import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

import { digestPayload, DIGEST_SPEC_VERSION } from "./digest.js";
import {
  type EventEnvelope,
  type EventType,
  EVENT_SCHEMA_VERSION,
  isEventType,
  validateEnvelope,
} from "./envelope.js";
import { CommandError, errorCodeOf } from "./errors.js";

export interface EventDraft {
  readonly event_type: EventType;
  readonly actor_binding_ref: string;
  readonly caused_by?: string;
  readonly idempotency_key: string;
  readonly payload: Record<string, unknown>;
  readonly event_id?: string;
  readonly occurred_at?: string;
  readonly writer_id?: string;
}

export type LedgerSnapshot =
  | { readonly status: "missing" }
  | { readonly status: "ready"; readonly events: readonly EventEnvelope[] }
  | {
      readonly status: "truncated_tail";
      readonly events: readonly EventEnvelope[];
      readonly truncated_bytes: number;
    };

export interface LedgerPaths {
  readonly root: string;
  readonly events: string;
  readonly lock: string;
}

export function ledgerPaths(workspaceRoot: string): LedgerPaths {
  const root = join(workspaceRoot, ".hufu", "ledger");
  return {
    root,
    events: join(root, "events.jsonl"),
    lock: join(root, "write.lock"),
  };
}

export function lockPresent(workspaceRoot: string): boolean {
  return existsSync(ledgerPaths(workspaceRoot).lock);
}

export function readLedger(workspaceRoot: string): LedgerSnapshot {
  const paths = ledgerPaths(workspaceRoot);
  if (!existsSync(paths.events)) {
    return { status: "missing" };
  }
  let raw: string;
  try {
    raw = readFileSync(paths.events, "utf8");
  } catch (error) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      `ledger is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = parseEventFile(raw);
  if (parsed.truncated_bytes > 0) {
    return {
      status: "truncated_tail",
      events: parsed.events,
      truncated_bytes: parsed.truncated_bytes,
    };
  }
  return { status: "ready", events: parsed.events };
}

export function appendEvents(
  workspaceRoot: string,
  drafts: readonly EventDraft[],
): readonly EventEnvelope[] {
  if (drafts.length === 0) {
    throw new CommandError("CONTRACT_INVALID", "append requires at least one event");
  }
  return mutateLedger(workspaceRoot, (_events, append) => append(drafts));
}

export function mutateLedger<T>(
  workspaceRoot: string,
  fn: (
    events: readonly EventEnvelope[],
    append: (drafts: readonly EventDraft[]) => EventEnvelope[],
  ) => T,
): T {
  return withWriterLock(workspaceRoot, (current) => {
    if (current.truncated_bytes > 0) {
      throw new CommandError(
        "LEDGER_CORRUPT",
        "ledger has an unfinished tail; repair it before appending",
      );
    }
    const append = (drafts: readonly EventDraft[]): EventEnvelope[] =>
      writeDrafts(workspaceRoot, current.events, drafts);
    return fn(current.events, append);
  });
}

export function repairTruncatedTail(workspaceRoot: string): EventEnvelope {
  return withWriterLock(workspaceRoot, (current) => {
    if (current.truncated_bytes === 0) {
      throw new CommandError(
        "CONTRACT_INVALID",
        "no truncated tail to repair",
      );
    }
    const paths = ledgerPaths(workspaceRoot);
    const prefix = serializeAll(current.events);
    writeFileSync(paths.events, prefix, "utf8");
    const repairedAt = new Date().toISOString();
    const written = writeDrafts(workspaceRoot, current.events, [
      {
        actor_binding_ref: "hufu:ledger-repair",
        event_type: "hufu/ledger.repair.truncated_tail",
        idempotency_key: `hufu/ledger.repair.truncated_tail:${repairedAt}`,
        payload: {
          removed_bytes: current.truncated_bytes,
          repaired_at: repairedAt,
        },
      },
    ]);
    const repair = written[written.length - 1];
    if (repair === undefined) {
      throw new CommandError("LEDGER_CORRUPT", "repair event was not written");
    }
    return repair;
  });
}

interface ParsedLedger {
  readonly events: EventEnvelope[];
  readonly truncated_bytes: number;
}

function parseEventFile(raw: string): ParsedLedger {
  if (raw === "") {
    return { events: [], truncated_bytes: 0 };
  }
  const hasTrailingLf = raw.endsWith("\n");
  const parts = raw.split("\n");
  const completeLines = parts.slice(0, -1);
  const tail = hasTrailingLf ? "" : (parts[parts.length - 1] ?? "");
  const events: EventEnvelope[] = [];
  const seenIds = new Set<string>();
  const seenKeys = new Map<string, string>();
  let expectedSeq = 1;
  for (const line of completeLines) {
    if (line === "") {
      throw new CommandError("LEDGER_CORRUPT", "ledger contains an empty line");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new CommandError("LEDGER_CORRUPT", "ledger contains a malformed line");
    }
    let envelope: EventEnvelope;
    try {
      envelope = validateEnvelope(parsed);
    } catch (error) {
      if (
        error instanceof CommandError &&
        (error.code === "SCHEMA_UNSUPPORTED" ||
          error.code === "LEDGER_DIGEST_CONFLICT" ||
          error.code === "LEDGER_CAUSALITY_CONFLICT")
      ) {
        throw error;
      }
      throw new CommandError(
        "LEDGER_CORRUPT",
        "ledger contains a malformed line",
      );
    }
    if (envelope.ledger_seq !== expectedSeq) {
      throw new CommandError(
        "LEDGER_CAUSALITY_CONFLICT",
        "ledger_seq is not contiguous",
      );
    }
    if (seenIds.has(envelope.event_id)) {
      throw new CommandError(
        "LEDGER_CAUSALITY_CONFLICT",
        "duplicate event_id",
      );
    }
    if (
      envelope.caused_by !== undefined &&
      !seenIds.has(envelope.caused_by)
    ) {
      throw new CommandError(
        "LEDGER_CAUSALITY_CONFLICT",
        "caused_by does not reference an earlier event",
      );
    }
    const previousDigest = seenKeys.get(envelope.idempotency_key);
    if (
      previousDigest !== undefined &&
      previousDigest !== envelope.payload_digest
    ) {
      throw new CommandError(
        "LEDGER_DIGEST_CONFLICT",
        "idempotency key collides with a different digest",
      );
    }
    seenIds.add(envelope.event_id);
    seenKeys.set(envelope.idempotency_key, envelope.payload_digest);
    events.push(envelope);
    expectedSeq += 1;
  }
  return { events, truncated_bytes: tail.length };
}

function writeDrafts(
  workspaceRoot: string,
  existing: readonly EventEnvelope[],
  drafts: readonly EventDraft[],
): EventEnvelope[] {
  const byKey = new Map<string, EventEnvelope>();
  for (const event of existing) {
    byKey.set(event.idempotency_key, event);
  }
  const returned: EventEnvelope[] = [];
  const toWrite: EventEnvelope[] = [];
  let nextSeq = existing.length + 1;
  const writerId = `pid:${process.pid}`;
  const seenIds = new Set(existing.map((event) => event.event_id));

  for (const draft of drafts) {
    if (!isEventType(draft.event_type)) {
      throw new CommandError(
        "SCHEMA_UNSUPPORTED",
        `unsupported event_type: ${draft.event_type}`,
      );
    }
    const payloadDigest = digestPayload(draft.payload);
    const previous = byKey.get(draft.idempotency_key);
    if (previous !== undefined) {
      if (previous.payload_digest !== payloadDigest) {
        throw new CommandError(
          "LEDGER_DIGEST_CONFLICT",
          "idempotency key collides with a different digest",
        );
      }
      returned.push(previous);
      continue;
    }
    if (draft.caused_by !== undefined && !seenIds.has(draft.caused_by)) {
      throw new CommandError(
        "LEDGER_CAUSALITY_CONFLICT",
        "caused_by does not reference an earlier event",
      );
    }
    const envelope: EventEnvelope = {
      event_id: draft.event_id ?? randomUUID(),
      event_type: draft.event_type,
      event_schema_version: EVENT_SCHEMA_VERSION,
      ledger_seq: nextSeq,
      occurred_at: draft.occurred_at ?? new Date().toISOString(),
      actor_binding_ref: draft.actor_binding_ref,
      idempotency_key: draft.idempotency_key,
      payload_digest: payloadDigest,
      digest_spec_version: DIGEST_SPEC_VERSION,
      writer_id: draft.writer_id ?? writerId,
      payload: draft.payload,
      ...(draft.caused_by === undefined ? {} : { caused_by: draft.caused_by }),
    };
    validateEnvelope(envelope);
    byKey.set(envelope.idempotency_key, envelope);
    seenIds.add(envelope.event_id);
    returned.push(envelope);
    toWrite.push(envelope);
    nextSeq += 1;
  }

  if (toWrite.length === 0) {
    return returned;
  }
  const chunk = serializeAll(toWrite);
  const paths = ledgerPaths(workspaceRoot);
  if (!existsSync(paths.events) || readFileSync(paths.events, "utf8") === "") {
    writeFileSync(paths.events, chunk, "utf8");
  } else {
    appendFileSync(paths.events, chunk, "utf8");
  }
  return returned;
}

function serializeAll(events: readonly EventEnvelope[]): string {
  return events.map(serializeEnvelope).join("");
}

function serializeEnvelope(envelope: EventEnvelope): string {
  const record: Record<string, unknown> = {
    actor_binding_ref: envelope.actor_binding_ref,
    digest_spec_version: envelope.digest_spec_version,
    event_id: envelope.event_id,
    event_schema_version: envelope.event_schema_version,
    event_type: envelope.event_type,
    idempotency_key: envelope.idempotency_key,
    ledger_seq: envelope.ledger_seq,
    occurred_at: envelope.occurred_at,
    payload: envelope.payload,
    payload_digest: envelope.payload_digest,
    writer_id: envelope.writer_id,
  };
  if (envelope.caused_by !== undefined) {
    record["caused_by"] = envelope.caused_by;
  }
  return `${JSON.stringify(record)}\n`;
}

function withWriterLock<T>(
  workspaceRoot: string,
  fn: (current: ParsedLedger) => T,
): T {
  const paths = ledgerPaths(workspaceRoot);
  mkdirSync(paths.root, { recursive: true });
  let fd: number | undefined;
  let held = false;
  try {
    try {
      fd = openSync(paths.lock, "wx");
    } catch (error) {
      if (errorCodeOf(error) === "EEXIST") {
        throw new CommandError(
          "LEDGER_WRITER_CONFLICT",
          "another writer holds the ledger lock",
        );
      }
      throw new CommandError(
        "OBSERVATION_UNAVAILABLE",
        `unable to create ledger lock: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    held = true;
    const diagnostic = {
      created_at: new Date().toISOString(),
      pid: process.pid,
      writer_id: `pid:${process.pid}`,
    };
    writeSync(fd, `${JSON.stringify(diagnostic)}\n`, "utf8");
    const snapshot = existsSync(paths.events)
      ? parseEventFile(readFileSync(paths.events, "utf8"))
      : { events: [], truncated_bytes: 0 };
    return fn(snapshot);
  } finally {
    if (fd !== undefined) {
      closeSync(fd);
    }
    if (held && existsSync(paths.lock)) {
      unlinkSync(paths.lock);
    }
  }
}
