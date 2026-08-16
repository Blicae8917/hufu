import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { componentDigest } from "../src/hufu/decision-digest.js";
import { materializeDecision } from "../src/hufu/decision-state.js";
import { readLedger } from "../src/hufu/storage.js";
import {
  connectOpenGrant,
  parseStdout,
  recordEnvelope,
  recordPacket,
  runHufu,
  withTempDir,
  writeJson,
} from "./decision-harness.js";

function ackBody(
  dir: string,
  packet: Record<string, unknown>,
  envelopeId: string,
  extras: Record<string, unknown> = {},
): string {
  const snapshot = readLedger(dir);
  if (snapshot.status !== "ready") {
    throw new Error("ledger missing");
  }
  const materialized = materializeDecision(
    snapshot.events,
    String(packet["decision_id"]),
  );
  if (materialized === undefined) {
    throw new Error("decision missing");
  }
  return writeJson(dir, "ack.json", {
    acceptance_digest: componentDigest(materialized.semantic["acceptance_metric"]),
    added_scope: [],
    content_digest: materialized.content_digest,
    decision_id: packet["decision_id"],
    envelope_id: envelopeId,
    facts_checked_as_of: "2026-08-16T12:00:00.000Z",
    outcome_digest: componentDigest(materialized.semantic["business_outcome"]),
    state_digest: componentDigest(materialized.semantic["authoritative_state"]),
    version: materialized.version,
    ...extras,
  });
}

describe("hufu decide --ack", () => {
  it("clears ack_required for an empty added_scope", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      const path = ackBody(dir, packet, String(envelope["envelope_id"]));
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--ack", path],
        dir,
      );
      assert.equal(result.status, 0, result.stdout);
      const view = parseStdout(runHufu(["status"], dir).stdout)[
        "result"
      ] as Record<string, unknown>;
      const guardrails = view["execution_guardrails"] as Record<string, unknown>;
      assert.deepEqual(guardrails["value"], []);
      assert.doesNotMatch(result.stdout, /approved|rejected/);
    });
  });

  it("returns scope_change_required without changing the grant", () => {
    withTempDir((dir) => {
      const { grant_id, grant_revision } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      const path = ackBody(dir, packet, String(envelope["envelope_id"]), {
        added_scope: [
          {
            evidence_ref: "ev-gap",
            requested_scope: "write production",
            required_because: "actual_permission_gap",
          },
        ],
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--ack", path],
        dir,
      );
      assert.equal(result.status, 0, result.stdout);
      const payload = parseStdout(result.stdout)["result"] as Record<
        string,
        unknown
      >;
      assert.deepEqual(payload["guardrails"], ["scope_change_required"]);
      const view = parseStdout(runHufu(["status"], dir).stdout)[
        "result"
      ] as Record<string, unknown>;
      const grant = view["authorization_grant"] as Record<string, unknown>;
      const grantValue = grant["value"] as Record<string, unknown>;
      assert.equal(grantValue["revision"], grant_revision);
      const guardrails = view["execution_guardrails"] as Record<string, unknown>;
      assert.ok(
        (guardrails["value"] as string[]).includes("scope_change_required"),
      );
      const handoff = runHufu(
        [
          "handoff",
          "--work-item",
          "wi-1",
          "--completed",
          "ack recorded",
          "--remaining",
          "wait for grant",
        ],
        dir,
      );
      assert.equal(handoff.status, 0, handoff.stdout);
      const handoffResult = parseStdout(handoff.stdout)["result"] as Record<
        string,
        unknown
      >;
      assert.match(String(handoffResult["next_action_text"]), /scope_change_required/);
      assert.doesNotMatch(
        String(handoffResult["next_action_text"]),
        /continue decision/,
      );
    });
  });

  it("rejects an illegal required_because", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      const path = ackBody(dir, packet, String(envelope["envelope_id"]), {
        added_scope: [
          {
            evidence_ref: "ev",
            requested_scope: "more",
            required_because: "nice_to_have",
          },
        ],
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--ack", path],
        dir,
      );
      assert.equal(result.status, 2);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "ACK_INVALID");
    });
  });

  it("rejects tampered component digests", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      const path = ackBody(dir, packet, String(envelope["envelope_id"]), {
        outcome_digest:
          "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--ack", path],
        dir,
      );
      assert.equal(result.status, 2);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "ACK_INVALID");
    });
  });

  it("rejects a second ack with a different digest", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      const first = ackBody(dir, packet, String(envelope["envelope_id"]));
      assert.equal(
        runHufu(["decide", "--actor", "human:alice", "--ack", first], dir)
          .status,
        0,
      );
      const second = ackBody(dir, packet, String(envelope["envelope_id"]), {
        added_scope: [
          {
            evidence_ref: "ev-gap",
            requested_scope: "write production",
            required_because: "data_safety",
          },
        ],
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--ack", second],
        dir,
      );
      assert.equal(result.status, 3);
    });
  });
});
