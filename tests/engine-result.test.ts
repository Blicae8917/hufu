import assert from "node:assert/strict";
import { describe, it } from "node:test";

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

describe("hufu decide --result", () => {
  it("records a bound progress result with result_id kind and content_digest", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      bindEngine(dir);
      const path = writeJson(dir, "result.json", {
        ...engineFixture("result-progress.json"),
        decision_id: packet["decision_id"],
        envelope_id: envelope["envelope_id"],
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--result", path],
        dir,
      );
      assert.equal(result.status, 0, result.stdout);
      const payload = parseStdout(result.stdout)["result"] as Record<
        string,
        unknown
      >;
      assert.equal(payload["result_id"], "result-progress");
      assert.equal(payload["kind"], "progress");
      assert.match(String(payload["content_digest"]), /^sha256:[0-9a-f]{64}$/);
      assert.equal(typeof payload["ledger_seq"], "number");
      const view = statusView(dir);
      const typed = view["typed_result"] as Record<string, unknown>;
      const value = typed["value"] as Record<string, unknown>;
      assert.equal(typed["availability"], "available");
      assert.equal(value["kind"], "progress");
      assert.equal(value["result_id"], "result-progress");
      assert.equal(value["envelope_id"], envelope["envelope_id"]);
      assert.doesNotMatch(JSON.stringify(view), /"goal_id"/);
      const durable = view["first_durable_effect"] as Record<string, unknown>;
      const durableValue = durable["value"] as Record<string, unknown> | null;
      assert.notEqual(durableValue?.["status"], "applied");
      const items = view["work_items"] as Array<Record<string, unknown>>;
      assert.equal(
        items.some((item) => String(item["work_item_id"]).startsWith("goal-")),
        false,
      );
    });
  });

  it("rejects an unbound result with ENGINE_NOT_BOUND", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      const path = writeJson(dir, "result.json", {
        ...engineFixture("result-progress.json"),
        decision_id: packet["decision_id"],
        envelope_id: envelope["envelope_id"],
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--result", path],
        dir,
      );
      assert.equal(result.status, 4);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "ENGINE_NOT_BOUND");
    });
  });

  it("rejects a result without an envelope as DATA_INSUFFICIENT", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      bindEngine(dir);
      const path = writeJson(dir, "result.json", engineFixture("result-progress.json"));
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--result", path],
        dir,
      );
      assert.equal(result.status, 4);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "DATA_INSUFFICIENT");
    });
  });

  it("rejects an illegal kind as CONTRACT_INVALID", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      bindEngine(dir);
      const path = writeJson(dir, "result.json", {
        ...engineFixture("result-progress.json"),
        decision_id: packet["decision_id"],
        envelope_id: envelope["envelope_id"],
        kind: "success",
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--result", path],
        dir,
      );
      assert.equal(result.status, 2);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "CONTRACT_INVALID");
    });
  });

  it("rejects goal-as-work-item.json as ENGINE_AUTHORITY_REJECTED", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      bindEngine(dir);
      const path = writeJson(dir, "result.json", {
        ...engineFixture("goal-as-work-item.json"),
        decision_id: packet["decision_id"],
        envelope_id: envelope["envelope_id"],
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--result", path],
        dir,
      );
      assert.equal(result.status, 2);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "ENGINE_AUTHORITY_REJECTED");
    });
  });

  it("rejects scheduler-hint.json as ENGINE_CONTROL_PLANE_REJECTED", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      bindEngine(dir);
      const path = writeJson(dir, "result.json", {
        ...engineFixture("scheduler-hint.json"),
        decision_id: packet["decision_id"],
        envelope_id: envelope["envelope_id"],
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--result", path],
        dir,
      );
      assert.equal(result.status, 2);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "ENGINE_CONTROL_PLANE_REJECTED");
    });
  });
});
