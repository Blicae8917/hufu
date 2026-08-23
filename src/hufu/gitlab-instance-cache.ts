import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CommandError, isJsonObject } from "./errors.js";
import {
  parseGitLabInstanceExternalRef,
  parseGitLabInstanceIdentity,
  type GitLabInstanceIdentity,
} from "./gitlab-instance-ref.js";
import { type GitLabIssueProjection } from "./gitlab-port.js";

export const GITLAB_INSTANCE_CACHE_SCHEMA_VERSION = 1;

export interface GitLabInstanceProjectionCache {
  readonly cache_schema_version: 1;
  readonly incomplete: boolean;
  readonly items: readonly GitLabIssueProjection[];
  readonly observed_at: string;
  readonly repository: string;
  readonly instance_origin: string;
  readonly instance_kind: "self_hosted";
  readonly task_authority: "gitlab";
}

export function gitlabInstanceCachePath(workspaceRoot: string): string {
  return join(workspaceRoot, ".hufu", "cache", "gitlab-instance-projection.json");
}

export function assertCacheMatchesIdentity(
  cache: GitLabInstanceProjectionCache,
  identity: GitLabInstanceIdentity,
): void {
  if (
    cache.instance_kind !== "self_hosted" ||
    cache.instance_origin !== identity.instance_origin ||
    cache.repository !== identity.project_path
  ) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance cache does not match connected identity",
    );
  }
}

export function readGitLabInstanceProjectionCacheFor(
  workspaceRoot: string,
  identity: GitLabInstanceIdentity,
): GitLabInstanceProjectionCache | undefined {
  const cache = readGitLabInstanceProjectionCache(workspaceRoot);
  if (cache === undefined) {
    return undefined;
  }
  assertCacheMatchesIdentity(cache, identity);
  return cache;
}

export function readGitLabInstanceProjectionCache(
  workspaceRoot: string,
): GitLabInstanceProjectionCache | undefined {
  const path = gitlabInstanceCachePath(workspaceRoot);
  if (!existsSync(path)) {
    return undefined;
  }
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      `gitlab instance projection cache is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance projection cache is not valid JSON",
    );
  }
  return validateCache(parsed);
}

export function writeGitLabInstanceProjectionCache(
  workspaceRoot: string,
  cache: GitLabInstanceProjectionCache,
): void {
  const path = gitlabInstanceCachePath(workspaceRoot);
  mkdirSync(join(workspaceRoot, ".hufu", "cache"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(cache)}\n`, "utf8");
}

function validateCache(value: unknown): GitLabInstanceProjectionCache {
  if (!isJsonObject(value)) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance projection cache is not an object",
    );
  }
  if ("body" in value || "description" in value || "token" in value || "credential" in value) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance projection cache must not store body or credentials",
    );
  }
  const version = value["cache_schema_version"];
  if (typeof version !== "number" || version !== GITLAB_INSTANCE_CACHE_SCHEMA_VERSION) {
    throw new CommandError(
      version !== undefined && typeof version === "number" && version > GITLAB_INSTANCE_CACHE_SCHEMA_VERSION
        ? "SCHEMA_UNSUPPORTED"
        : "OBSERVATION_UNAVAILABLE",
      "gitlab instance projection cache schema is not supported",
    );
  }
  if (value["task_authority"] !== "gitlab" || value["instance_kind"] !== "self_hosted") {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance projection cache identity is invalid",
    );
  }
  const itemsValue = value["items"];
  if (!Array.isArray(itemsValue)) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance projection cache items are missing",
    );
  }
  const observedAt = value["observed_at"];
  if (typeof observedAt !== "string" || observedAt.trim() === "") {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance projection cache observed_at is missing",
    );
  }
  const identity = parseGitLabInstanceIdentity({
    instanceKind: "self_hosted",
    instanceOrigin: String(value["instance_origin"] ?? ""),
    projectPath: String(value["repository"] ?? ""),
  });
  const items = itemsValue.map((item) =>
    validateItem(item, observedAt, identity.project_path, identity.instance_host),
  );
  return {
    cache_schema_version: 1,
    incomplete: value["incomplete"] === true,
    items,
    observed_at: observedAt,
    repository: identity.project_path,
    instance_origin: identity.instance_origin,
    instance_kind: "self_hosted",
    task_authority: "gitlab",
  };
}

function validateItem(
  value: unknown,
  fallbackObservedAt: string,
  repository: string,
  instanceHost: string,
): GitLabIssueProjection {
  if (!isJsonObject(value)) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance projection cache item is not an object",
    );
  }
  if ("body" in value || "description" in value || "token" in value || "credential" in value) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance projection cache must not store issue body or credentials",
    );
  }
  const parsed = parseGitLabInstanceExternalRef(String(value["external_ref"] ?? ""));
  if (parsed.repository !== repository || parsed.instance_host !== instanceHost) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance projection cache item is not this project",
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
      "gitlab instance projection cache item is missing required fields",
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
  return {
    ...item,
    ...(typeof value["source_revision"] === "string" && value["source_revision"].trim() !== ""
      ? { source_revision: value["source_revision"].trim() }
      : {}),
    ...(Array.isArray(value["labels"])
      ? {
          labels: value["labels"].filter(
            (label): label is string => typeof label === "string" && label.trim() !== "",
          ),
        }
      : {}),
    ...(typeof value["assignee"] === "string" && value["assignee"].trim() !== ""
      ? { assignee: value["assignee"].trim() }
      : {}),
    ...(typeof value["milestone"] === "string" && value["milestone"].trim() !== ""
      ? { milestone: value["milestone"].trim() }
      : {}),
    ...(typeof value["updated_at"] === "string" && value["updated_at"].trim() !== ""
      ? { updated_at: value["updated_at"].trim() }
      : {}),
  };
}
