import { realpathSync, statSync } from "node:fs";
import { resolve as hostResolve } from "node:path";

import { CommandError } from "./errors.js";

export const PROJECT_ROOT_ENV = "HUFU_PROJECT_ROOT";

export interface PathResolveApi {
  resolve(...paths: string[]): string;
}

export interface ResolveProjectRootInput {
  readonly flag?: string;
  readonly env?: string;
  readonly cwd: string;
  readonly pathApi?: PathResolveApi;
  readonly inspect?: (candidate: string) => "missing" | "file" | "directory";
  readonly realpath?: (candidate: string) => string;
}

export interface ResolvedProjectRoot {
  readonly project_root: string;
  readonly source: "flag" | "env" | "cwd";
}

export function candidateProjectRoot(
  raw: string,
  cwd: string,
  pathApi: PathResolveApi = { resolve: hostResolve },
): string {
  return pathApi.resolve(cwd, raw);
}

export function resolveProjectRoot(
  input: ResolveProjectRootInput,
): ResolvedProjectRoot {
  const selected = selectRawProjectRoot(input);
  if (selected.raw.trim() === "") {
    throw new CommandError("CONTRACT_INVALID", "project root is empty");
  }
  const pathApi = input.pathApi ?? { resolve: hostResolve };
  const candidate = candidateProjectRoot(selected.raw, input.cwd, pathApi);
  const inspect = input.inspect ?? inspectHostPath;
  const kind = inspect(candidate);
  if (kind === "missing") {
    throw new CommandError("CONTRACT_INVALID", "project root does not exist");
  }
  if (kind !== "directory") {
    throw new CommandError("CONTRACT_INVALID", "project root is not a directory");
  }
  const realpath = input.realpath ?? realpathSync;
  try {
    return { project_root: realpath(candidate), source: selected.source };
  } catch (error) {
    throw new CommandError(
      "CONTRACT_INVALID",
      `project root is not accessible: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function selectRawProjectRoot(
  input: ResolveProjectRootInput,
): { raw: string; source: ResolvedProjectRoot["source"] } {
  if (input.flag !== undefined) {
    return { raw: input.flag, source: "flag" };
  }
  if (input.env !== undefined) {
    return { raw: input.env, source: "env" };
  }
  return { raw: input.cwd, source: "cwd" };
}

function inspectHostPath(candidate: string): "missing" | "file" | "directory" {
  try {
    return statSync(candidate).isDirectory() ? "directory" : "file";
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: unknown }).code === "ENOENT"
    ) {
      return "missing";
    }
    throw new CommandError(
      "CONTRACT_INVALID",
      `project root is not accessible: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
