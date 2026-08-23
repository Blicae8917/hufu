import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { connectWorkspace } from "../src/hufu/connect.js";
import { CommandError } from "../src/hufu/errors.js";
import {
  acceptTypedResult,
  assertAuthorityCrossing,
  assertDecisionCrossing,
  assertEvidenceCrossing,
  isBridgeEnabled,
  projectBridgeSnapshot,
} from "../src/hufu/loopx-bridge.js";
import { readLedger } from "../src/hufu/storage.js";
import {
  bindEngine,
  connectOpenGrant,
  withTempDir,
} from "./decision-harness.js";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;
const EXAMPLE_TASK_REF = "gitlab:example-group/example-project#456";

function legalAuthority(grantId: string, revision = 1): Record<string, unknown> {
  return {
    authority_scope_ref: { grant_id: grantId, revision },
    freshness: "fresh",
    observed_at: "2026-08-23T00:00:00.000Z",
    session_binding_ref: { binding_id: "bind-example", generation: 1 },
    source_revision: "rev-example",
    task_authority: "gitlab",
    task_ref: EXAMPLE_TASK_REF,
  };
}

function legalDecision(): Record<string, unknown> {
  return {
    content_digest: DIGEST_A,
    decision_id: "decision-demo",
    execution_envelope_ref: {
      content_digest: DIGEST_B,
      decision_ref: {
        content_digest: DIGEST_A,
        decision_id: "decision-demo",
        version: 1,
      },
      envelope_id: "env-example",
    },
    version: 1,
  };
}

function legalEvidence(): Record<string, unknown> {
  return {
    availability: "available",
    binds_decision_id: "decision-demo",
    binds_task_ref: EXAMPLE_TASK_REF,
    effect_ref: { effect_id: "eff-example" },
    evidence_ref: "ev-example",
    fact_class: "observed",
    freshness: "fresh",
    observed_at: "2026-08-23T00:00:00.000Z",
    receipt_ref: { receipt_id: "rcpt-example" },
    typed_result_ref: { result_id: "tr-example" },
  };
}

function ledgerText(dir: string): string {
  return readFileSync(join(dir, ".hufu", "ledger", "events.jsonl"), "utf8");
}

function currentGrantRevision(dir: string): number {
  const snapshot = readLedger(dir);
  if (snapshot.status === "missing") {
    throw new Error("ledger missing");
  }
  const grants = snapshot.events.filter(
    (event) => event.event_type === "hufu/authorization_grant.issued",
  );
  const grant = grants[grants.length - 1];
  return Number(grant?.payload["revision"]);
}

function assertRejected(
  fn: () => unknown,
  code: string,
): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof CommandError, String(error));
    assert.equal(error.code, code);
    return true;
  });
}

describe("012 LoopX bridge adapter (#58)", () => {
  it("rejects Journal, Receipt, TypedResult, and observed_result as AuthorizationGrant", () => {
    withTempDir((dir) => {
      const { grant_id, grant_revision } = connectOpenGrant(dir);
      const before = ledgerText(dir);
      const forbidden = [
        { inferred_from: "journal", journal: "host said done", authority_scope_ref: { grant_id, revision: 2 } },
        { ok: true, receipt_id: "rcpt-1", authority_scope_ref: { grant_id, revision: 2 } },
        { kind: "progress", result_id: "tr-1", authority_scope_ref: { grant_id, revision: 2 } },
        { observed_result: "applied", authority_scope_ref: { grant_id, revision: 2 } },
      ] as const;
      for (const payload of forbidden) {
        assertRejected(
          () => assertAuthorityCrossing(payload),
          "BRIDGE_AUTHORITY_REJECTED",
        );
      }
      assert.equal(ledgerText(dir), before);
      assert.equal(currentGrantRevision(dir), grant_revision);
    });
  });

  it("rejects scope_text, goal_id, and business_outcome payloads without writing the ledger", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const before = ledgerText(dir);
      assertRejected(
        () =>
          assertAuthorityCrossing({
            ...legalAuthority(grant_id),
            scope_text: "expand grant from loopx",
          }),
        "BRIDGE_AUTHORITY_REJECTED",
      );
      assertRejected(
        () =>
          assertAuthorityCrossing({
            ...legalAuthority(grant_id),
            goal_id: "goal-example",
          }),
        "BRIDGE_CONTROL_PLANE_REJECTED",
      );
      assertRejected(
        () =>
          assertDecisionCrossing({
            ...legalDecision(),
            business_outcome: "Ship the feature",
          }),
        "BRIDGE_AUTHORITY_REJECTED",
      );
      assert.equal(ledgerText(dir), before);
      assert.doesNotMatch(before, /expand grant from loopx|goal-example|Ship the feature/);
    });
  });

  it("rejects promoting loopx-mechanisms or engine_id to task_authority", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      bindEngine(dir);
      const snapshot = readLedger(dir);
      assert.equal(snapshot.status, "ready");
      assert.equal(isBridgeEnabled(snapshot.events), false);
      for (const task_authority of ["loopx-mechanisms", "engine_id", "loopx", "engine", "bridge"]) {
        assertRejected(
          () =>
            assertAuthorityCrossing({
              ...legalAuthority(grant_id),
              task_authority,
            }),
          "BRIDGE_008_PROMOTION_REJECTED",
        );
      }
    });
  });

  it("accepts legal three-side refs and does not change grant_revision", () => {
    withTempDir((dir) => {
      const { grant_id, grant_revision } = connectOpenGrant(dir);
      const authority = assertAuthorityCrossing(legalAuthority(grant_id));
      const decision = assertDecisionCrossing(legalDecision());
      const evidence = assertEvidenceCrossing(legalEvidence());
      assert.equal(authority.authority_scope_ref.grant_id, grant_id);
      assert.equal(authority.authority_scope_ref.revision, grant_revision);
      assert.equal(decision.decision_id, "decision-demo");
      assert.equal(evidence.evidence_ref, "ev-example");
      assert.equal(currentGrantRevision(dir), grant_revision);
      assert.equal("scope_text" in authority, false);
      assert.equal("business_outcome" in decision, false);
      assert.equal("ok" in evidence, false);
    });
  });

  it("rejects scope_text, business_outcome, and Receipt ok on otherwise legal crossings", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      assertRejected(
        () =>
          assertAuthorityCrossing({
            ...legalAuthority(grant_id),
            scope_text: "commander grant body",
          }),
        "BRIDGE_AUTHORITY_REJECTED",
      );
      assertRejected(
        () =>
          assertDecisionCrossing({
            ...legalDecision(),
            business_outcome: "Record one canonical decision",
          }),
        "BRIDGE_AUTHORITY_REJECTED",
      );
      assertRejected(
        () =>
          assertEvidenceCrossing({
            ...legalEvidence(),
            ok: true,
          }),
        "BRIDGE_AUTHORITY_REJECTED",
      );
    });
  });

  it("rejects deriving authority_scope_ref from Journal, Receipt, TypedResult, or observed_result", () => {
    const derivations = [
      { authority_scope_ref: { grant_id: "g-1", revision: 1 }, journal: "done" },
      { authority_scope_ref: { grant_id: "g-1", revision: 1 }, receipt: { ok: true } },
      { authority_scope_ref: { grant_id: "g-1", revision: 1 }, typed_result: { kind: "progress" } },
      { authority_scope_ref: { grant_id: "g-1", revision: 1 }, observed_result: "applied" },
    ] as const;
    for (const payload of derivations) {
      assertRejected(() => assertAuthorityCrossing(payload), "BRIDGE_AUTHORITY_REJECTED");
    }
  });

  it("reports missing observations as data_insufficient and never writes 0", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      assertRejected(
        () =>
          assertAuthorityCrossing({
            ...legalAuthority(grant_id),
            observed_at: 0,
          }),
        "DATA_INSUFFICIENT",
      );
      assertRejected(
        () =>
          assertAuthorityCrossing({
            ...legalAuthority(grant_id),
            source_revision: 0,
          }),
        "DATA_INSUFFICIENT",
      );
      const ledger = readLedger(dir);
      const projected = projectBridgeSnapshot(
        ledger.status === "missing" ? [] : ledger.events,
      );
      const serialized = JSON.stringify(projected);
      assert.doesNotMatch(serialized, /:0([,}\]])/);
      assert.equal(serialized.includes('"observed_at":0'), false);
    });
  });

  it("accepts a TypedResultRef without expanding AuthorizationGrant", () => {
    withTempDir((dir) => {
      const connected = connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: "local ledger and handoff",
        projectId: "demo",
        repository: "https://example.com/demo.git",
        taskAuthority: "local",
      });
      const beforeRevision = connected.grant_revision;
      const accepted = acceptTypedResult({ result_id: "tr-example" });
      assert.equal(accepted.accepted, true);
      assert.equal(accepted.inferred_grant, false);
      assert.equal(accepted.grant_revision_unchanged, true);
      assert.equal(accepted.typed_result_ref.result_id, "tr-example");
      assert.equal(currentGrantRevision(dir), beforeRevision);
      assertRejected(
        () =>
          acceptTypedResult({
            result_id: "tr-example",
            authority_scope_ref: { grant_id: connected.grant_id, revision: beforeRevision + 1 },
          }),
        "BRIDGE_AUTHORITY_REJECTED",
      );
      assert.equal(currentGrantRevision(dir), beforeRevision);
    });
  });
});
