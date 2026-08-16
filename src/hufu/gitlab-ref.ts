import { CommandError } from "./errors.js";

export const EXAMPLE_GITLAB_PROJECT = "example-group/example-project";

export function canonicalGitLabExternalRef(
  project: string,
  issueNumber: number,
): string {
  return `gitlab:${project}#${String(issueNumber)}`;
}

export function parseGitLabProject(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new CommandError("CONTRACT_INVALID", "repository must be non-empty");
  }
  if (/^github:/i.test(trimmed) || /github\.com/i.test(trimmed)) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab task_authority does not accept GitHub identities",
    );
  }
  const match =
    trimmed.match(/^https?:\/\/gitlab\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i) ??
    trimmed.match(/^git@gitlab\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i) ??
    trimmed.match(/^ssh:\/\/git@gitlab\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i) ??
    trimmed.match(/^([^/#]+)\/([^/#]+)$/);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab task_authority only accepts a two-segment gitlab.com group/project",
    );
  }
  if (/gitlab\./i.test(trimmed) && !/gitlab\.com/i.test(trimmed)) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab task_authority does not accept private GitLab hosts",
    );
  }
  const group = match[1];
  const project = match[2].replace(/\.git$/i, "");
  if (group.includes("/") || project.includes("/")) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab task_authority does not accept nested groups",
    );
  }
  return `${group}/${project}`;
}

export function parseGitLabExternalRef(input: string): {
  readonly group: string;
  readonly project: string;
  readonly issue: number;
  readonly external_ref: string;
  readonly repository: string;
} {
  const trimmed = input.trim();
  const match = trimmed.match(/^gitlab:([^/#]+)\/([^/#]+)#([1-9][0-9]*)$/);
  if (
    match === null ||
    match[1] === undefined ||
    match[2] === undefined ||
    match[3] === undefined
  ) {
    throw new CommandError(
      "EXTERNAL_REF_INVALID",
      "external_ref must be gitlab:group/project#issue with no leading zeros",
    );
  }
  const group = match[1];
  const project = match[2];
  const issue = Number(match[3]);
  const repository = `${group}/${project}`;
  return {
    group,
    project,
    issue,
    repository,
    external_ref: canonicalGitLabExternalRef(repository, issue),
  };
}
