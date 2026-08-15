import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { connectWorkspace } from "../src/hufu/connect.js";
import { type GitHubPort } from "../src/hufu/github-port.js";
import { statusWorkspace } from "../src/hufu/status.js";

const mainJs = fileURLToPath(new URL("../src/hufu/main.js", import.meta.url));

function runHufu(args: readonly string[], cwd: string) {
  return spawnSync(process.execPath, [mainJs, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HUFU_DENY_NETWORK: "1" },
  });
}

function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "hufu-gh-status-"));
  return fn(dir).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

function parseStdout(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

function countingPort(items = defaultItems()): {
  port: GitHubPort;
  state: { calls: number };
} {
  const state = { calls: 0 };
  return {
    state,
    port: {
      async listIssueProjections() {
        state.calls += 1;
        return {
          incomplete: false,
          items,
          observed_at: "2026-08-15T23:00:00.000Z",
          source_revision: "2026-08-15T22:00:00Z",
        };
      },
    },
  };
}

function defaultItems() {
  return [
    {
      external_ref: "github:Blicae8917/hufu#4",
      native_state: "open",
      original_url: "https://github.com/Blicae8917/hufu/issues/4",
      title: "M3：本仓 GitHub 只读投影",
      observed_at: "2026-08-15T23:00:00.000Z",
      source_revision: "2026-08-15T22:00:00Z",
    },
  ];
}

describe("hufu status github", () => {
  it("does not fetch without --refresh and marks work items data_insufficient", async () => {
    await withTempDir(async (dir) => {
      connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: "read-only projection and handoff",
        projectId: "hufu",
        repository: "https://github.com/Blicae8917/hufu",
        taskAuthority: "github",
      });
      const counted = countingPort();
      const view = await statusWorkspace(dir, { githubPort: counted.port });
      assert.equal(counted.state.calls, 0);
      assert.equal(view.task_authority.value, "github");
      assert.equal(view.work_items.length, 0);
      assert.equal(view.work_item_set.availability, "data_insufficient");
    });
  });

  it("refreshes once, projects observed work items, and keeps body out of JSON", async () => {
    await withTempDir(async (dir) => {
      connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: "read-only projection and handoff",
        projectId: "hufu",
        repository: "https://github.com/Blicae8917/hufu",
        taskAuthority: "github",
      });
      const counted = countingPort();
      const view = await statusWorkspace(dir, {
        githubPort: counted.port,
        refresh: true,
      });
      assert.equal(counted.state.calls, 1);
      assert.equal(view.work_items.length, 1);
      const item = view.work_items[0];
      assert.equal(item?.work_item_id, "github:Blicae8917/hufu#4");
      assert.equal(item?.original_url, "https://github.com/Blicae8917/hufu/issues/4");
      assert.equal(item?.native_state?.fact_class, "observed");
      assert.equal(JSON.stringify(view).includes("THIS BODY"), false);
      assert.notEqual(item?.native_state?.value, 0);
    });
  });

  it("still rejects --refresh for local authority", () => {
    const dir = mkdtempSync(join(tmpdir(), "hufu-gh-status-local-"));
    try {
      const connect = runHufu(
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
      assert.equal(connect.status, 0, connect.stderr);
      const result = runHufu(["status", "--refresh"], dir);
      assert.equal(result.status, 2);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "CONTRACT_INVALID");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
