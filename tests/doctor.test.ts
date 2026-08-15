import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
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
  const dir = mkdtempSync(join(tmpdir(), "hufu-doctor-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseStdout(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe("hufu doctor", () => {
  it("reports a healthy ledger after cold start", () => {
    withTempDir((dir) => {
      assert.equal(runHufu(CONNECT_ARGS, dir).status, 0);
      const result = runHufu(["doctor"], dir);
      assert.equal(result.status, 0, result.stderr);
      const body = parseStdout(result.stdout);
      const payload = body["result"] as Record<string, unknown>;
      assert.equal(payload["healthy"], true);
    });
  });

  it("exits 4 when .hufu is missing", () => {
    withTempDir((dir) => {
      const result = runHufu(["doctor"], dir);
      assert.equal(result.status, 4);
    });
  });

  it("fails closed on a malformed middle line and does not rewrite the file", () => {
    withTempDir((dir) => {
      assert.equal(runHufu(CONNECT_ARGS, dir).status, 0);
      const eventsPath = join(dir, ".hufu", "ledger", "events.jsonl");
      const original = readFileSync(eventsPath, "utf8");
      const lines = original.trimEnd().split("\n");
      lines.splice(1, 0, "not-json");
      const damaged = `${lines.join("\n")}\n`;
      writeFileSync(eventsPath, damaged, "utf8");

      const result = runHufu(["doctor"], dir);
      assert.equal(result.status, 3);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "LEDGER_CORRUPT");
      assert.equal(readFileSync(eventsPath, "utf8"), damaged);
    });
  });

  it("repairs only a truncated tail when explicitly requested", () => {
    withTempDir((dir) => {
      assert.equal(runHufu(CONNECT_ARGS, dir).status, 0);
      const eventsPath = join(dir, ".hufu", "ledger", "events.jsonl");
      const original = readFileSync(eventsPath, "utf8");
      writeFileSync(eventsPath, original.slice(0, -8), "utf8");

      const withoutRepair = runHufu(["doctor"], dir);
      assert.equal(withoutRepair.status, 3);

      const repaired = runHufu(["doctor", "--repair-truncated-tail"], dir);
      assert.equal(repaired.status, 0, repaired.stderr);

      const healthy = runHufu(["doctor"], dir);
      assert.equal(healthy.status, 0, healthy.stderr);
      const payload = parseStdout(healthy.stdout)["result"] as Record<
        string,
        unknown
      >;
      assert.equal(payload["healthy"], true);

      const lines = readFileSync(eventsPath, "utf8").trim().split("\n");
      const last = JSON.parse(lines[lines.length - 1] ?? "{}") as {
        event_type?: string;
      };
      assert.equal(last.event_type, "hufu/ledger.repair.truncated_tail");
    });
  });
});
