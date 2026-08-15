import { readFileSync } from "node:fs";

import { validateTask } from "./contracts.js";

const SUMMARY_KEYS = [
  "project_id",
  "schema_version",
  "source",
  "task_id",
  "valid",
] as const;

export function main(argv: string[]): number {
  const command = argv[0];
  if (command !== "validate") {
    process.stderr.write(`unknown command: ${command ?? "(none)"}\n`);
    return 1;
  }

  const taskFile = argv[1];
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
