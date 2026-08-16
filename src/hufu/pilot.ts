import { readFileSync } from "node:fs";

import {
  commanderId,
  projectLeadPrincipal,
} from "./decision-state.js";
import { type EventEnvelope } from "./envelope.js";
import { CommandError, isJsonObject } from "./errors.js";
import {
  METRIC_SLOT_NAMES,
  metricSlot,
  sanitizedAggregate,
  validatePilotRecordInput,
  type MetricSlot,
  type MetricSlotName,
  type PilotConclusion,
  type PilotRecord,
} from "./pilot-schema.js";
import { type EventDraft, mutateLedger, readLedger } from "./storage.js";

export const PILOT_EVENT_TYPE = "hufu/pilot.recorded" as const;

export interface PilotCommandInput {
  readonly actor: string;
  readonly file?: string;
  readonly payload?: Record<string, unknown>;
}

export interface ExpansionGate {
  readonly status: "closed" | "evaluation_allowed" | "paused";
  readonly comparison_class: string | null;
  readonly round_count: number;
  readonly net_benefit_rounds: number;
  readonly web_implemented: false;
  readonly serve_allowed: false;
}

export function recordPilot(
  workspaceRoot: string,
  input: PilotCommandInput,
): Record<string, unknown> {
  const actor = requiredActor(input.actor);
  const raw = readPilotPayload(input);
  const snapshot = readLedger(workspaceRoot);
  if (snapshot.status === "missing") {
    throw new CommandError(
      "TASK_AUTHORITY_MISSING",
      "workspace is not connected as a local project",
    );
  }
  return mutateLedger(workspaceRoot, (events, append) => {
    assertPilotActor(events, actor);
    const record = validatePilotRecordInput(raw);
    assertHandoffExists(events, record.work_item_id);
    const derived = derivePilotMetrics(events, record);
    const metrics = mergeDerivedMetrics(record.metrics, derived);
    const payload = pilotPayload(record, metrics);
    const last = events[events.length - 1];
    const written = append([
      {
        actor_binding_ref: actor,
        caused_by: last?.event_id,
        event_type: PILOT_EVENT_TYPE,
        idempotency_key: `${PILOT_EVENT_TYPE}:${record.pilot_id}`,
        payload,
      },
    ]);
    const known = new Set(events.map((event) => event.event_id));
    const extra = written.filter((event) => !known.has(event.event_id));
    const allEvents = extra.length === 0 ? events : [...events, ...extra];
    const recorded = written[written.length - 1] ?? last;
    return toPilotResult(allEvents, record, recorded?.ledger_seq ?? last?.ledger_seq ?? 1);
  });
}

export function latestPilotEvent(
  events: readonly EventEnvelope[],
): EventEnvelope | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.event_type === PILOT_EVENT_TYPE) {
      return event;
    }
  }
  return undefined;
}

export function evaluateExpansionGate(
  events: readonly EventEnvelope[],
): ExpansionGate | undefined {
  const recorded = events.filter((event) => event.event_type === PILOT_EVENT_TYPE);
  if (recorded.length === 0) {
    return undefined;
  }
  const latest = recorded[recorded.length - 1];
  const comparisonClass =
    typeof latest?.payload["comparison_class"] === "string"
      ? latest.payload["comparison_class"]
      : null;
  const rounds = recorded.filter(
    (event) => event.payload["comparison_class"] === comparisonClass,
  );
  const netBenefitRounds = rounds.filter((event) => isExplainableNetBenefit(event)).length;
  const lastThree = rounds.slice(-3);
  let status: ExpansionGate["status"] = "closed";
  if (
    lastThree.length === 3 &&
    lastThree.every((event) => event.payload["conclusion"] === "NO_NET_BENEFIT")
  ) {
    status = "paused";
  } else if (lastThree.length === 3 && lastThree.every(isExplainableNetBenefit)) {
    status = "evaluation_allowed";
  }
  return {
    status,
    comparison_class: comparisonClass,
    round_count: rounds.length,
    net_benefit_rounds: netBenefitRounds,
    web_implemented: false,
    serve_allowed: false,
  };
}

export function derivePilotMetrics(
  events: readonly EventEnvelope[],
  record: Pick<PilotRecord, "work_item_id" | "observation_window">,
): Pick<
  Record<MetricSlotName, MetricSlot>,
  "coordination_wakeups" | "rework" | "zero_effect_attempts"
> {
  const related = events.filter((event) =>
    eventReferencesWorkItem(events, event, record.work_item_id),
  );
  const wakeups = related.filter((event) => isWakeupEvent(event)).length;
  const rework = related.filter(
    (event) => event.event_type === "hufu/decision.decision_delta",
  ).length;
  return {
    coordination_wakeups: metricSlot("available", "measured", wakeups, "count"),
    rework: metricSlot("available", "measured", rework, "count"),
    zero_effect_attempts: deriveZeroEffect(events, record),
  };
}

export function conclusionCounts(
  events: readonly EventEnvelope[],
  comparisonClass: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    if (event.event_type !== PILOT_EVENT_TYPE) {
      continue;
    }
    if (event.payload["comparison_class"] !== comparisonClass) {
      continue;
    }
    const conclusion = String(event.payload["conclusion"] ?? "");
    counts[conclusion] = (counts[conclusion] ?? 0) + 1;
  }
  return counts;
}

function deriveZeroEffect(
  events: readonly EventEnvelope[],
  record: Pick<PilotRecord, "observation_window">,
): MetricSlot {
  const window = record.observation_window;
  if (window === undefined) {
    return metricSlot("data_insufficient", "unavailable", null, "count");
  }
  const inWindow = events.filter(
    (event) =>
      event.ledger_seq >= window.from_ledger_seq &&
      event.ledger_seq <= window.to_ledger_seq,
  );
  const produced = inWindow.some((event) => isProgressEvent(event));
  return metricSlot("available", "measured", produced ? 0 : 1, "count");
}

function mergeDerivedMetrics(
  input: Record<MetricSlotName, MetricSlot>,
  derived: Pick<
    Record<MetricSlotName, MetricSlot>,
    "coordination_wakeups" | "rework" | "zero_effect_attempts"
  >,
): Record<MetricSlotName, MetricSlot> {
  const merged = { ...input };
  for (const name of [
    "coordination_wakeups",
    "rework",
    "zero_effect_attempts",
  ] as const) {
    merged[name] = reconcileDerived(name, input[name], derived[name]);
  }
  return merged;
}

function reconcileDerived(
  name: MetricSlotName,
  input: MetricSlot,
  derived: MetricSlot,
): MetricSlot {
  if (input.availability === "available" && input.value === 0 && derived.availability !== "available") {
    throw new CommandError(
      "PILOT_INVALID",
      `${name} must not write 0 when the observation is missing`,
    );
  }
  if (
    input.availability === "available" &&
    derived.availability === "available" &&
    input.value !== derived.value
  ) {
    throw new CommandError(
      "PILOT_INVALID",
      `${name} does not match events already recorded for this work item`,
    );
  }
  if (input.availability === "available" && derived.availability !== "available") {
    throw new CommandError(
      "DATA_INSUFFICIENT",
      `${name} cannot be treated as complete without a reliable observation window`,
    );
  }
  return derived;
}

function eventReferencesWorkItem(
  events: readonly EventEnvelope[],
  event: EventEnvelope,
  workItemId: string,
): boolean {
  if (event.payload["work_item_id"] === workItemId) {
    return true;
  }
  const ids = event.payload["work_item_ids"];
  if (Array.isArray(ids) && ids.includes(workItemId)) {
    return true;
  }
  const taskRef = taskRefOf(event);
  if (taskRef === workItemId) {
    return true;
  }
  const decisionId = event.payload["decision_id"];
  if (typeof decisionId === "string" && decisionId !== "") {
    return decisionOwnsWorkItem(events, decisionId, workItemId);
  }
  return false;
}

function decisionOwnsWorkItem(
  events: readonly EventEnvelope[],
  decisionId: string,
  workItemId: string,
): boolean {
  return events.some((event) => {
    if (event.payload["decision_id"] !== decisionId) {
      return false;
    }
    if (event.payload["work_item_id"] === workItemId) {
      return true;
    }
    const ids = event.payload["work_item_ids"];
    if (Array.isArray(ids) && ids.includes(workItemId)) {
      return true;
    }
    return taskRefOf(event) === workItemId;
  });
}

function isWakeupEvent(event: EventEnvelope): boolean {
  return (
    event.event_type === "hufu/handoff.recorded" ||
    event.event_type === "hufu/decision.packet_recorded" ||
    event.event_type === "hufu/decision.envelope_attached" ||
    event.event_type === "hufu/engine.bound" ||
    event.event_type === "hufu/engine.typed_result" ||
    event.event_type === "hufu/engine.receipt"
  );
}

function isProgressEvent(event: EventEnvelope): boolean {
  if (event.event_type === "hufu/decision.fact_delta") {
    return true;
  }
  if (event.event_type === "hufu/decision.decision_delta") {
    return true;
  }
  return (
    event.event_type === "hufu/decision.effect_delta" &&
    event.payload["observed_result"] === "applied" &&
    event.payload["durability"] === "durable"
  );
}

function taskRefOf(event: EventEnvelope): string | undefined {
  const state = event.payload["authoritative_state"];
  if (state !== null && typeof state === "object" && !Array.isArray(state)) {
    const ref = (state as Record<string, unknown>)["task_ref"];
    if (typeof ref === "string") {
      return ref;
    }
  }
  return undefined;
}

function isExplainableNetBenefit(event: EventEnvelope): boolean {
  if (event.payload["conclusion"] !== "NET_BENEFIT") {
    return false;
  }
  const quality = event.payload["quality_preserved"];
  if (!isJsonObject(quality)) {
    return false;
  }
  return (
    quality["authorization_preserved"] === true &&
    quality["safety_preserved"] === true &&
    quality["result_quality_preserved"] === true &&
    quality["evidence_integrity_preserved"] === true
  );
}

function assertPilotActor(events: readonly EventEnvelope[], actor: string): void {
  if (actor === commanderId(events) || actor === projectLeadPrincipal(events)) {
    return;
  }
  throw new CommandError(
    "ROLE_NOT_ACTIVE",
    "only the commander or current project_lead may record a pilot",
  );
}

function assertHandoffExists(
  events: readonly EventEnvelope[],
  workItemId: string,
): void {
  const handoff = events.find(
    (event) =>
      event.event_type === "hufu/handoff.recorded" &&
      event.payload["work_item_id"] === workItemId,
  );
  if (handoff === undefined) {
    throw new CommandError(
      "DATA_INSUFFICIENT",
      "work item has no recorded handoff",
    );
  }
}

function pilotPayload(
  record: PilotRecord,
  metrics: Record<MetricSlotName, MetricSlot>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    baseline: record.baseline,
    comparison_class: record.comparison_class,
    conclusion: record.conclusion,
    metrics,
    derived_metrics: {
      coordination_wakeups: metrics.coordination_wakeups,
      rework: metrics.rework,
      zero_effect_attempts: metrics.zero_effect_attempts,
    },
    pilot_id: record.pilot_id,
    work_item_id: record.work_item_id,
  };
  if (record.quality_preserved !== undefined) {
    payload["quality_preserved"] = record.quality_preserved;
  }
  if (record.notes_ref !== undefined) {
    payload["notes_ref"] = record.notes_ref;
  }
  if (record.observation_window !== undefined) {
    payload["observation_window"] = record.observation_window;
  }
  return payload;
}

function toPilotResult(
  events: readonly EventEnvelope[],
  record: PilotRecord,
  ledgerSeq: number,
): Record<string, unknown> {
  const gate = evaluateExpansionGate(events) ?? closedGate(record.comparison_class);
  return {
    aggregate: sanitizedAggregate({
      comparison_class: record.comparison_class,
      conclusion_counts: conclusionCounts(events, record.comparison_class),
      method_ref: record.baseline.method_ref,
    }),
    comparison_class: record.comparison_class,
    conclusion: record.conclusion,
    expansion_gate: gate,
    ledger_seq: ledgerSeq,
    pilot_id: record.pilot_id,
    work_item_id: record.work_item_id,
  };
}

function closedGate(comparisonClass: string): ExpansionGate {
  return {
    status: "closed",
    comparison_class: comparisonClass,
    round_count: 0,
    net_benefit_rounds: 0,
    web_implemented: false,
    serve_allowed: false,
  };
}

function requiredActor(actor: string): string {
  if (actor.trim() === "") {
    throw new CommandError("CONTRACT_INVALID", "--actor is required");
  }
  return actor.trim();
}

function readPilotPayload(input: PilotCommandInput): Record<string, unknown> {
  const file = input.file?.trim() ?? "";
  const hasFile = file !== "";
  const hasPayload = input.payload !== undefined;
  if (hasFile === hasPayload) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "pilot requires exactly one of file or payload",
    );
  }
  if (hasPayload) {
    if (!isJsonObject(input.payload)) {
      throw new CommandError("CONTRACT_INVALID", "pilot payload must be a JSON object");
    }
    return input.payload;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isJsonObject(parsed)) {
      throw new CommandError("CONTRACT_INVALID", "pilot record must be a JSON object");
    }
    return parsed;
  } catch (error) {
    if (error instanceof CommandError) {
      throw error;
    }
    throw new CommandError("CONTRACT_INVALID", "pilot record could not be parsed");
  }
}

export type { PilotConclusion };
