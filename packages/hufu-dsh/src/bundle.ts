import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CommandError } from "hufu";

export interface PluginRow {
  readonly id: string;
  readonly name: string;
  readonly runtime?: string;
  readonly inject?: readonly string[];
  readonly exports?: string;
  readonly config?: Record<string, unknown>;
}

export type PatchOp =
  | {
      readonly insert: readonly PluginRow[];
    }
  | PluginRow;

export function applyPatch(rows: readonly PluginRow[], op: PatchOp): PluginRow[] {
  if ("insert" in op) {
    return [...rows, ...op.insert];
  }
  const replacement = op;
  const index = rows.findIndex((row) => row.id === replacement.id);
  if (index === -1) {
    return [...rows, replacement];
  }
  const next = [...rows];
  next[index] = replacement;
  return next;
}

export function applyPatches(
  rows: readonly PluginRow[],
  ops: readonly PatchOp[],
): PluginRow[] {
  return ops.reduce<PluginRow[]>((current, op) => applyPatch(current, op), [
    ...rows,
  ]);
}

export function packageHasBundle(packageDir: string): boolean {
  const manifest = readJsonObject(join(packageDir, "package.json"));
  const patch = bundlePatchPath(manifest);
  return patch !== undefined;
}

export function readBundlePatchOrThrow(packageDir: string): PatchOp[] {
  const manifestPath = join(packageDir, "package.json");
  if (!existsSync(manifestPath)) {
    throw new CommandError("CONTRACT_INVALID", "package.json is missing");
  }
  const manifest = readJsonObject(manifestPath);
  const relative = bundlePatchPath(manifest);
  if (relative === undefined) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "package listed in bundles has no valid dsh.bundle.patch",
    );
  }
  const patchPath = join(packageDir, relative);
  if (!existsSync(patchPath)) {
    throw new CommandError("CONTRACT_INVALID", "bundle patch file is missing");
  }
  return parseCordisPatchYaml(readFileSync(patchPath, "utf8"));
}

export function loadListedBundle(packageDir: string): PluginRow[] {
  return applyPatches([], readBundlePatchOrThrow(packageDir));
}

export function hufuRowPresent(rows: readonly PluginRow[]): boolean {
  return rows.some(
    (row) =>
      row.id === "hufu" &&
      row.name === "hufu-dsh" &&
      row.runtime === "isolate" &&
      (row.inject ?? []).includes("hufu"),
  );
}

export function parseCordisPatchYaml(text: string): PatchOp[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized === "") {
    throw new CommandError("CONTRACT_INVALID", "bundle patch is empty");
  }
  if (/(?:^|\n)-\s*insert:/.test(normalized)) {
    return [
      {
        insert: [parsePluginRow(normalized)],
      },
    ];
  }
  if (/(?:^|\n)-\s*id:/.test(normalized)) {
    return [parsePluginRow(normalized)];
  }
  throw new CommandError(
    "CONTRACT_INVALID",
    "bundle patch is not a valid insert or row replace",
  );
}

function bundlePatchPath(manifest: Record<string, unknown>): string | undefined {
  const dsh = manifest["dsh"];
  if (typeof dsh !== "object" || dsh === null || Array.isArray(dsh)) {
    return undefined;
  }
  const bundle = (dsh as Record<string, unknown>)["bundle"];
  if (typeof bundle !== "object" || bundle === null || Array.isArray(bundle)) {
    return undefined;
  }
  const patch = (bundle as Record<string, unknown>)["patch"];
  return typeof patch === "string" && patch.trim() !== "" ? patch : undefined;
}

function parsePluginRow(text: string): PluginRow {
  const id = requiredYamlScalar(text, "id");
  const pluginName = requiredYamlScalar(text, "name");
  const runtime = optionalYamlScalar(text, "runtime");
  const exportsField = optionalYamlScalar(text, "exports");
  const inject = yamlStringList(text, "inject");
  const row: PluginRow = { id, name: pluginName };
  return {
    ...row,
    ...(runtime === undefined ? {} : { runtime }),
    ...(exportsField === undefined ? {} : { exports: exportsField }),
    ...(inject === undefined ? {} : { inject }),
  };
}

function requiredYamlScalar(text: string, key: string): string {
  const value = optionalYamlScalar(text, key);
  if (value === undefined) {
    throw new CommandError("CONTRACT_INVALID", `bundle patch missing ${key}`);
  }
  return value;
}

function optionalYamlScalar(text: string, key: string): string | undefined {
  const match = text.match(
    new RegExp(`(?:^|\\n)\\s*-?\\s*${key}:\\s*(\\S+)`),
  );
  const value = match?.[1];
  if (value === undefined) {
    return undefined;
  }
  return value.replace(/^["']|["']$/g, "");
}

function yamlStringList(text: string, key: string): readonly string[] | undefined {
  const match = text.match(new RegExp(`${key}:\\n((?:\\s+-\\s+\\S+\\n?)+)`));
  if (match === null || match[1] === undefined) {
    return undefined;
  }
  return [...match[1].matchAll(/-\s+(\S+)/g)].map((item) => item[1] ?? "");
}

function readJsonObject(path: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new CommandError("CONTRACT_INVALID", `${path} is not valid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CommandError("CONTRACT_INVALID", `${path} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}
