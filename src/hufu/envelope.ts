import { digestPayload, DIGEST_SPEC_VERSION } from "./digest.js";
import { CommandError, isJsonObject } from "./errors.js";

export const EVENT_SCHEMA_VERSION = 1;

export const EVENT_TYPES = [
  "hufu/project.connected",
  "hufu/commander.declared",
  "hufu/authorization_grant.issued",
  "hufu/role_binding.established",
  "hufu/work_item.opened",
  "hufu/handoff.recorded",
  "hufu/ledger.repair.truncated_tail",
  "hufu/decision.packet_recorded",
  "hufu/decision.envelope_attached",
  "hufu/decision.route_acked",
  "hufu/decision.fact_delta",
  "hufu/decision.decision_delta",
  "hufu/decision.effect_delta",
  "hufu/engine.bound",
  "hufu/engine.typed_result",
  "hufu/engine.receipt",
  "hufu/pilot.recorded",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface EventEnvelope {
  readonly event_id: string;
  readonly event_type: EventType;
  readonly event_schema_version: number;
  readonly ledger_seq: number;
  readonly occurred_at: string;
  readonly actor_binding_ref: string;
  readonly caused_by?: string;
  readonly idempotency_key: string;
  readonly payload_digest: string;
  readonly digest_spec_version: typeof DIGEST_SPEC_VERSION;
  readonly writer_id: string;
  readonly payload: Record<string, unknown>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OCCURRED_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const EVENT_TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);
const ENVELOPE_FIELD_NAMES = new Set([
  "actor_binding_ref",
  "caused_by",
  "digest_spec_version",
  "event_id",
  "event_schema_version",
  "event_type",
  "idempotency_key",
  "ledger_seq",
  "occurred_at",
  "payload",
  "payload_digest",
  "writer_id",
]);

export function isEventType(value: string): value is EventType {
  return EVENT_TYPE_SET.has(value);
}

export function validateEnvelope(value: unknown): EventEnvelope {
  if (!isJsonObject(value)) {
    throw new CommandError("CONTRACT_INVALID", "event must be a JSON object");
  }

  const eventType = requiredText(value, "event_type");
  if (!isEventType(eventType)) {
    throw new CommandError(
      "SCHEMA_UNSUPPORTED",
      `unsupported event_type: ${eventType}`,
    );
  }

  const eventSchemaVersion = requiredPositiveInteger(
    value,
    "event_schema_version",
  );
  if (eventSchemaVersion !== EVENT_SCHEMA_VERSION) {
    throw new CommandError(
      "SCHEMA_UNSUPPORTED",
      eventSchemaVersion > EVENT_SCHEMA_VERSION
        ? "event_schema_version is newer than this module supports"
        : "event_schema_version is not supported",
    );
  }

  const eventId = requiredText(value, "event_id");
  if (!UUID_RE.test(eventId)) {
    throw new CommandError("CONTRACT_INVALID", "event_id must be a lowercase UUID");
  }

  const ledgerSeq = requiredPositiveInteger(value, "ledger_seq");
  const occurredAt = requiredText(value, "occurred_at");
  if (!OCCURRED_AT_RE.test(occurredAt)) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "occurred_at must be UTC ISO-8601 with milliseconds",
    );
  }

  const actorBindingRef = requiredText(value, "actor_binding_ref");
  const idempotencyKey = requiredText(value, "idempotency_key");
  const payloadDigest = requiredText(value, "payload_digest");
  if (!DIGEST_RE.test(payloadDigest)) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "payload_digest must be sha256:<hex>",
    );
  }

  const digestSpecVersion = requiredText(value, "digest_spec_version");
  if (digestSpecVersion !== DIGEST_SPEC_VERSION) {
    throw new CommandError(
      "SCHEMA_UNSUPPORTED",
      "digest_spec_version is not supported",
    );
  }

  const writerId = requiredText(value, "writer_id");
  const payloadValue = value["payload"];
  if (!isJsonObject(payloadValue)) {
    throw new CommandError("CONTRACT_INVALID", "payload must be a JSON object");
  }
  for (const key of Object.keys(payloadValue)) {
    if (ENVELOPE_FIELD_NAMES.has(key)) {
      throw new CommandError(
        "CONTRACT_INVALID",
        "payload must not contain envelope fields",
      );
    }
  }

  const expectedDigest = digestPayload(payloadValue);
  if (expectedDigest !== payloadDigest) {
    throw new CommandError(
      "LEDGER_DIGEST_CONFLICT",
      "payload_digest does not match payload",
    );
  }

  const causedByValue = value["caused_by"];
  let causedBy: string | undefined;
  if (causedByValue !== undefined) {
    if (typeof causedByValue !== "string" || causedByValue.trim() === "") {
      throw new CommandError(
        "CONTRACT_INVALID",
        "caused_by must be a non-empty string when provided",
      );
    }
    causedBy = causedByValue;
  }

  const envelope: EventEnvelope = {
    event_id: eventId,
    event_type: eventType,
    event_schema_version: eventSchemaVersion,
    ledger_seq: ledgerSeq,
    occurred_at: occurredAt,
    actor_binding_ref: actorBindingRef,
    idempotency_key: idempotencyKey,
    payload_digest: payloadDigest,
    digest_spec_version: DIGEST_SPEC_VERSION,
    writer_id: writerId,
    payload: payloadValue,
  };
  if (causedBy !== undefined) {
    return { ...envelope, caused_by: causedBy };
  }
  return envelope;
}

function requiredText(
  payload: Record<string, unknown>,
  field: string,
): string {
  const value = payload[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new CommandError(
      "CONTRACT_INVALID",
      `${field} must be a non-empty string`,
    );
  }
  return value;
}

function requiredPositiveInteger(
  payload: Record<string, unknown>,
  field: string,
): number {
  if (!(field in payload)) {
    throw new CommandError(
      "CONTRACT_INVALID",
      `${field} must be a positive integer`,
    );
  }
  const value = payload[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new CommandError(
      "CONTRACT_INVALID",
      `${field} must be a positive integer`,
    );
  }
  return value;
}
