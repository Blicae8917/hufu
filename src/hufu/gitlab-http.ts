import { CommandError, isJsonObject } from "./errors.js";
import {
  type GitLabIssueProjection,
  type GitLabPort,
  type GitLabProjectionListResult,
} from "./gitlab-port.js";
import {
  canonicalGitLabExternalRef,
  parseGitLabProject,
} from "./gitlab-ref.js";

export interface HttpGitLabPortOptions {
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

export function createHttpGitLabPort(
  options: HttpGitLabPortOptions = {},
): GitLabPort {
  return {
    async listIssueProjections(project: string): Promise<GitLabProjectionListResult> {
      const repository = parseGitLabProject(project);
      const fetchFn = options.fetch ?? globalThis.fetch;
      if (
        options.fetch === undefined &&
        process.env["HUFU_DENY_NETWORK"] === "1"
      ) {
        throw new CommandError(
          "OBSERVATION_UNAVAILABLE",
          "network access is denied",
        );
      }
      const encoded = encodeURIComponent(repository);
      const listUrl = `https://gitlab.com/api/v4/projects/${encoded}/issues?state=all&per_page=100`;
      let response: Response;
      try {
        response = await fetchFn(listUrl, {
          headers: { Accept: "application/json" },
          method: "GET",
        });
      } catch (error) {
        throw new CommandError(
          "OBSERVATION_UNAVAILABLE",
          `gitlab read failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!response.ok) {
        throw new CommandError(
          "OBSERVATION_UNAVAILABLE",
          `gitlab read failed with HTTP ${String(response.status)}`,
        );
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new CommandError(
          "OBSERVATION_UNAVAILABLE",
          "gitlab read returned non-JSON",
        );
      }
      if (!Array.isArray(payload)) {
        throw new CommandError(
          "OBSERVATION_UNAVAILABLE",
          "gitlab issue list is not an array",
        );
      }
      const observedAt = (options.now ?? (() => new Date()))().toISOString();
      const items = payload.flatMap((item) =>
        toProjection(item, repository, observedAt),
      );
      const link = response.headers?.get("link") ?? "";
      const nextPage = response.headers?.get("x-next-page") ?? "";
      const incomplete =
        items.length >= 100 ||
        /rel="next"/i.test(link) ||
        nextPage.trim() !== "";
      return {
        incomplete,
        items,
        observed_at: observedAt,
      };
    },
  };
}

function toProjection(
  item: unknown,
  repository: string,
  observedAt: string,
): readonly GitLabIssueProjection[] {
  if (!isJsonObject(item)) {
    return [];
  }
  const type = item["type"];
  if (typeof type === "string" && type.trim().toLowerCase() !== "issue") {
    return [];
  }
  const webUrl = item["web_url"];
  if (typeof webUrl === "string" && webUrl.includes("/merge_requests/")) {
    return [];
  }
  const iid = item["iid"];
  const title = item["title"];
  const state = item["state"];
  if (
    typeof iid !== "number" ||
    !Number.isInteger(iid) ||
    iid < 1 ||
    typeof title !== "string" ||
    title.trim() === "" ||
    typeof webUrl !== "string" ||
    webUrl.trim() === "" ||
    typeof state !== "string" ||
    state.trim() === ""
  ) {
    return [];
  }
  const projection: GitLabIssueProjection = {
    external_ref: canonicalGitLabExternalRef(repository, iid),
    native_state: state.trim(),
    original_url: webUrl.trim(),
    title: title.trim(),
    observed_at: observedAt,
  };
  const updatedAt = item["updated_at"];
  if (typeof updatedAt === "string" && updatedAt.trim() !== "") {
    return [{ ...projection, source_revision: updatedAt.trim() }];
  }
  return [projection];
}
