import { digestPayload } from "./digest.js";
import { type EventEnvelope } from "./envelope.js";
import { CommandError } from "./errors.js";
import { mutateLedger, readLedger } from "./storage.js";

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

const CODEX_APP_CONSUMER_V2_CONTRACT = "codex_app_consumer_v2";
const CODEX_APP_CAPABILITY_RECEIPT_CONTRACT = "codex_app_host_capability_v1";
const CODEX_APP_PROVIDER_BINDING_CONTRACT = "codex_app_host_provider_binding_v1";
export const CODEX_APP_PROVIDER_CONTRACT_REF = "hufu/codex-app-native-tools@v2";
export const CODEX_APP_V2_CAPABILITY_DIGEST = digestPayload({
  capability: "codex_app",
  contract: CODEX_APP_CONSUMER_V2_CONTRACT,
  provider_contract_ref: CODEX_APP_PROVIDER_CONTRACT_REF,
  tools: [
    "create_thread",
    "list_threads",
    "read_thread",
    "send_message_to_thread",
    "wait_threads",
  ],
});

export type CodexAppHostToolName =
  | "create_thread"
  | "list_threads"
  | "read_thread"
  | "send_message_to_thread"
  | "wait_threads";

export interface CodexAppHostToolCall {
  readonly input: Readonly<Record<string, unknown>>;
  readonly tool: CodexAppHostToolName;
}

export interface CodexAppWorkspaceTarget {
  readonly project_id: string;
  readonly target: {
    readonly environment:
      | { readonly type: "local" }
      | {
          readonly startingState?:
            | { readonly type: "working-tree" }
            | { readonly branchName: string; readonly type: "branch" };
          readonly type: "worktree";
        };
    readonly projectId: string;
    readonly type: "project";
  };
}

export interface CodexAppWorkspaceResolver {
  resolve(workspace: NativeWorkspaceRef): CodexAppWorkspaceTarget;
}

export interface CodexAppMessageResolver {
  resolve(messageRef: MessageRef): string;
}

export interface CodexAppPreparedRef {
  readonly operation_id: string;
  readonly packet_digest: string;
}

export interface CodexAppPreparedAction {
  readonly call: CodexAppHostToolCall;
  readonly ref: CodexAppPreparedRef;
}

export type CodexAppSessionBindingRef = SessionBindingRef;

export interface CodexAppSessionBinding {
  readonly authority_ref: string;
  readonly binding_id: string;
  readonly branch_ref?: string;
  readonly capability_digest: string;
  readonly channel: string;
  readonly client_thread_ref?: string;
  readonly correlation_title?: string;
  readonly created_at: string;
  readonly cursor?: string;
  readonly fence: number;
  readonly generation: number;
  readonly host_id?: string;
  readonly host_thread_ref?: string;
  readonly idle: boolean;
  readonly observed_at: string;
  readonly ref: CodexAppSessionBindingRef;
  readonly role: string;
  readonly state: "pending" | "ready" | "handed_off" | "released";
  readonly supersedes?: CodexAppSessionBindingRef;
  readonly turn_ref?: string;
  readonly work_item_ref: string;
  readonly workspace_ref: string;
  readonly worktree_ref?: string;
}

export type CodexAppHostToolResult =
  | {
      readonly availability: "available";
      readonly client_thread_id?: string;
      readonly cursor?: string;
      readonly delivered?: boolean;
      readonly host_id?: string;
      readonly idle?: boolean;
      readonly matched_title?: string;
      readonly thread_id?: string;
      readonly turn_ref?: string;
    }
  | {
      readonly availability: "unavailable";
      readonly error_code: string;
    };

export type CodexAppStartCompletion =
  | {
      readonly binding: CodexAppSessionBinding;
      readonly status: "pending" | "ready";
    }
  | {
      readonly status: "unavailable";
    };

export type CodexAppReadbackCompletion =
  | {
      readonly availability: "available";
      readonly binding: CodexAppSessionBinding;
    }
  | {
      readonly availability: "unavailable";
      readonly binding?: undefined;
    };

export type CodexAppSendCompletion =
  | {
      readonly binding: CodexAppSessionBinding;
      readonly delivery: "accepted";
    }
  | {
      readonly binding?: undefined;
      readonly delivery: "unavailable";
    };

export interface CodexAppInterruptAvailability {
  readonly availability: "unavailable";
  readonly reason: "native_interrupt_not_exposed";
}

export type CodexAppReleaseCompletion =
  | {
      readonly availability: "available";
      readonly binding: CodexAppSessionBinding;
      readonly released: boolean;
    }
  | {
      readonly availability: "unavailable";
      readonly binding?: undefined;
      readonly released: false;
    };

export interface CreateCodexAppConsumerV2Options {
  readonly actorBindingRef: string;
  readonly messageResolver: CodexAppMessageResolver;
  readonly now?: () => Date;
  readonly workspaceResolver: CodexAppWorkspaceResolver;
  readonly workspaceRoot: string;
}

export interface CodexAppConsumerV2 {
  binding(ref: CodexAppSessionBindingRef): CodexAppSessionBinding;
  completeReadback(
    prepared: CodexAppPreparedRef,
    result: CodexAppHostToolResult,
  ): CodexAppReadbackCompletion;
  completeRelease(
    prepared: CodexAppPreparedRef,
    result: CodexAppHostToolResult,
  ): CodexAppReleaseCompletion;
  completeSend(
    prepared: CodexAppPreparedRef,
    result: CodexAppHostToolResult,
  ): CodexAppSendCompletion;
  completeStart(
    prepared: CodexAppPreparedRef,
    result: CodexAppHostToolResult,
  ): CodexAppStartCompletion;
  completeWait(
    prepared: CodexAppPreparedRef,
    result: CodexAppHostToolResult,
  ): CodexAppReadbackCompletion;
  interrupt(binding: CodexAppSessionBindingRef): CodexAppInterruptAvailability;
  prepareStart(
    envelopeRef: EnvelopeRef,
    role: string,
    workspaceRef: NativeWorkspaceRef,
    idempotencyKey: string,
  ): CodexAppPreparedAction;
  prepareReadback(
    binding: CodexAppSessionBindingRef,
    idempotencyKey: string,
  ): CodexAppPreparedAction;
  prepareRelease(
    binding: CodexAppSessionBindingRef,
    requireIdle: boolean,
    idempotencyKey: string,
  ): CodexAppPreparedAction;
  prepareSend(
    binding: CodexAppSessionBindingRef,
    messageRef: MessageRef,
    expectedIdle: boolean,
    idempotencyKey: string,
  ): CodexAppPreparedAction;
  prepareWait(
    binding: CodexAppSessionBindingRef,
    afterCursor: string,
    boundedTimeout: WaitBounds,
    idempotencyKey: string,
  ): CodexAppPreparedAction;
  recoverPrepared(prepared: CodexAppPreparedRef): CodexAppPreparedAction;
  recordLogicalHandoff(
    binding: CodexAppSessionBindingRef,
    idempotencyKey: string,
  ): CodexAppSessionBinding;
}

export function createCodexAppConsumerV2(
  options: CreateCodexAppConsumerV2Options,
): CodexAppConsumerV2 {
  const actorBindingRef = requiredText(options.actorBindingRef, "actor_binding_ref");
  const workspaceRoot = requiredText(options.workspaceRoot, "workspace_root");
  const now = options.now ?? (() => new Date());
  const capabilityDigest = CODEX_APP_V2_CAPABILITY_DIGEST;

  function events(): readonly EventEnvelope[] {
    const snapshot = readLedger(workspaceRoot);
    if (snapshot.status === "truncated_tail") {
      throw new CommandError("LEDGER_CORRUPT", "ledger has an unfinished tail");
    }
    return snapshot.status === "missing" ? [] : snapshot.events;
  }

  function binding(ref: CodexAppSessionBindingRef): CodexAppSessionBinding {
    return bindingSnapshot(ref).binding;
  }

  function bindingSnapshot(ref: CodexAppSessionBindingRef): RuntimeBindingSnapshot {
    return resolveCurrentRuntimeBindingSnapshot(events(), ref);
  }

  function persistPrepared(
    operationId: string,
    operationKind: string,
    call: CodexAppHostToolCall,
    requestFields: Readonly<Record<string, unknown>>,
    durableCall: CodexAppHostToolCall = call,
  ): CodexAppPreparedAction {
    const request: Record<string, unknown> = {
      ...requestFields,
      call: durableCall,
      operation_kind: operationKind,
    };
    const packetDigest = digestPayload(request);
    const payload: Record<string, unknown> = {
      canonical_payload_digest: packetDigest,
      contract: CODEX_APP_CONSUMER_V2_CONTRACT,
      effect_id: operationId,
      mutation_kind: `codex_host.${operationKind}`,
      runtime_event_kind: "action_prepared",
      runtime_request: request,
    };
    let created = false;
    mutateLedger(workspaceRoot, (current, append) => {
      const previous = findRuntimePrepared(current, operationId);
      if (previous !== undefined) {
        if (previous["canonical_payload_digest"] !== packetDigest) {
          throw new CommandError(
            "LEDGER_DIGEST_CONFLICT",
            `${operationKind} idempotency key collides with a different packet`,
          );
        }
        return;
      }
      append([
        {
          actor_binding_ref: actorBindingRef,
          event_type: "hufu/mutation.prepared",
          idempotency_key: `hufu/mutation.prepared:${operationId}`,
          payload,
        },
      ]);
      created = true;
    });
    const prepared = {
      call,
      ref: preparedRefFromPayload(payload),
    };
    return created ? prepared : recoverPreparedAction(prepared.ref);
  }

  function hydratePrepared(payload: Record<string, unknown>): CodexAppPreparedAction {
    const base = preparedActionFromPayload(payload);
    const request = requiredRecord(payload["runtime_request"], "runtime_request");
    if (request["operation_kind"] !== "send") {
      return base;
    }
    const messageRef = {
      message_ref: requiredText(String(request["message_ref"] ?? ""), "message_ref"),
    };
    const prompt = requiredText(options.messageResolver.resolve(messageRef), "resolved prompt");
    if (digestPayload({ prompt }) !== request["prompt_digest"]) {
      throw new CommandError(
        "LEDGER_DIGEST_CONFLICT",
        "resolved prompt no longer matches the prepared prompt digest",
      );
    }
    const { messageRef: _messageRef, promptDigest: _promptDigest, ...input } = base.call.input;
    return {
      call: {
        input: { ...input, prompt },
        tool: "send_message_to_thread",
      },
      ref: base.ref,
    };
  }

  function recoverPreparedAction(prepared: CodexAppPreparedRef): CodexAppPreparedAction {
    const ref: CodexAppPreparedRef = {
      operation_id: requiredText(prepared.operation_id, "operation_id"),
      packet_digest: requiredText(prepared.packet_digest, "packet_digest"),
    };
    const current = events();
    const payload = findRuntimePrepared(current, ref.operation_id);
    if (payload === undefined || payload["canonical_payload_digest"] !== ref.packet_digest) {
      throw new CommandError("DATA_INSUFFICIENT", "prepared Host action does not exist");
    }
    if (findRuntimeReceipt(current, ref.operation_id) !== undefined) {
      throw new CommandError(
        "CONTRACT_INVALID",
        "completed Host action cannot be recovered for another call",
      );
    }
    const request = requiredRecord(payload["runtime_request"], "runtime_request");
    if (request["operation_kind"] === "send") {
      throw new CommandError(
        "DATA_INSUFFICIENT",
        "send recovery requires a verifiable Host effect marker or manual closeout",
      );
    }
    if (request["operation_kind"] !== "start") {
      return hydratePrepared(payload);
    }
    const correlationTitle = requiredText(
      String(request["correlation_title"] ?? ""),
      "correlation_title",
    );
    const recoveryCall: CodexAppHostToolCall = {
      input: { limit: 100 },
      tool: "list_threads",
    };
    const recoveryId = `codex-app:recovery:${ref.operation_id}`;
    const recoveryRequest = {
      call: recoveryCall,
      correlation_title: correlationTitle,
      operation_kind: "start_correlation_readback",
      original_operation_id: ref.operation_id,
      original_packet_digest: ref.packet_digest,
    };
    const recoveryDigest = digestPayload(recoveryRequest);
    mutateLedger(workspaceRoot, (latest, append) => {
      const prior = findRuntimeRecovery(latest, ref.operation_id);
      if (prior !== undefined) {
        if (prior["canonical_payload_digest"] !== recoveryDigest) {
          throw new CommandError(
            "LEDGER_DIGEST_CONFLICT",
            "start recovery collides with another correlation readback",
          );
        }
        return;
      }
      append([{
        actor_binding_ref: actorBindingRef,
        event_type: "hufu/mutation.prepared",
        idempotency_key: `hufu/mutation.prepared:${recoveryId}`,
        payload: {
          canonical_payload_digest: recoveryDigest,
          contract: CODEX_APP_CONSUMER_V2_CONTRACT,
          effect_id: recoveryId,
          mutation_kind: "codex_host.start_correlation_readback",
          original_operation_id: ref.operation_id,
          runtime_event_kind: "recovery_prepared",
          runtime_request: recoveryRequest,
        },
      }]);
    });
    return { call: recoveryCall, ref };
  }

  function prepareStart(
    envelopeRef: EnvelopeRef,
    role: string,
    workspaceRef: NativeWorkspaceRef,
    idempotencyKey: string,
  ): CodexAppPreparedAction {
    const envelopeId = requiredText(envelopeRef.envelope_id, "envelope_id");
    const envelopeDigest = requiredText(envelopeRef.content_digest, "envelope content_digest");
    const normalizedRole = requiredText(role, "role");
    const actionIdempotencyKey = requiredText(idempotencyKey, "idempotency_key");
    const target = options.workspaceResolver.resolve(workspaceRef);
    const projectId = requiredHostSelector(target.project_id, "project_id");
    const hostTarget = validateCreateThreadTarget(target.target);
    const authorityRef = requiredText(workspaceRef.authority_ref, "authority_ref");
    const workItemRef = requiredText(workspaceRef.work_item_ref, "work_item_ref");
    const channel = requiredText(workspaceRef.channel, "channel");
    const nativeWorkspaceRef = requiredText(workspaceRef.workspace_ref, "workspace_ref");
    const slotDigest = digestPayload({
      authority_ref: authorityRef,
      channel,
      role: normalizedRole,
      work_item_ref: workItemRef,
    });
    const operationId = `codex-app:start:${actionIdempotencyKey}`;
    const correlationTitle = `Hufu ${digestPayload({ operation_id: operationId }).slice(7, 19)}`;
    const call: CodexAppHostToolCall = {
      input: {
        prompt: `Use Hufu execution envelope ${envelopeId} as ${normalizedRole}; verify stable refs before work.`,
        target: hostTarget,
        title: correlationTitle,
      },
      tool: "create_thread",
    };
    let generation = 1;
    const baseRequest: Record<string, unknown> = {
      authority_ref: authorityRef,
      call,
      channel,
      envelope_content_digest: envelopeDigest,
      correlation_title: correlationTitle,
      envelope_ref: envelopeId,
      operation_kind: "start",
      role: normalizedRole,
      slot_digest: slotDigest,
      work_item_ref: workItemRef,
      workspace_ref: nativeWorkspaceRef,
      ...(workspaceRef.branch_ref === undefined
        ? {}
        : { branch_ref: requiredText(workspaceRef.branch_ref, "branch_ref") }),
      ...(workspaceRef.worktree_ref === undefined
        ? {}
        : { worktree_ref: requiredText(workspaceRef.worktree_ref, "worktree_ref") }),
      ...(workspaceRef.supersedes === undefined
        ? {}
        : { supersedes: validBindingRef(workspaceRef.supersedes) }),
    };

    let preparedPayload: Record<string, unknown> | undefined;
    let preparedCreated = false;
    mutateLedger(workspaceRoot, (current, append) => {
      assertStartAuthority(current, {
        actor_binding_ref: actorBindingRef,
        envelope_content_digest: envelopeDigest,
        envelope_id: envelopeId,
        project_id: projectId,
        role: normalizedRole,
        observed_at: now(),
        workspace: workspaceRef,
      });
      const priorPrepared = findRuntimePrepared(current, operationId);
      if (priorPrepared !== undefined) {
        const priorRequest = requiredRecord(
          priorPrepared["runtime_request"],
          "runtime_request",
        );
        generation = requiredPositiveInteger(priorRequest["generation"], "generation");
        const candidateDigest = digestPayload({ ...baseRequest, generation });
        if (priorPrepared["canonical_payload_digest"] !== candidateDigest) {
          throw new CommandError(
            "LEDGER_DIGEST_CONFLICT",
            "start idempotency key collides with a different packet",
          );
        }
        preparedPayload = priorPrepared;
        return;
      }
      const bindings = runtimeBindings(current);
      const latestGeneration = bindings
        .filter((binding) => bindingSlotDigest(binding) === slotDigest)
        .reduce((highest, binding) => Math.max(highest, binding.generation), 0);
      generation = latestGeneration + 1;
      const request = { ...baseRequest, generation };
      const packetDigest = digestPayload(request);
      const payload: Record<string, unknown> = {
        canonical_payload_digest: packetDigest,
        contract: CODEX_APP_CONSUMER_V2_CONTRACT,
        effect_id: operationId,
        mutation_kind: "codex_host.start",
        runtime_event_kind: "action_prepared",
        runtime_request: request,
      };
      const currentBinding = latestBindingForSlot(bindings, slotDigest);
      const supersedes = workspaceRef.supersedes;
      if (currentBinding !== undefined) {
        if (supersedes === undefined) {
          if (currentBinding.state !== "released") {
            throw new CommandError(
              "SESSION_BINDING_CONFLICT",
              "active session binding already occupies this slot",
            );
          }
        } else if (
          currentBinding.binding_id !== supersedes.binding_id ||
          currentBinding.generation !== supersedes.generation ||
          currentBinding.state !== "handed_off"
        ) {
          throw new CommandError(
            "SESSION_HANDOFF_REQUIRED",
            "successor start requires the current handed-off binding",
          );
        }
      } else if (supersedes !== undefined) {
        throw new CommandError(
          "SESSION_HANDOFF_REQUIRED",
          "successor start references an unknown binding",
        );
      }
      const pendingStart = current.some((event) => {
        const candidate = runtimePreparedPayload(event);
        if (candidate === undefined || candidate["effect_id"] === operationId) {
          return false;
        }
        const requestValue = asRecord(candidate["runtime_request"]);
        return (
          requestValue?.["operation_kind"] === "start" &&
          requestValue["slot_digest"] === slotDigest &&
          findRuntimeReceipt(current, String(candidate["effect_id"])) === undefined
        );
      });
      if (pendingStart) {
        throw new CommandError(
          "SESSION_BINDING_CONFLICT",
          "another prepared start already occupies this slot",
        );
      }
      append([
        {
          actor_binding_ref: actorBindingRef,
          event_type: "hufu/mutation.prepared",
          idempotency_key: `hufu/mutation.prepared:${operationId}`,
          payload,
        },
      ]);
      preparedPayload = payload;
      preparedCreated = true;
    });

    if (preparedPayload === undefined) {
      throw new CommandError("DATA_INSUFFICIENT", "prepared start was not recorded");
    }
    const prepared = preparedActionFromPayload(preparedPayload);
    return preparedCreated ? prepared : recoverPreparedAction(prepared.ref);
  }

  function completeStart(
    prepared: CodexAppPreparedRef,
    result: CodexAppHostToolResult,
  ): CodexAppStartCompletion {
    const operationId = requiredText(prepared.operation_id, "operation_id");
    const packetDigest = requiredText(prepared.packet_digest, "packet_digest");
    let completion: CodexAppStartCompletion | undefined;
    mutateLedger(workspaceRoot, (current, append) => {
      const existing = findRuntimeReceipt(current, operationId);
      if (existing !== undefined) {
        completion = startCompletionFromReceipt(existing, packetDigest);
        return;
      }
      const preparedPayload = findRuntimePrepared(current, operationId);
      if (
        preparedPayload === undefined ||
        preparedPayload["canonical_payload_digest"] !== packetDigest
      ) {
        throw new CommandError("DATA_INSUFFICIENT", "prepared start does not exist");
      }
      const request = requiredRecord(preparedPayload["runtime_request"], "runtime_request");
      if (result.availability === "unavailable") {
        const payload = runtimeReceiptPayload(
          operationId,
          "start",
          packetDigest,
          "unavailable",
          { error_code: requiredText(result.error_code, "error_code") },
        );
        append([runtimeReceiptDraft(actorBindingRef, operationId, payload)]);
        completion = { status: "unavailable" };
        return;
      }
      const hostId = optionalText(result.host_id);
      const hostThreadRef = optionalText(result.thread_id);
      const clientThreadRef = optionalText(result.client_thread_id);
      if ((hostThreadRef === undefined) === (clientThreadRef === undefined)) {
        throw new CommandError(
          "CONTRACT_INVALID",
          "start result must contain exactly one thread_id or client_thread_id",
        );
      }
      const recovery = findRuntimeRecovery(current, operationId);
      if (
        recovery !== undefined &&
        optionalText(result.matched_title) !==
          requiredText(String(request["correlation_title"] ?? ""), "correlation_title")
      ) {
        throw new CommandError(
          "CONTRACT_INVALID",
          "start recovery did not match the prepared correlation title",
        );
      }
      if (hostThreadRef !== undefined && hostId === undefined) {
        throw new CommandError("DATA_INSUFFICIENT", "ready start result is missing host_id");
      }
      const generation = requiredPositiveInteger(request["generation"], "generation");
      const state = hostThreadRef === undefined ? "pending" : "ready";
      const bindingId = `binding:${digestPayload({ operation_id: operationId }).slice(7, 31)}`;
      const createdAt = now().toISOString();
      const binding: CodexAppSessionBinding = {
        authority_ref: requiredText(String(request["authority_ref"] ?? ""), "authority_ref"),
        binding_id: bindingId,
        capability_digest: capabilityDigest,
        channel: requiredText(String(request["channel"] ?? ""), "channel"),
        correlation_title: requiredText(
          String(request["correlation_title"] ?? ""),
          "correlation_title",
        ),
        created_at: createdAt,
        fence: generation,
        generation,
        idle: result.idle === true,
        observed_at: createdAt,
        ref: { binding_id: bindingId, generation },
        role: requiredText(String(request["role"] ?? ""), "role"),
        state,
        work_item_ref: requiredText(String(request["work_item_ref"] ?? ""), "work_item_ref"),
        workspace_ref: requiredText(String(request["workspace_ref"] ?? ""), "workspace_ref"),
        ...(optionalText(request["branch_ref"]) === undefined
          ? {}
          : { branch_ref: optionalText(request["branch_ref"]) }),
        ...(clientThreadRef === undefined ? {} : { client_thread_ref: clientThreadRef }),
        ...(hostId === undefined ? {} : { host_id: hostId }),
        ...(optionalText(result.cursor) === undefined ? {} : { cursor: optionalText(result.cursor) }),
        ...(hostThreadRef === undefined ? {} : { host_thread_ref: hostThreadRef }),
        ...(asBindingRef(request["supersedes"]) === undefined
          ? {}
          : { supersedes: asBindingRef(request["supersedes"]) }),
        ...(optionalText(result.turn_ref) === undefined
          ? {}
          : { turn_ref: optionalText(result.turn_ref) }),
        ...(optionalText(request["worktree_ref"]) === undefined
          ? {}
          : { worktree_ref: optionalText(request["worktree_ref"]) }),
      };
      const payload = runtimeReceiptPayload(
        operationId,
        "start",
        packetDigest,
        state,
        { binding },
      );
      append([runtimeReceiptDraft(actorBindingRef, operationId, payload)]);
      completion = { binding, status: state };
    });
    if (completion === undefined) {
      throw new CommandError("DATA_INSUFFICIENT", "start completion was not recorded");
    }
    return completion;
  }

  function prepareReadback(
    bindingRef: CodexAppSessionBindingRef,
    idempotencyKey: string,
  ): CodexAppPreparedAction {
    const snapshot = bindingSnapshot(bindingRef);
    const current = snapshot.binding;
    if (current.state === "released" || current.state === "handed_off") {
      throw new CommandError("SESSION_GENERATION_STALE", "inactive binding cannot be observed");
    }
    const actionIdempotencyKey = requiredText(idempotencyKey, "idempotency_key");
    const pending = current.host_thread_ref === undefined;
    const call: CodexAppHostToolCall = pending
      ? { input: { limit: 100 }, tool: "list_threads" }
      : {
          input: {
            hostId: requiredText(current.host_id, "host_id"),
            threadId: current.host_thread_ref,
          },
          tool: "read_thread",
        };
    return persistPrepared(
      `codex-app:readback:${actionIdempotencyKey}`,
      "readback",
      call,
      {
        binding_ref: current.ref,
        ...bindingFrontierFields(snapshot),
        ...(pending
          ? {
              client_thread_ref: requiredText(
                current.client_thread_ref,
                "client_thread_ref",
              ),
              correlation_title: requiredText(
                current.correlation_title,
                "correlation_title",
              ),
              resolution_kind: "pending_list_threads",
            }
          : { resolution_kind: "read_thread" }),
      },
    );
  }

  function completeReadback(
    prepared: CodexAppPreparedRef,
    result: CodexAppHostToolResult,
  ): CodexAppReadbackCompletion {
    const operationId = requiredText(prepared.operation_id, "operation_id");
    const packetDigest = requiredText(prepared.packet_digest, "packet_digest");
    let completion: CodexAppReadbackCompletion | undefined;
    mutateLedger(workspaceRoot, (current, append) => {
      const existing = findRuntimeReceipt(current, operationId);
      if (existing !== undefined) {
        completion = readbackCompletionFromReceipt(existing, packetDigest);
        return;
      }
      const preparedPayload = findRuntimePrepared(current, operationId);
      if (
        preparedPayload === undefined ||
        preparedPayload["canonical_payload_digest"] !== packetDigest
      ) {
        throw new CommandError("DATA_INSUFFICIENT", "prepared readback does not exist");
      }
      const request = requiredRecord(preparedPayload["runtime_request"], "runtime_request");
      const bindingRef = requiredBindingRef(request["binding_ref"], "binding_ref");
      const observed = assertExpectedBindingFrontier(current, bindingRef, request);
      if (result.availability === "unavailable") {
        const payload = runtimeReceiptPayload(
          operationId,
          "readback",
          packetDigest,
          "unavailable",
          { error_code: requiredText(result.error_code, "error_code") },
        );
        append([runtimeReceiptDraft(actorBindingRef, operationId, payload)]);
        completion = { availability: "unavailable" };
        return;
      }
      const resultHostId = optionalText(result.host_id);
      if (
        observed.host_id !== undefined &&
        resultHostId !== undefined &&
        resultHostId !== observed.host_id
      ) {
        throw new CommandError("CONTRACT_INVALID", "readback host_id does not match binding");
      }
      const returnedThread = optionalText(result.thread_id);
      const stableThread = observed.host_thread_ref ?? returnedThread;
      if (stableThread === undefined) {
        throw new CommandError(
          "DATA_INSUFFICIENT",
          "pending binding readback did not return a stable thread_id",
        );
      }
      if (observed.host_thread_ref === undefined) {
        if (
          optionalText(result.matched_title) !==
          requiredText(observed.correlation_title, "correlation_title")
        ) {
          throw new CommandError(
            "CONTRACT_INVALID",
            "pending resolution did not match the prepared correlation title",
          );
        }
        if (resultHostId === undefined) {
          throw new CommandError("DATA_INSUFFICIENT", "pending resolution is missing host_id");
        }
      }
      if (
        observed.host_thread_ref !== undefined &&
        returnedThread !== undefined &&
        observed.host_thread_ref !== returnedThread
      ) {
        throw new CommandError("CONTRACT_INVALID", "readback thread_id does not match binding");
      }
      const observedAt = now().toISOString();
      const { client_thread_ref: _pendingClientThread, ...stableObserved } = observed;
      const updated: CodexAppSessionBinding = {
        ...stableObserved,
        host_id: observed.host_id ?? resultHostId,
        host_thread_ref: stableThread,
        idle: result.idle === true,
        observed_at: observedAt,
        state: "ready",
        ...(optionalText(result.cursor) === undefined
          ? {}
          : { cursor: optionalText(result.cursor) }),
        ...(optionalText(result.turn_ref) === undefined
          ? {}
          : { turn_ref: optionalText(result.turn_ref) }),
      };
      const payload = runtimeReceiptPayload(
        operationId,
        "readback",
        packetDigest,
        "available",
        { binding: updated },
      );
      append([runtimeReceiptDraft(actorBindingRef, operationId, payload)]);
      completion = { availability: "available", binding: updated };
    });
    if (completion === undefined) {
      throw new CommandError("DATA_INSUFFICIENT", "readback completion was not recorded");
    }
    return completion;
  }

  function prepareSend(
    bindingRef: CodexAppSessionBindingRef,
    messageRef: MessageRef,
    expectedIdle: boolean,
    idempotencyKey: string,
  ): CodexAppPreparedAction {
    const snapshot = bindingSnapshot(bindingRef);
    const current = snapshot.binding;
    if (current.state !== "ready" || current.host_thread_ref === undefined) {
      throw new CommandError("DATA_INSUFFICIENT", "send requires a ready session binding");
    }
    if (!current.idle) {
      throw new CommandError("SESSION_TURN_BUSY", "active Turn rejects an additional message");
    }
    const ref = {
      message_ref: requiredText(messageRef.message_ref, "message_ref"),
    };
    const prompt = requiredText(options.messageResolver.resolve(ref), "resolved prompt");
    const promptDigest = digestPayload({ prompt });
    const actionIdempotencyKey = requiredText(idempotencyKey, "idempotency_key");
    const call: CodexAppHostToolCall = {
      input: {
        hostId: requiredText(current.host_id, "host_id"),
        prompt,
        threadId: current.host_thread_ref,
      },
      tool: "send_message_to_thread",
    };
    const durableCall: CodexAppHostToolCall = {
      input: {
        hostId: requiredText(current.host_id, "host_id"),
        messageRef: ref.message_ref,
        promptDigest,
        threadId: current.host_thread_ref,
      },
      tool: "send_message_to_thread",
    };
    return persistPrepared(
      `codex-app:send:${actionIdempotencyKey}`,
      "send",
      call,
      {
        binding_ref: current.ref,
        ...bindingFrontierFields(snapshot),
        expected_idle: expectedIdle,
        message_ref: ref.message_ref,
        prompt_digest: promptDigest,
      },
      durableCall,
    );
  }

  function completeSend(
    prepared: CodexAppPreparedRef,
    result: CodexAppHostToolResult,
  ): CodexAppSendCompletion {
    const operationId = requiredText(prepared.operation_id, "operation_id");
    const packetDigest = requiredText(prepared.packet_digest, "packet_digest");
    let completion: CodexAppSendCompletion | undefined;
    mutateLedger(workspaceRoot, (current, append) => {
      const existing = findRuntimeReceipt(current, operationId);
      if (existing !== undefined) {
        completion = sendCompletionFromReceipt(existing, packetDigest);
        return;
      }
      const preparedPayload = findRuntimePrepared(current, operationId);
      if (
        preparedPayload === undefined ||
        preparedPayload["canonical_payload_digest"] !== packetDigest
      ) {
        throw new CommandError("DATA_INSUFFICIENT", "prepared send does not exist");
      }
      const request = requiredRecord(preparedPayload["runtime_request"], "runtime_request");
      const bindingRef = requiredBindingRef(request["binding_ref"], "binding_ref");
      const sent = assertExpectedBindingFrontier(current, bindingRef, request);
      if (
        result.availability === "unavailable" ||
        result.delivered !== true
      ) {
        const runtimeResult = result.availability === "unavailable"
          ? { error_code: requiredText(result.error_code, "error_code") }
          : { error_code: "delivery_not_confirmed" };
        const payload = runtimeReceiptPayload(
          operationId,
          "send",
          packetDigest,
          "unavailable",
          runtimeResult,
        );
        append([runtimeReceiptDraft(actorBindingRef, operationId, payload)]);
        completion = { delivery: "unavailable" };
        return;
      }
      if (
        optionalText(result.host_id) !== undefined &&
        optionalText(result.host_id) !== sent.host_id
      ) {
        throw new CommandError("CONTRACT_INVALID", "send host_id does not match binding");
      }
      const observedAt = now().toISOString();
      const updated: CodexAppSessionBinding = {
        ...sent,
        idle: result.idle === true,
        observed_at: observedAt,
        ...(optionalText(result.cursor) === undefined
          ? {}
          : { cursor: optionalText(result.cursor) }),
        ...(optionalText(result.turn_ref) === undefined
          ? {}
          : { turn_ref: optionalText(result.turn_ref) }),
      };
      const payload = runtimeReceiptPayload(
        operationId,
        "send",
        packetDigest,
        "accepted",
        { binding: updated },
      );
      append([runtimeReceiptDraft(actorBindingRef, operationId, payload)]);
      completion = { binding: updated, delivery: "accepted" };
    });
    if (completion === undefined) {
      throw new CommandError("DATA_INSUFFICIENT", "send completion was not recorded");
    }
    return completion;
  }

  function prepareWait(
    bindingRef: CodexAppSessionBindingRef,
    afterCursor: string,
    boundedTimeout: WaitBounds,
    idempotencyKey: string,
  ): CodexAppPreparedAction {
    const snapshot = bindingSnapshot(bindingRef);
    const current = snapshot.binding;
    if (current.state !== "ready" || current.host_thread_ref === undefined) {
      throw new CommandError("DATA_INSUFFICIENT", "wait requires a ready session binding");
    }
    const cursor = requiredText(afterCursor, "after_cursor");
    const timeoutMs = boundedTimeout.timeout_ms;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_WAIT_MS) {
      throw new CommandError(
        "CONTRACT_INVALID",
        `wait timeout_ms must be a bounded integer from 1 to ${String(MAX_WAIT_MS)}`,
      );
    }
    const actionIdempotencyKey = requiredText(idempotencyKey, "idempotency_key");
    const targets = [{
      afterCursor: cursor,
      hostId: requiredText(current.host_id, "host_id"),
      threadId: current.host_thread_ref,
    }];
    const call: CodexAppHostToolCall = {
      input: { targets, timeoutMs },
      tool: "wait_threads",
    };
    return persistPrepared(
      `codex-app:wait:${actionIdempotencyKey}`,
      "wait",
      call,
      {
        after_cursor: cursor,
        binding_ref: current.ref,
        ...bindingFrontierFields(snapshot),
        timeout_ms: timeoutMs,
      },
    );
  }

  function completeWait(
    prepared: CodexAppPreparedRef,
    result: CodexAppHostToolResult,
  ): CodexAppReadbackCompletion {
    const operationId = requiredText(prepared.operation_id, "operation_id");
    const packetDigest = requiredText(prepared.packet_digest, "packet_digest");
    let completion: CodexAppReadbackCompletion | undefined;
    mutateLedger(workspaceRoot, (current, append) => {
      const existing = findRuntimeReceipt(current, operationId);
      if (existing !== undefined) {
        completion = readbackCompletionFromReceipt(existing, packetDigest);
        return;
      }
      const preparedPayload = findRuntimePrepared(current, operationId);
      if (
        preparedPayload === undefined ||
        preparedPayload["canonical_payload_digest"] !== packetDigest
      ) {
        throw new CommandError("DATA_INSUFFICIENT", "prepared wait does not exist");
      }
      const request = requiredRecord(preparedPayload["runtime_request"], "runtime_request");
      const bindingRef = requiredBindingRef(request["binding_ref"], "binding_ref");
      const waited = assertExpectedBindingFrontier(current, bindingRef, request);
      if (result.availability === "unavailable") {
        const payload = runtimeReceiptPayload(
          operationId,
          "wait",
          packetDigest,
          "unavailable",
          { error_code: requiredText(result.error_code, "error_code") },
        );
        append([runtimeReceiptDraft(actorBindingRef, operationId, payload)]);
        completion = { availability: "unavailable" };
        return;
      }
      if (
        optionalText(result.host_id) !== undefined &&
        optionalText(result.host_id) !== waited.host_id
      ) {
        throw new CommandError("CONTRACT_INVALID", "wait host_id does not match binding");
      }
      const returnedThread = optionalText(result.thread_id);
      if (
        returnedThread !== undefined &&
        returnedThread !== waited.host_thread_ref
      ) {
        throw new CommandError("CONTRACT_INVALID", "wait thread_id does not match binding");
      }
      const updated: CodexAppSessionBinding = {
        ...waited,
        idle: result.idle === true,
        observed_at: now().toISOString(),
        ...(optionalText(result.cursor) === undefined
          ? {}
          : { cursor: optionalText(result.cursor) }),
        ...(optionalText(result.turn_ref) === undefined
          ? {}
          : { turn_ref: optionalText(result.turn_ref) }),
      };
      const payload = runtimeReceiptPayload(
        operationId,
        "wait",
        packetDigest,
        "available",
        { binding: updated },
      );
      append([runtimeReceiptDraft(actorBindingRef, operationId, payload)]);
      completion = { availability: "available", binding: updated };
    });
    if (completion === undefined) {
      throw new CommandError("DATA_INSUFFICIENT", "wait completion was not recorded");
    }
    return completion;
  }

  function recordLogicalHandoff(
    bindingRef: CodexAppSessionBindingRef,
    idempotencyKey: string,
  ): CodexAppSessionBinding {
    const operationId = `codex-app:logical-handoff:${requiredText(idempotencyKey, "idempotency_key")}`;
    let handedOff: CodexAppSessionBinding | undefined;
    mutateLedger(workspaceRoot, (current, append) => {
      const existing = findRuntimeReceipt(current, operationId);
      if (existing !== undefined) {
        const preparedPayload = findRuntimePrepared(current, operationId);
        const preparedBinding = asBindingRef(
          asRecord(preparedPayload?.["runtime_request"])?.["binding_ref"],
        );
        const requestedBinding = validBindingRef(bindingRef);
        if (
          preparedBinding === undefined ||
          preparedBinding.binding_id !== requestedBinding.binding_id ||
          preparedBinding.generation !== requestedBinding.generation
        ) {
          throw new CommandError(
            "LEDGER_DIGEST_CONFLICT",
            "logical handoff idempotency key collides with another binding",
          );
        }
        const packetDigest = requiredText(
          String(existing["canonical_payload_digest"] ?? ""),
          "packet_digest",
        );
        handedOff = bindingCompletionFromReceipt(existing, packetDigest, "handed_off");
        return;
      }
      const active = resolveCurrentRuntimeBinding(current, bindingRef);
      if (active.state !== "ready" || !active.idle) {
        throw new CommandError("SESSION_TURN_BUSY", "logical handoff requires an idle ready binding");
      }
      const request = {
        binding_ref: active.ref,
        operation_kind: "logical_handoff",
      };
      const packetDigest = digestPayload(request);
      const transitioned: CodexAppSessionBinding = {
        ...active,
        observed_at: now().toISOString(),
        state: "handed_off",
      };
      const preparedPayload: Record<string, unknown> = {
        canonical_payload_digest: packetDigest,
        contract: CODEX_APP_CONSUMER_V2_CONTRACT,
        effect_id: operationId,
        mutation_kind: "codex_host.logical_handoff",
        runtime_event_kind: "action_prepared",
        runtime_request: request,
      };
      const receiptPayload = runtimeReceiptPayload(
        operationId,
        "logical_handoff",
        packetDigest,
        "handed_off",
        { binding: transitioned },
      );
      append([
        {
          actor_binding_ref: actorBindingRef,
          event_type: "hufu/mutation.prepared",
          idempotency_key: `hufu/mutation.prepared:${operationId}`,
          payload: preparedPayload,
        },
        runtimeReceiptDraft(actorBindingRef, operationId, receiptPayload),
      ]);
      handedOff = transitioned;
    });
    if (handedOff === undefined) {
      throw new CommandError("DATA_INSUFFICIENT", "logical handoff was not recorded");
    }
    return handedOff;
  }

  function prepareRelease(
    bindingRef: CodexAppSessionBindingRef,
    requireIdle: boolean,
    idempotencyKey: string,
  ): CodexAppPreparedAction {
    const snapshot = bindingSnapshot(bindingRef);
    const current = snapshot.binding;
    if (current.state !== "ready" || current.host_thread_ref === undefined) {
      throw new CommandError("DATA_INSUFFICIENT", "release requires a ready binding");
    }
    const actionIdempotencyKey = requiredText(idempotencyKey, "idempotency_key");
    const call: CodexAppHostToolCall = {
      input: {
        hostId: requiredText(current.host_id, "host_id"),
        threadId: current.host_thread_ref,
      },
      tool: "read_thread",
    };
    return persistPrepared(
      `codex-app:release:${actionIdempotencyKey}`,
      "release",
      call,
      {
        binding_ref: current.ref,
        ...bindingFrontierFields(snapshot),
        require_idle: requireIdle,
      },
    );
  }

  function completeRelease(
    prepared: CodexAppPreparedRef,
    result: CodexAppHostToolResult,
  ): CodexAppReleaseCompletion {
    const operationId = requiredText(prepared.operation_id, "operation_id");
    const packetDigest = requiredText(prepared.packet_digest, "packet_digest");
    let completion: CodexAppReleaseCompletion | undefined;
    mutateLedger(workspaceRoot, (current, append) => {
      const existing = findRuntimeReceipt(current, operationId);
      if (existing !== undefined) {
        completion = releaseCompletionFromReceipt(existing, packetDigest);
        return;
      }
      const preparedPayload = findRuntimePrepared(current, operationId);
      if (
        preparedPayload === undefined ||
        preparedPayload["canonical_payload_digest"] !== packetDigest
      ) {
        throw new CommandError("DATA_INSUFFICIENT", "prepared release does not exist");
      }
      const request = requiredRecord(preparedPayload["runtime_request"], "runtime_request");
      const bindingRef = requiredBindingRef(request["binding_ref"], "binding_ref");
      const releasing = assertExpectedBindingFrontier(current, bindingRef, request);
      if (result.availability === "unavailable") {
        const payload = runtimeReceiptPayload(
          operationId,
          "release",
          packetDigest,
          "unavailable",
          { error_code: requiredText(result.error_code, "error_code") },
        );
        append([runtimeReceiptDraft(actorBindingRef, operationId, payload)]);
        completion = { availability: "unavailable", released: false };
        return;
      }
      if (
        optionalText(result.host_id) !== undefined &&
        optionalText(result.host_id) !== releasing.host_id
      ) {
        throw new CommandError("CONTRACT_INVALID", "release host_id does not match binding");
      }
      const returnedThread = optionalText(result.thread_id);
      if (
        returnedThread !== undefined &&
        returnedThread !== releasing.host_thread_ref
      ) {
        throw new CommandError("CONTRACT_INVALID", "release thread_id does not match binding");
      }
      const requireIdle = request["require_idle"] === true;
      const mayRelease = !requireIdle || result.idle === true;
      const updated: CodexAppSessionBinding = {
        ...releasing,
        idle: result.idle === true,
        observed_at: now().toISOString(),
        state: mayRelease ? "released" : "ready",
        ...(optionalText(result.cursor) === undefined
          ? {}
          : { cursor: optionalText(result.cursor) }),
        ...(optionalText(result.turn_ref) === undefined
          ? {}
          : { turn_ref: optionalText(result.turn_ref) }),
      };
      const payload = runtimeReceiptPayload(
        operationId,
        "release",
        packetDigest,
        mayRelease ? "released" : "busy",
        { binding: updated },
      );
      append([runtimeReceiptDraft(actorBindingRef, operationId, payload)]);
      completion = {
        availability: "available",
        binding: updated,
        released: mayRelease,
      };
    });
    if (completion === undefined) {
      throw new CommandError("DATA_INSUFFICIENT", "release completion was not recorded");
    }
    return completion;
  }

  return {
    binding,
    completeReadback,
    completeRelease,
    completeSend,
    completeStart,
    completeWait,
    interrupt(bindingRef) {
      binding(bindingRef);
      return {
        availability: "unavailable",
        reason: "native_interrupt_not_exposed",
      };
    },
    prepareStart,
    prepareReadback,
    prepareRelease,
    prepareSend,
    prepareWait,
    recoverPrepared(prepared) {
      return recoverPreparedAction(prepared);
    },
    recordLogicalHandoff,
  };
}

function runtimePreparedPayload(event: EventEnvelope): Record<string, unknown> | undefined {
  return event.event_type === "hufu/mutation.prepared" &&
    event.payload["contract"] === CODEX_APP_CONSUMER_V2_CONTRACT &&
    event.payload["runtime_event_kind"] === "action_prepared"
    ? event.payload
    : undefined;
}

function findRuntimePrepared(
  events: readonly EventEnvelope[],
  operationId: string,
): Record<string, unknown> | undefined {
  return [...events]
    .reverse()
    .map(runtimePreparedPayload)
    .find((payload) => payload?.["effect_id"] === operationId);
}

function findRuntimeReceipt(
  events: readonly EventEnvelope[],
  operationId: string,
): Record<string, unknown> | undefined {
  const event = [...events].reverse().find(
    (candidate) =>
      candidate.event_type === "hufu/mutation.receipt" &&
      candidate.payload["contract"] === CODEX_APP_CONSUMER_V2_CONTRACT &&
      candidate.payload["runtime_event_kind"] === "action_completed" &&
      candidate.payload["effect_id"] === operationId,
  );
  return event?.payload;
}

function findRuntimeRecovery(
  events: readonly EventEnvelope[],
  originalOperationId: string,
): Record<string, unknown> | undefined {
  return [...events]
    .reverse()
    .find(
      (event) =>
        event.event_type === "hufu/mutation.prepared" &&
        event.payload["contract"] === CODEX_APP_CONSUMER_V2_CONTRACT &&
        event.payload["runtime_event_kind"] === "recovery_prepared" &&
        event.payload["original_operation_id"] === originalOperationId,
    )?.payload;
}

interface RuntimeBindingSnapshot {
  readonly binding: CodexAppSessionBinding;
  readonly ledger_seq: number;
}

function runtimeBindingSnapshots(events: readonly EventEnvelope[]): RuntimeBindingSnapshot[] {
  const snapshots: RuntimeBindingSnapshot[] = [];
  for (const event of events) {
    if (
      event.event_type !== "hufu/mutation.receipt" ||
      event.payload["contract"] !== CODEX_APP_CONSUMER_V2_CONTRACT
    ) {
      continue;
    }
    const binding = asRecord(event.payload["runtime_result"])?.["binding"];
    if (binding !== undefined) {
      snapshots.push({
        binding: parseRuntimeBinding(binding),
        ledger_seq: event.ledger_seq,
      });
    }
  }
  return snapshots;
}

function runtimeBindings(events: readonly EventEnvelope[]): CodexAppSessionBinding[] {
  return runtimeBindingSnapshots(events).map((snapshot) => snapshot.binding);
}

function latestBindingForSlot(
  bindings: readonly CodexAppSessionBinding[],
  slotDigest: string,
): CodexAppSessionBinding | undefined {
  return bindings
    .filter((binding) => bindingSlotDigest(binding) === slotDigest)
    .sort((left, right) => left.generation - right.generation)
    .at(-1);
}

function resolveCurrentRuntimeBinding(
  events: readonly EventEnvelope[],
  ref: CodexAppSessionBindingRef,
): CodexAppSessionBinding {
  return resolveCurrentRuntimeBindingSnapshot(events, ref).binding;
}

function resolveCurrentRuntimeBindingSnapshot(
  events: readonly EventEnvelope[],
  ref: CodexAppSessionBindingRef,
): RuntimeBindingSnapshot {
  const validated = validBindingRef(ref);
  const snapshots = runtimeBindingSnapshots(events);
  const exact = snapshots
    .filter(
      (candidate) =>
        candidate.binding.binding_id === validated.binding_id &&
        candidate.binding.generation === validated.generation,
    )
    .at(-1);
  if (exact === undefined) {
    throw new CommandError("CONTRACT_INVALID", "session binding is unknown");
  }
  const current = snapshots
    .filter(
      (candidate) =>
        bindingSlotDigest(candidate.binding) === bindingSlotDigest(exact.binding),
    )
    .sort(
      (left, right) =>
        left.binding.generation - right.binding.generation ||
        left.ledger_seq - right.ledger_seq,
    )
    .at(-1);
  if (
    current === undefined ||
    current.binding.binding_id !== exact.binding.binding_id ||
    current.binding.generation !== exact.binding.generation
  ) {
    throw new CommandError("SESSION_GENERATION_STALE", "session binding generation is not current");
  }
  return exact;
}

function bindingFrontierFields(
  snapshot: RuntimeBindingSnapshot,
): Record<string, unknown> {
  return {
    expected_binding_cursor: snapshot.binding.cursor ?? null,
    expected_binding_observed_at: snapshot.binding.observed_at,
    expected_binding_revision: snapshot.ledger_seq,
  };
}

function assertExpectedBindingFrontier(
  events: readonly EventEnvelope[],
  ref: CodexAppSessionBindingRef,
  request: Record<string, unknown>,
): CodexAppSessionBinding {
  const current = resolveCurrentRuntimeBindingSnapshot(events, ref);
  if (
    request["expected_binding_revision"] !== current.ledger_seq ||
    request["expected_binding_observed_at"] !== current.binding.observed_at ||
    request["expected_binding_cursor"] !== (current.binding.cursor ?? null)
  ) {
    throw new CommandError(
      "LEDGER_CAUSALITY_CONFLICT",
      "Host result is older than the current SessionBinding frontier",
    );
  }
  return current.binding;
}

function bindingSlotDigest(binding: CodexAppSessionBinding): string {
  return digestPayload({
    authority_ref: binding.authority_ref,
    channel: binding.channel,
    role: binding.role,
    work_item_ref: binding.work_item_ref,
  });
}

interface StartAuthorityInput {
  readonly actor_binding_ref: string;
  readonly envelope_content_digest: string;
  readonly envelope_id: string;
  readonly observed_at: Date;
  readonly project_id: string;
  readonly role: string;
  readonly workspace: NativeWorkspaceRef;
}

function assertStartAuthority(
  events: readonly EventEnvelope[],
  input: StartAuthorityInput,
): void {
  const project = [...events]
    .reverse()
    .find((event) => event.event_type === "hufu/project.connected");
  if (project?.payload["project_id"] !== input.project_id) {
    throw new CommandError(
      "GRANT_SCOPE_EXCEEDED",
      "workspace resolver project is outside the connected Hufu project",
    );
  }
  const supersededBindings = new Set(
    events
      .filter((event) => event.event_type === "hufu/role_binding.established")
      .map((event) => optionalText(event.payload["supersedes"]))
      .filter((value): value is string => value !== undefined),
  );
  const capability = [...events]
    .reverse()
    .find(
      (event) =>
        event.event_type === "hufu/mutation.receipt" &&
        event.payload["contract"] === CODEX_APP_CAPABILITY_RECEIPT_CONTRACT &&
        event.payload["runtime_event_kind"] === "host_capability_observed",
    );
  const capabilityObservedAt = Date.parse(String(capability?.payload["observed_at"] ?? ""));
  const capabilityExpiresAt = Date.parse(String(capability?.payload["expires_at"] ?? ""));
  const nowMs = input.observed_at.getTime();
  const providerBindingRef = optionalText(capability?.payload["provider_binding_ref"]);
  const providerBinding = [...events]
    .reverse()
    .find(
      (event) =>
        event.event_type === "hufu/mutation.receipt" &&
        event.payload["contract"] === CODEX_APP_PROVIDER_BINDING_CONTRACT,
    );
  const providerIssuerBindingRef = optionalText(
    providerBinding?.payload["issuer_binding_ref"],
  );
  const providerIssuer = [...events]
    .reverse()
    .find(
      (event) =>
        event.event_type === "hufu/role_binding.established" &&
        event.payload["binding_id"] === providerIssuerBindingRef &&
        providerIssuerBindingRef !== undefined &&
        !supersededBindings.has(providerIssuerBindingRef),
    );
  const currentProjectLead = [...events]
    .filter(
      (event) =>
        event.event_type === "hufu/role_binding.established" &&
        event.payload["role"] === "project_lead" &&
        typeof event.payload["binding_id"] === "string" &&
        !supersededBindings.has(event.payload["binding_id"]),
    )
    .at(-1);
  if (
    capability?.payload["capability_id"] !== "codex_app" ||
    optionalText(capability.payload["capability_receipt_ref"]) === undefined ||
    capability.actor_binding_ref !== providerBindingRef ||
    capability.payload["issuer_binding_ref"] !== providerBindingRef ||
    capability.payload["provider_contract_ref"] !== CODEX_APP_PROVIDER_CONTRACT_REF ||
    capability.payload["capability_digest"] !== CODEX_APP_V2_CAPABILITY_DIGEST ||
    capability.payload["declared"] !== true ||
    capability.payload["observed"] !== true ||
    capability.payload["qualified"] !== true ||
    !Number.isFinite(capabilityObservedAt) ||
    !Number.isFinite(capabilityExpiresAt) ||
    capabilityObservedAt > nowMs ||
    capabilityExpiresAt < nowMs
  ) {
    throw new CommandError(
      "HOST_CAPABILITY_REJECTED",
      "current codex_app capability receipt is missing, stale, or bound to another provider contract",
    );
  }
  if (
    providerBindingRef === undefined ||
    providerBinding?.payload["provider_binding_ref"] !== providerBindingRef ||
    providerBinding.payload["provider_contract_ref"] !== CODEX_APP_PROVIDER_CONTRACT_REF ||
    providerBinding.payload["capability_digest"] !== CODEX_APP_V2_CAPABILITY_DIGEST ||
    providerBinding.payload["state"] !== "active" ||
    providerBinding.payload["generation"] !== 1 ||
    providerIssuer === undefined ||
    currentProjectLead?.payload["binding_id"] !== providerIssuerBindingRef ||
    providerIssuer.payload["role"] !== "project_lead" ||
    providerIssuer.payload["scope_kind"] !== "project" ||
    providerIssuer.payload["scope_id"] !== input.project_id ||
    providerIssuer.payload["principal_id"] !== providerBinding.actor_binding_ref
  ) {
    throw new CommandError(
      "HOST_CAPABILITY_REJECTED",
      "capability observation is not issued by the current active Host ProviderBinding",
    );
  }

  const grant = [...events]
    .reverse()
    .find((event) => event.event_type === "hufu/authorization_grant.issued");
  const grantId = optionalText(grant?.payload["grant_id"]);
  const grantRevision = grant?.payload["revision"];
  if (
    grantId === undefined ||
    typeof grantRevision !== "number" ||
    !Number.isSafeInteger(grantRevision)
  ) {
    throw new CommandError("DATA_INSUFFICIENT", "current Hufu grant is unavailable");
  }
  if (input.workspace.authority_ref !== grantId) {
    throw new CommandError(
      "GRANT_SCOPE_EXCEEDED",
      "workspace authority_ref does not match the current Hufu grant",
    );
  }

  const envelope = [...events]
    .reverse()
    .find(
      (event) =>
        event.event_type === "hufu/decision.envelope_attached" &&
        event.payload["envelope_id"] === input.envelope_id,
    );
  if (envelope === undefined) {
    throw new CommandError("DATA_INSUFFICIENT", "execution envelope does not exist");
  }
  if (envelope.payload["content_digest"] !== input.envelope_content_digest) {
    throw new CommandError("DECISION_CONFLICT", "execution envelope digest is not current");
  }
  const decisionId = optionalText(envelope.payload["decision_id"]);
  const latestEnvelope = [...events]
    .reverse()
    .find(
      (event) =>
        event.event_type === "hufu/decision.envelope_attached" &&
        event.payload["decision_id"] === decisionId,
    );
  if (latestEnvelope?.payload["envelope_id"] !== input.envelope_id) {
    throw new CommandError("DECISION_CONFLICT", "execution envelope has been superseded");
  }
  const workItems = envelope.payload["work_item_ids"];
  if (!Array.isArray(workItems) || !workItems.includes(input.workspace.work_item_ref)) {
    throw new CommandError(
      "GRANT_SCOPE_EXCEEDED",
      "work item is outside the current execution envelope",
    );
  }

  const packet = events.find(
    (event) =>
      event.event_type === "hufu/decision.packet_recorded" &&
      event.payload["decision_id"] === decisionId,
  );
  const authorityScope = asRecord(packet?.payload["authority_scope_ref"]);
  if (
    authorityScope?.["grant_id"] !== grantId ||
    authorityScope["revision"] !== grantRevision
  ) {
    throw new CommandError(
      "GRANT_SCOPE_EXCEEDED",
      "decision authority scope does not match the current Hufu grant",
    );
  }

  const roleBinding = [...events]
    .reverse()
    .find(
      (event) =>
        event.event_type === "hufu/role_binding.established" &&
        event.payload["binding_id"] === input.actor_binding_ref &&
        !supersededBindings.has(input.actor_binding_ref),
    );
  if (
    roleBinding === undefined ||
    roleBinding.payload["role"] !== input.role ||
    roleBinding.payload["principal_id"] !== envelope.payload["executor_principal_id"]
  ) {
    throw new CommandError(
      "ROLE_NOT_ACTIVE",
      "actor binding is not the current envelope executor role",
    );
  }
  const expectedScope = roleBinding.payload["scope_kind"] === "project"
    ? input.project_id
    : roleBinding.payload["scope_kind"] === "mission"
      ? input.envelope_id
      : input.workspace.work_item_ref;
  if (roleBinding.payload["scope_id"] !== expectedScope) {
    throw new CommandError("GRANT_SCOPE_EXCEEDED", "actor binding scope does not match start");
  }
}

function preparedActionFromPayload(payload: Record<string, unknown>): CodexAppPreparedAction {
  const request = requiredRecord(payload["runtime_request"], "runtime_request");
  const call = requiredRecord(request["call"], "call");
  const tool = requiredText(String(call["tool"] ?? ""), "tool");
  if (!isCodexAppHostToolName(tool)) {
    throw new CommandError("CONTRACT_INVALID", "prepared Host tool is unsupported");
  }
  return {
    call: {
      input: requiredRecord(call["input"], "call.input"),
      tool,
    },
    ref: preparedRefFromPayload(payload),
  };
}

function preparedRefFromPayload(payload: Record<string, unknown>): CodexAppPreparedRef {
  return {
    operation_id: requiredText(String(payload["effect_id"] ?? ""), "operation_id"),
    packet_digest: requiredText(
      String(payload["canonical_payload_digest"] ?? ""),
      "packet_digest",
    ),
  };
}

function runtimeReceiptPayload(
  operationId: string,
  operationKind: string,
  packetDigest: string,
  outcome: string,
  runtimeResult: Record<string, unknown>,
): Record<string, unknown> {
  return {
    canonical_payload_digest: packetDigest,
    contract: CODEX_APP_CONSUMER_V2_CONTRACT,
    effect_id: operationId,
    mutation_kind: `codex_host.${operationKind}`,
    outcome,
    runtime_event_kind: "action_completed",
    runtime_result: runtimeResult,
    write_performed: false,
  };
}

function runtimeReceiptDraft(
  actorBindingRef: string,
  operationId: string,
  payload: Record<string, unknown>,
) {
  return {
    actor_binding_ref: actorBindingRef,
    event_type: "hufu/mutation.receipt" as const,
    idempotency_key: `hufu/mutation.receipt:${operationId}`,
    payload,
  };
}

function startCompletionFromReceipt(
  payload: Record<string, unknown>,
  packetDigest: string,
): CodexAppStartCompletion {
  if (payload["canonical_payload_digest"] !== packetDigest) {
    throw new CommandError("LEDGER_DIGEST_CONFLICT", "completion digest does not match prepared packet");
  }
  if (payload["outcome"] === "unavailable") {
    return { status: "unavailable" };
  }
  const binding = parseRuntimeBinding(
    requiredRecord(payload["runtime_result"], "runtime_result")["binding"],
  );
  if (binding.state !== "pending" && binding.state !== "ready") {
    throw new CommandError("DATA_INSUFFICIENT", "start completion has an invalid binding state");
  }
  return { binding, status: binding.state };
}

function readbackCompletionFromReceipt(
  payload: Record<string, unknown>,
  packetDigest: string,
): CodexAppReadbackCompletion {
  if (payload["canonical_payload_digest"] !== packetDigest) {
    throw new CommandError("LEDGER_DIGEST_CONFLICT", "completion digest does not match prepared packet");
  }
  if (payload["outcome"] === "unavailable") {
    return { availability: "unavailable" };
  }
  return {
    availability: "available",
    binding: parseRuntimeBinding(
      requiredRecord(payload["runtime_result"], "runtime_result")["binding"],
    ),
  };
}

function sendCompletionFromReceipt(
  payload: Record<string, unknown>,
  packetDigest: string,
): CodexAppSendCompletion {
  if (payload["canonical_payload_digest"] !== packetDigest) {
    throw new CommandError("LEDGER_DIGEST_CONFLICT", "completion digest does not match prepared packet");
  }
  if (payload["outcome"] !== "accepted") {
    return { delivery: "unavailable" };
  }
  return {
    binding: parseRuntimeBinding(
      requiredRecord(payload["runtime_result"], "runtime_result")["binding"],
    ),
    delivery: "accepted",
  };
}

function bindingCompletionFromReceipt(
  payload: Record<string, unknown>,
  packetDigest: string,
  expectedOutcome: string,
): CodexAppSessionBinding {
  if (
    payload["canonical_payload_digest"] !== packetDigest ||
    payload["outcome"] !== expectedOutcome
  ) {
    throw new CommandError("LEDGER_DIGEST_CONFLICT", "binding completion does not match request");
  }
  return parseRuntimeBinding(
    requiredRecord(payload["runtime_result"], "runtime_result")["binding"],
  );
}

function releaseCompletionFromReceipt(
  payload: Record<string, unknown>,
  packetDigest: string,
): CodexAppReleaseCompletion {
  if (payload["canonical_payload_digest"] !== packetDigest) {
    throw new CommandError("LEDGER_DIGEST_CONFLICT", "release completion digest mismatch");
  }
  if (payload["outcome"] === "unavailable") {
    return { availability: "unavailable", released: false };
  }
  const binding = parseRuntimeBinding(
    requiredRecord(payload["runtime_result"], "runtime_result")["binding"],
  );
  return {
    availability: "available",
    binding,
    released: payload["outcome"] === "released",
  };
}

function parseRuntimeBinding(value: unknown): CodexAppSessionBinding {
  const record = requiredRecord(value, "binding");
  const state = requiredText(String(record["state"] ?? ""), "binding.state");
  if (state !== "pending" && state !== "ready" && state !== "handed_off" && state !== "released") {
    throw new CommandError("DATA_INSUFFICIENT", "binding state is unsupported");
  }
  const generation = requiredPositiveInteger(record["generation"], "binding.generation");
  const bindingId = requiredText(String(record["binding_id"] ?? ""), "binding.binding_id");
  const binding: CodexAppSessionBinding = {
    authority_ref: requiredText(String(record["authority_ref"] ?? ""), "binding.authority_ref"),
    binding_id: bindingId,
    capability_digest: requiredText(
      String(record["capability_digest"] ?? ""),
      "binding.capability_digest",
    ),
    channel: requiredText(String(record["channel"] ?? ""), "binding.channel"),
    ...(optionalText(record["correlation_title"]) === undefined
      ? {}
      : { correlation_title: optionalText(record["correlation_title"]) }),
    created_at: requiredText(String(record["created_at"] ?? ""), "binding.created_at"),
    fence: requiredPositiveInteger(record["fence"], "binding.fence"),
    generation,
    ...(optionalText(record["host_id"]) === undefined
      ? {}
      : { host_id: optionalText(record["host_id"]) }),
    idle: record["idle"] === true,
    observed_at: requiredText(String(record["observed_at"] ?? ""), "binding.observed_at"),
    ref: { binding_id: bindingId, generation },
    role: requiredText(String(record["role"] ?? ""), "binding.role"),
    state,
    work_item_ref: requiredText(String(record["work_item_ref"] ?? ""), "binding.work_item_ref"),
    workspace_ref: requiredText(String(record["workspace_ref"] ?? ""), "binding.workspace_ref"),
    ...(optionalText(record["branch_ref"]) === undefined
      ? {}
      : { branch_ref: optionalText(record["branch_ref"]) }),
    ...(optionalText(record["client_thread_ref"]) === undefined
      ? {}
      : { client_thread_ref: optionalText(record["client_thread_ref"]) }),
    ...(optionalText(record["cursor"]) === undefined ? {} : { cursor: optionalText(record["cursor"]) }),
    ...(optionalText(record["host_thread_ref"]) === undefined
      ? {}
      : { host_thread_ref: optionalText(record["host_thread_ref"]) }),
    ...(asBindingRef(record["supersedes"]) === undefined
      ? {}
      : { supersedes: asBindingRef(record["supersedes"]) }),
    ...(optionalText(record["turn_ref"]) === undefined
      ? {}
      : { turn_ref: optionalText(record["turn_ref"]) }),
    ...(optionalText(record["worktree_ref"]) === undefined
      ? {}
      : { worktree_ref: optionalText(record["worktree_ref"]) }),
  };
  if (state !== "pending" && binding.host_id === undefined) {
    throw new CommandError("DATA_INSUFFICIENT", "ready binding is missing host_id");
  }
  return binding;
}

function validBindingRef(ref: SessionBindingRef): CodexAppSessionBindingRef {
  return {
    binding_id: requiredText(ref.binding_id, "binding_id"),
    generation: requiredPositiveInteger(ref.generation, "generation"),
  };
}

function asBindingRef(value: unknown): CodexAppSessionBindingRef | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    return undefined;
  }
  return validBindingRef({
    binding_id: String(record["binding_id"] ?? ""),
    generation: Number(record["generation"]),
  });
}

function requiredBindingRef(value: unknown, field: string): CodexAppSessionBindingRef {
  const ref = asBindingRef(value);
  if (ref === undefined) {
    throw new CommandError("DATA_INSUFFICIENT", `${field} is missing or malformed`);
  }
  return ref;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function requiredRecord(value: unknown, field: string): Record<string, unknown> {
  const record = asRecord(value);
  if (record === undefined) {
    throw new CommandError("DATA_INSUFFICIENT", `${field} must be an object`);
  }
  return record;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new CommandError("CONTRACT_INVALID", `${field} must be a positive integer`);
  }
  return value;
}

function requiredHostSelector(value: unknown, field: string): string {
  const text = requiredText(typeof value === "string" ? value : undefined, field);
  if (text.length > 512 || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new CommandError("CONTRACT_INVALID", `${field} is not a legal Host selector`);
  }
  return text;
}

function validateCreateThreadTarget(
  value: CodexAppWorkspaceTarget["target"],
): CodexAppWorkspaceTarget["target"] {
  requiredHostSelector(value.projectId, "target.projectId");
  if (
    value.type !== "project" ||
    (value.environment.type !== "local" && value.environment.type !== "worktree")
  ) {
    throw new CommandError("CONTRACT_INVALID", "workspace target is not a legal project target");
  }
  if (
    value.environment.type === "worktree" &&
    value.environment.startingState?.type === "branch"
  ) {
    requiredHostSelector(
      value.environment.startingState.branchName,
      "target.environment.startingState.branchName",
    );
  }
  return value;
}

function isCodexAppHostToolName(value: string): value is CodexAppHostToolName {
  return (
    value === "create_thread" ||
    value === "list_threads" ||
    value === "read_thread" ||
    value === "send_message_to_thread" ||
    value === "wait_threads"
  );
}
