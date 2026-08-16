import { PACKET_DIGEST_FIELDS } from "./decision-digest.js";
import { CommandError, isJsonObject } from "./errors.js";

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REQUIRED_BECAUSE = new Set([
  "actual_permission_gap",
  "data_safety",
  "effect_readback_unavailable",
  "irreversible_action",
]);
const ENVELOPE_FORBIDDEN = new Set([
  "acceptance_metric",
  "authoritative_state",
  "authority_scope_ref",
  "business_outcome",
  "non_goals",
  "simplest_safe_route",
  "true_stoplines",
  "unknowns",
  "verified_facts",
]);

export function requiredText(
  value: Record<string, unknown>,
  field: string,
): string {
  const raw = value[field];
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new CommandError("CONTRACT_INVALID", `${field} must be a non-empty string`);
  }
  return raw.trim();
}

export function optionalText(
  value: Record<string, unknown>,
  field: string,
): string | undefined {
  if (!(field in value) || value[field] === undefined) {
    return undefined;
  }
  return requiredText(value, field);
}

export function requiredIso(
  value: Record<string, unknown>,
  field: string,
): string {
  const text = requiredText(value, field);
  if (!ISO_RE.test(text)) {
    throw new CommandError(
      "CONTRACT_INVALID",
      `${field} must be UTC ISO-8601 with milliseconds`,
    );
  }
  return text;
}

export function requiredPositiveInteger(
  value: Record<string, unknown>,
  field: string,
): number {
  const raw = value[field];
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new CommandError(
      "CONTRACT_INVALID",
      `${field} must be a positive integer`,
    );
  }
  return raw;
}

export function requiredStringArray(
  value: Record<string, unknown>,
  field: string,
): string[] {
  const raw = value[field];
  if (!Array.isArray(raw)) {
    throw new CommandError("CONTRACT_INVALID", `${field} must be an array`);
  }
  return raw.map((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new CommandError(
        "CONTRACT_INVALID",
        `${field}[${index}] must be a non-empty string`,
      );
    }
    return item;
  });
}

export function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!isJsonObject(value)) {
    throw new CommandError("CONTRACT_INVALID", `${label} must be a JSON object`);
  }
  return value;
}

export function assertNoForbiddenEnvelopeFields(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertNoForbiddenEnvelopeFields(item, `${path}[${index}]`);
    });
    return;
  }
  if (!isJsonObject(value)) {
    return;
  }
  for (const key of Object.keys(value)) {
    if (ENVELOPE_FORBIDDEN.has(key)) {
      throw new CommandError(
        "ENVELOPE_INVALID",
        `execution envelope must not include ${key}`,
      );
    }
    assertNoForbiddenEnvelopeFields(value[key], `${path}.${key}`);
  }
}

export function validateRecheckWhen(value: unknown): Record<string, unknown> {
  const object = requireObject(value, "recheck_when");
  const type = requiredText(object, "type");
  if (type === "wall_clock") {
    requiredIso(object, "at_or_after");
  } else if (type === "evidence_frontier") {
    requiredPositiveInteger(object, "min_evidence_seq");
  } else if (type === "provider_revision") {
    requiredText(object, "source_revision");
  } else if (type !== "implementation_activity") {
    throw new CommandError("CONTRACT_INVALID", "unknown recheck_when.type");
  }
  return object;
}

export function validateAuthoritySnapshot(
  value: unknown,
): Record<string, unknown> {
  const object = requireObject(value, "authoritative_state");
  requiredText(object, "task_ref");
  requiredIso(object, "observed_at");
  const freshness = requiredText(object, "freshness");
  if (
    freshness !== "fresh" &&
    freshness !== "stale" &&
    freshness !== "unknown" &&
    freshness !== "not_applicable"
  ) {
    throw new CommandError("CONTRACT_INVALID", "invalid freshness");
  }
  if ("source_revision" in object && object["source_revision"] !== undefined) {
    if (object["source_revision"] === 0) {
      throw new CommandError(
        "CONTRACT_INVALID",
        "source_revision must not be 0",
      );
    }
    requiredText(object, "source_revision");
  }
  return object;
}

export function validateGrantRef(value: unknown): { grant_id: string; revision: number } {
  const object = requireObject(value, "authority_scope_ref");
  return {
    grant_id: requiredText(object, "grant_id"),
    revision: requiredPositiveInteger(object, "revision"),
  };
}

export function validateVerifiedFacts(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new CommandError("CONTRACT_INVALID", "verified_facts must be an array");
  }
  for (const [index, item] of value.entries()) {
    const object = requireObject(item, `verified_facts[${index}]`);
    requiredText(object, "proposition");
    requiredText(object, "evidence_ref");
  }
  return value;
}

const PACKET_INPUT_KEYS = new Set<string>([...PACKET_DIGEST_FIELDS, "content_digest"]);

export function validatePacketInput(value: unknown): Record<string, unknown> {
  const object = requireObject(value, "packet");
  for (const key of Object.keys(object)) {
    if (!PACKET_INPUT_KEYS.has(key)) {
      throw new CommandError(
        "CONTRACT_INVALID",
        `packet must not include ${key}`,
      );
    }
  }
  if (!("recheck_when" in object)) {
    throw new CommandError("CONTRACT_INVALID", "recheck_when is required");
  }
  validateRecheckWhen(object["recheck_when"]);
  validateAuthoritySnapshot(object["authoritative_state"]);
  validateGrantRef(object["authority_scope_ref"]);
  validateVerifiedFacts(object["verified_facts"]);
  requiredText(object, "business_outcome");
  requiredText(object, "acceptance_metric");
  requiredText(object, "simplest_safe_route");
  requiredStringArray(object, "unknowns");
  requiredStringArray(object, "non_goals");
  requiredStringArray(object, "true_stoplines");
  requiredIso(object, "evidence_as_of");
  if ("version" in object && object["version"] !== 1) {
    throw new CommandError("CONTRACT_INVALID", "initial packet version must be 1");
  }
  return object;
}

export function validateEnvelopeInput(value: unknown): Record<string, unknown> {
  const object = requireObject(value, "envelope");
  assertNoForbiddenEnvelopeFields(object);
  requiredText(object, "decision_id");
  requiredPositiveInteger(object, "version");
  requiredText(object, "content_digest");
  requiredText(object, "executor_principal_id");
  const workItems = requiredStringArray(object, "work_item_ids");
  if (workItems.length === 0) {
    throw new CommandError("CONTRACT_INVALID", "work_item_ids must not be empty");
  }
  if ("route_step_refs" in object) {
    requiredStringArray(object, "route_step_refs");
  }
  if ("input_refs" in object) {
    requiredStringArray(object, "input_refs");
  }
  if ("handoff_refs" in object) {
    requiredStringArray(object, "handoff_refs");
  }
  return object;
}

export function validateAckInput(value: unknown): Record<string, unknown> {
  const object = requireObject(value, "ack");
  requiredText(object, "envelope_id");
  requiredText(object, "decision_id");
  requiredPositiveInteger(object, "version");
  requiredText(object, "content_digest");
  requiredText(object, "outcome_digest");
  requiredText(object, "state_digest");
  requiredText(object, "acceptance_digest");
  requiredIso(object, "facts_checked_as_of");
  const added = object["added_scope"];
  if (added === undefined) {
    object["added_scope"] = [];
  } else if (!Array.isArray(added)) {
    throw new CommandError("ACK_INVALID", "added_scope must be an array");
  } else {
    for (const [index, item] of added.entries()) {
      const entry = requireObject(item, `added_scope[${index}]`);
      const reason = requiredText(entry, "required_because");
      if (!REQUIRED_BECAUSE.has(reason)) {
        throw new CommandError("ACK_INVALID", "illegal required_because");
      }
      requiredText(entry, "evidence_ref");
      requiredText(entry, "requested_scope");
    }
  }
  return object;
}

export function validateFactInput(value: unknown): Record<string, unknown> {
  const object = requireObject(value, "fact");
  requiredText(object, "decision_id");
  requiredPositiveInteger(object, "base_version");
  const ops = object["ops"];
  if (!Array.isArray(ops) || ops.length === 0) {
    throw new CommandError("CONTRACT_INVALID", "ops must be a non-empty array");
  }
  for (const [index, item] of ops.entries()) {
    const op = requireObject(item, `ops[${index}]`);
    const kind = requiredText(op, "op");
    if (kind !== "add" && kind !== "supersede" && kind !== "withdraw") {
      throw new CommandError("CONTRACT_INVALID", "unknown fact op");
    }
    requiredText(op, "fact_ref");
  }
  const frontier = requireObject(object["evidence_frontier"], "evidence_frontier");
  requiredPositiveInteger(frontier, "seq");
  return object;
}

export function validateReviseInput(value: unknown): Record<string, unknown> {
  const object = requireObject(value, "revise");
  requiredText(object, "decision_id");
  requiredPositiveInteger(object, "expected_version");
  const changed = requireObject(object["changed_fields"], "changed_fields");
  if (Object.keys(changed).length === 0) {
    throw new CommandError("CONTRACT_INVALID", "changed_fields must not be empty");
  }
  const preserve = object["preserve_effects"];
  if (preserve !== undefined) {
    if (!Array.isArray(preserve)) {
      throw new CommandError("CONTRACT_INVALID", "preserve_effects must be an array");
    }
    for (const [index, item] of preserve.entries()) {
      const entry = requireObject(item, `preserve_effects[${index}]`);
      requiredText(entry, "effect_id");
      const status = requiredText(entry, "readback_status");
      if (status === "applied") {
        throw new CommandError(
          "CONTRACT_INVALID",
          "preserve_effects cannot claim applied without an effect readback record",
        );
      }
    }
  }
  return object;
}

export function validateEffectInput(value: unknown): Record<string, unknown> {
  const object = requireObject(value, "effect");
  requiredText(object, "effect_id");
  requiredText(object, "envelope_id");
  requiredText(object, "decision_id");
  requiredPositiveInteger(object, "version");
  const readback = requiredText(object, "readback_status");
  if (
    readback !== "complete" &&
    readback !== "unavailable" &&
    readback !== "data_insufficient"
  ) {
    throw new CommandError("CONTRACT_INVALID", "invalid readback_status");
  }
  const observed = object["observed_result"];
  if (observed === 0) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "observed_result must not be 0",
    );
  }
  if (readback !== "complete") {
    if (observed === "applied" || observed === "confirmed_absent") {
      throw new CommandError(
        "CONTRACT_INVALID",
        "incomplete readback cannot claim applied or confirmed_absent",
      );
    }
    const durability = object["durability"];
    if (durability === "durable") {
      throw new CommandError(
        "CONTRACT_INVALID",
        "incomplete readback cannot be durable",
      );
    }
  } else {
    if (observed !== "applied" && observed !== "confirmed_absent") {
      throw new CommandError(
        "CONTRACT_INVALID",
        "complete readback must be applied or confirmed_absent",
      );
    }
    if (observed === "applied") {
      if (object["durability"] !== "durable" && object["durability"] !== undefined) {
        requiredText(object, "durability");
      }
    }
    requiredIso(object, "observed_at");
  }
  return object;
}
