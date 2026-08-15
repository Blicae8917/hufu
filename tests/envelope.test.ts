import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { digestPayload } from "../src/hufu/digest.js";
import { CommandError } from "../src/hufu/errors.js";
import { validateEnvelope } from "../src/hufu/envelope.js";

const payload = {
  project_id: "demo",
  repository: "https://example.com/demo.git",
  stale_after_hours: 24,
  task_authority: "local",
};

function validEnvelope(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    actor_binding_ref: "human:alice",
    digest_spec_version: "1",
    event_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    event_schema_version: 1,
    event_type: "hufu/project.connected",
    idempotency_key: "connect:demo:local",
    ledger_seq: 1,
    occurred_at: "2026-08-15T12:00:00.000Z",
    payload,
    payload_digest: digestPayload(payload),
    writer_id: "pid:1",
    ...overrides,
  };
}

describe("event envelope v1", () => {
  it("accepts a legal envelope", () => {
    const envelope = validateEnvelope(validEnvelope());
    assert.equal(envelope.ledger_seq, 1);
    assert.equal(envelope.event_schema_version, 1);
    assert.match(envelope.payload_digest, /^sha256:[0-9a-f]{64}$/);
  });

  it("rejects a missing ledger_seq", () => {
    const payload = validEnvelope();
    delete payload["ledger_seq"];
    assert.throws(
      () => validateEnvelope(payload),
      (error: unknown) =>
        error instanceof CommandError && error.code === "CONTRACT_INVALID",
    );
  });

  it("rejects a missing payload_digest", () => {
    const payload = validEnvelope();
    delete payload["payload_digest"];
    assert.throws(
      () => validateEnvelope(payload),
      (error: unknown) =>
        error instanceof CommandError && error.code === "CONTRACT_INVALID",
    );
  });

  it("fails closed when event_schema_version is greater than 1", () => {
    assert.throws(
      () => validateEnvelope(validEnvelope({ event_schema_version: 2 })),
      (error: unknown) =>
        error instanceof CommandError && error.code === "SCHEMA_UNSUPPORTED",
    );
  });
});
