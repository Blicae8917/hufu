import { CommandError, isJsonObject } from "./errors.js";
import { fetchWithTimeout } from "./fetch-timeout.js";
import { type GitHubPort, type ProjectionListResult } from "./github-port.js";
import { CANONICAL_OWNER, CANONICAL_REPO, canonicalExternalRef } from "./github-ref.js";

export interface HttpGitHubPortOptions {
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}

export const FETCH_TIMEOUT_MS = 10_000;

const LIST_URL =
  `https://api.github.com/repos/${CANONICAL_OWNER}/${CANONICAL_REPO}/issues?state=all&per_page=100`;

export function createHttpGitHubPort(
  options: HttpGitHubPortOptions = {},
): GitHubPort {
  return {
    async listIssueProjections(): Promise<ProjectionListResult> {
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
      let response: Response;
      try {
        response = await fetchWithTimeout(
          () =>
            fetchFn(LIST_URL, {
              headers: { Accept: "application/vnd.github+json" },
              method: "GET",
            }),
          options.timeoutMs ?? FETCH_TIMEOUT_MS,
          "github read timed out",
        );
      } catch (error) {
        throw new CommandError(
          "OBSERVATION_UNAVAILABLE",
          `github read failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!response.ok) {
        throw new CommandError(
          "OBSERVATION_UNAVAILABLE",
          `github read failed with HTTP ${String(response.status)}`,
        );
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new CommandError(
          "OBSERVATION_UNAVAILABLE",
          "github read returned non-JSON",
        );
      }
      if (!Array.isArray(payload)) {
        throw new CommandError(
          "OBSERVATION_UNAVAILABLE",
          "github issue list is not an array",
        );
      }
      const observedAt = (options.now ?? (() => new Date()))().toISOString();
      const items = payload.flatMap((item) =>
        toProjection(item, observedAt),
      );
      const link = response.headers?.get("link") ?? "";
      const incomplete =
        items.length >= 100 || /rel="next"/i.test(link);
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
  observedAt: string,
): readonly import("./github-port.js").GitHubIssueProjection[] {
  if (!isJsonObject(item)) {
    return [];
  }
  if (item["pull_request"] !== undefined) {
    return [];
  }
  const number = item["number"];
  const title = item["title"];
  const htmlUrl = item["html_url"];
  const state = item["state"];
  if (
    typeof number !== "number" ||
    !Number.isInteger(number) ||
    number < 1 ||
    typeof title !== "string" ||
    title.trim() === "" ||
    typeof htmlUrl !== "string" ||
    htmlUrl.trim() === "" ||
    typeof state !== "string" ||
    state.trim() === ""
  ) {
    return [];
  }
  const projection: import("./github-port.js").GitHubIssueProjection = {
    external_ref: canonicalExternalRef(number),
    native_state: state.trim(),
    original_url: htmlUrl.trim(),
    title: title.trim(),
    observed_at: observedAt,
  };
  const updatedAt = item["updated_at"];
  if (typeof updatedAt === "string" && updatedAt.trim() !== "") {
    return [{ ...projection, source_revision: updatedAt.trim() }];
  }
  return [projection];
}
