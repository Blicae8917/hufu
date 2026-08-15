import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const mainJs = fileURLToPath(new URL("../src/hufu/main.js", import.meta.url));

function runHufu(args: readonly string[], cwd: string) {
  return spawnSync(process.execPath, [mainJs, ...args], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
}

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "hufu-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("hufu validate", () => {
  it("prints a key-sorted ValidateSummary and exits 0", () => {
    const payload = {
      schema_version: "0.1",
      task_id: "task-42",
      project: { id: "demo-project", repository: "https://example.com/demo.git" },
      source: "native",
      objective: "Validate a task.",
      authorization_scope: ["read repository"],
      terminal_conditions: ["validation succeeds"],
    };

    withTempDir((dir) => {
      const taskFile = join(dir, "task.json");
      writeFileSync(taskFile, JSON.stringify(payload), "utf8");
      const result = runHufu(["validate", taskFile], dir);

      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        result.stdout.trim(),
        '{"project_id":"demo-project","schema_version":"0.1","source":"native","task_id":"task-42","valid":true}',
      );
    });
  });

  it("exits 2 for {} and mentions schema_version on stderr", () => {
    withTempDir((dir) => {
      const taskFile = join(dir, "task.json");
      writeFileSync(taskFile, "{}", "utf8");
      const result = runHufu(["validate", taskFile], dir);

      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^invalid task contract: /);
      assert.match(result.stderr, /schema_version/);
    });
  });

  it("exits 2 for malformed JSON", () => {
    withTempDir((dir) => {
      const taskFile = join(dir, "task.json");
      writeFileSync(taskFile, "{", "utf8");
      const result = runHufu(["validate", taskFile], dir);

      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^invalid task contract: /);
    });
  });

  it("exits 2 for a missing file", () => {
    withTempDir((dir) => {
      const result = runHufu(["validate", join(dir, "missing.json")], dir);

      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^invalid task contract: /);
    });
  });
});

describe("unsupported product commands", () => {
  for (const command of ["connect", "doctor", "status", "handoff"] as const) {
    it(`rejects ${command} without creating .hufu/`, () => {
      withTempDir((dir) => {
        const result = runHufu([command], dir);

        assert.notEqual(result.status, 0);
        assert.equal(existsSync(join(dir, ".hufu")), false);
        assert.doesNotMatch(result.stdout, /"valid"\s*:\s*true/);
        assert.doesNotMatch(result.stderr, /already (connected|available)/i);
      });
    });
  }
});
