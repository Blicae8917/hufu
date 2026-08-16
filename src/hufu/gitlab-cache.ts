import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CommandError, isJsonObject } from "./errors.js";
import { type GitLabIssueProjection } from "./gitlab-port.js";
import { parseGitLabExternalRef, parseGitLabProject } from "./gitlab-ref.js";

export const GITLAB_CACHE_SCHEMA_VERSION = 1;

export interface GitLabProjectionCache {
  readonly cache_schema_version: 1;
  readonly incomplete: boolean;
  readonly items: readonly GitLabIssueProjection[];
  readonly observed_at: string;
  readonly repository: string;
  readonly task_authority: "gitlab";
}

export function gitlabCachePath(workspaceRoot: string): string {
  return join(workspaceRoot, ".hufu", "cache", "gitlab-projection.json");
}

export function readGitLabProjectionCache(
  workspaceRoot: string,
): GitLabProjectionCache | undefined {
  const path = gitlabCachePath(workspaceRoot);
  if (!existsSync(path)) {
    return undefined;
  }
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      `gitlab projection cache is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab projection cache is not valid JSON",
    );
  }
  return validateCache(parsed);
}

export function writeGitLabProjectionCache(
  workspaceRoot: string,
  cache: GitLabProjectionCache,
): void {
  const path = gitlabCachePath(workspaceRoot);
  mkdirSync(join(workspaceRoot, ".hufu", "cache"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(cache)}\n`, "utf8");
}

function validateCache(value: unknown): GitLabProjectionCache {
  if (!isJsonObject(value)) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab projection cache is not an object",
    );
  }
  const version = value["cache_schema_version"];
  if (typeof version !== "number" || version > GITLAB_CACHE_SCHEMA_VERSION) {
    throw new CommandError(
      "SCHEMA_UNSUPPORTED",
      "gitlab projection cache schema is not supported",
    );
  }
  if (version !== GITLAB_CACHE_SCHEMA_VERSION) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab projection cache schema is unreadable",
    );
  }
  if (value["task_authority"] !== "gitlab") {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab projection cache task_authority is invalid",
    );
  }
  const itemsValue = value["items"];
  if (!Array.isArray(itemsValue)) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab projection cache items are missing",
    );
  }
  const observedAt = value["observed_at"];
  if (typeof observedAt !== "string" || observedAt.trim() === "") {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab projection cache observed_at is missing",
    );
  }
  const repository = parseGitLabProject(String(value["repository"] ?? ""));
  const items = itemsValue.map((item) => validateItem(item, observedAt, repository));
  return {
    cache_schema_version: 1,
    incomplete: value["incomplete"] === true,
    items,
    observed_at: observedAt,
    repository,
    task_authority: "gitlab",
  };
}

function validateItem(
  value: unknown,
  fallbackObservedAt: string,
  repository: string,
): GitLabIssueProjection {
  if (!isJsonObject(value)) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab projection cache item is not an object",
    );
  }
  if ("body" in value || "description" in value) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab projection cache must not store issue body",
    );
  }
  const parsed = parseGitLabExternalRef(String(value["external_ref"] ?? ""));
  if (parsed.repository !== repository) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab projection cache item is not this project",
    );
  }
  const title = value["title"];
  const originalUrl = value["original_url"];
  const nativeState = value["native_state"];
  if (
    typeof title !== "string" ||
    title.trim() === "" ||
    typeof originalUrl !== "string" ||
    originalUrl.trim() === "" ||
    typeof nativeState !== "string" ||
    nativeState.trim() === ""
  ) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab projection cache item is missing required fields",
    );
  }
  const item: GitLabIssueProjection = {
    external_ref: parsed.external_ref,
    native_state: nativeState.trim(),
    original_url: originalUrl.trim(),
    title: title.trim(),
    observed_at:
      typeof value["observed_at"] === "string" && value["observed_at"].trim() !== ""
        ? value["observed_at"].trim()
        : fallbackObservedAt,
  };
  if (
    typeof value["source_revision"] === "string" &&
    value["source_revision"].trim() !== ""
  ) {
    return { ...item, source_revision: value["source_revision"].trim() };
  }
  return item;
}
