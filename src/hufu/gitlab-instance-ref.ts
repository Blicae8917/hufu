import { CommandError } from "./errors.js";

export const EXAMPLE_GITLAB_INSTANCE_ORIGIN = "https://gitlab.example.com";
export const EXAMPLE_GITLAB_INSTANCE_HOST = "gitlab.example.com";

export interface GitLabInstanceIdentity {
  readonly instance_kind: "self_hosted";
  readonly instance_origin: string;
  readonly instance_host: string;
  readonly project_path: string;
}

export interface GitLabInstanceExternalRef {
  readonly instance_host: string;
  readonly group: string;
  readonly project: string;
  readonly issue: number;
  readonly repository: string;
  readonly external_ref: string;
}

const SAAS_HOSTS = new Set(["gitlab.com", "www.gitlab.com"]);

export function parseGitLabInstanceOrigin(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new CommandError("CONTRACT_INVALID", "instance_origin must be non-empty");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "self-hosted instance_origin must be an HTTPS URL",
    );
  }
  if (parsed.protocol !== "https:") {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "self-hosted instance_origin must use HTTPS",
    );
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new CommandError(
      "CONTRACT_INVALID",
      "instance_origin must not embed credentials",
    );
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "instance_origin must be an origin without a project path",
    );
  }
  const host = parsed.hostname.toLowerCase();
  if (SAAS_HOSTS.has(host)) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab.com cannot impersonate a self-hosted instance",
    );
  }
  return `https://${host}${parsed.port === "" ? "" : `:${parsed.port}`}`;
}

export function parseGitLabInstanceProjectPath(input: string): string {
  const trimmed = input.trim().replace(/\.git$/i, "");
  const match = trimmed.match(/^([^/#]+)\/([^/#]+)$/);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "self-hosted project_path must be a two-segment group/project",
    );
  }
  if (match[1].includes("/") || match[2].includes("/")) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "self-hosted GitLab does not accept nested groups",
    );
  }
  return `${match[1]}/${match[2]}`;
}

export function parseGitLabInstanceSourceUrl(input: string): {
  readonly instance_origin: string;
  readonly project_path: string;
} {
  const trimmed = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "self-hosted source must be an HTTPS instance URL",
    );
  }
  if (parsed.protocol !== "https:") {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "self-hosted source must use HTTPS",
    );
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new CommandError(
      "CONTRACT_INVALID",
      "self-hosted source must not embed credentials",
    );
  }
  const host = parsed.hostname.toLowerCase();
  if (SAAS_HOSTS.has(host)) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab.com cannot impersonate a self-hosted instance",
    );
  }
  const segments = parsed.pathname
    .replace(/\.git$/i, "")
    .split("/")
    .filter((part) => part.length > 0);
  if (segments.length !== 2 || segments[0] === undefined || segments[1] === undefined) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "self-hosted source must be origin plus a two-segment group/project",
    );
  }
  return {
    instance_origin: `https://${host}${parsed.port === "" ? "" : `:${parsed.port}`}`,
    project_path: `${segments[0]}/${segments[1]}`,
  };
}

export function parseGitLabInstanceIdentity(input: {
  readonly instanceKind: string;
  readonly instanceOrigin: string;
  readonly projectPath: string;
}): GitLabInstanceIdentity {
  if (input.instanceKind.trim() !== "self_hosted") {
    throw new CommandError(
      "CONTRACT_INVALID",
      "self-hosted authority requires instance_kind=self_hosted",
    );
  }
  const instance_origin = parseGitLabInstanceOrigin(input.instanceOrigin);
  const project_path = looksLikeSourceUrl(input.projectPath)
    ? alignProjectPath(input.projectPath, instance_origin)
    : parseGitLabInstanceProjectPath(input.projectPath);
  return {
    instance_kind: "self_hosted",
    instance_origin,
    instance_host: new URL(instance_origin).hostname.toLowerCase(),
    project_path,
  };
}

export function canonicalGitLabInstanceExternalRef(
  host: string,
  project: string,
  issueNumber: number,
): string {
  return `gitlab-instance:${host}/${project}#${String(issueNumber)}`;
}

export function parseGitLabInstanceExternalRef(
  input: string,
): GitLabInstanceExternalRef {
  const trimmed = input.trim();
  const match = trimmed.match(
    /^gitlab-instance:([^/#]+)\/([^/#]+)\/([^/#]+)#([1-9][0-9]*)$/,
  );
  if (
    match === null ||
    match[1] === undefined ||
    match[2] === undefined ||
    match[3] === undefined ||
    match[4] === undefined
  ) {
    throw new CommandError(
      "EXTERNAL_REF_INVALID",
      "external_ref must be gitlab-instance:host/group/project#issue with no leading zeros",
    );
  }
  const instance_host = match[1].toLowerCase();
  if (SAAS_HOSTS.has(instance_host)) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab.com cannot impersonate a self-hosted instance",
    );
  }
  const group = match[2];
  const project = match[3];
  const issue = Number(match[4]);
  const repository = `${group}/${project}`;
  return {
    instance_host,
    group,
    project,
    issue,
    repository,
    external_ref: canonicalGitLabInstanceExternalRef(instance_host, repository, issue),
  };
}

function looksLikeSourceUrl(input: string): boolean {
  return /^https?:\/\//i.test(input.trim());
}

function alignProjectPath(source: string, expectedOrigin: string): string {
  const parsed = parseGitLabInstanceSourceUrl(source);
  if (parsed.instance_origin !== expectedOrigin) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "repository host conflicts with the declared instance_origin",
    );
  }
  return parsed.project_path;
}
