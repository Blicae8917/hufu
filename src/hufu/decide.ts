import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  componentDigest,
  packetContentDigest,
} from "./decision-digest.js";
import {
  optionalText,
  requiredPositiveInteger,
  requiredStringArray,
  requiredText,
  validateAckInput,
  validateEffectInput,
  validateEnvelopeInput,
  validateFactInput,
  validatePacketInput,
  validateReviseInput,
} from "./decision-schema.js";
import {
  commanderId,
  currentEnvelope,
  currentGrant,
  decisionClaimingWorkItem,
  materializeDecision,
  type MaterializedDecision,
  projectLeadPrincipal,
} from "./decision-state.js";
import { type EventEnvelope } from "./envelope.js";
import { CommandError, isJsonObject } from "./errors.js";
import { parseExternalRef } from "./github-ref.js";
import { readGitLabProjectionCache } from "./gitlab-cache.js";
import { parseGitLabExternalRef } from "./gitlab-ref.js";
import {
  currentRebaseFingerprint,
  evaluateGuardrails,
  rebaseAlreadyRecorded,
} from "./guardrails.js";
import { readProjectionCache } from "./projection-cache.js";
import { type EventDraft, mutateLedger, readLedger } from "./storage.js";
import { findWorkItem } from "./work-item.js";

export type DecideKind =
  | "ack"
  | "effect"
  | "envelope"
  | "fact"
  | "packet"
  | "revise";

export interface DecideInput {
  readonly actor: string;
  readonly kind: DecideKind;
  readonly file?: string;
  readonly payload?: Record<string, unknown>;
}

export function decideWorkspace(
  workspaceRoot: string,
  input: DecideInput,
): Record<string, unknown> {
  const actor = requiredActor(input.actor);
  const payload = readDecidePayload(input);
  const snapshot = readLedger(workspaceRoot);
  if (snapshot.status === "missing") {
    throw new CommandError(
      "TASK_AUTHORITY_MISSING",
      "workspace is not connected as a local project",
    );
  }
  return mutateLedger(workspaceRoot, (events, append) => {
    switch (input.kind) {
      case "packet":
        return recordPacket(workspaceRoot, events, append, actor, payload);
      case "envelope":
        return recordEnvelope(events, append, actor, payload);
      case "ack":
        return recordAck(events, append, actor, payload);
      case "fact":
        return recordFact(events, append, actor, payload);
      case "revise":
        return recordRevise(events, append, actor, payload);
      case "effect":
        return recordEffect(events, append, actor, payload);
    }
  });
}

function recordPacket(
  workspaceRoot: string,
  events: readonly EventEnvelope[],
  append: (drafts: readonly EventDraft[]) => readonly EventEnvelope[],
  actor: string,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const input = validatePacketInput(raw);
  if (actor !== commanderId(events)) {
    throw new CommandError("ROLE_NOT_ACTIVE", "only the commander may record a packet");
  }
  const grant = currentGrant(events);
  const scope = input["authority_scope_ref"] as Record<string, unknown>;
  if (String(scope["grant_id"]) !== grant.grant_id || Number(scope["revision"]) !== grant.revision) {
    throw new CommandError(
      "GRANT_SCOPE_EXCEEDED",
      "authority_scope_ref must match the current grant revision",
    );
  }
  const state = input["authoritative_state"] as Record<string, unknown>;
  const taskRef = String(state["task_ref"]);
  assertWorkItemExists(workspaceRoot, events, taskRef);
  const claimant = decisionClaimingWorkItem(events, taskRef);
  const decisionId =
    typeof input["decision_id"] === "string" && input["decision_id"].trim() !== ""
      ? input["decision_id"].trim()
      : randomUUID();
  if (claimant !== undefined && claimant !== decisionId) {
    throw new CommandError(
      "DECISION_CONFLICT",
      "work item already belongs to another active decision stream",
    );
  }
  const semantic = {
    ...input,
    decision_id: decisionId,
    version: 1,
  };
  const digest = packetContentDigest(semantic);
  if (
    typeof input["content_digest"] === "string" &&
    input["content_digest"] !== digest
  ) {
    throw new CommandError("CONTRACT_INVALID", "content_digest does not match payload");
  }
  const payload = { ...semantic, content_digest: digest };
  const last = events[events.length - 1];
  const written = append([
    {
      actor_binding_ref: actor,
      caused_by: last?.event_id,
      event_type: "hufu/decision.packet_recorded",
      idempotency_key: `hufu/decision.packet_recorded:${decisionId}:1`,
      payload,
    },
  ]);
  const recorded = written[written.length - 1];
  return {
    content_digest: digest,
    decision_id: decisionId,
    ledger_seq: recorded?.ledger_seq ?? last?.ledger_seq ?? 1,
    version: 1,
  };
}

function recordEnvelope(
  events: readonly EventEnvelope[],
  append: (drafts: readonly EventDraft[]) => readonly EventEnvelope[],
  actor: string,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const input = validateEnvelopeInput(raw);
  const decisionId = requiredText(input, "decision_id");
  const materialized = requireMaterialized(events, decisionId);
  observeGuardrails(events, materialized);
  if (
    Number(input["version"]) !== materialized.version ||
    requiredText(input, "content_digest") !== materialized.content_digest
  ) {
    throw new CommandError(
      "DECISION_CONFLICT",
      "envelope does not match the current decision digest",
    );
  }
  const workItemIds = requiredStringArray(input, "work_item_ids");
  const taskRef = taskRefOf(materialized.semantic);
  if (!workItemIds.includes(taskRef)) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "work_item_ids must include the packet task_ref",
    );
  }
  for (const workItemId of workItemIds) {
    const claimant = decisionClaimingWorkItem(events, workItemId, decisionId);
    if (claimant !== undefined) {
      throw new CommandError(
        "DECISION_CONFLICT",
        "work item already belongs to another active decision stream",
      );
    }
  }
  const lead = projectLeadPrincipal(events);
  const drafts: EventDraft[] = [];
  const last = events[events.length - 1];
  const envelopeId =
    optionalText(input, "envelope_id") ?? randomUUID();
  const executor = requiredText(input, "executor_principal_id");
  let ownerBindingId: string | undefined;
  let missionLeadBindingId: string | undefined;
  if (workItemIds.length === 1) {
    if (actor !== lead) {
      throw new CommandError(
        "ROLE_NOT_ACTIVE",
        "only the current project_lead may attach a single-item envelope",
      );
    }
    const workItemId = workItemIds[0];
    if (workItemId === undefined) {
      throw new CommandError("CONTRACT_INVALID", "work_item_ids must not be empty");
    }
    ownerBindingId = `binding:${workItemId}:owner`;
    drafts.push({
      actor_binding_ref: actor,
      caused_by: last?.event_id,
      event_type: "hufu/role_binding.established",
      idempotency_key: `hufu/role_binding.established:${workItemId}:owner`,
      payload: {
        binding_id: ownerBindingId,
        principal_id: executor,
        role: "owner",
        scope_id: workItemId,
        scope_kind: "work_item",
      },
    });
  } else {
    if (actor !== lead) {
      throw new CommandError(
        "ROLE_NOT_ACTIVE",
        "mission envelopes must be attached by the current project_lead",
      );
    }
    missionLeadBindingId = `binding:${envelopeId}:mission_lead`;
    drafts.push({
      actor_binding_ref: actor,
      caused_by: last?.event_id,
      event_type: "hufu/role_binding.established",
      idempotency_key: `hufu/role_binding.established:${envelopeId}:mission_lead`,
      payload: {
        binding_id: missionLeadBindingId,
        principal_id: actor,
        role: "mission_lead",
        scope_id: envelopeId,
        scope_kind: "mission",
      },
    });
  }
  const envelopePayload: Record<string, unknown> = {
    content_digest: materialized.content_digest,
    decision_id: decisionId,
    envelope_id: envelopeId,
    executor_principal_id: executor,
    work_item_ids: workItemIds,
    version: materialized.version,
  };
  copyOptional(input, envelopePayload, [
    "route_step_refs",
    "input_refs",
    "handoff_refs",
    "budget_ref",
    "deadline",
    "supersedes_envelope_ref",
  ]);
  drafts.push({
    actor_binding_ref: actor,
    caused_by: last?.event_id,
    event_type: "hufu/decision.envelope_attached",
    idempotency_key: `hufu/decision.envelope_attached:${envelopeId}`,
    payload: envelopePayload,
  });
  append(drafts);
  const result: Record<string, unknown> = {
    content_digest: materialized.content_digest,
    decision_id: decisionId,
    envelope_id: envelopeId,
    version: materialized.version,
  };
  if (ownerBindingId !== undefined) {
    result["owner_binding_id"] = ownerBindingId;
  }
  if (missionLeadBindingId !== undefined) {
    result["mission_lead_binding_id"] = missionLeadBindingId;
  }
  return result;
}

function recordAck(
  events: readonly EventEnvelope[],
  append: (drafts: readonly EventDraft[]) => readonly EventEnvelope[],
  actor: string,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const input = validateAckInput(raw);
  const envelopeId = requiredText(input, "envelope_id");
  const envelope = events.find(
    (event) =>
      event.event_type === "hufu/decision.envelope_attached" &&
      event.payload["envelope_id"] === envelopeId,
  );
  if (envelope === undefined) {
    throw new CommandError("DATA_INSUFFICIENT", "envelope does not exist");
  }
  const decisionId = String(envelope.payload["decision_id"]);
  const materialized = requireMaterialized(events, decisionId);
  observeGuardrails(events, materialized);
  if (actor !== String(envelope.payload["executor_principal_id"])) {
    throw new CommandError("ACK_INVALID", "acknowledger is not the envelope executor");
  }
  if (
    requiredText(input, "decision_id") !== decisionId ||
    Number(input["version"]) !== materialized.version ||
    requiredText(input, "content_digest") !== materialized.content_digest
  ) {
    throw new CommandError("ACK_INVALID", "ack does not match the current decision");
  }
  const outcome = componentDigest(materialized.semantic["business_outcome"]);
  const state = componentDigest(materialized.semantic["authoritative_state"]);
  const acceptance = componentDigest(materialized.semantic["acceptance_metric"]);
  if (
    requiredText(input, "outcome_digest") !== outcome ||
    requiredText(input, "state_digest") !== state ||
    requiredText(input, "acceptance_digest") !== acceptance
  ) {
    throw new CommandError("ACK_INVALID", "component digests do not match");
  }
  const added = Array.isArray(input["added_scope"]) ? input["added_scope"] : [];
  const last = events[events.length - 1];
  append([
    {
      actor_binding_ref: actor,
      caused_by: last?.event_id,
      event_type: "hufu/decision.route_acked",
      idempotency_key: `hufu/decision.route_acked:${envelopeId}`,
      payload: {
        acceptance_digest: acceptance,
        added_scope: added,
        content_digest: materialized.content_digest,
        decision_id: decisionId,
        envelope_id: envelopeId,
        facts_checked_as_of: input["facts_checked_as_of"],
        outcome_digest: outcome,
        state_digest: state,
        version: materialized.version,
      },
    },
  ]);
  const flags: string[] = [];
  if (added.length > 0) {
    flags.push("scope_change_required");
  }
  return {
    added_scope_count: added.length,
    decision_id: decisionId,
    envelope_id: envelopeId,
    guardrails: flags,
    version: materialized.version,
  };
}

function recordFact(
  events: readonly EventEnvelope[],
  append: (drafts: readonly EventDraft[]) => readonly EventEnvelope[],
  actor: string,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const input = validateFactInput(raw);
  const decisionId = requiredText(input, "decision_id");
  const materialized = requireMaterialized(events, decisionId);
  observeGuardrails(events, materialized);
  assertFactActor(events, actor, decisionId);
  if (requiredPositiveInteger(input, "base_version") !== materialized.version) {
    throw new CommandError("DECISION_CONFLICT", "fact delta base_version is not current");
  }
  const fingerprint =
    typeof input["rebase_fingerprint"] === "string"
      ? input["rebase_fingerprint"]
      : undefined;
  if (fingerprint !== undefined && rebaseAlreadyRecorded(events, fingerprint)) {
    return {
      decision_id: decisionId,
      idempotent: true,
      version: materialized.version,
    };
  }
  if (fingerprint !== undefined) {
    const expected = currentRebaseFingerprint(materialized, events);
    if (fingerprint !== expected) {
      throw new CommandError("CONTRACT_INVALID", "rebase_fingerprint does not match");
    }
  }
  const deltaId = optionalText(input, "delta_id") ?? randomUUID();
  const last = events[events.length - 1];
  append([
    {
      actor_binding_ref: actor,
      caused_by: last?.event_id,
      event_type: "hufu/decision.fact_delta",
      idempotency_key: `hufu/decision.fact_delta:${deltaId}`,
      payload: {
        base_version: materialized.version,
        decision_id: decisionId,
        delta_id: deltaId,
        evidence_frontier: input["evidence_frontier"],
        ops: input["ops"],
        ...(fingerprint === undefined ? {} : { rebase_fingerprint: fingerprint }),
      },
    },
  ]);
  return {
    decision_id: decisionId,
    delta_id: deltaId,
    version: materialized.version,
  };
}

function recordRevise(
  events: readonly EventEnvelope[],
  append: (drafts: readonly EventDraft[]) => readonly EventEnvelope[],
  actor: string,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const input = validateReviseInput(raw);
  if (actor !== commanderId(events)) {
    throw new CommandError("ROLE_NOT_ACTIVE", "only the commander may revise a decision");
  }
  const decisionId = requiredText(input, "decision_id");
  const materialized = requireMaterialized(events, decisionId);
  observeGuardrails(events, materialized);
  const expected = requiredPositiveInteger(input, "expected_version");
  if (expected !== materialized.version) {
    throw new CommandError("DECISION_CONFLICT", "decision version jump or stale expected_version");
  }
  const newVersion = expected + 1;
  const changed = input["changed_fields"] as Record<string, unknown>;
  const nextSemantic = {
    ...materialized.semantic,
    ...changed,
    decision_id: decisionId,
    version: newVersion,
  };
  const digest = packetContentDigest(nextSemantic);
  const last = events[events.length - 1];
  append([
    {
      actor_binding_ref: actor,
      caused_by: last?.event_id,
      event_type: "hufu/decision.decision_delta",
      idempotency_key: `hufu/decision.decision_delta:${decisionId}:${newVersion}`,
      payload: {
        based_on_fact_delta_refs: input["based_on_fact_delta_refs"] ?? [],
        changed_fields: changed,
        content_digest: digest,
        decision_id: decisionId,
        discarded_assumptions: input["discarded_assumptions"] ?? [],
        expected_version: expected,
        new_version: newVersion,
        preserve_effects: input["preserve_effects"] ?? [],
        supersedes: {
          content_digest: materialized.content_digest,
          decision_id: decisionId,
          version: expected,
        },
      },
    },
  ]);
  return {
    content_digest: digest,
    decision_id: decisionId,
    new_version: newVersion,
  };
}

function recordEffect(
  events: readonly EventEnvelope[],
  append: (drafts: readonly EventDraft[]) => readonly EventEnvelope[],
  actor: string,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const input = validateEffectInput(raw);
  const envelopeId = requiredText(input, "envelope_id");
  const envelope = events.find(
    (event) =>
      event.event_type === "hufu/decision.envelope_attached" &&
      event.payload["envelope_id"] === envelopeId,
  );
  if (envelope === undefined) {
    throw new CommandError("DATA_INSUFFICIENT", "envelope does not exist");
  }
  if (actor !== String(envelope.payload["executor_principal_id"])) {
    throw new CommandError("ROLE_NOT_ACTIVE", "only the envelope executor may record effects");
  }
  const materialized = materializeDecision(events, requiredText(input, "decision_id"));
  if (materialized !== undefined) {
    observeGuardrails(events, materialized);
  }
  const observationId = optionalText(input, "observation_id") ?? randomUUID();
  const last = events[events.length - 1];
  const payload: Record<string, unknown> = {
    decision_id: requiredText(input, "decision_id"),
    durability:
      input["observed_result"] === "applied" ? "durable" : "unknown",
    effect_id: requiredText(input, "effect_id"),
    envelope_id: envelopeId,
    observation_id: observationId,
    readback_status: input["readback_status"],
    version: requiredPositiveInteger(input, "version"),
  };
  copyOptional(input, payload, [
    "observed_result",
    "observed_at",
    "evidence_refs",
    "implementation_activity",
    "hits_non_goal",
  ]);
  append([
    {
      actor_binding_ref: actor,
      caused_by: last?.event_id,
      event_type: "hufu/decision.effect_delta",
      idempotency_key: `hufu/decision.effect_delta:${payload["effect_id"]}:${observationId}`,
      payload,
    },
  ]);
  return {
    effect_id: payload["effect_id"],
    observation_id: observationId,
  };
}

function assertFactActor(
  events: readonly EventEnvelope[],
  actor: string,
  decisionId: string,
): void {
  if (actor === commanderId(events) || actor === projectLeadPrincipal(events)) {
    return;
  }
  const envelope = currentEnvelope(events, decisionId);
  if (envelope !== undefined && actor === String(envelope.payload["executor_principal_id"])) {
    return;
  }
  throw new CommandError("ROLE_NOT_ACTIVE", "actor may not append a fact delta");
}

function observeGuardrails(
  events: readonly EventEnvelope[],
  materialized: MaterializedDecision,
): void {
  evaluateGuardrails({ events, materialized, now: new Date() });
}

function requireMaterialized(
  events: readonly EventEnvelope[],
  decisionId: string,
) {
  const materialized = materializeDecision(events, decisionId);
  if (materialized === undefined) {
    throw new CommandError("DATA_INSUFFICIENT", "decision does not exist");
  }
  if (materialized.conflict) {
    throw new CommandError("DECISION_CONFLICT", "decision stream has a conflicting successor");
  }
  return materialized;
}

function taskRefOf(semantic: Record<string, unknown>): string {
  const state = semantic["authoritative_state"];
  if (state !== null && typeof state === "object" && !Array.isArray(state)) {
    const ref = (state as Record<string, unknown>)["task_ref"];
    if (typeof ref === "string") {
      return ref;
    }
  }
  throw new CommandError("CONTRACT_INVALID", "authoritative_state.task_ref is missing");
}

function assertWorkItemExists(
  workspaceRoot: string,
  events: readonly EventEnvelope[],
  taskRef: string,
): void {
  const connected = events.find(
    (event) => event.event_type === "hufu/project.connected",
  );
  const authority = connected?.payload["task_authority"];
  if (authority === "github") {
    const cache = readProjectionCache(workspaceRoot);
    let parsed: ReturnType<typeof parseExternalRef>;
    try {
      parsed = parseExternalRef(taskRef);
    } catch {
      throw new CommandError("DATA_INSUFFICIENT", "github task_ref is not in the projection cache");
    }
    if (cache?.items.some((item) => item.external_ref === parsed.external_ref) !== true) {
      throw new CommandError(
        "DATA_INSUFFICIENT",
        "github task_ref is not in the projection cache",
      );
    }
    return;
  }
  if (authority === "gitlab") {
    const parsed = parseGitLabExternalRef(taskRef);
    const cache = readGitLabProjectionCache(workspaceRoot);
    if (cache?.items.some((item) => item.external_ref === parsed.external_ref) !== true) {
      throw new CommandError(
        "DATA_INSUFFICIENT",
        "gitlab task_ref is not in the projection cache",
      );
    }
    return;
  }
  if (findWorkItem(events, taskRef) === undefined) {
    throw new CommandError("DATA_INSUFFICIENT", "work item does not exist");
  }
}

function copyOptional(
  from: Record<string, unknown>,
  to: Record<string, unknown>,
  keys: readonly string[],
): void {
  for (const key of keys) {
    if (from[key] !== undefined) {
      to[key] = from[key];
    }
  }
}

function requiredActor(actor: string): string {
  if (actor.trim() === "") {
    throw new CommandError("CONTRACT_INVALID", "--actor is required");
  }
  return actor.trim();
}

function readDecidePayload(input: DecideInput): Record<string, unknown> {
  const file = input.file?.trim() ?? "";
  const hasFile = file !== "";
  const hasPayload = input.payload !== undefined;
  if (hasFile === hasPayload) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "decide requires exactly one of file or payload",
    );
  }
  if (hasPayload) {
    if (!isJsonObject(input.payload)) {
      throw new CommandError(
        "CONTRACT_INVALID",
        "decide payload must be a JSON object",
      );
    }
    return input.payload;
  }
  return readJsonFile(file);
}

function readJsonFile(path: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new CommandError(
      "CONTRACT_INVALID",
      `cannot read file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CommandError("CONTRACT_INVALID", "decide payload is not valid JSON");
  }
  if (!isJsonObject(parsed)) {
    throw new CommandError("CONTRACT_INVALID", "decide payload must be a JSON object");
  }
  return parsed;
}
