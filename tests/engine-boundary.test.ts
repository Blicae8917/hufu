import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { connectWorkspace } from "../src/hufu/connect.js";
import { decideWorkspace } from "../src/hufu/decide.js";
import { enginePort, type EnginePort } from "../src/hufu/engine-loopx.js";
import { type GitHubPort } from "../src/hufu/github-port.js";
import { type GitLabPort } from "../src/hufu/gitlab-port.js";
import { statusWorkspace } from "../src/hufu/status.js";
import {
  basePacket,
  bindEngine,
  connectOpenGrant,
  engineFixture,
  recordEnvelope,
  recordPacket,
  runHufu,
  withTempDir,
  writeJson,
} from "./decision-harness.js";

type ForbiddenEngineMethods = Extract<
  keyof EnginePort,
  "createGoal" | "heartbeat" | "quota" | "schedule" | "startAgent"
>;
type ForbiddenGitHubWrites = Extract<
  keyof GitHubPort,
  "closeIssue" | "createIssue" | "createNote" | "updateIssue"
>;
type ForbiddenGitLabWrites = Extract<
  keyof GitLabPort,
  "closeIssue" | "createIssue" | "createNote" | "updateIssue"
>;

const enginePortHasNoControlPlane: [ForbiddenEngineMethods] extends [never]
  ? true
  : false = true;
const githubPortHasNoWrites: [ForbiddenGitHubWrites] extends [never] ? true : false =
  true;
const gitlabPortHasNoWrites: [ForbiddenGitLabWrites] extends [never] ? true : false =
  true;

function withAsyncTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "hufu-engine-boundary-"));
  return fn(dir).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

function ledgerText(dir: string): string {
  return readFileSync(join(dir, ".hufu", "ledger", "events.jsonl"), "utf8");
}

describe("engine boundary", () => {
  it("keeps EnginePort free of scheduler heartbeat quota and goal APIs", () => {
    assert.equal(enginePortHasNoControlPlane, true);
    assert.equal("schedule" in enginePort, false);
    assert.equal("heartbeat" in enginePort, false);
    assert.equal("quota" in enginePort, false);
    assert.equal("startAgent" in enginePort, false);
    assert.equal("createGoal" in enginePort, false);
  });

  it("rejects goal_id and scheduler_hint payloads without writing them", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      bindEngine(dir);
      const before = ledgerText(dir);
      for (const [name, code] of [
        ["goal-as-work-item.json", "ENGINE_AUTHORITY_REJECTED"],
        ["scheduler-hint.json", "ENGINE_CONTROL_PLANE_REJECTED"],
      ] as const) {
        const payload = {
          ...engineFixture(name),
          decision_id: packet["decision_id"],
          envelope_id: envelope["envelope_id"],
        };
        const path = writeJson(dir, name, payload);
        const result = runHufu(
          ["decide", "--actor", "human:alice", "--result", path],
          dir,
        );
        assert.equal(result.status, 2, result.stdout);
        const body = JSON.parse(result.stdout) as {
          error?: { code?: string };
        };
        assert.equal(body.error?.code, code);
        assert.equal(ledgerText(dir).includes(name.split(".")[0] ?? name), false);
      }
      assert.equal(ledgerText(dir), before);
    });
  });

  it("does not call GitHubPort for result or receipt and exposes no issue writes", async () => {
    assert.equal(githubPortHasNoWrites, true);
    await withAsyncTempDir(async (dir) => {
      const connected = connectWorkspace(dir, {
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
      assert.equal("createIssue" in port, false);
      assert.equal("updateIssue" in port, false);
      assert.equal("closeIssue" in port, false);
      await statusWorkspace(dir, { refresh: true, githubPort: port });
      const packet = basePacket(connected.grant_id);
      (packet["authoritative_state"] as Record<string, unknown>)["task_ref"] =
        "github:Blicae8917/hufu#4";
      const recorded = decideWorkspace(dir, {
        actor: "human:alice",
        kind: "packet",
        payload: packet,
      });
      const envelope = decideWorkspace(dir, {
        actor: "human:alice",
        kind: "envelope",
        payload: {
          content_digest: recorded["content_digest"],
          decision_id: recorded["decision_id"],
          executor_principal_id: "human:alice",
          version: recorded["version"],
          work_item_ids: ["github:Blicae8917/hufu#4"],
        },
      });
      decideWorkspace(dir, {
        actor: "human:alice",
        kind: "engine",
        payload: { engine_id: "loopx-mechanisms" },
      });
      const before = state.calls;
      const typed = decideWorkspace(dir, {
        actor: "human:alice",
        kind: "result",
        payload: {
          ...engineFixture("result-progress.json"),
          decision_id: recorded["decision_id"],
          envelope_id: envelope["envelope_id"],
        },
      });
      decideWorkspace(dir, {
        actor: "human:alice",
        kind: "receipt",
        payload: {
          ...engineFixture("receipt.json"),
          result_id: typed["result_id"],
        },
      });
      assert.equal(state.calls, before);
    });
  });

  it("does not call GitLabPort for result or receipt and exposes no issue writes", async () => {
    assert.equal(gitlabPortHasNoWrites, true);
    await withAsyncTempDir(async (dir) => {
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
      assert.equal("createIssue" in port, false);
      assert.equal("updateIssue" in port, false);
      assert.equal("closeIssue" in port, false);
      await statusWorkspace(dir, { refresh: true, gitlabPort: port });
      const packet = basePacket(connected.grant_id);
      (packet["authoritative_state"] as Record<string, unknown>)["task_ref"] =
        "gitlab:example-group/example-project#456";
      const recorded = decideWorkspace(dir, {
        actor: "human:alice",
        kind: "packet",
        payload: packet,
      });
      const envelope = decideWorkspace(dir, {
        actor: "human:alice",
        kind: "envelope",
        payload: {
          content_digest: recorded["content_digest"],
          decision_id: recorded["decision_id"],
          executor_principal_id: "human:alice",
          version: recorded["version"],
          work_item_ids: ["gitlab:example-group/example-project#456"],
        },
      });
      decideWorkspace(dir, {
        actor: "human:alice",
        kind: "engine",
        payload: { engine_id: "loopx-mechanisms" },
      });
      const before = state.calls;
      const typed = decideWorkspace(dir, {
        actor: "human:alice",
        kind: "result",
        payload: {
          ...engineFixture("result-progress.json"),
          decision_id: recorded["decision_id"],
          envelope_id: envelope["envelope_id"],
        },
      });
      decideWorkspace(dir, {
        actor: "human:alice",
        kind: "receipt",
        payload: {
          ...engineFixture("receipt.json"),
          result_id: typed["result_id"],
        },
      });
      assert.equal(state.calls, before);
    });
  });

  it("does not treat CommandError from a missing engine as a network failure", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      const path = writeJson(dir, "result.json", engineFixture("result-progress.json"));
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--result", path],
        dir,
      );
      assert.equal(result.status, 4);
      const error = JSON.parse(result.stdout) as { error?: { code?: string } };
      assert.equal(error.error?.code, "ENGINE_NOT_BOUND");
      assert.doesNotMatch(result.stdout, /ECONNREFUSED|fetch failed|ENOTFOUND/);
    });
  });
});
