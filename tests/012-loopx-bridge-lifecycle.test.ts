import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { connectWorkspace } from "../src/hufu/connect.js";
import { CommandError } from "../src/hufu/errors.js";
import {
  assertAuthorityCrossing,
  assertEvidenceCrossing,
  bridgePort,
  type BridgePort,
} from "../src/hufu/loopx-bridge.js";
import { readLedger } from "../src/hufu/storage.js";

type ForbiddenWrites = Extract<
  keyof BridgePort,
  "writeIssue" | "closeIssue" | "commentIssue" | "merge"
>;
type ForbiddenControlPlane = Extract<
  keyof BridgePort,
  "schedule" | "heartbeat" | "quota" | "startAgent" | "createGoal"
>;

const bridgeHasNoIssueWrites: [ForbiddenWrites] extends [never] ? true : false = true;
const bridgeHasNoControlPlane: [ForbiddenControlPlane] extends [never] ? true : false =
  true;

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "hufu-bridge-life-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function ledgerText(dir: string): string {
  return readFileSync(join(dir, ".hufu", "ledger", "events.jsonl"), "utf8");
}

function legalAuthority(
  taskAuthority: "github" | "gitlab",
  taskRef: string,
  grantId: string,
): Record<string, unknown> {
  return {
    authority_scope_ref: { grant_id: grantId, revision: 1 },
    freshness: "fresh",
    observed_at: "2026-08-23T00:00:00.000Z",
    source_revision: "rev-example",
    task_authority: taskAuthority,
    task_ref: taskRef,
  };
}

describe("012 LoopX bridge lifecycle (#58)", () => {
  it("does not expose issue write methods on the bridge port", () => {
    assert.equal(bridgeHasNoIssueWrites, true);
    assert.equal("writeIssue" in bridgePort, false);
    assert.equal("closeIssue" in bridgePort, false);
    assert.equal("commentIssue" in bridgePort, false);
    assert.equal("merge" in bridgePort, false);
    assert.equal(bridgeHasNoControlPlane, true);
  });

  it("does not call issue writes when task_authority is github or gitlab", () => {
    withTempDir((dir) => {
      const github = connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: "read-only projection and handoff",
        projectId: "hufu",
        repository: "https://github.com/Blicae8917/hufu",
        taskAuthority: "github",
      });
      const before = ledgerText(dir);
      const crossing = assertAuthorityCrossing(
        legalAuthority("github", "github:Blicae8917/hufu#58", github.grant_id),
      );
      assert.equal(crossing.task_authority, "github");
      assert.equal(ledgerText(dir), before);
    });
  });

  it("rejects LoopX Goal completion as a native Issue close", () => {
    withTempDir((dir) => {
      const gitlab = connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: "read-only projection and handoff",
        projectId: "demo",
        repository: "example-group/example-project",
        taskAuthority: "gitlab",
      });
      const before = ledgerText(dir);
      assert.throws(
        () =>
          assertEvidenceCrossing({
            availability: "available",
            close_issue: true,
            evidence_ref: "ev-goal-done",
            fact_class: "observed",
            freshness: "fresh",
            goal_completed: true,
            task_authority: "gitlab",
          }),
        (error: unknown) =>
          error instanceof CommandError &&
          (error.code === "BRIDGE_LIFECYCLE_REJECTED" ||
            error.code === "BRIDGE_CONTROL_PLANE_REJECTED"),
      );
      assert.throws(
        () =>
          assertAuthorityCrossing({
            ...legalAuthority(
              "gitlab",
              "gitlab:example-group/example-project#456",
              gitlab.grant_id,
            ),
            closeIssue: true,
            goal_id: "goal-done",
          }),
        (error: unknown) =>
          error instanceof CommandError &&
          (error.code === "BRIDGE_LIFECYCLE_REJECTED" ||
            error.code === "BRIDGE_CONTROL_PLANE_REJECTED"),
      );
      assert.equal(ledgerText(dir), before);
      const snapshot = readLedger(dir);
      if (snapshot.status === "missing") {
        throw new Error("ledger missing");
      }
      assert.equal(
        snapshot.events.some((event) => event.event_type.startsWith("hufu/mutation.")),
        false,
      );
    });
  });
});
