import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  const dir = mkdtempSync(join(tmpdir(), "hufu-connect-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseStdout(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe("hufu connect", () => {
  it("writes a local cold start and prints grant and project lead identities", () => {
    withTempDir((dir) => {
      const result = runHufu(CONNECT_ARGS, dir);
      assert.equal(result.status, 0, result.stderr);
      const body = parseStdout(result.stdout);
      assert.equal(body["ok"], true);
      const payload = body["result"] as Record<string, unknown>;
      assert.equal(typeof payload["grant_id"], "string");
      assert.equal(typeof payload["project_lead_binding_id"], "string");
      assert.notEqual(payload["grant_id"], "");
      assert.notEqual(payload["project_lead_binding_id"], "");

      const events = readFileSync(
        join(dir, ".hufu", "ledger", "events.jsonl"),
        "utf8",
      )
        .trim()
        .split("\n");
      assert.equal(events.length, 4);
    });
  });

  it("is idempotent for the same payload and does not duplicate bootstrap events", () => {
    withTempDir((dir) => {
      const first = runHufu(CONNECT_ARGS, dir);
      assert.equal(first.status, 0, first.stderr);
      const firstBody = parseStdout(first.stdout)["result"] as Record<
        string,
        unknown
      >;

      const second = runHufu(CONNECT_ARGS, dir);
      assert.equal(second.status, 0, second.stderr);
      const secondBody = parseStdout(second.stdout)["result"] as Record<
        string,
        unknown
      >;
      assert.equal(secondBody["grant_id"], firstBody["grant_id"]);
      assert.equal(
        secondBody["project_lead_binding_id"],
        firstBody["project_lead_binding_id"],
      );

      const events = readFileSync(
        join(dir, ".hufu", "ledger", "events.jsonl"),
        "utf8",
      )
        .trim()
        .split("\n");
      assert.equal(events.length, 4);
    });
  });

  it("rejects github task_authority with exit 2", () => {
    withTempDir((dir) => {
      const args = CONNECT_ARGS.map((value) =>
        value === "local" ? "github" : value,
      );
      const result = runHufu(args, dir);
      assert.equal(result.status, 2, result.stderr);
      const body = parseStdout(result.stdout);
      assert.equal(body["ok"], false);
      const error = body["error"] as Record<string, unknown>;
      assert.equal(error["code"], "REPOSITORY_NOT_ALLOWED");
      assert.equal(existsSync(join(dir, ".hufu")), false);
    });
  });

  it("rejects connect when write.lock already exists", () => {
    withTempDir((dir) => {
      const ledgerDir = join(dir, ".hufu", "ledger");
      mkdirSync(ledgerDir, { recursive: true });
      writeFileSync(join(ledgerDir, "write.lock"), "{}\n", "utf8");
      const result = runHufu(CONNECT_ARGS, dir);
      assert.equal(result.status, 3, result.stderr);
      const body = parseStdout(result.stdout);
      const error = body["error"] as Record<string, unknown>;
      assert.equal(error["code"], "LEDGER_WRITER_CONFLICT");
      assert.equal(existsSync(join(ledgerDir, "events.jsonl")), false);
    });
  });
});
