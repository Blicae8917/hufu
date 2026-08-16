import { type EventEnvelope } from "./envelope.js";
import { CommandError } from "./errors.js";
import {
  packetContentDigest,
  PACKET_DIGEST_FIELDS,
} from "./decision-digest.js";

export interface MaterializedDecision {
  readonly conflict: boolean;
  readonly content_digest: string;
  readonly decision_id: string;
  readonly packet: EventEnvelope;
  readonly semantic: Record<string, unknown>;
  readonly version: number;
}

export function packetSemantic(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const semantic: Record<string, unknown> = {};
  for (const key of PACKET_DIGEST_FIELDS) {
    semantic[key] = payload[key];
  }
  return semantic;
}

export function materializeDecision(
  events: readonly EventEnvelope[],
  decisionId: string,
): MaterializedDecision | undefined {
  const packet = events.find(
    (event) =>
      event.event_type === "hufu/decision.packet_recorded" &&
      event.payload["decision_id"] === decisionId,
  );
  if (packet === undefined) {
    return undefined;
  }
  let semantic = packetSemantic(packet.payload);
  let version = 1;
  let conflict = false;
  const deltas = events.filter(
    (event) =>
      event.event_type === "hufu/decision.decision_delta" &&
      event.payload["decision_id"] === decisionId,
  );
  const seenExpected = new Set<number>();
  for (const delta of deltas) {
    const expected = Number(delta.payload["expected_version"]);
    const next = Number(delta.payload["new_version"]);
    if (expected !== version || next !== expected + 1 || seenExpected.has(expected)) {
      conflict = true;
      break;
    }
    seenExpected.add(expected);
    const changed = delta.payload["changed_fields"];
    if (changed !== null && typeof changed === "object" && !Array.isArray(changed)) {
      semantic = {
        ...semantic,
        ...(changed as Record<string, unknown>),
        decision_id: decisionId,
        version: next,
      };
    }
    version = next;
  }
  semantic = { ...semantic, decision_id: decisionId, version };
  return {
    conflict,
    content_digest: packetContentDigest(semantic),
    decision_id: decisionId,
    packet,
    semantic,
    version,
  };
}

export function latestPacketIds(events: readonly EventEnvelope[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    if (event.event_type !== "hufu/decision.packet_recorded") {
      continue;
    }
    const id = event.payload["decision_id"];
    if (typeof id === "string" && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function currentEnvelope(
  events: readonly EventEnvelope[],
  decisionId: string,
): EventEnvelope | undefined {
  const envelopes = events.filter(
    (event) =>
      event.event_type === "hufu/decision.envelope_attached" &&
      event.payload["decision_id"] === decisionId,
  );
  return envelopes[envelopes.length - 1];
}

export function currentAck(
  events: readonly EventEnvelope[],
  envelopeId: string,
): EventEnvelope | undefined {
  const acks = events.filter(
    (event) =>
      event.event_type === "hufu/decision.route_acked" &&
      event.payload["envelope_id"] === envelopeId,
  );
  return acks[acks.length - 1];
}

export function activeWorkItemsForDecision(
  events: readonly EventEnvelope[],
  decisionId: string,
): string[] {
  const envelope = currentEnvelope(events, decisionId);
  if (envelope !== undefined) {
    const ids = envelope.payload["work_item_ids"];
    if (Array.isArray(ids)) {
      return ids.filter((item): item is string => typeof item === "string");
    }
  }
  const materialized = materializeDecision(events, decisionId);
  const state = materialized?.semantic["authoritative_state"];
  if (state !== null && typeof state === "object" && !Array.isArray(state)) {
    const ref = (state as Record<string, unknown>)["task_ref"];
    if (typeof ref === "string") {
      return [ref];
    }
  }
  return [];
}

export function decisionClaimingWorkItem(
  events: readonly EventEnvelope[],
  workItemId: string,
  exceptDecisionId?: string,
): string | undefined {
  for (const decisionId of latestPacketIds(events)) {
    if (decisionId === exceptDecisionId) {
      continue;
    }
    if (activeWorkItemsForDecision(events, decisionId).includes(workItemId)) {
      return decisionId;
    }
  }
  return undefined;
}

export function currentGrant(events: readonly EventEnvelope[]): {
  grant_id: string;
  revision: number;
  scope_text: string;
} {
  const grants = events.filter(
    (event) => event.event_type === "hufu/authorization_grant.issued",
  );
  const grant = grants[grants.length - 1];
  if (grant === undefined) {
    throw new CommandError("DATA_INSUFFICIENT", "no authorization grant is available");
  }
  return {
    grant_id: String(grant.payload["grant_id"]),
    revision: Number(grant.payload["revision"]),
    scope_text: String(grant.payload["scope_text"]),
  };
}

export function commanderId(events: readonly EventEnvelope[]): string {
  const commander = events.find(
    (event) => event.event_type === "hufu/commander.declared",
  );
  const id = commander?.payload["commander_id"];
  if (typeof id !== "string" || id === "") {
    throw new CommandError("DATA_INSUFFICIENT", "commander identity is missing");
  }
  return id;
}

export function projectLeadPrincipal(events: readonly EventEnvelope[]): string {
  const bindings = events.filter(
    (event) =>
      event.event_type === "hufu/role_binding.established" &&
      event.payload["role"] === "project_lead",
  );
  const current = currentBindings(bindings);
  const lead = current[current.length - 1];
  const principal = lead?.payload["principal_id"];
  if (typeof principal !== "string" || principal === "") {
    throw new CommandError("ROLE_NOT_ACTIVE", "no current project_lead binding");
  }
  return principal;
}

export function currentBindings(
  bindings: readonly EventEnvelope[],
): EventEnvelope[] {
  const superseded = new Set<string>();
  for (const binding of bindings) {
    const previous = binding.payload["supersedes"];
    if (typeof previous === "string" && previous !== "") {
      superseded.add(previous);
    }
  }
  return bindings.filter((binding) => {
    const bindingId = binding.payload["binding_id"];
    return typeof bindingId === "string" && !superseded.has(bindingId);
  });
}

export function evidenceFrontierSeq(events: readonly EventEnvelope[], decisionId: string): number {
  const facts = events.filter(
    (event) =>
      event.event_type === "hufu/decision.fact_delta" &&
      event.payload["decision_id"] === decisionId,
  );
  const last = facts[facts.length - 1];
  const frontier = last?.payload["evidence_frontier"];
  if (frontier !== null && typeof frontier === "object" && !Array.isArray(frontier)) {
    const seq = (frontier as Record<string, unknown>)["seq"];
    if (typeof seq === "number") {
      return seq;
    }
  }
  return 0;
}
