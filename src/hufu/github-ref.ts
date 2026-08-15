import { CommandError } from "./errors.js";

export const CANONICAL_OWNER = "Blicae8917";
export const CANONICAL_REPO = "hufu";
export const CANONICAL_REPOSITORY = `${CANONICAL_OWNER}/${CANONICAL_REPO}`;

export function canonicalExternalRef(issueNumber: number): string {
  return `github:${CANONICAL_REPOSITORY}#${issueNumber}`;
}

export function parseThisPublicGithubRepository(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") {
    throw new CommandError("CONTRACT_INVALID", "repository must be non-empty");
  }
  const match =
    trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i) ??
    trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i) ??
    trimmed.match(/^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i) ??
    trimmed.match(/^([^/]+)\/([^/#]+)$/);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "github task_authority only accepts this public repository",
    );
  }
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, "");
  if (!sameRepo(owner, repo)) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "github task_authority only accepts this public repository",
    );
  }
  return CANONICAL_REPOSITORY;
}

export function parseExternalRef(input: string): {
  readonly owner: string;
  readonly repo: string;
  readonly issue: number;
  readonly external_ref: string;
} {
  const trimmed = input.trim();
  const match = trimmed.match(
    /^github:([^/#]+)\/([^/#]+)#([1-9][0-9]*)$/,
  );
  if (match === null || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
    throw new CommandError(
      "EXTERNAL_REF_INVALID",
      "external_ref must be github:owner/repo#issue with no leading zeros",
    );
  }
  if (!sameRepo(match[1], match[2])) {
    throw new CommandError(
      "EXTERNAL_REF_INVALID",
      "external_ref is not this public repository",
    );
  }
  const issue = Number(match[3]);
  return {
    owner: CANONICAL_OWNER,
    repo: CANONICAL_REPO,
    issue,
    external_ref: canonicalExternalRef(issue),
  };
}

function sameRepo(owner: string, repo: string): boolean {
  return (
    owner.toLowerCase() === CANONICAL_OWNER.toLowerCase() &&
    repo.toLowerCase() === CANONICAL_REPO.toLowerCase()
  );
}
