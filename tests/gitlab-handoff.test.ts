import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { connectWorkspace } from "../src/hufu/connect.js";
import { CommandError } from "../src/hufu/errors.js";
import { type GitLabPort } from "../src/hufu/gitlab-port.js";
import { recordHandoff } from "../src/hufu/handoff.js";
import { statusWorkspace } from "../src/hufu/status.js";

function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "hufu-gl-handoff-"));
  return fn(dir).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

describe("hufu handoff gitlab", () => {
  it("records a handoff against a cached gitlab ref without calling GitLab", async () => {
    await withTempDir(async (dir) => {
      connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: "read-only projection and handoff",
        projectId: "demo",
        repository: "example-group/example-project",
        taskAuthority: "gitlab",
      });
      const state = { calls: 0 };
      const port: GitLabPort = {
        async listIssueProjections() {
          state.calls += 1;
          return {
            incomplete: false,
            items: [
              {
                external_ref: "gitlab:example-group/example-project#456",
                native_state: "opened",
                original_url:
                  "https://gitlab.com/example-group/example-project/-/issues/456",
                title: "M6",
                observed_at: "2026-08-16T12:00:00.000Z",
              },
            ],
            observed_at: "2026-08-16T12:00:00.000Z",
          };
        },
      };
      await statusWorkspace(dir, { refresh: true, gitlabPort: port });
      const before = state.calls;
      const result = recordHandoff(dir, {
        completed: "spec drafted",
        remaining: "implement after accept",
        workItemId: "gitlab:example-group/example-project#456",
      });
      assert.equal(result.work_item_id, "gitlab:example-group/example-project#456");
      assert.match(result.next_action_text, /gitlab:example-group\/example-project#456/);
      assert.equal(state.calls, before);
    });
  });

  it("exits data-insufficient for an unknown gitlab ref and rejects github refs", async () => {
    await withTempDir(async (dir) => {
      connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: "read-only projection and handoff",
        projectId: "demo",
        repository: "example-group/example-project",
        taskAuthority: "gitlab",
      });
      assert.throws(
        () =>
          recordHandoff(dir, {
            completed: "x",
            remaining: "y",
            workItemId: "gitlab:example-group/example-project#456",
          }),
        (error: unknown) =>
          error instanceof CommandError && error.code === "DATA_INSUFFICIENT",
      );
      assert.throws(
        () =>
          recordHandoff(dir, {
            completed: "x",
            remaining: "y",
            workItemId: "github:Blicae8917/hufu#4",
          }),
        (error: unknown) =>
          error instanceof CommandError && error.code === "EXTERNAL_REF_INVALID",
      );
    });
  });
});
