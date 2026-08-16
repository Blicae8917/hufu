import {
  CommandError,
  ContractError,
  commandErrorBody,
  connectWorkspace,
  decideWorkspace,
  doctorWorkspace,
  recordHandoff,
  statusWorkspace,
  validateTask,
  type DecideKind,
} from "hufu";

import { bindWorkspaceStorage } from "./storage-domain.js";

const TOOL_NAMES = [
  "hufu.validate",
  "hufu.connect",
  "hufu.doctor",
  "hufu.status",
  "hufu.handoff",
  "hufu.decide",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

const DECIDE_KINDS = [
  "ack",
  "effect",
  "envelope",
  "fact",
  "packet",
  "revise",
] as const satisfies readonly DecideKind[];

export interface ToolResult {
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: {
    code: string;
    message: string;
    schema_version: "1";
  };
}

export function listToolNames(): readonly string[] {
  return TOOL_NAMES;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const result = await dispatchTool(name, args);
    return { ok: true, result };
  } catch (error) {
    if (error instanceof CommandError) {
      return commandErrorBody(error);
    }
    throw error;
  }
}

async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "hufu.validate":
      return runValidate(args);
    case "hufu.connect":
      return runConnect(args);
    case "hufu.doctor":
      return runDoctor(args);
    case "hufu.status":
      return runStatus(args);
    case "hufu.handoff":
      return runHandoff(args);
    case "hufu.decide":
      return runDecide(args);
    default:
      throw new CommandError("CONTRACT_INVALID", `unknown tool ${name}`);
  }
}

function runValidate(args: Record<string, unknown>): unknown {
  const payload = args["task"] ?? args["payload"];
  if (payload === undefined) {
    throw new CommandError("CONTRACT_INVALID", "task is required");
  }
  try {
    const task = validateTask(payload);
    return {
      project_id: task.project.id,
      schema_version: task.schema_version,
      source: task.source,
      task_id: task.task_id,
      valid: true,
    };
  } catch (error) {
    if (error instanceof ContractError) {
      throw new CommandError("CONTRACT_INVALID", error.message);
    }
    throw error;
  }
}

function runConnect(args: Record<string, unknown>): unknown {
  const workspaceRoot = requiredWorkspace(args);
  bindWorkspaceStorage(workspaceRoot);
  return connectWorkspace(workspaceRoot, {
    commander: requiredTextAny(args, "commander"),
    grantExpires: optionalTextAny(args, "grantExpires", "grant-expires"),
    grantScope: requiredTextAny(args, "grantScope", "grant-scope"),
    projectId: requiredTextAny(args, "projectId", "project-id"),
    projectLead: optionalTextAny(args, "projectLead", "project-lead"),
    repository: requiredTextAny(args, "repository"),
    taskAuthority: requiredTextAny(args, "taskAuthority", "task-authority"),
  });
}

function runDoctor(args: Record<string, unknown>): unknown {
  const workspaceRoot = requiredWorkspace(args);
  bindWorkspaceStorage(workspaceRoot);
  return doctorWorkspace(workspaceRoot, {
    repairTruncatedTail: args["repairTruncatedTail"] === true,
  });
}

async function runStatus(args: Record<string, unknown>): Promise<unknown> {
  const workspaceRoot = requiredWorkspace(args);
  bindWorkspaceStorage(workspaceRoot);
  return statusWorkspace(workspaceRoot, {
    refresh: args["refresh"] === true,
  });
}

function runHandoff(args: Record<string, unknown>): unknown {
  const workspaceRoot = requiredWorkspace(args);
  bindWorkspaceStorage(workspaceRoot);
  return recordHandoff(workspaceRoot, {
    completed: requiredTextAny(args, "completed"),
    nextReview: optionalTextAny(args, "nextReview", "next-review"),
    remaining: requiredTextAny(args, "remaining"),
    risks: optionalTextAny(args, "risks"),
    workItemId: requiredTextAny(args, "workItemId", "work-item"),
  });
}

function runDecide(args: Record<string, unknown>): unknown {
  const workspaceRoot = requiredWorkspace(args);
  bindWorkspaceStorage(workspaceRoot);
  const kind = args["kind"];
  if (typeof kind !== "string" || !isDecideKind(kind)) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "decide requires kind packet|envelope|ack|fact|revise|effect",
    );
  }
  const file = optionalText(args, "file");
  const payload = args["payload"];
  return decideWorkspace(workspaceRoot, {
    actor: requiredTextAny(args, "actor"),
    file,
    kind,
    payload: payload === undefined ? undefined : asObject(payload),
  });
}

function isDecideKind(value: string): value is DecideKind {
  return (DECIDE_KINDS as readonly string[]).includes(value);
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CommandError("CONTRACT_INVALID", "decide payload must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function requiredWorkspace(args: Record<string, unknown>): string {
  const value = args["workspaceRoot"];
  if (typeof value !== "string" || value.trim() === "") {
    throw new CommandError("CONTRACT_INVALID", "workspaceRoot is required");
  }
  return value;
}

function optionalTextAny(
  args: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = optionalText(args, key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function requiredTextAny(args: Record<string, unknown>, ...keys: string[]): string {
  const value = optionalTextAny(args, ...keys);
  if (value === undefined) {
    const label = keys[0] ?? "value";
    throw new CommandError("CONTRACT_INVALID", `${label} is required`);
  }
  return value;
}

function optionalText(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new CommandError("CONTRACT_INVALID", `${key} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
