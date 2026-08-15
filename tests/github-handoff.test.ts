import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { connectWorkspace } from "../src/hufu/connect.js";
import { CommandError } from "../src/hufu/errors.js";
import { type GitHubPort } from "../src/hufu/github-port.js";
import { recordHandoff } from "../src/hufu/handoff.js";
import { statusWorkspace } from "../src/hufu/status.js";

function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "hufu-gh-handoff-"));
  return fn(dir).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

describe("hufu handoff github", () => {
  it("records a handoff against a cached external ref without calling GitHub", async () => {
    await withTempDir(async (dir) => {
      connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: "read-only projection and handoff",
        projectId: "hufu",
        repository: "https://github.com/Blicae8917/hufu",
        taskAuthority: "github",
      });
      const state = { calls: 0 };
      const port: GitHubPort = {
        async listIssueProjections() {
          state.calls += 1;
          return {
            incomplete: false,
            items: [
              {
                external_ref: "github:Blicae8917/hufu#4",
                native_state: "open",
                original_url: "https://github.com/Blicae8917/hufu/issues/4",
                title: "M3",
                observed_at: "2026-08-15T23:00:00.000Z",
              },
            ],
            observed_at: "2026-08-15T23:00:00.000Z",
          };
        },
      };
      await statusWorkspace(dir, { refresh: true, githubPort: port });
      const before = state.calls;
      const result = recordHandoff(dir, {
        completed: "spec drafted",
        remaining: "implement after accept",
        workItemId: "github:Blicae8917/hufu#4",
      });
      assert.equal(result.work_item_id, "github:Blicae8917/hufu#4");
      assert.match(result.next_action_text, /github:Blicae8917\/hufu#4/);
      assert.equal(state.calls, before);
    });
  });

  it("exits data-insufficient for an unknown github ref", async () => {
    await withTempDir(async (dir) => {
      connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: "read-only projection and handoff",
        projectId: "hufu",
        repository: "https://github.com/Blicae8917/hufu",
        taskAuthority: "github",
      });
      assert.throws(
        () =>
          recordHandoff(dir, {
            completed: "x",
            remaining: "y",
            workItemId: "github:Blicae8917/hufu#4",
          }),
        (error: unknown) =>
          error instanceof CommandError && error.code === "DATA_INSUFFICIENT",
      );
    });
  });
});
