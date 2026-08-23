import { CommandError } from "./errors.js";
import { digestPayload } from "./digest.js";
import {
  assertBridgeActivationReceipt,
  prepareOutboundTurn,
  type BoundedTurnRequest,
  type BridgeActivationReceipt,
  type EffectRef,
  type ReceiptRef,
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
  ): BoundedTurnRequest;
}

export interface LoopXRunOnceConsumerOptions {
  readonly activation_receipt?: BridgeActivationReceipt;
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
    options.port !== undefined &&
    options.validator !== undefined &&
    options.port.adapter_id === activation.adapter_id &&
    options.port.runtime_locator_ref === activation.runtime_locator_ref &&
    options.validator.validator_id === activation.validator_id;
  return {
    plan(envelopeRef, sessionBindingRef) {
      const plan = prepareOutboundTurn(
        envelopeRef,
        sessionBindingRef,
        activation,
      );
      return dependenciesQualified
        ? plan
        : { ...plan, execution_allowed: false };
    },

    async execute(plan) {
      if (
        !plan.execution_allowed ||
        activation === undefined ||
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
      );
      if (digestPayload(plan) !== digestPayload(expectedPlan)) {
        throw new CommandError(
          "HOST_CAPABILITY_REJECTED",
          "LoopX turn plan does not match the qualified activation, envelope, or SessionBinding",
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
