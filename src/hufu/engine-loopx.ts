import { type EventEnvelope } from "./envelope.js";
import { CommandError } from "./errors.js";
import {
  LOOPX_MECHANISMS_ENGINE_ID,
  validateEngineBindInput,
  validateReceiptInput,
  validateTypedResultInput,
} from "./engine-schema.js";

export interface EngineBindResult {
  readonly engine_id: typeof LOOPX_MECHANISMS_ENGINE_ID;
}

export interface TypedResult {
  readonly decision_id: string;
  readonly envelope_id: string;
  readonly kind: string;
  readonly observed_at: string;
  readonly result_id?: string;
  readonly turn_ref: string;
}

export interface Receipt {
  readonly effect_id?: string;
  readonly evidence_ref: string;
  readonly ok: boolean;
  readonly receipt_id?: string;
  readonly result_id?: string;
}

export interface EngineSnapshot {
  readonly events: readonly EventEnvelope[];
}

export interface EnginePort {
  assertBindable(payload: Record<string, unknown>): EngineBindResult;
  assertReceipt(payload: Record<string, unknown>, snapshot: EngineSnapshot): Receipt;
  assertTypedResult(
    payload: Record<string, unknown>,
    snapshot: EngineSnapshot,
  ): TypedResult;
}

export const enginePort: EnginePort = {
  assertBindable(payload) {
    return validateEngineBindInput(payload);
  },
  assertTypedResult(payload, snapshot) {
    const input = validateTypedResultInput(payload);
    if (!engineIsBound(snapshot.events)) {
      throw new CommandError("ENGINE_NOT_BOUND", "optional engine is not bound");
    }
    return {
      decision_id: String(input["decision_id"]),
      envelope_id: String(input["envelope_id"]),
      kind: String(input["kind"]),
      observed_at: String(input["observed_at"]),
      turn_ref: String(input["turn_ref"]),
      ...(typeof input["result_id"] === "string"
        ? { result_id: input["result_id"] }
        : {}),
    };
  },
  assertReceipt(payload, snapshot) {
    const input = validateReceiptInput(payload);
    if (!engineIsBound(snapshot.events)) {
      throw new CommandError("ENGINE_NOT_BOUND", "optional engine is not bound");
    }
    const resultId =
      typeof input["result_id"] === "string" ? input["result_id"].trim() : "";
    const effectId =
      typeof input["effect_id"] === "string" ? input["effect_id"].trim() : "";
    if (resultId !== "") {
      const found = snapshot.events.some(
        (event) =>
          event.event_type === "hufu/engine.typed_result" &&
          event.payload["result_id"] === resultId,
      );
      if (!found) {
        throw new CommandError("DATA_INSUFFICIENT", "typed result does not exist");
      }
    }
    if (effectId !== "") {
      const found = snapshot.events.some(
        (event) =>
          event.event_type === "hufu/decision.effect_delta" &&
          event.payload["effect_id"] === effectId,
      );
      if (!found) {
        throw new CommandError("DATA_INSUFFICIENT", "effect does not exist");
      }
    }
    return {
      evidence_ref: String(input["evidence_ref"]),
      ok: Boolean(input["ok"]),
      ...(resultId === "" ? {} : { result_id: resultId }),
      ...(effectId === "" ? {} : { effect_id: effectId }),
      ...(typeof input["receipt_id"] === "string"
        ? { receipt_id: input["receipt_id"] }
        : {}),
    };
  },
};

export function engineIsBound(events: readonly EventEnvelope[]): boolean {
  return currentEngineBinding(events) !== undefined;
}

export function currentEngineBinding(
  events: readonly EventEnvelope[],
): EventEnvelope | undefined {
  const matches = events.filter(
    (event) =>
      event.event_type === "hufu/engine.bound" &&
      event.payload["engine_id"] === LOOPX_MECHANISMS_ENGINE_ID,
  );
  return matches[matches.length - 1];
}

export function latestTypedResult(
  events: readonly EventEnvelope[],
): EventEnvelope | undefined {
  const matches = events.filter(
    (event) => event.event_type === "hufu/engine.typed_result",
  );
  return matches[matches.length - 1];
}

export function latestReceipt(
  events: readonly EventEnvelope[],
): EventEnvelope | undefined {
  const matches = events.filter(
    (event) => event.event_type === "hufu/engine.receipt",
  );
  return matches[matches.length - 1];
}
