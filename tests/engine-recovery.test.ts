import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { componentDigest } from "../src/hufu/decision-digest.js";
import { materializeDecision } from "../src/hufu/decision-state.js";
import { readLedger } from "../src/hufu/storage.js";
import {
  bindEngine,
  connectOpenGrant,
  engineFixture,
  parseStdout,
  recordEnvelope,
  recordPacket,
  runHufu,
  statusView,
  withTempDir,
  writeJson,
} from "./decision-harness.js";

function recordEmptyAck(
  dir: string,
  packet: Record<string, unknown>,
  envelopeId: string,
): void {
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
  const path = writeJson(dir, "ack.json", {
    acceptance_digest: componentDigest(materialized.semantic["acceptance_metric"]),
    added_scope: [],
    content_digest: materialized.content_digest,
    decision_id: packet["decision_id"],
    envelope_id: envelopeId,
    facts_checked_as_of: "2026-08-16T12:00:00.000Z",
    outcome_digest: componentDigest(materialized.semantic["business_outcome"]),
    state_digest: componentDigest(materialized.semantic["authoritative_state"]),
    version: materialized.version,
  });
  const result = runHufu(
    ["decide", "--actor", "human:alice", "--ack", path],
    dir,
  );
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`);
  }
}

function recordConfirmedAbsent(
  dir: string,
  packet: Record<string, unknown>,
  envelopeId: string,
): void {
  const path = writeJson(dir, "effect.json", {
    decision_id: packet["decision_id"],
    effect_id: "fx-absent",
    envelope_id: envelopeId,
    observed_at: "2026-08-16T13:10:00.000Z",
    observed_result: "confirmed_absent",
    readback_status: "complete",
    version: 1,
  });
  const result = runHufu(
    ["decide", "--actor", "human:alice", "--effect", path],
    dir,
  );
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`);
  }
}

function guardrailValues(view: Record<string, unknown>): string[] {
  const slot = view["execution_guardrails"] as Record<string, unknown>;
  return (slot["value"] as string[]) ?? [];
}

describe("engine_no_progress recovery", () => {
  it("derives engine_no_progress after stop and confirmed_absent and blocks forward handoff steps", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      const envelopeId = String(envelope["envelope_id"]);
      recordEmptyAck(dir, packet, envelopeId);
      bindEngine(dir);
      recordConfirmedAbsent(dir, packet, envelopeId);
      const path = writeJson(dir, "result.json", {
        ...engineFixture("result-stop.json"),
        decision_id: packet["decision_id"],
        envelope_id: envelopeId,
      });
      assert.equal(
        runHufu(["decide", "--actor", "human:alice", "--result", path], dir)
          .status,
        0,
      );
      const view = statusView(dir);
      assert.equal(guardrailValues(view).includes("engine_no_progress"), true);
      const handoff = runHufu(
        [
          "handoff",
          "--work-item",
          "wi-1",
          "--completed",
          "engine stopped",
          "--remaining",
          "do not continue the old envelope",
        ],
        dir,
      );
      assert.equal(handoff.status, 0, handoff.stdout);
      const result = parseStdout(handoff.stdout)["result"] as Record<
        string,
        unknown
      >;
      assert.match(String(result["next_action_text"]), /blocked by/);
      assert.match(String(result["next_action_text"]), /engine_no_progress/);
      assert.doesNotMatch(
        String(result["next_action_text"]),
        /^Work item wi-1: continue within recorded authorization scope/,
      );
    });
  });

  it("does not derive engine_no_progress when the engine is unbound", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      const envelopeId = String(envelope["envelope_id"]);
      recordEmptyAck(dir, packet, envelopeId);
      recordConfirmedAbsent(dir, packet, envelopeId);
      const view = statusView(dir);
      assert.equal(guardrailValues(view).includes("engine_no_progress"), false);
    });
  });

  it("does not derive engine_no_progress from missing typed results", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      const envelopeId = String(envelope["envelope_id"]);
      recordEmptyAck(dir, packet, envelopeId);
      bindEngine(dir);
      recordConfirmedAbsent(dir, packet, envelopeId);
      const view = statusView(dir);
      assert.equal(guardrailValues(view).includes("engine_no_progress"), false);
    });
  });
});
