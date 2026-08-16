import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

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
  const dir = mkdtempSync(join(tmpdir(), "hufu-status-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseStdout(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe("hufu status", () => {
  it("projects local task_authority with fact axes after connect", () => {
    withTempDir((dir) => {
      assert.equal(runHufu(CONNECT_ARGS, dir).status, 0);
      const result = runHufu(["status"], dir);
      assert.equal(result.status, 0, result.stderr);
      const view = parseStdout(result.stdout)["result"] as Record<string, unknown>;
      const taskAuthority = view["task_authority"] as Record<string, unknown>;
      assert.equal(taskAuthority["value"], "local");
      assert.equal(typeof taskAuthority["fact_class"], "string");
      assert.equal(typeof taskAuthority["availability"], "string");
      assert.equal(typeof taskAuthority["freshness"], "string");
    });
  });

  it("marks session and run as not available and does not use 0 as a missing value", () => {
    withTempDir((dir) => {
      assert.equal(runHufu(CONNECT_ARGS, dir).status, 0);
      const view = parseStdout(runHufu(["status"], dir).stdout)[
        "result"
      ] as Record<string, unknown>;
      for (const key of ["session", "run"] as const) {
        const slot = view[key] as Record<string, unknown>;
        assert.notEqual(slot["availability"], "available");
        assert.notEqual(slot["value"], 0);
        assert.equal(slot["value"], null);
      }
    });
  });

  it("marks decision slots data_insufficient when none is recorded", () => {
    withTempDir((dir) => {
      assert.equal(runHufu(CONNECT_ARGS, dir).status, 0);
      const view = parseStdout(runHufu(["status"], dir).stdout)[
        "result"
      ] as Record<string, unknown>;
      assert.equal(view["view_schema_version"], 1);
      for (const key of [
        "decision",
        "execution_envelope",
        "route_ack",
        "first_durable_effect",
      ] as const) {
        const slot = view[key] as Record<string, unknown>;
        assert.equal(slot["availability"], "data_insufficient");
        assert.equal(slot["value"], null);
        assert.notEqual(slot["value"], 0);
      }
      const guardrails = view["execution_guardrails"] as Record<string, unknown>;
      assert.deepEqual(guardrails["value"], []);
    });
  });

  it("rejects --refresh as a contract error", () => {
    withTempDir((dir) => {
      assert.equal(runHufu(CONNECT_ARGS, dir).status, 0);
      const result = runHufu(["status", "--refresh"], dir);
      assert.equal(result.status, 2);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "CONTRACT_INVALID");
    });
  });

  it("exits 4 when the workspace is not connected", () => {
    withTempDir((dir) => {
      const result = runHufu(["status"], dir);
      assert.equal(result.status, 4);
    });
  });
});
