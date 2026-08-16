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

function recordProgressResult(
  dir: string,
  packet: Record<string, unknown>,
  envelope: Record<string, unknown>,
): Record<string, unknown> {
  const path = writeJson(dir, "result.json", {
    ...engineFixture("result-progress.json"),
    decision_id: packet["decision_id"],
    envelope_id: envelope["envelope_id"],
  });
  const result = runHufu(
    ["decide", "--actor", "human:alice", "--result", path],
    dir,
  );
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`);
  }
  return parseStdout(result.stdout)["result"] as Record<string, unknown>;
}

describe("hufu decide --receipt", () => {
  it("records a receipt against an existing result without changing grant revision", () => {
    withTempDir((dir) => {
      const { grant_id, grant_revision } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      bindEngine(dir);
      recordProgressResult(dir, packet, envelope);
      const path = writeJson(dir, "receipt.json", engineFixture("receipt.json"));
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--receipt", path],
        dir,
      );
      assert.equal(result.status, 0, result.stdout);
      const payload = parseStdout(result.stdout)["result"] as Record<
        string,
        unknown
      >;
      assert.equal(payload["receipt_id"], "receipt-1");
      assert.equal(payload["ok"], true);
      assert.equal(typeof payload["ledger_seq"], "number");
      const view = statusView(dir);
      const grant = (view["authorization_grant"] as Record<string, unknown>)[
        "value"
      ] as Record<string, unknown>;
      assert.equal(grant["revision"], grant_revision);
      const durable = view["first_durable_effect"] as Record<string, unknown>;
      const durableValue = durable["value"] as Record<string, unknown> | null;
      assert.notEqual(durableValue?.["status"], "applied");
      const receipt = view["receipt"] as Record<string, unknown>;
      const receiptValue = receipt["value"] as Record<string, unknown>;
      assert.equal(receipt["availability"], "available");
      assert.equal(receiptValue["ok"], true);
      assert.equal(receiptValue["result_id"], "result-progress");
    });
  });

  it("rejects grant_id or observed_result as RECEIPT_INVALID", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      bindEngine(dir);
      recordProgressResult(dir, packet, envelope);
      for (const extra of [{ grant_id: "g-1" }, { observed_result: "applied" }]) {
        const path = writeJson(dir, "receipt.json", {
          ...engineFixture("receipt.json"),
          ...extra,
        });
        const result = runHufu(
          ["decide", "--actor", "human:alice", "--receipt", path],
          dir,
        );
        assert.equal(result.status, 2, result.stdout);
        const error = parseStdout(result.stdout)["error"] as Record<
          string,
          unknown
        >;
        assert.equal(error["code"], "RECEIPT_INVALID");
      }
    });
  });

  it("rejects an unbound receipt with ENGINE_NOT_BOUND", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      const path = writeJson(dir, "receipt.json", engineFixture("receipt.json"));
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--receipt", path],
        dir,
      );
      assert.equal(result.status, 4);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "ENGINE_NOT_BOUND");
    });
  });

  it("rejects an unknown result_id as DATA_INSUFFICIENT", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      recordEnvelope(dir, packet);
      bindEngine(dir);
      const path = writeJson(dir, "receipt.json", engineFixture("receipt.json"));
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--receipt", path],
        dir,
      );
      assert.equal(result.status, 4);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "DATA_INSUFFICIENT");
    });
  });
});
