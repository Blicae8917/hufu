import { optionalText, requiredPositiveInteger, requiredText } from "./decision-schema.js";
import { CommandError, isJsonObject } from "./errors.js";

export const TASK_AUTHORITIES = ["github", "gitlab", "local"] as const;
export type BridgeTaskAuthority = (typeof TASK_AUTHORITIES)[number];

export const FRESHNESS_VALUES = [
  "fresh",
  "stale",
  "unknown",
  "not_applicable",
] as const;
export type BridgeFreshness = (typeof FRESHNESS_VALUES)[number];

export const FACT_CLASSES = ["authoritative", "observed", "derived"] as const;
export type BridgeFactClass = (typeof FACT_CLASSES)[number];

export const AVAILABILITIES = [
  "available",
  "unavailable",
  "data_insufficient",
  "conflict",
] as const;
export type BridgeAvailability = (typeof AVAILABILITIES)[number];

export const AUTHORITY_CROSSING_KEYS = [
  "authority_scope_ref",
  "freshness",
  "observed_at",
  "session_binding_ref",
  "source_revision",
  "task_authority",
  "task_ref",
] as const;

export const DECISION_CROSSING_KEYS = [
  "acceptance_digest",
  "content_digest",
  "decision_id",
  "execution_envelope_ref",
  "outcome_digest",
  "state_digest",
  "version",
] as const;

export const EVIDENCE_CROSSING_KEYS = [
  "availability",
  "binds_decision_id",
  "binds_effect_id",
  "binds_task_ref",
  "binds_work_item_id",
  "effect_ref",
  "evidence_ref",
  "fact_class",
  "freshness",
  "observed_at",
  "readback_status",
  "receipt_ref",
  "typed_result_ref",
] as const;

export const ENVELOPE_REF_KEYS = [
  "content_digest",
  "decision_ref",
  "envelope_id",
] as const;

export const TYPED_RESULT_REF_KEYS = ["result_id"] as const;

const PROMOTED_AUTHORITIES = new Set([
  "bridge",
  "engine",
  "engine-loopx",
  "engine_id",
  "loopx",
  "loopx-mechanisms",
]);

const CONTROL_PLANE_KEYS = new Set([
  "createGoal",
  "dashboard",
  "goal_completed",
  "goal_id",
  "heartbeat",
  "lease",
  "quota",
  "registry",
  "run_history",
  "schedule",
  "scheduler",
  "todo_completed",
  "todo_id",
  "turn_journal",
]);

const LIFECYCLE_KEYS = new Set([
  "body",
  "closeIssue",
  "close_issue",
  "commentIssue",
  "comment_issue",
  "createIssue",
  "description",
  "merge",
  "updateIssue",
  "writeIssue",
]);

const AUTHORITY_BODY_KEYS = new Set([
  "DECISION_PACKET",
  "EXECUTION_ENVELOPE",
  "FACT_DELTA",
  "DECISION_DELTA",
  "EFFECT_DELTA",
  "ROUTE_ACK",
  "acceptance_metric",
  "access_token",
  "authorization_grant",
  "authorization_scope",
  "blocked_by",
  "business_outcome",
  "credential",
  "durability",
  "executor_principal_id",
  "expires_at",
  "grant",
  "host_transcript",
  "inferred_from",
  "issuer_id",
  "journal",
  "kind",
  "next_action",
  "observed_result",
  "ok",
  "password",
  "private_key",
  "proposition",
  "receipt",
  "scope",
  "scope_text",
  "secret",
  "session_log",
  "simplest_safe_route",
  "supersedes",
  "token",
  "transcript",
  "typed_result",
  "work_item_ids",
]);

const OBSERVATION_KEYS = new Set(["observed_at", "source_revision"]);

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function requireObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!isJsonObject(value)) {
    throw new CommandError("CONTRACT_INVALID", `${label} must be a JSON object`);
  }
  return value;
}

export function rejectForbiddenCrossingKeys(value: unknown): void {
  rejectZeroObservations(value);
  const keys = collectKeys(value);
  if ([...keys].some((key) => CONTROL_PLANE_KEYS.has(key))) {
    throw new CommandError(
      "BRIDGE_CONTROL_PLANE_REJECTED",
      "LoopX control-plane fields cannot cross the bridge",
    );
  }
  const taskAuthority = readTaskAuthority(value);
  if (taskAuthority !== undefined && PROMOTED_AUTHORITIES.has(taskAuthority)) {
    throw new CommandError(
      "BRIDGE_008_PROMOTION_REJECTED",
      "loopx-mechanisms cannot become task_authority or enable the bridge",
    );
  }
  if ([...keys].some((key) => LIFECYCLE_KEYS.has(key))) {
    throw new CommandError(
      "BRIDGE_LIFECYCLE_REJECTED",
      "native issue bodies and write methods cannot cross the bridge",
    );
  }
  if ([...keys].some((key) => AUTHORITY_BODY_KEYS.has(key))) {
    throw new CommandError(
      "BRIDGE_AUTHORITY_REJECTED",
      "grant, packet, journal, receipt, or credential bodies cannot cross or expand authority",
    );
  }
}

export function rejectUnknownKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      throw new CommandError(
        "BRIDGE_AUTHORITY_REJECTED",
        `${label} cannot include ${key}`,
      );
    }
  }
}

export function requiredAuthority(value: Record<string, unknown>): BridgeTaskAuthority {
  const raw = requiredText(value, "task_authority");
  if (!TASK_AUTHORITIES.includes(raw as BridgeTaskAuthority)) {
    throw new CommandError(
      "BRIDGE_008_PROMOTION_REJECTED",
      "task_authority must remain github, gitlab, or local",
    );
  }
  return raw as BridgeTaskAuthority;
}

export function requiredFreshness(value: Record<string, unknown>): BridgeFreshness {
  const raw = requiredText(value, "freshness");
  if (!FRESHNESS_VALUES.includes(raw as BridgeFreshness)) {
    throw new CommandError("CONTRACT_INVALID", "invalid freshness");
  }
  return raw as BridgeFreshness;
}

export function requiredFactClass(value: Record<string, unknown>): BridgeFactClass {
  const raw = requiredText(value, "fact_class");
  if (!FACT_CLASSES.includes(raw as BridgeFactClass)) {
    throw new CommandError("CONTRACT_INVALID", "invalid fact_class");
  }
  return raw as BridgeFactClass;
}

export function requiredAvailability(value: Record<string, unknown>): BridgeAvailability {
  const raw = requiredText(value, "availability");
  if (!AVAILABILITIES.includes(raw as BridgeAvailability)) {
    throw new CommandError("CONTRACT_INVALID", "invalid availability");
  }
  return raw as BridgeAvailability;
}

export function requiredDigest(value: Record<string, unknown>, field: string): string {
  const raw = requiredText(value, field);
  if (!DIGEST_RE.test(raw)) {
    throw new CommandError("CONTRACT_INVALID", `${field} must be a sha256 digest`);
  }
  return raw;
}

export function optionalIso(value: Record<string, unknown>, field: string): string | undefined {
  if (!(field in value)) {
    return undefined;
  }
  rejectZeroObservationField(value[field], field);
  const raw = requiredText(value, field);
  if (!ISO_RE.test(raw)) {
    throw new CommandError("CONTRACT_INVALID", `${field} must be UTC ISO-8601`);
  }
  return raw;
}

export function optionalRevisionText(
  value: Record<string, unknown>,
  field: string,
): string | undefined {
  if (!(field in value)) {
    return undefined;
  }
  rejectZeroObservationField(value[field], field);
  return requiredText(value, field);
}

export function requiredScopeRef(value: unknown): {
  grant_id: string;
  revision: number;
} {
  const object = requireObject(value, "authority_scope_ref");
  rejectForbiddenCrossingKeys(object);
  rejectUnknownKeys(object, ["grant_id", "revision"], "authority_scope_ref");
  return {
    grant_id: requiredText(object, "grant_id"),
    revision: requiredPositiveInteger(object, "revision"),
  };
}

export function requiredSessionBindingRef(value: unknown): {
  binding_id: string;
  generation: number;
} {
  const object = requireObject(value, "session_binding_ref");
  rejectForbiddenCrossingKeys(object);
  rejectUnknownKeys(object, ["binding_id", "generation"], "session_binding_ref");
  return {
    binding_id: requiredText(object, "binding_id"),
    generation: requiredPositiveInteger(object, "generation"),
  };
}

export function requiredDecisionRef(value: unknown): {
  content_digest: string;
  decision_id: string;
  version: number;
} {
  const object = requireObject(value, "decision_ref");
  rejectForbiddenCrossingKeys(object);
  rejectUnknownKeys(
    object,
    ["acceptance_digest", "content_digest", "decision_id", "outcome_digest", "state_digest", "version"],
    "decision_ref",
  );
  return {
    content_digest: requiredDigest(object, "content_digest"),
    decision_id: requiredText(object, "decision_id"),
    version: requiredPositiveInteger(object, "version"),
    ...(optionalText(object, "acceptance_digest") === undefined
      ? {}
      : { acceptance_digest: optionalText(object, "acceptance_digest") }),
    ...(optionalText(object, "outcome_digest") === undefined
      ? {}
      : { outcome_digest: optionalText(object, "outcome_digest") }),
    ...(optionalText(object, "state_digest") === undefined
      ? {}
      : { state_digest: optionalText(object, "state_digest") }),
  };
}

export function requiredEnvelopeRef(value: unknown): {
  content_digest: string;
  decision_ref: ReturnType<typeof requiredDecisionRef>;
  envelope_id: string;
} {
  const object = requireObject(value, "execution_envelope_ref");
  rejectForbiddenCrossingKeys(object);
  rejectUnknownKeys(object, [...ENVELOPE_REF_KEYS], "execution_envelope_ref");
  return {
    content_digest: requiredDigest(object, "content_digest"),
    decision_ref: requiredDecisionRef(object["decision_ref"]),
    envelope_id: requiredText(object, "envelope_id"),
  };
}

export function requiredIdRef<K extends string>(
  value: unknown,
  label: string,
  field: K,
): { [P in K]: string } {
  const object = requireObject(value, label);
  rejectForbiddenCrossingKeys(object);
  rejectUnknownKeys(object, [field], label);
  return { [field]: requiredText(object, field) } as { [P in K]: string };
}

function rejectZeroObservations(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      rejectZeroObservations(item);
    }
    return;
  }
  if (!isJsonObject(value)) {
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (OBSERVATION_KEYS.has(key)) {
      rejectZeroObservationField(nested, key);
    }
    rejectZeroObservations(nested);
  }
}

function rejectZeroObservationField(value: unknown, field: string): void {
  if (value === 0) {
    throw new CommandError(
      "DATA_INSUFFICIENT",
      `${field} is missing and must not be written as 0`,
    );
  }
}

function collectKeys(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, acc);
    }
    return acc;
  }
  if (!isJsonObject(value)) {
    return acc;
  }
  for (const [key, nested] of Object.entries(value)) {
    acc.add(key);
    collectKeys(nested, acc);
  }
  return acc;
}

function readTaskAuthority(value: unknown): string | undefined {
  if (!isJsonObject(value)) {
    return undefined;
  }
  const raw = value["task_authority"];
  return typeof raw === "string" ? raw : undefined;
}
