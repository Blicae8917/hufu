import { optionalText, requiredText } from "./decision-schema.js";
import {
  currentEnvelope,
  currentGrant,
  latestPacketIds,
  materializeDecision,
} from "./decision-state.js";
import { digestPayload } from "./digest.js";
import { latestReceipt, latestTypedResult } from "./engine-loopx.js";
import { type EventEnvelope } from "./envelope.js";
import { CommandError, isJsonObject } from "./errors.js";
import {
  AUTHORITY_CROSSING_KEYS,
  DECISION_CROSSING_KEYS,
  EVIDENCE_CROSSING_KEYS,
  TYPED_RESULT_REF_KEYS,
  optionalIso,
  optionalRevisionText,
  rejectForbiddenCrossingKeys,
  rejectUnknownKeys,
  requiredAuthority,
  requiredAvailability,
  requiredDecisionRef,
  requiredDigest,
  requiredEnvelopeRef,
  requiredFactClass,
  requiredFreshness,
  requiredIdRef,
  requiredScopeRef,
  requiredSessionBindingRef,
  requireObject,
  type BridgeAvailability,
  type BridgeFactClass,
  type BridgeFreshness,
  type BridgeTaskAuthority,
} from "./loopx-bridge-schema.js";
import { type CurrentView } from "./projector.js";

export interface AuthorityScopeRef {
  readonly grant_id: string;
  readonly revision: number;
}

export interface SessionBindingRef {
  readonly binding_id: string;
  readonly generation: number;
}

export interface AuthoritySnapshotRef {
  readonly freshness: BridgeFreshness;
  readonly observed_at?: string;
  readonly source_revision?: string;
  readonly task_ref: string;
}

export interface AuthorityCrossing extends AuthoritySnapshotRef {
  readonly authority_scope_ref: AuthorityScopeRef;
  readonly session_binding_ref?: SessionBindingRef;
  readonly task_authority: BridgeTaskAuthority;
}

export interface DecisionRef {
  readonly acceptance_digest?: string;
  readonly content_digest: string;
  readonly decision_id: string;
  readonly outcome_digest?: string;
  readonly state_digest?: string;
  readonly version: number;
}

export interface ExecutionEnvelopeRef {
  readonly content_digest: string;
  readonly decision_ref: DecisionRef;
  readonly envelope_id: string;
}

export interface DecisionCrossing extends DecisionRef {
  readonly execution_envelope_ref?: ExecutionEnvelopeRef;
}

export interface EffectRef {
  readonly effect_id: string;
}

export interface ReceiptRef {
  readonly receipt_id: string;
}

export interface TypedResultRef {
  readonly result_id: string;
}

export interface EvidenceCrossing {
  readonly availability: BridgeAvailability;
  readonly binds_decision_id?: string;
  readonly binds_effect_id?: string;
  readonly binds_task_ref?: string;
  readonly binds_work_item_id?: string;
  readonly effect_ref?: EffectRef;
  readonly evidence_ref: string;
  readonly fact_class: BridgeFactClass;
  readonly freshness: BridgeFreshness;
  readonly observed_at?: string;
  readonly readback_status?: "complete" | "unavailable" | "data_insufficient";
  readonly receipt_ref?: ReceiptRef;
  readonly typed_result_ref?: TypedResultRef;
}

export interface BridgeSnapshot {
  readonly authority_scope_ref?: AuthorityScopeRef;
  readonly authority_snapshot_ref?: AuthoritySnapshotRef;
  readonly content_digest: string;
  readonly decision_ref?: DecisionRef;
  readonly effect_ref?: EffectRef;
  readonly evidence_ref?: { readonly evidence_ref: string };
  readonly execution_envelope_ref?: ExecutionEnvelopeRef;
  readonly receipt_ref?: ReceiptRef;
  readonly session_binding_ref?: SessionBindingRef;
  readonly typed_result_ref?: TypedResultRef;
}

export interface TypedResultAcceptance {
  readonly accepted: true;
  readonly grant_revision_unchanged: true;
  readonly inferred_grant: false;
  readonly typed_result_ref: TypedResultRef;
}

export interface BoundedTurnRequest {
  readonly decision_ref: DecisionRef;
  readonly envelope_ref: ExecutionEnvelopeRef;
  readonly max_invocations: 1;
  readonly turn_kind: "run_once";
}

export interface BridgePort {
  acceptTypedResult(ref: unknown): TypedResultAcceptance;
  assertAuthorityCrossing(payload: unknown): AuthorityCrossing;
  assertDecisionCrossing(payload: unknown): DecisionCrossing;
  assertEvidenceCrossing(payload: unknown): EvidenceCrossing;
  isBridgeEnabled(events: readonly EventEnvelope[]): boolean;
  prepareOutboundTurn(envelopeRef: unknown): BoundedTurnRequest;
  projectBridgeSnapshot(source: unknown): BridgeSnapshot;
}

export function assertAuthorityCrossing(payload: unknown): AuthorityCrossing {
  rejectForbiddenCrossingKeys(payload);
  const object = requireObject(payload, "authority crossing");
  rejectUnknownKeys(object, AUTHORITY_CROSSING_KEYS, "authority crossing");
  const crossing: AuthorityCrossing = {
    authority_scope_ref: requiredScopeRef(object["authority_scope_ref"]),
    freshness: requiredFreshness(object),
    task_authority: requiredAuthority(object),
    task_ref: requiredText(object, "task_ref"),
    ...(optionalRevisionText(object, "source_revision") === undefined
      ? {}
      : { source_revision: optionalRevisionText(object, "source_revision") }),
    ...(optionalIso(object, "observed_at") === undefined
      ? {}
      : { observed_at: optionalIso(object, "observed_at") }),
    ...("session_binding_ref" in object
      ? { session_binding_ref: requiredSessionBindingRef(object["session_binding_ref"]) }
      : {}),
  };
  return crossing;
}

export function assertDecisionCrossing(payload: unknown): DecisionCrossing {
  rejectForbiddenCrossingKeys(payload);
  const object = requireObject(payload, "decision crossing");
  rejectUnknownKeys(object, DECISION_CROSSING_KEYS, "decision crossing");
  const crossing: DecisionCrossing = {
    ...requiredDecisionRef({
      content_digest: object["content_digest"],
      decision_id: object["decision_id"],
      version: object["version"],
      ...(optionalText(object, "acceptance_digest") === undefined
        ? {}
        : { acceptance_digest: optionalText(object, "acceptance_digest") }),
      ...(optionalText(object, "outcome_digest") === undefined
        ? {}
        : { outcome_digest: optionalText(object, "outcome_digest") }),
      ...(optionalText(object, "state_digest") === undefined
        ? {}
        : { state_digest: optionalText(object, "state_digest") }),
    }),
    ...("execution_envelope_ref" in object
      ? { execution_envelope_ref: requiredEnvelopeRef(object["execution_envelope_ref"]) }
      : {}),
  };
  return crossing;
}

export function assertEvidenceCrossing(payload: unknown): EvidenceCrossing {
  rejectForbiddenCrossingKeys(payload);
  const object = requireObject(payload, "evidence crossing");
  rejectUnknownKeys(object, EVIDENCE_CROSSING_KEYS, "evidence crossing");
  const readback = object["readback_status"];
  if (
    readback !== undefined &&
    readback !== "complete" &&
    readback !== "unavailable" &&
    readback !== "data_insufficient"
  ) {
    throw new CommandError("CONTRACT_INVALID", "invalid readback_status");
  }
  return {
    availability: requiredAvailability(object),
    evidence_ref: requiredText(object, "evidence_ref"),
    fact_class: requiredFactClass(object),
    freshness: requiredFreshness(object),
    ...(optionalText(object, "binds_decision_id") === undefined
      ? {}
      : { binds_decision_id: optionalText(object, "binds_decision_id") }),
    ...(optionalText(object, "binds_effect_id") === undefined
      ? {}
      : { binds_effect_id: optionalText(object, "binds_effect_id") }),
    ...(optionalText(object, "binds_task_ref") === undefined
      ? {}
      : { binds_task_ref: optionalText(object, "binds_task_ref") }),
    ...(optionalText(object, "binds_work_item_id") === undefined
      ? {}
      : { binds_work_item_id: optionalText(object, "binds_work_item_id") }),
    ...(optionalIso(object, "observed_at") === undefined
      ? {}
      : { observed_at: optionalIso(object, "observed_at") }),
    ...(readback === undefined
      ? {}
      : { readback_status: readback }),
    ...("effect_ref" in object
      ? { effect_ref: requiredIdRef(object["effect_ref"], "effect_ref", "effect_id") }
      : {}),
    ...("receipt_ref" in object
      ? { receipt_ref: requiredIdRef(object["receipt_ref"], "receipt_ref", "receipt_id") }
      : {}),
    ...("typed_result_ref" in object
      ? {
          typed_result_ref: requiredIdRef(
            object["typed_result_ref"],
            "typed_result_ref",
            "result_id",
          ),
        }
      : {}),
  };
}

export function acceptTypedResult(ref: unknown): TypedResultAcceptance {
  rejectForbiddenCrossingKeys(ref);
  const object = requireObject(ref, "typed result ref");
  rejectUnknownKeys(object, TYPED_RESULT_REF_KEYS, "typed result ref");
  return {
    accepted: true,
    grant_revision_unchanged: true,
    inferred_grant: false,
    typed_result_ref: {
      result_id: requiredText(object, "result_id"),
    },
  };
}

export function prepareOutboundTurn(envelopeRef: unknown): BoundedTurnRequest {
  const envelope = requiredEnvelopeRef(envelopeRef);
  return {
    decision_ref: envelope.decision_ref,
    envelope_ref: envelope,
    max_invocations: 1,
    turn_kind: "run_once",
  };
}

export function isBridgeEnabled(_events: readonly EventEnvelope[]): boolean {
  return false;
}

export function projectBridgeSnapshot(source: unknown): BridgeSnapshot {
  if (Array.isArray(source)) {
    return snapshotFromEvents(source);
  }
  if (isCurrentView(source)) {
    return snapshotFromView(source);
  }
  throw new CommandError(
    "BRIDGE_AUTHORITY_REJECTED",
    "bridge snapshot source must be a CurrentView or event list",
  );
}

export const bridgePort: BridgePort = {
  acceptTypedResult,
  assertAuthorityCrossing,
  assertDecisionCrossing,
  assertEvidenceCrossing,
  isBridgeEnabled,
  prepareOutboundTurn,
  projectBridgeSnapshot,
};

function snapshotFromView(view: CurrentView): BridgeSnapshot {
  const grant = view.authorization_grant.value;
  const decision = view.decision.value;
  const envelope = view.execution_envelope.value;
  const receipt = view.receipt.value;
  const typed = view.typed_result.value;
  const effect = view.first_durable_effect.value;
  const lead = view.project_lead.value;
  const item = view.work_items[0];
  const draft: Omit<BridgeSnapshot, "content_digest"> = {
    ...(grant === null
      ? {}
      : { authority_scope_ref: { grant_id: grant.grant_id, revision: grant.revision } }),
    ...(decision === null ? {} : { decision_ref: { ...decision } }),
    ...(envelope === null || decision === null
      ? {}
      : {
          execution_envelope_ref: {
            content_digest: envelope.content_digest,
            decision_ref: { ...decision },
            envelope_id: envelope.envelope_id,
          },
        }),
    ...(receipt === null || typeof receipt.receipt_id !== "string"
      ? {}
      : { receipt_ref: { receipt_id: receipt.receipt_id } }),
    ...(typed === null ? {} : { typed_result_ref: { result_id: typed.result_id } }),
    ...(effect === null || typeof effect.effect_id !== "string"
      ? {}
      : { effect_ref: { effect_id: effect.effect_id } }),
    ...(lead === null
      ? {}
      : { session_binding_ref: { binding_id: lead.binding_id, generation: 1 } }),
    ...(item === undefined
      ? {}
      : {
          authority_snapshot_ref: {
            freshness: item.observed_at?.freshness ?? "not_applicable",
            task_ref: item.work_item_id,
            ...(typeof item.source_revision === "string" && item.source_revision !== ""
              ? { source_revision: item.source_revision }
              : {}),
            ...(item.observed_at?.value
              ? { observed_at: item.observed_at.value }
              : {}),
          },
        }),
  };
  return finalizeSnapshot(draft);
}

function snapshotFromEvents(events: readonly EventEnvelope[]): BridgeSnapshot {
  let authorityScope: AuthorityScopeRef | undefined;
  try {
    const grant = currentGrant(events);
    authorityScope = { grant_id: grant.grant_id, revision: grant.revision };
  } catch (error) {
    if (!(error instanceof CommandError) || error.code !== "DATA_INSUFFICIENT") {
      throw error;
    }
  }
  const decisionId = latestPacketIds(events).at(-1);
  const materialized =
    decisionId === undefined ? undefined : materializeDecision(events, decisionId);
  const decisionRef =
    materialized === undefined
      ? undefined
      : {
          content_digest: materialized.content_digest,
          decision_id: materialized.decision_id,
          version: materialized.version,
        };
  const envelopeEvent =
    decisionId === undefined ? undefined : currentEnvelope(events, decisionId);
  const envelopeRef =
    envelopeEvent === undefined || decisionRef === undefined
      ? undefined
      : {
          content_digest: requiredDigest(envelopeEvent.payload, "content_digest"),
          decision_ref: decisionRef,
          envelope_id: requiredText(envelopeEvent.payload, "envelope_id"),
        };
  const typed = latestTypedResult(events);
  const receipt = latestReceipt(events);
  const effect = [...events]
    .reverse()
    .find((event) => event.event_type === "hufu/decision.effect_delta");
  const workItem = [...events]
    .reverse()
    .find((event) => event.event_type === "hufu/work_item.opened");
  const draft: Omit<BridgeSnapshot, "content_digest"> = {
    ...(authorityScope === undefined ? {} : { authority_scope_ref: authorityScope }),
    ...(decisionRef === undefined ? {} : { decision_ref: decisionRef }),
    ...(envelopeRef === undefined ? {} : { execution_envelope_ref: envelopeRef }),
    ...(typed === undefined || typeof typed.payload["result_id"] !== "string"
      ? {}
      : { typed_result_ref: { result_id: typed.payload["result_id"] } }),
    ...(receipt === undefined || typeof receipt.payload["receipt_id"] !== "string"
      ? {}
      : { receipt_ref: { receipt_id: receipt.payload["receipt_id"] } }),
    ...(effect === undefined || typeof effect.payload["effect_id"] !== "string"
      ? {}
      : { effect_ref: { effect_id: effect.payload["effect_id"] } }),
    ...(workItem === undefined || typeof workItem.payload["work_item_id"] !== "string"
      ? {}
      : {
          authority_snapshot_ref: {
            freshness: "not_applicable",
            task_ref: workItem.payload["work_item_id"],
          },
        }),
  };
  return finalizeSnapshot(draft);
}

function finalizeSnapshot(draft: Omit<BridgeSnapshot, "content_digest">): BridgeSnapshot {
  const contentDigest = digestPayload(draft);
  const snapshot: BridgeSnapshot = { ...draft, content_digest: contentDigest };
  const text = JSON.stringify(snapshot);
  if (/:0([,}\]])/.test(text) || /"scope_text"|"business_outcome"|"ok":true/.test(text)) {
    throw new CommandError(
      "BRIDGE_AUTHORITY_REJECTED",
      "bridge snapshot leaked a body field or wrote 0 for a missing observation",
    );
  }
  return snapshot;
}

function isCurrentView(value: unknown): value is CurrentView {
  if (!isJsonObject(value)) {
    return false;
  }
  const grant = value["authorization_grant"];
  const authority = value["task_authority"];
  return (
    isJsonObject(grant) &&
    typeof grant["fact_class"] === "string" &&
    isJsonObject(authority) &&
    "value" in authority
  );
}
