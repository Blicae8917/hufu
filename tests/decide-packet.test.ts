import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  basePacket,
  connectOpenGrant,
  parseStdout,
  recordPacket,
  runHufu,
  withTempDir,
  writeJson,
} from "./decision-harness.js";

describe("hufu decide --packet", () => {
  it("records version 1 with a content digest", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const recorded = recordPacket(dir, grant_id);
      assert.equal(recorded["version"], 1);
      assert.equal(typeof recorded["content_digest"], "string");
      assert.match(String(recorded["content_digest"]), /^sha256:[0-9a-f]{64}$/);
      const events = readFileSync(
        join(dir, ".hufu", "ledger", "events.jsonl"),
        "utf8",
      )
        .trim()
        .split("\n")
        .filter((line) => line.includes("decision.packet_recorded"));
      assert.equal(events.length, 1);
    });
  });

  it("is idempotent for the same digest", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const first = recordPacket(dir, grant_id);
      const second = recordPacket(dir, grant_id);
      assert.equal(second["content_digest"], first["content_digest"]);
      const events = readFileSync(
        join(dir, ".hufu", "ledger", "events.jsonl"),
        "utf8",
      )
        .trim()
        .split("\n")
        .filter((line) => line.includes("decision.packet_recorded"));
      assert.equal(events.length, 1);
    });
  });

  it("rejects a different body for the same decision id", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      recordPacket(dir, grant_id);
      const changed = basePacket(grant_id);
      changed["business_outcome"] = "a different outcome";
      const path = writeJson(dir, "packet2.json", changed);
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--packet", path],
        dir,
      );
      assert.equal(result.status, 3);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "LEDGER_DIGEST_CONFLICT");
    });
  });

  it("rejects a non-commander actor", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const path = writeJson(dir, "packet.json", basePacket(grant_id));
      const result = runHufu(
        ["decide", "--actor", "human:bob", "--packet", path],
        dir,
      );
      assert.equal(result.status, 2);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "ROLE_NOT_ACTIVE");
    });
  });

  it("exits 4 for an unknown work item", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = basePacket(grant_id);
      (packet["authoritative_state"] as Record<string, unknown>)["task_ref"] =
        "missing";
      const path = writeJson(dir, "packet.json", packet);
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--packet", path],
        dir,
      );
      assert.equal(result.status, 4);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "DATA_INSUFFICIENT");
    });
  });
});
