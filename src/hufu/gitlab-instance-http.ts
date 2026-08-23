import { CommandError, isJsonObject } from "./errors.js";
import { fetchWithTimeout } from "./fetch-timeout.js";
import { GITLAB_INSTANCE_CREDENTIAL_NAME } from "./secret-provider.js";
import {
  canonicalGitLabInstanceExternalRef,
  parseGitLabInstanceIdentity,
  type GitLabInstanceIdentity,
} from "./gitlab-instance-ref.js";
import {
  type GitLabIssueProjection,
  type GitLabPort,
  type GitLabProjectionListResult,
} from "./gitlab-port.js";
import { type SecretProvider } from "./secret-provider.js";

export interface HttpGitLabInstancePortOptions {
  readonly identity: GitLabInstanceIdentity;
  readonly secretProvider: SecretProvider;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}

export const FETCH_TIMEOUT_MS = 10_000;
const MAX_PAGES = 50;

export function createHttpGitLabInstancePort(
  options: HttpGitLabInstancePortOptions,
): GitLabPort {
  const identity = parseGitLabInstanceIdentity({
    instanceKind: options.identity.instance_kind,
    instanceOrigin: options.identity.instance_origin,
    projectPath: options.identity.project_path,
  });
  return {
    async listIssueProjections(project: string): Promise<GitLabProjectionListResult> {
      if (project.trim() !== "" && project.trim() !== identity.project_path) {
        const requested = project.trim();
        if (requested !== identity.project_path) {
          throw new CommandError(
            "CONTRACT_INVALID",
            "instance list project_path does not match the declared identity",
          );
        }
      }
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
      const observedAt = (options.now ?? (() => new Date()))().toISOString();
      const items: GitLabIssueProjection[] = [];
      let pageUrl = listUrl(identity, 1);
      let incomplete = false;
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const response = await getAuthorized(fetchFn, pageUrl, identity, options);
        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new CommandError(
            "OBSERVATION_UNAVAILABLE",
            "gitlab instance read returned non-JSON",
          );
        }
        if (!Array.isArray(payload)) {
          throw new CommandError(
            "OBSERVATION_UNAVAILABLE",
            "gitlab instance issue list is not an array",
          );
        }
        items.push(
          ...payload.flatMap((item) => toProjection(item, identity, observedAt)),
        );
        const next = nextPageUrl(response, identity, page);
        if (next === undefined) {
          incomplete = false;
          break;
        }
        if (page === MAX_PAGES) {
          incomplete = true;
          break;
        }
        pageUrl = next;
        incomplete = true;
      }
      return {
        incomplete,
        items,
        observed_at: observedAt,
      };
    },
  };
}

async function getAuthorized(
  fetchFn: typeof fetch,
  url: string,
  identity: GitLabInstanceIdentity,
  options: HttpGitLabInstancePortOptions,
): Promise<Response> {
  assertAllowedUrl(url, identity);
  const token = options.secretProvider.resolve(GITLAB_INSTANCE_CREDENTIAL_NAME);
  if (token === undefined || token.trim() === "") {
    throw new CommandError(
      "CONTRACT_INVALID",
      "self-hosted GitLab requires a host-injected credential",
    );
  }
  let response: Response;
  try {
    response = await fetchWithTimeout(
      () =>
        fetchFn(url, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          method: "GET",
          redirect: "manual",
        }),
      options.timeoutMs ?? FETCH_TIMEOUT_MS,
      "gitlab instance read timed out",
    );
  } catch (error) {
    if (error instanceof CommandError) {
      throw error;
    }
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      `gitlab instance read failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (isRedirect(response.status)) {
    const location = response.headers?.get("location") ?? "";
    throw new CommandError(
      escapeRedirect(location, identity)
        ? "REPOSITORY_NOT_ALLOWED"
        : "OBSERVATION_UNAVAILABLE",
      "gitlab instance redirect escaped the authorized origin",
    );
  }
  if (!response.ok) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      `gitlab instance read failed with HTTP ${String(response.status)}`,
    );
  }
  return response;
}

function listUrl(identity: GitLabInstanceIdentity, page: number): string {
  const encoded = encodeURIComponent(identity.project_path);
  const base = `${identity.instance_origin}/api/v4/projects/${encoded}/issues?state=all&per_page=100`;
  return page <= 1 ? base : `${base}&page=${String(page)}`;
}

function nextPageUrl(
  response: Response,
  identity: GitLabInstanceIdentity,
  currentPage: number,
): string | undefined {
  const nextPage = (response.headers?.get("x-next-page") ?? "").trim();
  if (nextPage !== "") {
    const parsed = Number(nextPage);
    if (!Number.isInteger(parsed) || parsed <= currentPage) {
      return undefined;
    }
    return listUrl(identity, parsed);
  }
  const link = response.headers?.get("link") ?? "";
  const match = link.match(/<([^>]+)>\s*;\s*rel="next"/i);
  if (match?.[1] === undefined) {
    return undefined;
  }
  assertAllowedUrl(match[1], identity);
  return match[1];
}

function assertAllowedUrl(url: string, identity: GitLabInstanceIdentity): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab instance request URL is invalid",
    );
  }
  if (parsed.protocol !== "https:") {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab instance requests must use HTTPS",
    );
  }
  const origin = `${parsed.protocol}//${parsed.host}`;
  if (origin.toLowerCase() !== identity.instance_origin.toLowerCase()) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab instance request escaped the authorized origin",
    );
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "gitlab.com" || host === "www.gitlab.com") {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab.com cannot impersonate a self-hosted instance",
    );
  }
}

function escapeRedirect(location: string, identity: GitLabInstanceIdentity): boolean {
  if (location.trim() === "") {
    return true;
  }
  try {
    const parsed = new URL(location, `${identity.instance_origin}/`);
    return parsed.origin.toLowerCase() !== identity.instance_origin.toLowerCase();
  } catch {
    return true;
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function toProjection(
  item: unknown,
  identity: GitLabInstanceIdentity,
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
  if (typeof webUrl === "string") {
    try {
      const parsed = new URL(webUrl);
      if (parsed.hostname.toLowerCase() !== identity.instance_host) {
        return [];
      }
    } catch {
      return [];
    }
  }
  const projection: GitLabIssueProjection = {
    external_ref: canonicalGitLabInstanceExternalRef(
      identity.instance_host,
      identity.project_path,
      iid,
    ),
    native_state: state.trim(),
    original_url: webUrl.trim(),
    title: title.trim(),
    observed_at: observedAt,
  };
  const labels = readLabels(item["labels"]);
  const assignee = readAssignee(item["assignee"] ?? item["assignees"]);
  const milestone = readMilestone(item["milestone"]);
  const updatedAt =
    typeof item["updated_at"] === "string" && item["updated_at"].trim() !== ""
      ? item["updated_at"].trim()
      : undefined;
  return [
    {
      ...projection,
      ...(labels === undefined ? {} : { labels }),
      ...(assignee === undefined ? {} : { assignee }),
      ...(milestone === undefined ? {} : { milestone }),
      ...(updatedAt === undefined ? {} : { updated_at: updatedAt }),
      ...(updatedAt === undefined ? {} : { source_revision: updatedAt }),
    },
  ];
}

function readLabels(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const labels = value.flatMap((item) => {
    if (typeof item === "string" && item.trim() !== "") {
      return [item.trim()];
    }
    if (isJsonObject(item) && typeof item["name"] === "string" && item["name"].trim() !== "") {
      return [item["name"].trim()];
    }
    return [];
  });
  return labels;
}

function readAssignee(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return readAssignee(first);
  }
  if (!isJsonObject(value)) {
    return undefined;
  }
  const username = value["username"];
  if (typeof username === "string" && username.trim() !== "") {
    return username.trim();
  }
  return undefined;
}

function readMilestone(value: unknown): string | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const title = value["title"];
  if (typeof title === "string" && title.trim() !== "") {
    return title.trim();
  }
  return undefined;
}
