import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { connectWorkspace } from "../src/hufu/connect.js";
import { CommandError } from "../src/hufu/errors.js";
import { openWorkItem } from "../src/hufu/work-item.js";

const mainJs = fileURLToPath(new URL("../src/hufu/main.js", import.meta.url));

const GITHUB_CONNECT_ARGS = [
  "connect",
  "--project-id",
  "hufu",
  "--repository",
  "https://github.com/Blicae8917/hufu",
  "--task-authority",
  "github",
  "--commander",
  "human:alice",
  "--grant-scope",
  "read-only projection and handoff",
] as const;

function runHufu(args: readonly string[], cwd: string) {
  return spawnSync(process.execPath, [mainJs, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HUFU_DENY_NETWORK: "1" },
  });
}

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "hufu-gh-connect-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseStdout(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe("hufu connect github", () => {
  it("connects this public repository without fetching", () => {
    withTempDir((dir) => {
      const result = runHufu(GITHUB_CONNECT_ARGS, dir);
      assert.equal(result.status, 0, result.stderr);
      const payload = parseStdout(result.stdout)["result"] as Record<
        string,
        unknown
      >;
      assert.equal(payload["task_authority"], "github");
      assert.equal(payload["repository_canonical"], "Blicae8917/hufu");
    });
  });

  it("rejects another github repository with exit 2", () => {
    withTempDir((dir) => {
      const args = GITHUB_CONNECT_ARGS.map((value) =>
        value === "https://github.com/Blicae8917/hufu"
          ? "https://github.com/other/repo"
          : value,
      );
      const result = runHufu(args, dir);
      assert.equal(result.status, 2);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "REPOSITORY_NOT_ALLOWED");
      assert.equal(existsSync(join(dir, ".hufu")), false);
    });
  });

  it("rejects github after a local connection", () => {
    withTempDir((dir) => {
      const local = runHufu(
        [
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
        ],
        dir,
      );
      assert.equal(local.status, 0, local.stderr);
      const result = runHufu(GITHUB_CONNECT_ARGS, dir);
      assert.equal(result.status, 3);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "LEDGER_CAUSALITY_CONFLICT");
    });
  });

  it("rejects opening a local work item on a github project", () => {
    withTempDir((dir) => {
      connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: "read-only projection and handoff",
        projectId: "hufu",
        repository: "https://github.com/Blicae8917/hufu",
        taskAuthority: "github",
      });
      assert.throws(
        () =>
          openWorkItem(dir, {
            objective: "nope",
            terminal_conditions: ["x"],
            work_item_id: "wi-1",
          }),
        (error: unknown) =>
          error instanceof CommandError &&
          error.code === "TASK_AUTHORITY_UNSUPPORTED",
      );
    });
  });
});
