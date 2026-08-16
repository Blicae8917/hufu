import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { openWorkItem } from "../src/hufu/work-item.js";
import {
  connectOpenGrant,
  parseStdout,
  recordEnvelope,
  recordPacket,
  runHufu,
  withTempDir,
  writeJson,
} from "./decision-harness.js";

describe("hufu decide --envelope", () => {
  it("attaches a single-item envelope and creates an owner binding", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const envelope = recordEnvelope(dir, packet);
      assert.equal(typeof envelope["owner_binding_id"], "string");
      const view = parseStdout(runHufu(["status"], dir).stdout)[
        "result"
      ] as Record<string, unknown>;
      const slot = view["execution_envelope"] as Record<string, unknown>;
      const value = slot["value"] as Record<string, unknown>;
      assert.equal(value["content_digest"], packet["content_digest"]);
      const guardrails = view["execution_guardrails"] as Record<string, unknown>;
      assert.deepEqual(guardrails["value"], ["ack_required"]);
    });
  });

  it("rejects an envelope that copies business_outcome", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const path = writeJson(dir, "bad-envelope.json", {
        business_outcome: "copied",
        content_digest: packet["content_digest"],
        decision_id: packet["decision_id"],
        executor_principal_id: "human:alice",
        version: packet["version"],
        work_item_ids: ["wi-1"],
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--envelope", path],
        dir,
      );
      assert.equal(result.status, 2);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "ENVELOPE_INVALID");
    });
  });

  it("rejects a digest mismatch", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const path = writeJson(dir, "envelope.json", {
        content_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        decision_id: packet["decision_id"],
        executor_principal_id: "human:alice",
        version: packet["version"],
        work_item_ids: ["wi-1"],
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--envelope", path],
        dir,
      );
      assert.equal(result.status, 3);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "DECISION_CONFLICT");
    });
  });

  it("rejects a non-lead actor", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      const path = writeJson(dir, "envelope.json", {
        content_digest: packet["content_digest"],
        decision_id: packet["decision_id"],
        executor_principal_id: "human:alice",
        version: packet["version"],
        work_item_ids: ["wi-1"],
      });
      const result = runHufu(
        ["decide", "--actor", "human:bob", "--envelope", path],
        dir,
      );
      assert.equal(result.status, 2);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "ROLE_NOT_ACTIVE");
    });
  });

  it("creates a mission_lead binding for two work items", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      openWorkItem(dir, {
        objective: "second item",
        terminal_conditions: ["done"],
        work_item_id: "wi-2",
      });
      const packet = recordPacket(dir, grant_id);
      const path = writeJson(dir, "envelope.json", {
        content_digest: packet["content_digest"],
        decision_id: packet["decision_id"],
        executor_principal_id: "human:alice",
        version: packet["version"],
        work_item_ids: ["wi-1", "wi-2"],
      });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--envelope", path],
        dir,
      );
      assert.equal(result.status, 0, result.stdout);
      const payload = parseStdout(result.stdout)["result"] as Record<
        string,
        unknown
      >;
      assert.equal(typeof payload["mission_lead_binding_id"], "string");
    });
  });
});
