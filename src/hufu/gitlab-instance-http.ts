import { CommandError, isJsonObject } from "./errors.js";
import { fetchWithTimeout } from "./fetch-timeout.js";
import { redactUnknown } from "./secret-redact.js";
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
      `gitlab instance read failed: ${redactUnknown(error, [token])}`,
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
  const rawNextPage = response.headers?.get("x-next-page");
  if (rawNextPage !== null && rawNextPage !== undefined && rawNextPage.trim() !== "") {
    const parsed = Number(rawNextPage.trim());
    if (!Number.isInteger(parsed) || parsed <= currentPage) {
      throw new CommandError(
        "OBSERVATION_UNAVAILABLE",
        "gitlab instance pagination next-page is malformed",
      );
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
  const declared = new URL(identity.instance_origin);
  if (declared.protocol === "https:" && parsed.protocol !== "https:") {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab instance requests must use HTTPS",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab instance requests must use HTTP or HTTPS",
    );
  }
  const origin = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${
    parsed.port === "" ? "" : `:${parsed.port}`
  }`;
  if (origin !== identity.instance_origin.toLowerCase()) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab instance request escaped the authorized origin",
    );
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab instance request URL must not embed credentials",
    );
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "gitlab.com" || host === "www.gitlab.com") {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab.com cannot impersonate a self-hosted instance",
    );
  }
  const encodedPath = `/api/v4/projects/${encodeURIComponent(identity.project_path)}/issues`;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(parsed.pathname);
  } catch {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab instance request URL is invalid",
    );
  }
  const decodedAllowed = `/api/v4/projects/${identity.project_path}/issues`;
  if (parsed.pathname !== encodedPath && decodedPath !== decodedAllowed) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab instance request escaped the authorized project path",
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

function issueWebOrigin(parsed: URL): string {
  const port = parsed.port === "" ? "" : `:${parsed.port}`;
  return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${port}`;
}

function assertIssueMatchesIdentity(
  item: Record<string, unknown>,
  identity: GitLabInstanceIdentity,
  iid: number,
  webUrl: string,
): void {
  let parsed: URL;
  try {
    parsed = new URL(webUrl);
  } catch {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance issue web_url is invalid",
    );
  }
  if (issueWebOrigin(parsed) !== identity.instance_origin.toLowerCase()) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance issue origin does not match the declared identity",
    );
  }
  const pathMatch = parsed.pathname.match(/^\/(.+)\/-\/issues\/([1-9][0-9]*)$/);
  if (pathMatch === null || pathMatch[1] === undefined || pathMatch[2] === undefined) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance issue web_url is not an issue URL for the declared project",
    );
  }
  let projectPath: string;
  try {
    projectPath = decodeURIComponent(pathMatch[1]);
  } catch {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance issue web_url project path is invalid",
    );
  }
  if (projectPath !== identity.project_path) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance issue does not belong to the declared project",
    );
  }
  const urlIid = Number(pathMatch[2]);
  if (!Number.isInteger(urlIid) || urlIid !== iid) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance issue iid does not match the declared issue URL",
    );
  }
  const references = item["references"];
  if (isJsonObject(references) && typeof references["full"] === "string") {
    const expected = `${identity.project_path}#${String(iid)}`;
    if (references["full"] !== expected) {
      throw new CommandError(
        "OBSERVATION_UNAVAILABLE",
        "gitlab instance issue references do not match the declared project",
      );
    }
  }
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
  assertIssueMatchesIdentity(item, identity, iid, webUrl);
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
