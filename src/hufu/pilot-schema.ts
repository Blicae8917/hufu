import { CommandError, isJsonObject } from "./errors.js";
import { requiredText } from "./decision-schema.js";

export const PILOT_SCHEMA_VERSION = 1 as const;

export const PILOT_CONCLUSIONS = [
  "DATA_INSUFFICIENT",
  "FAIL",
  "NET_BENEFIT",
  "NO_NET_BENEFIT",
  "TRADEOFF",
] as const;

export type PilotConclusion = (typeof PILOT_CONCLUSIONS)[number];

export const METRIC_SLOT_NAMES = [
  "planning_wall_clock",
  "execution_wall_clock",
  "total_wall_clock",
  "human_coordination_time",
  "zero_effect_attempts",
  "coordination_wakeups",
  "rework",
  "setup_cost",
  "native_usage",
] as const;

export type MetricSlotName = (typeof METRIC_SLOT_NAMES)[number];

export const METRIC_AVAILABILITIES = [
  "available",
  "data_insufficient",
  "unavailable",
] as const;

export const METRIC_ORIGINS = ["estimated", "measured", "unavailable"] as const;

export interface MetricSlot {
  readonly availability: (typeof METRIC_AVAILABILITIES)[number];
  readonly origin: (typeof METRIC_ORIGINS)[number];
  readonly value: number | null;
  readonly unit?: string;
  readonly native_report?: true;
}

export interface QualityPreserved {
  readonly authorization_preserved: true;
  readonly safety_preserved: true;
  readonly result_quality_preserved: true;
  readonly evidence_integrity_preserved: true;
}

export interface PilotBaseline {
  readonly source: string;
  readonly observed_at: string;
  readonly method_ref: string;
}

export interface ObservationWindow {
  readonly from_ledger_seq: number;
  readonly to_ledger_seq: number;
}

export interface PilotRecord {
  readonly schema_version: typeof PILOT_SCHEMA_VERSION;
  readonly pilot_id: string;
  readonly work_item_id: string;
  readonly comparison_class: string;
  readonly conclusion: PilotConclusion;
  readonly quality_preserved?: QualityPreserved;
  readonly metrics: Record<MetricSlotName, MetricSlot>;
  readonly baseline: PilotBaseline;
  readonly notes_ref?: string;
  readonly observation_window?: ObservationWindow;
}

const ROOT_KEYS = new Set([
  "baseline",
  "comparison_class",
  "conclusion",
  "metrics",
  "notes_ref",
  "observation_window",
  "pilot_id",
  "quality_preserved",
  "schema_version",
  "work_item_id",
]);

const BASELINE_KEYS = new Set(["method_ref", "observed_at", "source"]);
const SLOT_KEYS = new Set([
  "availability",
  "native_report",
  "origin",
  "unit",
  "value",
]);
const QUALITY_KEYS = [
  "authorization_preserved",
  "evidence_integrity_preserved",
  "result_quality_preserved",
  "safety_preserved",
] as const;

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ABS_PATH_RE =
  /(?:^|[\s"'=])(?:\/(?:home|Users|root|opt|var|etc|tmp)\/|[A-Za-z]:[\\/]|\\\\[A-Za-z])/;
const CREDENTIAL_RE =
  /(?:token\s*=|bearer\s+[A-Za-z0-9]|api[_-]?key|ghp_[A-Za-z0-9]|sk-[A-Za-z0-9]{8,}|xox[baprs]-)/i;
const INTERNAL_PROJECT_RE =
  /[A-Z][A-Za-z]+Internal[A-Za-z]+|internal[-_](?:project|crm|repo)/i;
const USAGE_SUCCESS_KEYS = new Set([
  "native_usage",
  "step_count",
  "steps",
  "success_basis",
  "token_count",
  "usage",
]);

export function isPilotConclusion(value: string): value is PilotConclusion {
  return (PILOT_CONCLUSIONS as readonly string[]).includes(value);
}

export function validatePilotRecordInput(value: unknown): PilotRecord {
  if (!isJsonObject(value)) {
    throw new CommandError("CONTRACT_INVALID", "pilot record must be a JSON object");
  }
  rejectUnknownKeys(value, ROOT_KEYS, "pilot record");
  if (value["schema_version"] !== PILOT_SCHEMA_VERSION) {
    throw new CommandError("PILOT_INVALID", "schema_version must be 1");
  }
  const pilotId = requiredPilotText(value, "pilot_id");
  const workItemId = requiredPilotText(value, "work_item_id");
  const comparisonClass = requiredPilotText(value, "comparison_class");
  const conclusionText = requiredPilotText(value, "conclusion");
  if (!isPilotConclusion(conclusionText)) {
    throw new CommandError("PILOT_INVALID", "conclusion is not in the allowed set");
  }
  const metrics = validateMetrics(value["metrics"]);
  const baseline = validateBaseline(value["baseline"]);
  const notesRef =
    value["notes_ref"] === undefined
      ? undefined
      : requiredPilotText(value, "notes_ref");
  const observationWindow = validateWindow(value["observation_window"]);
  let quality: QualityPreserved | undefined;
  if (conclusionText === "NET_BENEFIT") {
    quality = validateQuality(value["quality_preserved"]);
    assertNotUsageOnlySuccess(metrics);
  } else if (value["quality_preserved"] !== undefined) {
    quality = validateQuality(value["quality_preserved"]);
  }

  const record: PilotRecord = {
    schema_version: PILOT_SCHEMA_VERSION,
    pilot_id: pilotId,
    work_item_id: workItemId,
    comparison_class: comparisonClass,
    conclusion: conclusionText,
    metrics,
    baseline,
    ...(quality === undefined ? {} : { quality_preserved: quality }),
    ...(notesRef === undefined ? {} : { notes_ref: notesRef }),
    ...(observationWindow === undefined
      ? {}
      : { observation_window: observationWindow }),
  };
  assertPublicSafe(record);
  return record;
}

export function metricSlot(
  availability: MetricSlot["availability"],
  origin: MetricSlot["origin"],
  value: number | null,
  unit?: string,
): MetricSlot {
  if (availability !== "available") {
    return { availability, origin, value: null, ...(unit === undefined ? {} : { unit }) };
  }
  return { availability, origin, value, ...(unit === undefined ? {} : { unit }) };
}

export function sanitizedAggregate(input: {
  readonly comparison_class: string;
  readonly conclusion_counts: Record<string, number>;
  readonly method_ref: string;
}): {
  readonly comparison_class: string;
  readonly conclusion_counts: Record<string, number>;
  readonly metric_names: readonly MetricSlotName[];
  readonly method_ref: string;
} {
  return {
    comparison_class: input.comparison_class,
    conclusion_counts: input.conclusion_counts,
    metric_names: METRIC_SLOT_NAMES,
    method_ref: input.method_ref,
  };
}

function validateMetrics(value: unknown): Record<MetricSlotName, MetricSlot> {
  if (!isJsonObject(value)) {
    throw new CommandError("PILOT_INVALID", "metrics must be a JSON object");
  }
  const allowed = new Set<string>(METRIC_SLOT_NAMES);
  rejectUnknownKeys(value, allowed, "metrics");
  const metrics = {} as Record<MetricSlotName, MetricSlot>;
  for (const name of METRIC_SLOT_NAMES) {
    metrics[name] = validateSlot(name, value[name]);
  }
  return metrics;
}

function validateSlot(name: MetricSlotName, value: unknown): MetricSlot {
  if (!isJsonObject(value)) {
    throw new CommandError("PILOT_INVALID", `${name} must be a JSON object`);
  }
  rejectUnknownKeys(value, SLOT_KEYS, name);
  const availability = requiredPilotText(value, "availability");
  if (!METRIC_AVAILABILITIES.includes(availability as MetricSlot["availability"])) {
    throw new CommandError("PILOT_INVALID", `${name} availability is invalid`);
  }
  const origin = requiredPilotText(value, "origin");
  if (!METRIC_ORIGINS.includes(origin as MetricSlot["origin"])) {
    throw new CommandError("PILOT_INVALID", `${name} origin is invalid`);
  }
  const unit =
    value["unit"] === undefined ? undefined : requiredPilotText(value, "unit");
  if (availability !== "available") {
    if (value["value"] !== null) {
      throw new CommandError(
        "PILOT_INVALID",
        `${name} value must be null when not available and must not be 0`,
      );
    }
    if (origin === "measured") {
      throw new CommandError(
        "PILOT_INVALID",
        `${name} cannot mark a missing observation as measured`,
      );
    }
    return metricSlot(
      availability as MetricSlot["availability"],
      origin as MetricSlot["origin"],
      null,
      unit,
    );
  }
  if (typeof value["value"] !== "number" || !Number.isFinite(value["value"])) {
    throw new CommandError("PILOT_INVALID", `${name} value must be a number`);
  }
  if (origin === "estimated" && name === "native_usage") {
    throw new CommandError(
      "PILOT_INVALID",
      "estimated native usage cannot be recorded as a numeric measured slot",
    );
  }
  if (name === "native_usage" && origin === "measured" && value["native_report"] !== true) {
    throw new CommandError(
      "PILOT_INVALID",
      "native_usage may be measured only when Host or Provider natively reported it",
    );
  }
  if (origin === "unavailable") {
    throw new CommandError(
      "PILOT_INVALID",
      `${name} origin cannot be unavailable when the slot is available`,
    );
  }
  const slot: MetricSlot = {
    availability: "available",
    origin: origin as MetricSlot["origin"],
    value: value["value"],
    ...(unit === undefined ? {} : { unit }),
    ...(value["native_report"] === true ? { native_report: true as const } : {}),
  };
  return slot;
}

function validateBaseline(value: unknown): PilotBaseline {
  if (!isJsonObject(value)) {
    throw new CommandError("PILOT_INVALID", "baseline must be a JSON object");
  }
  rejectUnknownKeys(value, BASELINE_KEYS, "baseline");
  const source = requiredPilotText(value, "source");
  const observedAt = requiredPilotText(value, "observed_at");
  if (!ISO_RE.test(observedAt)) {
    throw new CommandError(
      "PILOT_INVALID",
      "baseline.observed_at must be UTC ISO-8601",
    );
  }
  const methodRef = requiredPilotText(value, "method_ref");
  return { source, observed_at: observedAt, method_ref: methodRef };
}

function validateQuality(value: unknown): QualityPreserved {
  if (!isJsonObject(value)) {
    throw new CommandError(
      "PILOT_INVALID",
      "NET_BENEFIT requires quality_preserved",
    );
  }
  rejectUnknownKeys(value, new Set(QUALITY_KEYS), "quality_preserved");
  for (const key of QUALITY_KEYS) {
    if (value[key] !== true) {
      throw new CommandError(
        "PILOT_INVALID",
        "NET_BENEFIT requires all quality_preserved flags to be true",
      );
    }
  }
  return {
    authorization_preserved: true,
    safety_preserved: true,
    result_quality_preserved: true,
    evidence_integrity_preserved: true,
  };
}

function validateWindow(value: unknown): ObservationWindow | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isJsonObject(value)) {
    throw new CommandError("PILOT_INVALID", "observation_window must be a JSON object");
  }
  rejectUnknownKeys(
    value,
    new Set(["from_ledger_seq", "to_ledger_seq"]),
    "observation_window",
  );
  const from = requiredPositiveSeq(value, "from_ledger_seq");
  const to = requiredPositiveSeq(value, "to_ledger_seq");
  if (from > to) {
    throw new CommandError("PILOT_INVALID", "observation_window is inverted");
  }
  return { from_ledger_seq: from, to_ledger_seq: to };
}

function assertNotUsageOnlySuccess(metrics: Record<MetricSlotName, MetricSlot>): void {
  const available = METRIC_SLOT_NAMES.filter(
    (name) => metrics[name].availability === "available",
  );
  if (available.length === 1 && available[0] === "native_usage") {
    throw new CommandError(
      "PILOT_INVALID",
      "must not claim NET_BENEFIT from a single usage or step count",
    );
  }
}

function assertPublicSafe(value: unknown): void {
  walkStrings(value, (text) => {
    if (ABS_PATH_RE.test(text) || /(?:^|[\s"'=])\/[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]+/.test(text)) {
      if (!text.startsWith("docs/") && !text.includes("docs/SPEC.md")) {
        throw new CommandError(
          "PILOT_INVALID",
          "pilot record must not include machine-local absolute paths",
        );
      }
    }
    if (CREDENTIAL_RE.test(text)) {
      throw new CommandError(
        "PILOT_INVALID",
        "pilot record must not include credentials or session secrets",
      );
    }
    if (INTERNAL_PROJECT_RE.test(text)) {
      throw new CommandError(
        "PILOT_INVALID",
        "pilot record must not include internal project names",
      );
    }
  });
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (allowed.has(key)) {
      continue;
    }
    if (USAGE_SUCCESS_KEYS.has(key)) {
      throw new CommandError(
        "PILOT_INVALID",
        "must not claim success from a single usage or step count",
      );
    }
    throw new CommandError("PILOT_INVALID", `${label} has unsupported field ${key}`);
  }
}

function requiredPilotText(value: Record<string, unknown>, field: string): string {
  try {
    return requiredText(value, field);
  } catch (error) {
    if (error instanceof CommandError && error.code === "CONTRACT_INVALID") {
      throw new CommandError("PILOT_INVALID", error.message);
    }
    throw error;
  }
}

function requiredPositiveSeq(value: Record<string, unknown>, field: string): number {
  const raw = value[field];
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new CommandError("PILOT_INVALID", `${field} must be a positive integer`);
  }
  return raw;
}

function walkStrings(value: unknown, visit: (text: string) => void): void {
  if (typeof value === "string") {
    visit(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      walkStrings(item, visit);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const nested of Object.values(value)) {
    walkStrings(nested, visit);
  }
}
