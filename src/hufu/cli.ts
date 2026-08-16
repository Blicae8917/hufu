import { readFileSync } from "node:fs";

import { connectWorkspace } from "./connect.js";
import { validateTask } from "./contracts.js";
import { decideWorkspace, type DecideKind } from "./decide.js";
import { doctorWorkspace } from "./doctor.js";
import {
  CommandError,
  commandErrorBody,
  exitCodeFor,
  stableStringify,
} from "./errors.js";
import { recordHandoff } from "./handoff.js";
import { recordPilot } from "./pilot.js";
import { statusWorkspace } from "./status.js";

const SUMMARY_KEYS = [
  "project_id",
  "schema_version",
  "source",
  "task_id",
  "valid",
] as const;

const REFRESH_FLAGS = new Set(["online", "pull", "refresh"]);

interface ParsedArgs {
  readonly command: string | undefined;
  readonly options: Record<string, string>;
  readonly positionals: string[];
  readonly switches: Set<string>;
}

export async function main(argv: string[]): Promise<number> {
  const command = argv[0];
  if (command === "validate") {
    return runValidate(argv.slice(1));
  }
  if (command === "connect") {
    return runJsonCommand(() => runConnect(parseArgs(argv)));
  }
  if (command === "doctor") {
    return runJsonCommand(() => runDoctor(parseArgs(argv)));
  }
  if (command === "status") {
    return runJsonCommand(() => runStatus(parseArgs(argv)));
  }
  if (command === "handoff") {
    return runJsonCommand(() => runHandoff(parseArgs(argv)));
  }
  if (command === "decide") {
    return runJsonCommand(() => runDecide(parseArgs(argv)));
  }
  if (command === "pilot") {
    return runJsonCommand(() => runPilot(parseArgs(argv)));
  }
  if (command === "serve") {
    return runJsonCommand(() => runServe(parseArgs(argv)));
  }
  process.stderr.write(`unknown command: ${command ?? "(none)"}\n`);
  return 1;
}

function runValidate(argv: string[]): number {
  const taskFile = argv[0];
  if (taskFile === undefined || taskFile.trim() === "") {
    process.stderr.write("invalid task contract: task file is required\n");
    return 2;
  }

  try {
    const payload: unknown = JSON.parse(readFileSync(taskFile, "utf8"));
    const task = validateTask(payload);
    const summary = {
      project_id: task.project.id,
      schema_version: task.schema_version,
      source: task.source,
      task_id: task.task_id,
      valid: true,
    };
    process.stdout.write(`${JSON.stringify(summary, [...SUMMARY_KEYS])}\n`);
    return 0;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`invalid task contract: ${reason}\n`);
    return 2;
  }
}

async function runJsonCommand(fn: () => unknown | Promise<unknown>): Promise<number> {
  try {
    const result = await fn();
    process.stdout.write(`${stableStringify({ ok: true, result })}\n`);
    return 0;
  } catch (error) {
    if (error instanceof CommandError) {
      process.stdout.write(`${stableStringify(commandErrorBody(error))}\n`);
      return exitCodeFor(error.code);
    }
    throw error;
  }
}

function runConnect(args: ParsedArgs): unknown {
  assertNoPositionals(args);
  const options = args.options;
  const projectId = requireOption(options, "project-id");
  const repository = requireOption(options, "repository");
  const taskAuthority = requireOption(options, "task-authority");
  const commander = requireOption(options, "commander");
  const grantScope = requireOption(options, "grant-scope");
  rejectUnknownSwitches(args.switches);
  rejectUnknownOptions(options, [
    "project-id",
    "repository",
    "task-authority",
    "commander",
    "grant-scope",
    "project-lead",
    "grant-expires",
  ]);
  return connectWorkspace(process.cwd(), {
    commander,
    grantExpires: options["grant-expires"],
    grantScope,
    projectId,
    projectLead: options["project-lead"],
    repository,
    taskAuthority,
  });
}

function runDoctor(args: ParsedArgs): unknown {
  assertNoPositionals(args);
  rejectUnknownOptions(args.options, []);
  rejectUnknownSwitches(args.switches, ["repair-truncated-tail"]);
  return doctorWorkspace(process.cwd(), {
    repairTruncatedTail: args.switches.has("repair-truncated-tail"),
  });
}

async function runStatus(args: ParsedArgs): Promise<unknown> {
  assertNoPositionals(args);
  const refresh = hasRefreshFlag(args);
  rejectUnknownOptions(args.options, refresh ? [...REFRESH_FLAGS] : []);
  rejectUnknownSwitches(args.switches, refresh ? [...REFRESH_FLAGS] : []);
  return statusWorkspace(process.cwd(), { refresh });
}

function runHandoff(args: ParsedArgs): unknown {
  assertNoPositionals(args);
  rejectUnknownSwitches(args.switches);
  rejectUnknownOptions(args.options, [
    "work-item",
    "completed",
    "remaining",
    "risks",
    "next-review",
  ]);
  return recordHandoff(process.cwd(), {
    completed: requireOption(args.options, "completed"),
    nextReview: args.options["next-review"],
    remaining: requireOption(args.options, "remaining"),
    risks: args.options["risks"],
    workItemId: requireOption(args.options, "work-item"),
  });
}

function runPilot(args: ParsedArgs): unknown {
  assertNoPositionals(args);
  rejectUnknownSwitches(args.switches);
  rejectUnknownOptions(args.options, ["actor", "record"]);
  return recordPilot(process.cwd(), {
    actor: requireOption(args.options, "actor"),
    file: requireOption(args.options, "record"),
  });
}

function runServe(args: ParsedArgs): unknown {
  assertNoPositionals(args);
  rejectUnknownSwitches(args.switches);
  rejectUnknownOptions(args.options, []);
  throw new CommandError(
    "EXPANSION_GATE_CLOSED",
    "loopback web is not implemented; a separate approval is required before serve can listen",
  );
}

const DECIDE_KINDS = [
  "ack",
  "effect",
  "engine",
  "envelope",
  "fact",
  "packet",
  "receipt",
  "result",
  "revise",
] as const satisfies readonly DecideKind[];

function runDecide(args: ParsedArgs): unknown {
  assertNoPositionals(args);
  rejectUnknownSwitches(args.switches);
  rejectUnknownOptions(args.options, ["actor", ...DECIDE_KINDS]);
  const present = DECIDE_KINDS.filter((kind) => args.options[kind] !== undefined);
  if (present.length !== 1) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "decide requires exactly one of --packet --envelope --ack --fact --revise --effect --engine --result --receipt",
    );
  }
  const kind = present[0];
  if (kind === undefined) {
    throw new CommandError("CONTRACT_INVALID", "decide kind is required");
  }
  return decideWorkspace(process.cwd(), {
    actor: requireOption(args.options, "actor"),
    file: requireOption(args.options, kind),
    kind,
  });
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const command = argv[0];
  const options: Record<string, string> = {};
  const switches = new Set<string>();
  const positionals: string[] = [];
  const rest = argv.slice(1);
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === undefined) {
      continue;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq !== -1) {
      options[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = rest[index + 1];
    if (next === undefined || next.startsWith("--")) {
      switches.add(body);
      continue;
    }
    options[body] = next;
    index += 1;
  }
  return { command, options, positionals, switches };
}

function requireOption(
  options: Record<string, string>,
  name: string,
): string {
  const value = options[name];
  if (value === undefined || value.trim() === "") {
    throw new CommandError("CONTRACT_INVALID", `--${name} is required`);
  }
  return value;
}

function assertNoPositionals(args: ParsedArgs): void {
  if (args.positionals.length > 0) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "unexpected positional arguments",
    );
  }
}

function hasRefreshFlag(args: ParsedArgs): boolean {
  return [...Object.keys(args.options), ...args.switches].some((flag) =>
    REFRESH_FLAGS.has(flag),
  );
}

function rejectUnknownOptions(
  options: Record<string, string>,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const name of Object.keys(options)) {
    if (!allowedSet.has(name)) {
      throw new CommandError("CONTRACT_INVALID", `unknown option --${name}`);
    }
  }
}

function rejectUnknownSwitches(
  switches: Set<string>,
  allowed: readonly string[] = [],
): void {
  const allowedSet = new Set(allowed);
  for (const name of switches) {
    if (REFRESH_FLAGS.has(name) && !allowedSet.has(name)) {
      throw new CommandError(
        "CONTRACT_INVALID",
        "explicit refresh is not available for this command",
      );
    }
    if (!allowedSet.has(name)) {
      throw new CommandError("CONTRACT_INVALID", `unknown option --${name}`);
    }
  }
}
