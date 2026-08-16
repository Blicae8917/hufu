import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { connectWorkspace } from "../src/hufu/connect.js";
import { decideWorkspace } from "../src/hufu/decide.js";
import { CommandError } from "../src/hufu/errors.js";
import { type GitLabPort } from "../src/hufu/gitlab-port.js";
import { statusWorkspace } from "../src/hufu/status.js";
import { basePacket } from "./decision-harness.js";

function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "hufu-gl-decide-"));
  return fn(dir).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

describe("hufu decide gitlab", () => {
  it("records a packet against a cached gitlab ref without networking", async () => {
    await withTempDir(async (dir) => {
      const connected = connectWorkspace(dir, {
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
      const packet = basePacket(connected.grant_id);
      (packet["authoritative_state"] as Record<string, unknown>)["task_ref"] =
        "gitlab:example-group/example-project#456";
      const result = decideWorkspace(dir, {
        actor: "human:alice",
        kind: "packet",
        payload: packet,
      });
      assert.equal(result["version"], 1);
      assert.equal(state.calls, before);
      assert.equal(JSON.stringify(result).includes("THIS DESCRIPTION"), false);
      assert.equal(JSON.stringify(packet).includes("THIS DESCRIPTION"), false);
    });
  });

  it("rejects a github task_ref on a gitlab project", async () => {
    await withTempDir(async (dir) => {
      const connected = connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: "read-only projection and handoff",
        projectId: "demo",
        repository: "example-group/example-project",
        taskAuthority: "gitlab",
      });
      const packet = basePacket(connected.grant_id);
      (packet["authoritative_state"] as Record<string, unknown>)["task_ref"] =
        "github:Blicae8917/hufu#4";
      assert.throws(
        () =>
          decideWorkspace(dir, {
            actor: "human:alice",
            kind: "packet",
            payload: packet,
          }),
        (error: unknown) =>
          error instanceof CommandError && error.code === "EXTERNAL_REF_INVALID",
      );
    });
  });
});
