import { digestPayload } from "./digest.js";
import { CommandError } from "./errors.js";

export const HOST_CAPABILITY_IDS = [
  "codex_app",
  "codex_cli",
  "claude_chat",
  "attached",
] as const;

export type HostCapabilityId = (typeof HOST_CAPABILITY_IDS)[number];

export const CODEX_CONSUMER_MAPPING = {
  handoff: "handoff_thread",
  interrupt: "interrupt",
  observe: "observe",
  resume: "send_message_to_thread",
  send: "send_message_to_thread",
  start: "create_thread",
  wait: "wait_threads",
} as const;

export type NativeHostAction = (typeof CODEX_CONSUMER_MAPPING)[keyof typeof CODEX_CONSUMER_MAPPING];

const MAX_WAIT_MS = 60_000;

export interface CapabilityCheck {
  readonly declared: boolean;
  readonly observed: boolean;
  readonly qualified: boolean;
}

export interface HostCapabilityReport {
  readonly capabilities: Record<HostCapabilityId, CapabilityCheck>;
  readonly create_session: boolean;
  readonly host_adapter_present: boolean;
  readonly write_construction: boolean;
}

export interface SessionBindingRef {
  readonly binding_id: string;
  readonly generation: number;
}

export interface EnvelopeRef {
  readonly content_digest?: string;
  readonly envelope_id: string;
}

export interface NativeWorkspaceRef {
  readonly authority_ref: string;
  readonly branch_ref?: string;
  readonly channel: string;
  readonly supersedes?: SessionBindingRef;
  readonly work_item_ref: string;
  readonly workspace_ref: string;
  readonly worktree_ref?: string;
}

export interface MessageRef {
  readonly message_ref: string;
}

export interface TurnRef {
  readonly turn_ref: string;
}

export interface WaitBounds {
  readonly timeout_ms: number;
}

export interface SessionBinding {
  readonly authority_ref: string;
  readonly binding_id: string;
  readonly branch_ref?: string;
  readonly capability_digest: string;
  readonly created_at: string;
  readonly current_turn_ref?: string;
  readonly fence: number;
  readonly generation: number;
  readonly host_thread_ref: string;
  readonly observed_at: string;
  readonly parent?: SessionBindingRef;
  readonly role: string;
  readonly supersedes?: SessionBindingRef;
  readonly work_item_ref: string;
  readonly workspace_ref: string;
  readonly worktree_ref?: string;
}

export interface NativeHostSendReceipt {
  readonly delivery: "accepted" | "queued" | "unavailable";
  readonly queued?: boolean;
  readonly result_id: string;
  readonly turn_ref?: string;
}

export interface SessionObservation {
  readonly binding_id: string;
  readonly cursor?: string;
  readonly generation: number;
  readonly idle: boolean;
  readonly observed_at: string;
  readonly turn_ref?: string;
}

export interface SessionReadback {
  readonly binding_id: string;
  readonly cursor?: string;
  readonly delivery: "delivered" | "unavailable" | "data_insufficient";
  readonly generation: number;
  readonly turn_ref?: string;
  readonly wake: "observed" | "unavailable" | "data_insufficient";
}

export interface SessionReleaseReceipt {
  readonly binding_id: string;
  readonly generation: number;
  readonly released: true;
}

export interface SessionHandoffReceipt {
  readonly binding_id: string;
  readonly generation: number;
  readonly handed_off: true;
}

export interface NativeHostJournalEntry {
  readonly action: NativeHostAction;
  readonly binding_id?: string;
  readonly generation?: number;
  readonly idempotency_key: string;
  readonly result_id?: string;
}

export interface NativeHostActionPacket {
  readonly action: NativeHostAction;
  readonly after_cursor?: string;
  readonly binding_id?: string;
  readonly envelope_id?: string;
  readonly host_thread_ref?: string;
  readonly idempotency_key: string;
  readonly message_ref?: string;
  readonly reason?: string;
  readonly role?: string;
  readonly timeout_ms?: number;
  readonly turn_ref?: string;
  readonly workspace_ref?: string;
}

export interface NativeHostAdapterResult {
  readonly action: NativeHostAction;
  readonly cursor?: string;
  readonly delivered?: boolean;
  readonly delivery_evidence?: boolean;
  readonly host_thread_ref?: string;
  readonly idle?: boolean;
  readonly interrupted?: boolean;
  readonly readback_evidence?: boolean;
  readonly turn_ref?: string;
}

export interface NativeHostAdapter {
  readonly capability_id: HostCapabilityId;
  dispatch(
    packet: NativeHostActionPacket,
  ): NativeHostAdapterResult | Promise<NativeHostAdapterResult>;
}

export interface CreateNativeHostRuntimeProviderOptions {
  readonly capability?: HostCapabilityId;
  readonly hostAdapter?: NativeHostAdapter;
  readonly now?: () => Date;
}

export interface NativeHostRuntimeProvider {
  capabilities(): HostCapabilityReport;
  handoff(sessionBinding: SessionBindingRef, idempotencyKey: string): Promise<SessionHandoffReceipt>;
  interrupt(
    sessionBinding: SessionBindingRef,
    turnRef: TurnRef,
    reason: string,
    idempotencyKey: string,
  ): Promise<SessionObservation>;
  journal(): readonly NativeHostJournalEntry[];
  observe(sessionBinding: SessionBindingRef): Promise<SessionObservation>;
  readback(sessionBinding: SessionBindingRef): Promise<SessionReadback>;
  receipts(): readonly unknown[];
  release(
    sessionBinding: SessionBindingRef,
    requireIdle: boolean,
    idempotencyKey: string,
  ): Promise<SessionReleaseReceipt>;
  resume(
    sessionBinding: SessionBindingRef,
    turnRef: TurnRef,
    idempotencyKey: string,
  ): Promise<SessionBinding>;
  send(
    sessionBinding: SessionBindingRef,
    messageRef: MessageRef,
    expectedIdle: boolean,
    idempotencyKey: string,
  ): Promise<NativeHostSendReceipt>;
  start(
    envelopeRef: EnvelopeRef,
    role: string,
    workspaceRef: NativeWorkspaceRef,
    idempotencyKey: string,
  ): Promise<SessionBinding>;
  wait(
    sessionBinding: SessionBindingRef,
    afterCursor: string,
    boundedTimeout: WaitBounds,
  ): Promise<SessionObservation>;
}

interface SlotRecord {
  binding: SessionBinding;
  deliveryEvidence: boolean;
  handedOff: boolean;
  idle: boolean;
  lastCursor?: string;
  readbackEvidence: boolean;
  released: boolean;
  slotKey: string;
}

export function createNativeHostRuntimeProvider(
  options: CreateNativeHostRuntimeProviderOptions = {},
): NativeHostRuntimeProvider {
  const now = options.now ?? (() => new Date());
  const slots = new Map<string, SlotRecord>();
  const byBinding = new Map<string, SlotRecord>();
  const idempotency = new Map<string, unknown>();
  const journalEntries: NativeHostJournalEntry[] = [];
  const receiptEntries: unknown[] = [];
  const slotGenerations = new Map<string, number>();
  const capabilityDigest = digestPayload({
    capability: options.capability ?? "none",
    mapping: CODEX_CONSUMER_MAPPING,
  });

  function nowIso(): string {
    return now().toISOString();
  }

  function absentCheck(): CapabilityCheck {
    return { declared: false, observed: false, qualified: false };
  }

  function checkFor(id: HostCapabilityId): CapabilityCheck {
    const declared = options.capability === id;
    const observed = declared && options.hostAdapter?.capability_id === id;
    return { declared, observed, qualified: observed };
  }

  function appQualified(): boolean {
    return checkFor("codex_app").qualified;
  }

  function requireAdapter(): NativeHostAdapter {
    if (options.hostAdapter === undefined) {
      throw new CommandError(
        "HOST_RUNTIME_UNAVAILABLE",
        "independent runtime has no injected host adapter",
      );
    }
    return options.hostAdapter;
  }

  async function dispatch(
    packet: NativeHostActionPacket,
  ): Promise<NativeHostAdapterResult> {
    const adapter = requireAdapter();
    return await Promise.resolve(adapter.dispatch(packet));
  }

  function recordJournal(
    packet: NativeHostActionPacket,
    resultId?: string,
  ): void {
    journalEntries.push({
      action: packet.action,
      idempotency_key: packet.idempotency_key,
      ...(packet.binding_id === undefined ? {} : { binding_id: packet.binding_id }),
      ...(resultId === undefined ? {} : { result_id: resultId }),
    });
  }

  function remember(key: string, value: unknown): void {
    idempotency.set(key, value);
  }

  function recall<T>(key: string): T | undefined {
    return idempotency.get(key) as T | undefined;
  }

  function slotKeyOf(workspace: NativeWorkspaceRef, role: string): string {
    return [
      requiredText(workspace.authority_ref, "authority_ref"),
      requiredText(workspace.work_item_ref, "work_item_ref"),
      requiredText(role, "role"),
      requiredText(workspace.channel, "channel"),
    ].join("\u001f");
  }

  function resolveRecord(ref: SessionBindingRef): SlotRecord {
    const bindingId = requiredText(ref.binding_id, "binding_id");
    if (!Number.isSafeInteger(ref.generation) || ref.generation < 1) {
      throw new CommandError("CONTRACT_INVALID", "generation must be a positive integer");
    }
    const record = byBinding.get(bindingId);
    if (record === undefined) {
      throw new CommandError("CONTRACT_INVALID", "session binding is unknown");
    }
    const current = slots.get(record.slotKey);
    if (
      record.binding.generation !== ref.generation ||
      current === undefined ||
      current.binding.generation !== ref.generation ||
      current.binding.binding_id !== bindingId
    ) {
      throw new CommandError(
        "SESSION_GENERATION_STALE",
        "session binding generation is not current",
      );
    }
    return record;
  }

  function observationOf(record: SlotRecord): SessionObservation {
    return {
      binding_id: record.binding.binding_id,
      generation: record.binding.generation,
      idle: record.idle,
      observed_at: record.binding.observed_at,
      ...(record.lastCursor === undefined ? {} : { cursor: record.lastCursor }),
      ...(record.binding.current_turn_ref === undefined
        ? {}
        : { turn_ref: record.binding.current_turn_ref }),
    };
  }

  function touch(record: SlotRecord, result: NativeHostAdapterResult): void {
    const observedAt = nowIso();
    record.idle = result.idle === true;
    if (result.cursor !== undefined) {
      record.lastCursor = result.cursor;
    }
    if (result.delivery_evidence === true || result.delivered === true) {
      record.deliveryEvidence = true;
    }
    if (result.readback_evidence === true) {
      record.readbackEvidence = true;
    }
    record.binding = {
      ...record.binding,
      observed_at: observedAt,
      ...(result.turn_ref === undefined
        ? {}
        : { current_turn_ref: result.turn_ref }),
    };
  }

  return {
    capabilities() {
      const capabilities = {
        attached: checkFor("attached"),
        claude_chat: checkFor("claude_chat"),
        codex_app: checkFor("codex_app"),
        codex_cli: checkFor("codex_cli"),
      };
      if (options.capability === undefined && options.hostAdapter === undefined) {
        return {
          capabilities: {
            attached: absentCheck(),
            claude_chat: absentCheck(),
            codex_app: absentCheck(),
            codex_cli: absentCheck(),
          },
          create_session: false,
          host_adapter_present: false,
          write_construction: false,
        };
      }
      return {
        capabilities,
        create_session: appQualified(),
        host_adapter_present: options.hostAdapter !== undefined,
        write_construction: appQualified(),
      };
    },

    async start(envelopeRef, role, workspaceRef, idempotencyKey) {
      const key = `start:${requiredText(idempotencyKey, "idempotency_key")}`;
      const replay = recall<SessionBinding>(key);
      if (replay !== undefined) {
        return replay;
      }
      requireAdapter();
      if (!appQualified()) {
        throw new CommandError(
          "HOST_CAPABILITY_REJECTED",
          "provider cannot create a write-construction session",
        );
      }
      const envelopeId = requiredText(envelopeRef.envelope_id, "envelope_id");
      const slotKey = slotKeyOf(workspaceRef, role);
      const existing = slots.get(slotKey);
      const supersedes = workspaceRef.supersedes;
      let generation = (slotGenerations.get(slotKey) ?? 0) + 1;
      let parent: SessionBindingRef | undefined;
      if (supersedes !== undefined) {
        const prior = byBinding.get(requiredText(supersedes.binding_id, "supersedes.binding_id"));
        if (prior === undefined || !prior.handedOff || prior.binding.generation !== supersedes.generation) {
          throw new CommandError(
            "SESSION_HANDOFF_REQUIRED",
            "successor start requires a recorded handoff",
          );
        }
        generation = prior.binding.generation + 1;
        parent = { binding_id: prior.binding.binding_id, generation: prior.binding.generation };
      } else if (existing !== undefined && !existing.released && !existing.handedOff) {
        throw new CommandError(
          "SESSION_BINDING_CONFLICT",
          "active session binding already occupies this slot",
        );
      } else if (existing !== undefined && existing.handedOff && !existing.released) {
        throw new CommandError(
          "SESSION_HANDOFF_REQUIRED",
          "successor start requires supersedes after handoff",
        );
      }
      const packet: NativeHostActionPacket = {
        action: CODEX_CONSUMER_MAPPING.start,
        envelope_id: envelopeId,
        idempotency_key: idempotencyKey,
        role,
        workspace_ref: requiredText(workspaceRef.workspace_ref, "workspace_ref"),
      };
      const result = await dispatch(packet);
      const hostThreadRef = requiredText(result.host_thread_ref, "host_thread_ref");
      const createdAt = nowIso();
      const binding: SessionBinding = {
        authority_ref: workspaceRef.authority_ref,
        binding_id: `bind:${workspaceRef.work_item_ref}:${role}:${workspaceRef.channel}:${String(generation)}`,
        capability_digest: capabilityDigest,
        created_at: createdAt,
        fence: generation,
        generation,
        host_thread_ref: hostThreadRef,
        observed_at: createdAt,
        role,
        work_item_ref: workspaceRef.work_item_ref,
        workspace_ref: workspaceRef.workspace_ref,
        ...(workspaceRef.worktree_ref === undefined
          ? {}
          : { worktree_ref: workspaceRef.worktree_ref }),
        ...(workspaceRef.branch_ref === undefined ? {} : { branch_ref: workspaceRef.branch_ref }),
        ...(result.turn_ref === undefined ? {} : { current_turn_ref: result.turn_ref }),
        ...(supersedes === undefined ? {} : { supersedes, parent }),
      };
      const record: SlotRecord = {
        binding,
        deliveryEvidence: false,
        handedOff: false,
        idle: result.idle !== false,
        readbackEvidence: result.readback_evidence === true,
        released: false,
        slotKey,
        ...(result.cursor === undefined ? {} : { lastCursor: result.cursor }),
      };
      slots.set(slotKey, record);
      byBinding.set(binding.binding_id, record);
      slotGenerations.set(slotKey, generation);
      recordJournal(packet, binding.binding_id);
      remember(key, binding);
      receiptEntries.push({ binding_id: binding.binding_id, generation, kind: "start" });
      return binding;
    },

    async resume(sessionBinding, turnRef, idempotencyKey) {
      const key = `resume:${requiredText(idempotencyKey, "idempotency_key")}`;
      const replay = recall<SessionBinding>(key);
      if (replay !== undefined) {
        return replay;
      }
      const record = resolveRecord(sessionBinding);
      const packet: NativeHostActionPacket = {
        action: CODEX_CONSUMER_MAPPING.resume,
        binding_id: record.binding.binding_id,
        host_thread_ref: record.binding.host_thread_ref,
        idempotency_key: idempotencyKey,
        turn_ref: requiredText(turnRef.turn_ref, "turn_ref"),
      };
      const result = await dispatch(packet);
      touch(record, result);
      recordJournal(packet);
      remember(key, record.binding);
      return record.binding;
    },

    async send(sessionBinding, messageRef, expectedIdle, idempotencyKey) {
      const key = `send:${requiredText(idempotencyKey, "idempotency_key")}`;
      const replay = recall<NativeHostSendReceipt>(key);
      if (replay !== undefined) {
        return replay;
      }
      requireAdapter();
      const record = resolveRecord(sessionBinding);
      const message = requiredText(messageRef.message_ref, "message_ref");
      if (expectedIdle && !record.idle) {
        const queued: NativeHostSendReceipt = {
          delivery: "accepted",
          queued: true,
          result_id: `queued:${idempotencyKey}`,
        };
        remember(key, queued);
        receiptEntries.push(queued);
        return queued;
      }
      const packet: NativeHostActionPacket = {
        action: CODEX_CONSUMER_MAPPING.send,
        binding_id: record.binding.binding_id,
        host_thread_ref: record.binding.host_thread_ref,
        idempotency_key: idempotencyKey,
        message_ref: message,
      };
      const result = await dispatch(packet);
      touch(record, { ...result, idle: result.idle === true });
      const receipt: NativeHostSendReceipt = {
        delivery: "accepted",
        result_id: `result:${idempotencyKey}`,
        ...(result.turn_ref === undefined ? {} : { turn_ref: result.turn_ref }),
      };
      recordJournal(packet, receipt.result_id);
      remember(key, receipt);
      receiptEntries.push(receipt);
      return receipt;
    },

    async observe(sessionBinding) {
      requireAdapter();
      const record = resolveRecord(sessionBinding);
      const packet: NativeHostActionPacket = {
        action: CODEX_CONSUMER_MAPPING.observe,
        binding_id: record.binding.binding_id,
        host_thread_ref: record.binding.host_thread_ref,
        idempotency_key: `observe:${record.binding.binding_id}:${String(record.binding.generation)}`,
      };
      const result = await dispatch(packet);
      touch(record, result);
      recordJournal(packet);
      return observationOf(record);
    },

    async wait(sessionBinding, afterCursor, boundedTimeout) {
      requireAdapter();
      const timeoutMs = boundedTimeout.timeout_ms;
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_WAIT_MS) {
        throw new CommandError(
          "CONTRACT_INVALID",
          `wait timeout_ms must be a bounded integer from 1 to ${String(MAX_WAIT_MS)}`,
        );
      }
      const record = resolveRecord(sessionBinding);
      const packet: NativeHostActionPacket = {
        action: CODEX_CONSUMER_MAPPING.wait,
        after_cursor: requiredText(afterCursor, "after_cursor"),
        binding_id: record.binding.binding_id,
        host_thread_ref: record.binding.host_thread_ref,
        idempotency_key: `wait:${record.binding.binding_id}:${afterCursor}:${String(timeoutMs)}`,
        timeout_ms: timeoutMs,
      };
      const result = await dispatch(packet);
      touch(record, { ...result, idle: result.idle !== false });
      recordJournal(packet);
      return observationOf(record);
    },

    async interrupt(sessionBinding, turnRef, reason, idempotencyKey) {
      const key = `interrupt:${requiredText(idempotencyKey, "idempotency_key")}`;
      const replay = recall<SessionObservation>(key);
      if (replay !== undefined) {
        return replay;
      }
      const record = resolveRecord(sessionBinding);
      const packet: NativeHostActionPacket = {
        action: CODEX_CONSUMER_MAPPING.interrupt,
        binding_id: record.binding.binding_id,
        host_thread_ref: record.binding.host_thread_ref,
        idempotency_key: idempotencyKey,
        reason: requiredText(reason, "reason"),
        turn_ref: requiredText(turnRef.turn_ref, "turn_ref"),
      };
      const result = await dispatch(packet);
      touch(record, { ...result, idle: true });
      const observed = observationOf(record);
      recordJournal(packet);
      remember(key, observed);
      return observed;
    },

    async release(sessionBinding, requireIdle, idempotencyKey) {
      const key = `release:${requiredText(idempotencyKey, "idempotency_key")}`;
      const replay = recall<SessionReleaseReceipt>(key);
      if (replay !== undefined) {
        return replay;
      }
      requireAdapter();
      const record = resolveRecord(sessionBinding);
      if (requireIdle && !record.idle) {
        throw new CommandError("SESSION_TURN_BUSY", "release requires an idle session");
      }
      record.released = true;
      const receipt: SessionReleaseReceipt = {
        binding_id: record.binding.binding_id,
        generation: record.binding.generation,
        released: true,
      };
      remember(key, receipt);
      receiptEntries.push(receipt);
      return receipt;
    },

    async readback(sessionBinding) {
      requireAdapter();
      const record = resolveRecord(sessionBinding);
      const packet: NativeHostActionPacket = {
        action: CODEX_CONSUMER_MAPPING.observe,
        binding_id: record.binding.binding_id,
        host_thread_ref: record.binding.host_thread_ref,
        idempotency_key: `readback:${record.binding.binding_id}:${String(record.binding.generation)}`,
      };
      const result = await dispatch(packet);
      touch(record, result);
      recordJournal(packet);
      const delivery =
        record.deliveryEvidence && record.readbackEvidence
          ? "delivered"
          : record.readbackEvidence
            ? "unavailable"
            : "data_insufficient";
      const wake =
        record.readbackEvidence && record.idle
          ? "observed"
          : record.readbackEvidence
            ? "unavailable"
            : "data_insufficient";
      const readback: SessionReadback = {
        binding_id: record.binding.binding_id,
        delivery,
        generation: record.binding.generation,
        wake,
        ...(record.lastCursor === undefined ? {} : { cursor: record.lastCursor }),
        ...(record.binding.current_turn_ref === undefined
          ? {}
          : { turn_ref: record.binding.current_turn_ref }),
      };
      receiptEntries.push({
        binding_id: readback.binding_id,
        delivery: readback.delivery,
        generation: readback.generation,
        kind: "readback",
        wake: readback.wake,
      });
      return readback;
    },

    async handoff(sessionBinding, idempotencyKey) {
      const key = `handoff:${requiredText(idempotencyKey, "idempotency_key")}`;
      const replay = recall<SessionHandoffReceipt>(key);
      if (replay !== undefined) {
        return replay;
      }
      const record = resolveRecord(sessionBinding);
      const packet: NativeHostActionPacket = {
        action: CODEX_CONSUMER_MAPPING.handoff,
        binding_id: record.binding.binding_id,
        host_thread_ref: record.binding.host_thread_ref,
        idempotency_key: idempotencyKey,
      };
      await dispatch(packet);
      record.handedOff = true;
      record.idle = true;
      const receipt: SessionHandoffReceipt = {
        binding_id: record.binding.binding_id,
        generation: record.binding.generation,
        handed_off: true,
      };
      recordJournal(packet);
      remember(key, receipt);
      receiptEntries.push(receipt);
      return receipt;
    },

    journal() {
      return journalEntries;
    },

    receipts() {
      return receiptEntries;
    },
  };
}

function requiredText(value: string | undefined, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CommandError("CONTRACT_INVALID", `${field} must be a non-empty string`);
  }
  return value.trim();
}
