import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { CommandError } from "../src/hufu/errors.js";
import {
  validateAckInput,
  validateEffectInput,
  validateEnvelopeInput,
  validatePacketInput,
} from "../src/hufu/decision-schema.js";

const validPacket = JSON.parse(
  readFileSync(join("tests", "fixtures", "decision", "packet.valid.json"), "utf8"),
) as Record<string, unknown>;
const forbiddenPacket = JSON.parse(
  readFileSync(
    join("tests", "fixtures", "decision", "packet.forbidden-body.json"),
    "utf8",
  ),
) as Record<string, unknown>;

describe("decision schema", () => {
  it("accepts the valid packet fixture", () => {
    assert.equal(validatePacketInput(validPacket)["decision_id"], "decision-demo");
  });

  it("rejects a packet that copies issue body", () => {
    assert.throws(
      () => validatePacketInput(forbiddenPacket),
      (error: unknown) =>
        error instanceof CommandError && error.code === "CONTRACT_INVALID",
    );
  });

  it("rejects a packet missing recheck_when", () => {
    assert.throws(
      () =>
        validatePacketInput({
          acceptance_metric: "a",
          authoritative_state: {
            freshness: "not_applicable",
            observed_at: "2026-08-16T00:00:00.000Z",
            task_ref: "wi-1",
          },
          authority_scope_ref: { grant_id: "g", revision: 1 },
          business_outcome: "o",
          evidence_as_of: "2026-08-16T00:00:00.000Z",
          non_goals: [],
          simplest_safe_route: "s",
          true_stoplines: [],
          unknowns: [],
          verified_facts: [],
          version: 1,
        }),
      (error: unknown) =>
        error instanceof CommandError && error.code === "CONTRACT_INVALID",
    );
  });

  it("rejects an unknown required_because", () => {
    assert.throws(
      () =>
        validateAckInput({
          acceptance_digest: "sha256:aa",
          added_scope: [
            {
              evidence_ref: "e",
              requested_scope: "more",
              required_because: "because_i_said_so",
            },
          ],
          content_digest: "sha256:aa",
          decision_id: "d",
          envelope_id: "e1",
          facts_checked_as_of: "2026-08-16T00:00:00.000Z",
          outcome_digest: "sha256:aa",
          state_digest: "sha256:aa",
          version: 1,
        }),
      (error: unknown) =>
        error instanceof CommandError && error.code === "ACK_INVALID",
    );
  });

  it("rejects an envelope that includes business_outcome", () => {
    assert.throws(
      () =>
        validateEnvelopeInput({
          business_outcome: "nope",
          content_digest: "sha256:aa",
          decision_id: "d",
          executor_principal_id: "human:alice",
          version: 1,
          work_item_ids: ["wi-1"],
        }),
      (error: unknown) =>
        error instanceof CommandError && error.code === "ENVELOPE_INVALID",
    );
  });

  it("rejects applied without complete readback", () => {
    assert.throws(
      () =>
        validateEffectInput({
          decision_id: "d",
          durability: "durable",
          effect_id: "fx",
          envelope_id: "e1",
          observed_result: "applied",
          readback_status: "unavailable",
          version: 1,
        }),
      (error: unknown) =>
        error instanceof CommandError && error.code === "CONTRACT_INVALID",
    );
  });

  it("rejects observed_result 0", () => {
    assert.throws(
      () =>
        validateEffectInput({
          decision_id: "d",
          effect_id: "fx",
          envelope_id: "e1",
          observed_result: 0,
          readback_status: "unavailable",
          version: 1,
        }),
      (error: unknown) =>
        error instanceof CommandError && error.code === "CONTRACT_INVALID",
    );
  });
});
