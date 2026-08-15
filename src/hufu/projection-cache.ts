import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CommandError, isJsonObject } from "./errors.js";
import { type GitHubIssueProjection } from "./github-port.js";
import { CANONICAL_REPOSITORY, parseExternalRef } from "./github-ref.js";

export const CACHE_SCHEMA_VERSION = 1;

export interface ProjectionCache {
  readonly cache_schema_version: 1;
  readonly incomplete: boolean;
  readonly items: readonly GitHubIssueProjection[];
  readonly observed_at: string;
  readonly repository: string;
  readonly task_authority: "github";
}

export function cachePath(workspaceRoot: string): string {
  return join(workspaceRoot, ".hufu", "cache", "github-projection.json");
}

export function readProjectionCache(
  workspaceRoot: string,
): ProjectionCache | undefined {
  const path = cachePath(workspaceRoot);
  if (!existsSync(path)) {
    return undefined;
  }
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      `projection cache is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "projection cache is not valid JSON",
    );
  }
  return validateCache(parsed);
}

export function writeProjectionCache(
  workspaceRoot: string,
  cache: ProjectionCache,
): void {
  const path = cachePath(workspaceRoot);
  mkdirSync(join(workspaceRoot, ".hufu", "cache"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(cache)}\n`, "utf8");
}

function validateCache(value: unknown): ProjectionCache {
  if (!isJsonObject(value)) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "projection cache is not an object",
    );
  }
  const version = value["cache_schema_version"];
  if (typeof version !== "number" || version > CACHE_SCHEMA_VERSION) {
    throw new CommandError(
      "SCHEMA_UNSUPPORTED",
      "projection cache schema is not supported",
    );
  }
  if (version !== CACHE_SCHEMA_VERSION) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "projection cache schema is unreadable",
    );
  }
  const itemsValue = value["items"];
  if (!Array.isArray(itemsValue)) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "projection cache items are missing",
    );
  }
  const observedAt = value["observed_at"];
  if (typeof observedAt !== "string" || observedAt.trim() === "") {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "projection cache observed_at is missing",
    );
  }
  const items = itemsValue.map((item) => validateItem(item, observedAt));
  return {
    cache_schema_version: 1,
    incomplete: value["incomplete"] === true,
    items,
    observed_at: observedAt,
    repository: CANONICAL_REPOSITORY,
    task_authority: "github",
  };
}

function validateItem(
  value: unknown,
  fallbackObservedAt: string,
): GitHubIssueProjection {
  if (!isJsonObject(value)) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "projection cache item is not an object",
    );
  }
  const parsed = parseExternalRef(String(value["external_ref"] ?? ""));
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
      "projection cache item is missing required fields",
    );
  }
  if ("body" in value) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "projection cache must not store issue body",
    );
  }
  const item: GitHubIssueProjection = {
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
