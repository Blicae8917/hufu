import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { rebaseFingerprint } from "../src/hufu/decision-digest.js";
import { writeProjectionCache } from "../src/hufu/projection-cache.js";
import {
  connectOpenGrant,
  parseStdout,
  recordEnvelope,
  recordPacket,
  runHufu,
  withTempDir,
  writeJson,
} from "./decision-harness.js";

describe("semantic rebase guardrails", () => {
  it("hard-triggers when recheck is due, effect is confirmed absent, and activity grew", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      const effect = writeJson(dir, "effect.json", {
        decision_id: packet["decision_id"],
        effect_id: "fx-none",
        envelope_id: envelope["envelope_id"],
        implementation_activity: true,
        observed_at: "2026-08-16T12:00:00.000Z",
        observed_result: "confirmed_absent",
        readback_status: "complete",
        version: 1,
      });
      assert.equal(
        runHufu(["decide", "--actor", "human:alice", "--effect", effect], dir)
          .status,
        0,
      );
      const status = runHufu(["status"], dir);
      assert.equal(status.status, 0, status.stdout);
      const view = parseStdout(status.stdout)["result"] as Record<string, unknown>;
      const guardrails = view["execution_guardrails"] as Record<string, unknown>;
      assert.ok(
        (guardrails["value"] as string[]).includes("semantic_rebase_required"),
      );
    });
  });

  it("hard-triggers when evidence hits a non-goal", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      const effect = writeJson(dir, "effect.json", {
        decision_id: packet["decision_id"],
        effect_id: "fx-ng",
        envelope_id: envelope["envelope_id"],
        hits_non_goal: true,
        observed_at: "2026-08-16T12:00:00.000Z",
        observed_result: "applied",
        readback_status: "complete",
        version: 1,
      });
      assert.equal(
        runHufu(["decide", "--actor", "human:alice", "--effect", effect], dir)
          .status,
        0,
      );
      const view = parseStdout(runHufu(["status"], dir).stdout)[
        "result"
      ] as Record<string, unknown>;
      const guardrails = view["execution_guardrails"] as Record<string, unknown>;
      assert.ok(
        (guardrails["value"] as string[]).includes("semantic_rebase_required"),
      );
    });
  });

  it("does not hard-trigger zero-effect without readback", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      const effect = writeJson(dir, "effect.json", {
        decision_id: packet["decision_id"],
        effect_id: "fx-unknown",
        envelope_id: envelope["envelope_id"],
        implementation_activity: true,
        readback_status: "unavailable",
        version: 1,
      });
      assert.equal(
        runHufu(["decide", "--actor", "human:alice", "--effect", effect], dir)
          .status,
        0,
      );
      const view = parseStdout(runHufu(["status"], dir).stdout)[
        "result"
      ] as Record<string, unknown>;
      const guardrails = view["execution_guardrails"] as Record<string, unknown>;
      assert.equal(
        (guardrails["value"] as string[]).includes("semantic_rebase_required"),
        false,
      );
      const durable = view["first_durable_effect"] as Record<string, unknown>;
      const value = durable["value"] as Record<string, unknown>;
      assert.notEqual(value["status"], "confirmed_absent");
    });
  });

  it("records a rebase fingerprint only once", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      const effect = writeJson(dir, "effect.json", {
        decision_id: packet["decision_id"],
        effect_id: "fx-none",
        envelope_id: envelope["envelope_id"],
        implementation_activity: true,
        observed_at: "2026-08-16T12:00:00.000Z",
        observed_result: "confirmed_absent",
        readback_status: "complete",
        version: 1,
      });
      assert.equal(
        runHufu(["decide", "--actor", "human:alice", "--effect", effect], dir)
          .status,
        0,
      );
      const fingerprint = rebaseFingerprint({
        decision_id: String(packet["decision_id"]),
        evidence_frontier_seq: 0,
        version: 1,
      });
      const fact = {
        base_version: 1,
        decision_id: packet["decision_id"],
        evidence_frontier: { seq: 1 },
        ops: [{ fact_ref: "rebase", op: "add" }],
        rebase_fingerprint: fingerprint,
      };
      const first = writeJson(dir, "fact1.json", fact);
      const second = writeJson(dir, "fact2.json", fact);
      assert.equal(
        runHufu(["decide", "--actor", "human:alice", "--fact", first], dir)
          .status,
        0,
      );
      const again = runHufu(
        ["decide", "--actor", "human:alice", "--fact", second],
        dir,
      );
      assert.equal(again.status, 0, again.stdout);
      const payload = parseStdout(again.stdout)["result"] as Record<
        string,
        unknown
      >;
      assert.equal(payload["idempotent"], true);
    });
  });

  it("does not introduce timers in decide status or handoff source", () => {
    for (const file of ["decide.ts", "status.ts", "handoff.ts", "guardrails.ts"]) {
      const source = readFileSync(join("src", "hufu", file), "utf8");
      assert.doesNotMatch(source, /setInterval|setTimeout/);
    }
  });

  it("does not call GitHub when recording a github packet", () => {
    withTempDir((dir) => {
      const connect = runHufu(
        [
          "connect",
          "--project-id",
          "hufu",
          "--repository",
          "https://github.com/Blicae8917/hufu",
          "--task-authority",
          "github",
          "--commander",
          "human:alice",
          "--grant-scope",
          "read-only projection and handoff",
        ],
        dir,
        { ...process.env, HUFU_DENY_NETWORK: "1" },
      );
      assert.equal(connect.status, 0, connect.stderr);
      const grant = parseStdout(connect.stdout)["result"] as Record<
        string,
        unknown
      >;
      writeProjectionCache(dir, {
        cache_schema_version: 1,
        incomplete: false,
        items: [
          {
            external_ref: "github:Blicae8917/hufu#6",
            native_state: "open",
            original_url: "https://github.com/Blicae8917/hufu/issues/6",
            observed_at: "2026-08-16T00:00:00.000Z",
            title: "zero copy",
          },
        ],
        observed_at: "2026-08-16T00:00:00.000Z",
        repository: "Blicae8917/hufu",
        task_authority: "github",
      });
      const packet = {
        acceptance_metric: "m",
        authoritative_state: {
          freshness: "fresh",
          observed_at: "2026-08-16T00:00:00.000Z",
          task_ref: "github:Blicae8917/hufu#6",
        },
        authority_scope_ref: {
          grant_id: grant["grant_id"],
          revision: grant["grant_revision"],
        },
        business_outcome: "o",
        evidence_as_of: "2026-08-16T00:00:00.000Z",
        non_goals: [],
        recheck_when: { type: "implementation_activity" },
        simplest_safe_route: "s",
        true_stoplines: [],
        unknowns: [],
        verified_facts: [],
        version: 1,
      };
      const path = writeJson(dir, "packet.json", packet);
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--packet", path],
        dir,
        { ...process.env, HUFU_DENY_NETWORK: "1" },
      );
      assert.equal(result.status, 0, result.stdout);
      const missing = writeJson(dir, "packet-missing.json", {
        ...packet,
        decision_id: "other",
        authoritative_state: {
          freshness: "fresh",
          observed_at: "2026-08-16T00:00:00.000Z",
          task_ref: "github:Blicae8917/hufu#99",
        },
      });
      const unknown = runHufu(
        ["decide", "--actor", "human:alice", "--packet", missing],
        dir,
        { ...process.env, HUFU_DENY_NETWORK: "1" },
      );
      assert.equal(unknown.status, 4);
    });
  });
});
