import { CommandError, isJsonObject } from "./errors.js";
import { digestPayload } from "./digest.js";
import {
  assertBridgeActivationReceipt,
  prepareOutboundTurn,
  type AuthorityScopeRef,
  type BoundedTurnRequest,
  type BridgeActivationReceipt,
  type DecisionRef,
  type EffectRef,
  type ExecutionEnvelopeRef,
  type ReceiptRef,
  type RunOnceAuthorityRef,
  type SessionBindingRef,
  type TypedResultRef,
} from "./loopx-bridge.js";

export interface LoopXRunOnceOutcome {
  readonly effect_ref: EffectRef;
  readonly idempotent_replay: boolean;
  readonly next_allowed: boolean;
  readonly receipt_ref: ReceiptRef;
  readonly status: "committed";
  readonly turn_key: string;
  readonly typed_result_ref: TypedResultRef;
  readonly validation_receipt_ref: ReceiptRef;
}

export type LoopXRunOnceExecutionObservation =
  | {
      readonly effect_ref: EffectRef;
      readonly mode: "run_once";
      readonly schema_version: "loopx_turn_execution_v0";
      readonly status: "committed";
      readonly turn_key: string;
      readonly typed_result: unknown;
      readonly typed_result_ref: TypedResultRef;
    }
  | {
      readonly mode: "run_once";
      readonly reason?: string;
      readonly schema_version: "loopx_turn_execution_v0";
      readonly status: "failed" | "stopped" | "scheduler_action_required";
      readonly turn_key: string;
    };

export type LoopXRunOnceReadback =
  | {
      readonly status: "not_found";
      readonly turn_key: string;
    }
  | {
      readonly status: "prepared" | "unavailable";
      readonly turn_key: string;
    }
  | {
      readonly effect_ref: EffectRef;
      readonly readback_status: "complete";
      readonly receipt_ref: ReceiptRef;
      readonly status: "complete";
      readonly turn_key: string;
      readonly typed_result_ref: TypedResultRef;
      readonly validation_receipt_ref: ReceiptRef;
    };

export interface LoopXRunOncePort {
  readonly adapter_id: string;
  readonly runtime_locator_ref: string;
  execute(plan: BoundedTurnRequest): Promise<LoopXRunOnceExecutionObservation>;
  readback(turnKey: string): Promise<LoopXRunOnceReadback>;
}

export type LoopXRunOnceAuthorityRef = RunOnceAuthorityRef;

export interface LoopXRunOnceAuthorityValidationReceipt {
  readonly accepted: true;
  readonly authority_ref: RunOnceAuthorityRef;
  readonly authority_scope_ref: AuthorityScopeRef;
  readonly decision_ref: DecisionRef;
  readonly envelope_ref: ExecutionEnvelopeRef;
  readonly freshness: "fresh";
  readonly observed_at: string;
  readonly receipt_id: string;
  readonly resolver_id: string;
  readonly session_binding_ref: SessionBindingRef;
  readonly source_revision: string;
  readonly task_ref: string;
  readonly validation_digest: string;
}

export interface LoopXRunOnceAuthorityResolverPort {
  readonly resolver_id: string;
  resolve(plan: BoundedTurnRequest): Promise<unknown>;
}

export type LoopXRunOnceAttemptRecord =
  | {
      readonly status: "not_found";
      readonly turn_key: string;
    }
  | {
      readonly attempt_id: string;
      readonly durable: true;
      readonly status: "prepared" | "attempted";
      readonly turn_key: string;
    };

export interface LoopXRunOnceAttemptReceipt {
  readonly attempt_id: string;
  readonly created: boolean;
  readonly durable: true;
  readonly status: "prepared";
  readonly turn_key: string;
}

export interface LoopXRunOnceAttemptStore {
  prepare(plan: BoundedTurnRequest): Promise<LoopXRunOnceAttemptReceipt>;
  read(turnKey: string): Promise<LoopXRunOnceAttemptRecord>;
}

export type LoopXTypedResultValidationReceipt =
  | {
      readonly accepted: true;
      readonly result_id: string;
      readonly turn_key: string;
      readonly validation_receipt_ref: ReceiptRef;
    }
  | {
      readonly accepted: false;
      readonly reason: string;
    };

export interface LoopXTypedResultValidatorPort {
  readonly validator_id: string;
  validate(
    plan: BoundedTurnRequest,
    typedResult: unknown,
  ): Promise<LoopXTypedResultValidationReceipt>;
}

export interface LoopXRunOnceConsumer {
  execute(plan: BoundedTurnRequest): Promise<LoopXRunOnceOutcome>;
  plan(
    envelopeRef: unknown,
    sessionBindingRef: unknown,
  ): Promise<BoundedTurnRequest>;
}

export interface LoopXRunOnceConsumerOptions {
  readonly activation_receipt?: BridgeActivationReceipt;
  readonly attempt_store?: LoopXRunOnceAttemptStore;
  readonly authority_ref?: RunOnceAuthorityRef;
  readonly authority_resolver?: LoopXRunOnceAuthorityResolverPort;
  readonly port?: LoopXRunOncePort;
  readonly validator?: LoopXTypedResultValidatorPort;
}

export function createLoopXRunOnceConsumer(
  options: LoopXRunOnceConsumerOptions = {},
): LoopXRunOnceConsumer {
  const activation =
    options.activation_receipt === undefined
      ? undefined
      : assertBridgeActivationReceipt(options.activation_receipt);
  const dependenciesQualified =
    activation !== undefined &&
    options.authority_ref !== undefined &&
    options.authority_resolver !== undefined &&
    options.attempt_store !== undefined &&
    options.port !== undefined &&
    options.validator !== undefined &&
    options.port.adapter_id === activation.adapter_id &&
    options.port.runtime_locator_ref === activation.runtime_locator_ref &&
    options.validator.validator_id === activation.validator_id &&
    options.authority_resolver.resolver_id.trim() !== "" &&
    options.authority_resolver.resolver_id !== activation.adapter_id &&
    options.authority_resolver.resolver_id !== activation.validator_id;
  return {
    async plan(envelopeRef, sessionBindingRef) {
      const draft = prepareOutboundTurn(
        envelopeRef,
        sessionBindingRef,
        activation,
        options.authority_ref,
      );
      if (!dependenciesQualified || options.authority_resolver === undefined) {
        return draft;
      }
      const validation = await tryResolveAuthority(
        options.authority_resolver,
        draft,
      );
      return validation === undefined
        ? draft
        : planWithAuthorityValidation(draft, validation);
    },

    async execute(plan) {
      if (
        !plan.execution_allowed ||
        activation === undefined ||
        options.authority_ref === undefined ||
        options.authority_resolver === undefined ||
        options.attempt_store === undefined ||
        options.port === undefined ||
        options.validator === undefined
      ) {
        throw new CommandError(
          "BRIDGE_NOT_AUTHORIZED",
          "LoopX run-once execution requires an injected qualified port and validator",
        );
      }
      if (!dependenciesQualified) {
        throw new CommandError(
          "HOST_CAPABILITY_REJECTED",
          "LoopX adapter or validator identity does not match the activation receipt",
        );
      }
      const expectedPlan = prepareOutboundTurn(
        plan.envelope_ref,
        plan.session_binding_ref,
        activation,
        options.authority_ref,
      );
      const currentAuthority = await resolveAuthorityRequired(
        options.authority_resolver,
        expectedPlan,
      );
      const expectedQualifiedPlan = planWithAuthorityValidation(
        expectedPlan,
        currentAuthority,
      );
      if (
        digestPayload(plan) !== digestPayload(expectedQualifiedPlan)
      ) {
        throw new CommandError(
          "BRIDGE_NOT_AUTHORIZED",
          "LoopX current authority validation changed or does not match this turn plan",
        );
      }

      const before = await readbackSafely(options.port, plan.turn_key);
      assertReadbackTurn(before, plan.turn_key);
      if (before.status === "complete") {
        return outcomeFromReadback(before, true);
      }
      if (before.status !== "not_found") {
        throw new CommandError(
          "DATA_INSUFFICIENT",
          "LoopX turn exists without a complete readback; blind retry is forbidden",
        );
      }

      const priorAttempt = await readAttemptSafely(
        options.attempt_store,
        plan.turn_key,
      );
      assertAttemptTurn(priorAttempt, plan.turn_key);
      if (priorAttempt.status !== "not_found") {
        throw new CommandError(
          "DATA_INSUFFICIENT",
          "LoopX turn was already attempted; only readback or a typed stop is allowed",
        );
      }
      const prepared = await prepareAttemptSafely(options.attempt_store, plan);
      if (
        prepared.turn_key !== plan.turn_key ||
        prepared.status !== "prepared" ||
        prepared.durable !== true ||
        prepared.attempt_id.trim() === "" ||
        prepared.created !== true
      ) {
        throw new CommandError(
          "DATA_INSUFFICIENT",
          "LoopX attempt was not durably prepared as a new single execution",
        );
      }

      let executed: LoopXRunOnceExecutionObservation;
      try {
        executed = await options.port.execute(plan);
      } catch {
        const recovery = await readbackSafely(options.port, plan.turn_key);
        assertReadbackTurn(recovery, plan.turn_key);
        if (recovery.status === "complete") {
          return outcomeFromReadback(recovery, true);
        }
        throw new CommandError(
          "DATA_INSUFFICIENT",
          "LoopX run-once outcome is uncertain; readback did not prove a committed turn",
        );
      }
      if (executed.status !== "committed") {
        const recovery = await readbackSafely(options.port, plan.turn_key);
        assertReadbackTurn(recovery, plan.turn_key);
        if (recovery.status === "complete") {
          return outcomeFromReadback(recovery, true);
        }
        throw new CommandError(
          "DATA_INSUFFICIENT",
          "LoopX run-once did not commit; readback is required before any next turn",
        );
      }
      assertExecutionObservation(executed, plan.turn_key);
      const validation = await validateSafely(
        options.validator,
        plan,
        executed.typed_result,
      );
      if (
        !validation.accepted ||
        validation.turn_key !== plan.turn_key ||
        validation.result_id !== executed.typed_result_ref.result_id ||
        validation.validation_receipt_ref.receipt_id.trim() === ""
      ) {
        throw new CommandError(
          "RECEIPT_INVALID",
          "independent typed-result validation did not bind the executed turn",
        );
      }

      const after = await readbackSafely(options.port, plan.turn_key);
      assertReadbackTurn(after, plan.turn_key);
      if (after.status !== "complete") {
        throw new CommandError(
          "DATA_INSUFFICIENT",
          "LoopX effect readback and Receipt must complete before another turn",
        );
      }
      if (
        after.typed_result_ref.result_id !== executed.typed_result_ref.result_id ||
        after.effect_ref.effect_id !== executed.effect_ref.effect_id ||
        after.validation_receipt_ref.receipt_id !==
          validation.validation_receipt_ref.receipt_id
      ) {
        throw new CommandError(
          "RECEIPT_INVALID",
          "LoopX readback refs do not match the executed and independently validated turn",
        );
      }
      return outcomeFromReadback(after, false);
    },
  };
}

function planWithAuthorityValidation(
  draft: BoundedTurnRequest,
  validation: LoopXRunOnceAuthorityValidationReceipt,
): BoundedTurnRequest {
  return {
    ...draft,
    authority_validation_ref: {
      receipt_id: validation.receipt_id,
      validation_digest: validation.validation_digest,
    },
    execution_allowed: true,
  };
}

async function tryResolveAuthority(
  resolver: LoopXRunOnceAuthorityResolverPort,
  plan: BoundedTurnRequest,
): Promise<LoopXRunOnceAuthorityValidationReceipt | undefined> {
  try {
    const value = await resolver.resolve(plan);
    return assertAuthorityValidationReceipt(value, plan, resolver.resolver_id);
  } catch {
    return undefined;
  }
}

async function resolveAuthorityRequired(
  resolver: LoopXRunOnceAuthorityResolverPort,
  plan: BoundedTurnRequest,
): Promise<LoopXRunOnceAuthorityValidationReceipt> {
  const value = await tryResolveAuthority(resolver, plan);
  if (value === undefined) {
    throw new CommandError(
      "BRIDGE_NOT_AUTHORIZED",
      "current Hufu authority could not be resolved or did not match this turn",
    );
  }
  return value;
}

function assertAuthorityValidationReceipt(
  value: unknown,
  plan: BoundedTurnRequest,
  resolverId: string,
): LoopXRunOnceAuthorityValidationReceipt {
  if (!isJsonObject(value) || value["accepted"] !== true) {
    throw new CommandError(
      "BRIDGE_NOT_AUTHORIZED",
      "authority resolver did not accept the current Hufu authority",
    );
  }
  const allowed = new Set([
    "accepted",
    "authority_ref",
    "authority_scope_ref",
    "decision_ref",
    "envelope_ref",
    "freshness",
    "observed_at",
    "receipt_id",
    "resolver_id",
    "session_binding_ref",
    "source_revision",
    "task_ref",
    "validation_digest",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new CommandError(
      "BRIDGE_NOT_AUTHORIZED",
      "authority resolver returned unsupported fields",
    );
  }
  if (
    plan.authority_ref === undefined ||
    digestPayload(value["authority_ref"]) !== digestPayload(plan.authority_ref) ||
    digestPayload(value["decision_ref"]) !== digestPayload(plan.decision_ref) ||
    digestPayload(value["envelope_ref"]) !== digestPayload(plan.envelope_ref) ||
    digestPayload(value["session_binding_ref"]) !==
      digestPayload(plan.session_binding_ref)
  ) {
    throw new CommandError(
      "BRIDGE_NOT_AUTHORIZED",
      "authority resolver receipt does not bind this authority, decision, envelope, and SessionBinding",
    );
  }
  if (value["task_ref"] !== plan.authority_ref.task_ref) {
    throw new CommandError(
      "BRIDGE_NOT_AUTHORIZED",
      "authority resolver receipt does not bind the requested task",
    );
  }
  const authorityScope = value["authority_scope_ref"];
  if (
    !isJsonObject(authorityScope) ||
    typeof authorityScope["grant_id"] !== "string" ||
    authorityScope["grant_id"].trim() === "" ||
    typeof authorityScope["revision"] !== "number" ||
    !Number.isSafeInteger(authorityScope["revision"]) ||
    authorityScope["revision"] < 1
  ) {
    throw new CommandError(
      "BRIDGE_NOT_AUTHORIZED",
      "authority resolver receipt is missing a current grant revision",
    );
  }
  const observedAt = requiredReceiptText(value, "observed_at");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(observedAt)) {
    throw new CommandError(
      "BRIDGE_NOT_AUTHORIZED",
      "authority resolver observed_at is invalid",
    );
  }
  if (value["freshness"] !== "fresh") {
    throw new CommandError(
      "BRIDGE_NOT_AUTHORIZED",
      "authority resolver receipt is not fresh",
    );
  }
  if (value["resolver_id"] !== resolverId) {
    throw new CommandError(
      "BRIDGE_NOT_AUTHORIZED",
      "authority resolver identity does not match its receipt",
    );
  }
  const semantic = {
    accepted: true as const,
    authority_ref: plan.authority_ref,
    authority_scope_ref: {
      grant_id: authorityScope["grant_id"],
      revision: authorityScope["revision"],
    },
    decision_ref: plan.decision_ref,
    envelope_ref: plan.envelope_ref,
    freshness: "fresh" as const,
    observed_at: observedAt,
    receipt_id: requiredReceiptText(value, "receipt_id"),
    resolver_id: resolverId,
    session_binding_ref: plan.session_binding_ref,
    source_revision: requiredReceiptText(value, "source_revision"),
    task_ref: requiredReceiptText(value, "task_ref"),
  };
  const validationDigest = requiredReceiptText(value, "validation_digest");
  if (validationDigest !== digestPayload(semantic)) {
    throw new CommandError(
      "BRIDGE_NOT_AUTHORIZED",
      "authority resolver validation digest does not match the current receipt",
    );
  }
  return { ...semantic, validation_digest: validationDigest };
}

function requiredReceiptText(
  value: Record<string, unknown>,
  field: string,
): string {
  const text = value[field];
  if (typeof text !== "string" || text.trim() === "") {
    throw new CommandError(
      "BRIDGE_NOT_AUTHORIZED",
      `authority resolver ${field} is missing`,
    );
  }
  return text;
}

async function readAttemptSafely(
  store: LoopXRunOnceAttemptStore,
  turnKey: string,
): Promise<LoopXRunOnceAttemptRecord> {
  try {
    return await store.read(turnKey);
  } catch {
    throw new CommandError(
      "DATA_INSUFFICIENT",
      "LoopX durable attempt journal is unavailable",
    );
  }
}

async function prepareAttemptSafely(
  store: LoopXRunOnceAttemptStore,
  plan: BoundedTurnRequest,
): Promise<LoopXRunOnceAttemptReceipt> {
  try {
    return await store.prepare(plan);
  } catch {
    throw new CommandError(
      "DATA_INSUFFICIENT",
      "LoopX attempt could not be durably prepared",
    );
  }
}

function assertAttemptTurn(
  value: LoopXRunOnceAttemptRecord,
  turnKey: string,
): void {
  if (value.turn_key !== turnKey) {
    throw new CommandError(
      "RECEIPT_INVALID",
      "LoopX durable attempt record belongs to another turn",
    );
  }
}

async function validateSafely(
  validator: LoopXTypedResultValidatorPort,
  plan: BoundedTurnRequest,
  typedResult: unknown,
): Promise<LoopXTypedResultValidationReceipt> {
  try {
    return await validator.validate(plan, typedResult);
  } catch {
    throw new CommandError(
      "RECEIPT_INVALID",
      "independent LoopX typed-result validation is unavailable",
    );
  }
}

async function readbackSafely(
  port: LoopXRunOncePort,
  turnKey: string,
): Promise<LoopXRunOnceReadback> {
  try {
    return await port.readback(turnKey);
  } catch {
    throw new CommandError(
      "DATA_INSUFFICIENT",
      "LoopX run-once readback is unavailable",
    );
  }
}

function assertExecutionObservation(
  value: Extract<
    LoopXRunOnceExecutionObservation,
    { readonly status: "committed" }
  >,
  turnKey: string,
): void {
  if (
    value.schema_version !== "loopx_turn_execution_v0" ||
    value.mode !== "run_once" ||
    value.status !== "committed" ||
    value.turn_key !== turnKey ||
    value.typed_result_ref.result_id.trim() === "" ||
    value.effect_ref.effect_id.trim() === ""
  ) {
    throw new CommandError(
      "RECEIPT_INVALID",
      "LoopX run-once execution observation is invalid or belongs to another turn",
    );
  }
}

function assertReadbackTurn(
  value: LoopXRunOnceReadback,
  turnKey: string,
): void {
  if (value.turn_key !== turnKey) {
    throw new CommandError(
      "RECEIPT_INVALID",
      "LoopX readback belongs to another turn",
    );
  }
}

function outcomeFromReadback(
  value: Extract<LoopXRunOnceReadback, { readonly status: "complete" }>,
  idempotentReplay: boolean,
): LoopXRunOnceOutcome {
  if (
    value.readback_status !== "complete" ||
    value.effect_ref.effect_id.trim() === "" ||
    value.receipt_ref.receipt_id.trim() === "" ||
    value.typed_result_ref.result_id.trim() === "" ||
    value.validation_receipt_ref.receipt_id.trim() === ""
  ) {
    throw new CommandError(
      "DATA_INSUFFICIENT",
      "LoopX committed turn is missing effect, validation, readback, or Receipt evidence",
    );
  }
  return {
    effect_ref: value.effect_ref,
    idempotent_replay: idempotentReplay,
    next_allowed: true,
    receipt_ref: value.receipt_ref,
    status: "committed",
    turn_key: value.turn_key,
    typed_result_ref: value.typed_result_ref,
    validation_receipt_ref: value.validation_receipt_ref,
  };
}
