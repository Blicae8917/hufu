import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  connectOpenGrant,
  parseStdout,
  recordEnvelope,
  recordPacket,
  runHufu,
  withTempDir,
  writeJson,
} from "./decision-harness.js";

describe("hufu decide deltas", () => {
  it("keeps version 1 after a fact delta", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const path = writeJson(dir, "fact.json", {
        base_version: 1,
        decision_id: packet["decision_id"],
        evidence_frontier: { seq: 1 },
        ops: [{ fact_ref: "f-1", op: "add" }],
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--fact", path],
        dir,
      );
      assert.equal(result.status, 0, result.stdout);
      const payload = parseStdout(result.stdout)["result"] as Record<
        string,
        unknown
      >;
      assert.equal(payload["version"], 1);
      const view = parseStdout(runHufu(["status"], dir).stdout)[
        "result"
      ] as Record<string, unknown>;
      const decision = (view["decision"] as Record<string, unknown>)[
        "value"
      ] as Record<string, unknown>;
      assert.equal(decision["version"], 1);
    });
  });

  it("revises to version 2 and stale-marks the old envelope", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      recordEnvelope(dir, packet);
      const path = writeJson(dir, "revise.json", {
        changed_fields: { simplest_safe_route: "stop and rebase" },
        decision_id: packet["decision_id"],
        expected_version: 1,
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--revise", path],
        dir,
      );
      assert.equal(result.status, 0, result.stdout);
      const payload = parseStdout(result.stdout)["result"] as Record<
        string,
        unknown
      >;
      assert.equal(payload["new_version"], 2);
      assert.notEqual(payload["content_digest"], packet["content_digest"]);
      const view = parseStdout(runHufu(["status"], dir).stdout)[
        "result"
      ] as Record<string, unknown>;
      const guardrails = view["execution_guardrails"] as Record<string, unknown>;
      assert.ok((guardrails["value"] as string[]).includes("stale_envelope"));
    });
  });

  it("rejects a second successor for the same version", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const first = writeJson(dir, "revise1.json", {
        changed_fields: { simplest_safe_route: "route a" },
        decision_id: packet["decision_id"],
        expected_version: 1,
      });
      assert.equal(
        runHufu(["decide", "--actor", "human:alice", "--revise", first], dir)
          .status,
        0,
      );
      const second = writeJson(dir, "revise2.json", {
        changed_fields: { simplest_safe_route: "route b" },
        decision_id: packet["decision_id"],
        expected_version: 1,
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--revise", second],
        dir,
      );
      assert.equal(result.status, 3);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "DECISION_CONFLICT");
    });
  });

  it("rejects a version jump", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const path = writeJson(dir, "revise.json", {
        changed_fields: { simplest_safe_route: "jump" },
        decision_id: packet["decision_id"],
        expected_version: 4,
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--revise", path],
        dir,
      );
      assert.equal(result.status, 3);
    });
  });

  it("rejects applied or zero without complete readback", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      for (const observed_result of ["applied", "confirmed_absent", 0] as const) {
        const path = writeJson(dir, `effect-${String(observed_result)}.json`, {
          decision_id: packet["decision_id"],
          effect_id: "fx-1",
          envelope_id: envelope["envelope_id"],
          observed_result,
          readback_status: "unavailable",
          version: 1,
        });
        const result = runHufu(
          ["decide", "--actor", "human:alice", "--effect", path],
          dir,
        );
        assert.equal(result.status, 2, result.stdout);
      }
    });
  });

  it("projects first durable effect after complete applied readback", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      const path = writeJson(dir, "effect.json", {
        decision_id: packet["decision_id"],
        durability: "durable",
        effect_id: "fx-done",
        envelope_id: envelope["envelope_id"],
        observed_at: "2026-08-16T12:00:00.000Z",
        observed_result: "applied",
        readback_status: "complete",
        version: 1,
      });
      assert.equal(
        runHufu(["decide", "--actor", "human:alice", "--effect", path], dir)
          .status,
        0,
      );
      const view = parseStdout(runHufu(["status"], dir).stdout)[
        "result"
      ] as Record<string, unknown>;
      const durable = view["first_durable_effect"] as Record<string, unknown>;
      const value = durable["value"] as Record<string, unknown>;
      assert.equal(value["status"], "applied");
    });
  });
});
