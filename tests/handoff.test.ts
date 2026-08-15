import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { openWorkItem } from "../src/hufu/work-item.js";

const mainJs = fileURLToPath(new URL("../src/hufu/main.js", import.meta.url));

const CONNECT_ARGS = [
  "connect",
  "--project-id",
  "demo",
  "--repository",
  "https://example.com/demo.git",
  "--task-authority",
  "local",
  "--commander",
  "human:alice",
  "--grant-scope",
  "local ledger and handoff",
] as const;

function runHufu(args: readonly string[], cwd: string) {
  return spawnSync(process.execPath, [mainJs, ...args], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
}

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "hufu-handoff-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseStdout(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

function connectAndOpen(dir: string): void {
  assert.equal(runHufu(CONNECT_ARGS, dir).status, 0);
  openWorkItem(dir, {
    objective: "Implement local ledger commands",
    terminal_conditions: ["tests pass"],
    work_item_id: "wi-1",
  });
}

describe("hufu handoff", () => {
  it("records a handoff whose next action names the work item", () => {
    withTempDir((dir) => {
      connectAndOpen(dir);
      const result = runHufu(
        [
          "handoff",
          "--work-item",
          "wi-1",
          "--completed",
          "spec kit artifacts",
          "--remaining",
          "implementation",
          "--risks",
          "none",
        ],
        dir,
      );
      assert.equal(result.status, 0, result.stderr);
      const payload = parseStdout(result.stdout)["result"] as Record<
        string,
        unknown
      >;
      assert.equal(typeof payload["next_action_text"], "string");
      assert.match(String(payload["next_action_text"]), /wi-1/);
    });
  });

  it("exits 4 when the work item is unknown", () => {
    withTempDir((dir) => {
      assert.equal(runHufu(CONNECT_ARGS, dir).status, 0);
      const result = runHufu(
        [
          "handoff",
          "--work-item",
          "missing",
          "--completed",
          "x",
          "--remaining",
          "y",
        ],
        dir,
      );
      assert.equal(result.status, 4);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "DATA_INSUFFICIENT");
    });
  });

  it("exits 2 when --completed is missing", () => {
    withTempDir((dir) => {
      connectAndOpen(dir);
      const result = runHufu(
        ["handoff", "--work-item", "wi-1", "--remaining", "y"],
        dir,
      );
      assert.equal(result.status, 2);
    });
  });

  it("exits 3 when write.lock is present", () => {
    withTempDir((dir) => {
      connectAndOpen(dir);
      writeFileSync(join(dir, ".hufu", "ledger", "write.lock"), "{}\n", "utf8");
      const result = runHufu(
        [
          "handoff",
          "--work-item",
          "wi-1",
          "--completed",
          "x",
          "--remaining",
          "y",
        ],
        dir,
      );
      assert.equal(result.status, 3);
    });
  });
});
