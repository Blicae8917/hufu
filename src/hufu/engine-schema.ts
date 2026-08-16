import { CommandError, isJsonObject } from "./errors.js";
import { digestPayload } from "./digest.js";
import { optionalText, requiredIso, requiredText } from "./decision-schema.js";

export const LOOPX_MECHANISMS_ENGINE_ID = "loopx-mechanisms" as const;

export const TYPED_RESULT_KINDS = [
  "data_insufficient",
  "failure",
  "progress",
  "readback_required",
  "stop",
] as const;

export type TypedResultKind = (typeof TYPED_RESULT_KINDS)[number];

const AUTHORITY_KEYS = new Set(["goal_id", "todo_id", "registry"]);
const CONTROL_PLANE_KEYS = new Set([
  "endpoint",
  "heartbeat",
  "next_cli_actions",
  "quota",
  "scheduler",
  "scheduler_hint",
  "task_authority",
]);
const RECEIPT_FORBIDDEN = new Set([
  "acceptance_metric",
  "authority_scope_ref",
  "authorization_scope",
  "business_outcome",
  "completed",
  "durability",
  "grant_id",
  "native_state",
  "observed_result",
  "work_item_id",
]);

const RESULT_DIGEST_FIELDS = [
  "decision_id",
  "envelope_id",
  "kind",
  "observed_at",
  "result_id",
  "turn_ref",
] as const;

const RECEIPT_DIGEST_FIELDS = [
  "effect_id",
  "evidence_ref",
  "ok",
  "receipt_id",
  "result_id",
] as const;

export function typedResultContentDigest(
  result: Record<string, unknown>,
): string {
  const semantic: Record<string, unknown> = {};
  for (const key of RESULT_DIGEST_FIELDS) {
    if (!(key in result)) {
      throw new CommandError("CONTRACT_INVALID", `missing ${key} for content digest`);
    }
    semantic[key] = result[key];
  }
  return digestPayload(semantic);
}

export function receiptContentDigest(receipt: Record<string, unknown>): string {
  const semantic: Record<string, unknown> = {};
  for (const key of RECEIPT_DIGEST_FIELDS) {
    if (key === "effect_id" || key === "result_id") {
      if (receipt[key] !== undefined) {
        semantic[key] = receipt[key];
      }
      continue;
    }
    if (!(key in receipt)) {
      throw new CommandError("CONTRACT_INVALID", `missing ${key} for content digest`);
    }
    semantic[key] = receipt[key];
  }
  return digestPayload(semantic);
}

export function assertNoForbiddenEngineKeys(value: unknown): void {
  walkKeys(value, (key) => {
    if (AUTHORITY_KEYS.has(key)) {
      throw new CommandError(
        "ENGINE_AUTHORITY_REJECTED",
        `${key} cannot be mapped as Hufu task authority or work item`,
      );
    }
    if (CONTROL_PLANE_KEYS.has(key)) {
      throw new CommandError(
        "ENGINE_CONTROL_PLANE_REJECTED",
        `${key} is not part of the first-batch mechanism catalog`,
      );
    }
  });
}

export function validateEngineBindInput(
  value: unknown,
): { engine_id: typeof LOOPX_MECHANISMS_ENGINE_ID } {
  const object = requireObject(value, "engine");
  assertNoForbiddenEngineKeys(object);
  const engineId = requiredText(object, "engine_id");
  if (engineId === "loopx" || engineId === "loopx-control-plane") {
    throw new CommandError(
      "ENGINE_CONTROL_PLANE_REJECTED",
      "full LoopX control plane is not bindable",
    );
  }
  if (engineId !== LOOPX_MECHANISMS_ENGINE_ID) {
    throw new CommandError("CONTRACT_INVALID", "unknown engine_id");
  }
  return { engine_id: LOOPX_MECHANISMS_ENGINE_ID };
}

export function validateTypedResultInput(
  value: unknown,
): Record<string, unknown> {
  const object = requireObject(value, "typed result");
  assertNoForbiddenEngineKeys(object);
  const kind = requiredText(object, "kind");
  if (!isTypedResultKind(kind)) {
    throw new CommandError("CONTRACT_INVALID", "invalid typed result kind");
  }
  const turnRef = requiredText(object, "turn_ref");
  if (
    turnRef.startsWith("github:") ||
    turnRef.startsWith("gitlab:") ||
    /^goal[-_]/i.test(turnRef) ||
    /\/goal\//i.test(turnRef)
  ) {
    throw new CommandError(
      "ENGINE_AUTHORITY_REJECTED",
      "turn_ref cannot map a Goal or external work item",
    );
  }
  requiredText(object, "decision_id");
  requiredText(object, "envelope_id");
  requiredIso(object, "observed_at");
  optionalText(object, "result_id");
  return object;
}

export function validateReceiptInput(value: unknown): Record<string, unknown> {
  const object = requireObject(value, "receipt");
  assertNoForbiddenEngineKeys(object);
  walkKeys(object, (key) => {
    if (RECEIPT_FORBIDDEN.has(key)) {
      throw new CommandError(
        "RECEIPT_INVALID",
        `receipt cannot include ${key}`,
      );
    }
  });
  const hasResult = typeof object["result_id"] === "string" && object["result_id"].trim() !== "";
  const hasEffect = typeof object["effect_id"] === "string" && object["effect_id"].trim() !== "";
  if (hasResult === hasEffect) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "receipt requires exactly one of result_id or effect_id",
    );
  }
  if (typeof object["ok"] !== "boolean") {
    throw new CommandError("CONTRACT_INVALID", "ok must be a boolean");
  }
  requiredText(object, "evidence_ref");
  optionalText(object, "receipt_id");
  return object;
}

function isTypedResultKind(value: string): value is TypedResultKind {
  return (TYPED_RESULT_KINDS as readonly string[]).includes(value);
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!isJsonObject(value)) {
    throw new CommandError("CONTRACT_INVALID", `${label} must be a JSON object`);
  }
  return value;
}

function walkKeys(value: unknown, visit: (key: string) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      walkKeys(item, visit);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    visit(key);
    walkKeys(nested, visit);
  }
}
