import { type EventEnvelope } from "./envelope.js";
import { rebaseFingerprint } from "./decision-digest.js";
import {
  currentAck,
  currentEnvelope,
  evidenceFrontierSeq,
  type MaterializedDecision,
} from "./decision-state.js";
import { engineIsBound, latestTypedResult } from "./engine-loopx.js";

export type Guardrail =
  | "ack_required"
  | "data_insufficient"
  | "engine_no_progress"
  | "scope_change_required"
  | "semantic_rebase_required"
  | "stale_envelope";

export interface FirstDurableEffect {
  readonly effect_id?: string;
  readonly observed_at?: string;
  readonly status:
    | "applied"
    | "confirmed_absent"
    | "data_insufficient"
    | "unavailable";
}

export function firstDurableEffect(
  events: readonly EventEnvelope[],
  decisionId: string,
): FirstDurableEffect {
  const effects = events.filter(
    (event) =>
      event.event_type === "hufu/decision.effect_delta" &&
      event.payload["decision_id"] === decisionId,
  );
  const complete = effects.filter(
    (event) => event.payload["readback_status"] === "complete",
  );
  const applied = complete.find(
    (event) =>
      event.payload["observed_result"] === "applied" &&
      event.payload["durability"] === "durable",
  );
  if (applied !== undefined) {
    return {
      effect_id: String(applied.payload["effect_id"]),
      observed_at:
        typeof applied.payload["observed_at"] === "string"
          ? applied.payload["observed_at"]
          : undefined,
      status: "applied",
    };
  }
  if (complete.length > 0 && complete.every((event) => event.payload["observed_result"] === "confirmed_absent")) {
    return { status: "confirmed_absent" };
  }
  if (effects.some((event) => event.payload["readback_status"] === "unavailable")) {
    return { status: "unavailable" };
  }
  if (effects.length > 0) {
    return { status: "data_insufficient" };
  }
  return { status: "data_insufficient" };
}

export function evaluateGuardrails(input: {
  readonly events: readonly EventEnvelope[];
  readonly materialized: MaterializedDecision;
  readonly now: Date;
}): readonly Guardrail[] {
  const guardrails = new Set<Guardrail>();
  const envelope = currentEnvelope(input.events, input.materialized.decision_id);
  if (envelope === undefined) {
    return [];
  }
  const envelopeDigest = String(envelope.payload["content_digest"]);
  const envelopeVersion = Number(envelope.payload["version"]);
  if (
    envelopeDigest !== input.materialized.content_digest ||
    envelopeVersion !== input.materialized.version
  ) {
    guardrails.add("stale_envelope");
  }
  const envelopeId = String(envelope.payload["envelope_id"]);
  const ack = currentAck(input.events, envelopeId);
  if (ack === undefined) {
    if (!guardrails.has("stale_envelope")) {
      guardrails.add("ack_required");
    }
  } else {
    const applicable = ackIsApplicable(ack, input.materialized, envelope);
    if (!applicable && !guardrails.has("stale_envelope")) {
      guardrails.add("ack_required");
    }
    const added = ack.payload["added_scope"];
    if (applicable && Array.isArray(added) && added.length > 0) {
      guardrails.add("scope_change_required");
    }
  }
  const durable = firstDurableEffect(input.events, input.materialized.decision_id);
  const rebase = shouldHardRebase({
    durable,
    events: input.events,
    materialized: input.materialized,
    now: input.now,
  });
  if (rebase === "data_insufficient") {
    guardrails.add("data_insufficient");
  }
  if (rebase === "required") {
    guardrails.add("semantic_rebase_required");
  }
  if (
    engineIsBound(input.events) &&
    !guardrails.has("stale_envelope") &&
    durable.status === "confirmed_absent"
  ) {
    const typed = latestTypedResult(input.events);
    if (
      typed !== undefined &&
      typed.payload["envelope_id"] === envelopeId &&
      typed.payload["kind"] !== "progress"
    ) {
      guardrails.add("engine_no_progress");
    }
  }
  return [...guardrails];
}

export function ackIsApplicable(
  ack: EventEnvelope,
  materialized: MaterializedDecision,
  envelope: EventEnvelope,
): boolean {
  return (
    String(ack.payload["decision_id"]) === materialized.decision_id &&
    Number(ack.payload["version"]) === materialized.version &&
    String(ack.payload["content_digest"]) === materialized.content_digest &&
    String(ack.payload["envelope_id"]) === String(envelope.payload["envelope_id"])
  );
}

function shouldHardRebase(input: {
  readonly durable: FirstDurableEffect;
  readonly events: readonly EventEnvelope[];
  readonly materialized: MaterializedDecision;
  readonly now: Date;
}): "no" | "required" | "data_insufficient" {
  const nonGoals = input.materialized.semantic["non_goals"];
  const goals = Array.isArray(nonGoals)
    ? nonGoals.filter((item): item is string => typeof item === "string")
    : [];
  const hit = input.events.some((event) => {
    if (
      event.event_type !== "hufu/decision.effect_delta" &&
      event.event_type !== "hufu/decision.fact_delta"
    ) {
      return false;
    }
    if (event.payload["decision_id"] !== input.materialized.decision_id) {
      return false;
    }
    if (event.payload["hits_non_goal"] === true) {
      return true;
    }
    const observed = event.payload["observed_result"];
    return typeof observed === "string" && goals.includes(observed);
  });
  if (hit) {
    return "required";
  }
  if (!recheckReached(input.materialized.semantic["recheck_when"], input.now, input.events, input.materialized.decision_id)) {
    return "no";
  }
  if (input.durable.status === "unavailable" || input.durable.status === "data_insufficient") {
    const hasEffect = input.events.some(
      (event) =>
        event.event_type === "hufu/decision.effect_delta" &&
        event.payload["decision_id"] === input.materialized.decision_id,
    );
    return hasEffect ? "data_insufficient" : "no";
  }
  if (input.durable.status !== "confirmed_absent") {
    return "no";
  }
  const grew = input.events.some(
    (event) =>
      event.event_type === "hufu/decision.effect_delta" &&
      event.payload["decision_id"] === input.materialized.decision_id &&
      event.payload["implementation_activity"] === true,
  );
  return grew ? "required" : "no";
}

function recheckReached(
  recheck: unknown,
  now: Date,
  events: readonly EventEnvelope[],
  decisionId: string,
): boolean {
  if (recheck === null || typeof recheck !== "object" || Array.isArray(recheck)) {
    return false;
  }
  const object = recheck as Record<string, unknown>;
  const type = object["type"];
  if (type === "wall_clock") {
    const at = object["at_or_after"];
    return typeof at === "string" && now.getTime() >= Date.parse(at);
  }
  if (type === "evidence_frontier") {
    const min = object["min_evidence_seq"];
    return typeof min === "number" && evidenceFrontierSeq(events, decisionId) >= min;
  }
  if (type === "implementation_activity") {
    return events.some(
      (event) =>
        event.event_type === "hufu/decision.effect_delta" &&
        event.payload["decision_id"] === decisionId &&
        event.payload["implementation_activity"] === true,
    );
  }
  if (type === "provider_revision") {
    return true;
  }
  return false;
}

export function currentRebaseFingerprint(
  materialized: MaterializedDecision,
  events: readonly EventEnvelope[],
): string {
  return rebaseFingerprint({
    decision_id: materialized.decision_id,
    evidence_frontier_seq: evidenceFrontierSeq(events, materialized.decision_id),
    version: materialized.version,
  });
}

export function rebaseAlreadyRecorded(
  events: readonly EventEnvelope[],
  fingerprint: string,
): boolean {
  return events.some(
    (event) =>
      event.event_type === "hufu/decision.fact_delta" &&
      event.payload["rebase_fingerprint"] === fingerprint,
  );
}
