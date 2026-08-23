import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { digestPayload } from "../src/hufu/digest.js";
import {
  assertAuthorityCrossing,
  assertBridgeActivationReceipt,
  isBridgeEnabled,
  LOOPX_RUN_ONCE_BASELINE,
  prepareOutboundTurn,
} from "../src/hufu/loopx-bridge.js";
import { CommandError } from "../src/hufu/errors.js";
import {
  createLoopXRunOnceConsumer,
  type LoopXRunOnceAttemptStore,
  type LoopXRunOnceConsumer,
  type LoopXRunOncePort,
  type LoopXTypedResultValidatorPort,
} from "../src/hufu/loopx-run-once.js";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

function executionEnvelopeRef(): Record<string, unknown> {
  return {
    content_digest: DIGEST_B,
    decision_ref: {
      content_digest: DIGEST_A,
      decision_id: "decision-example",
      version: 1,
    },
    envelope_id: "env-example",
  };
}

function sessionBindingRef(): Record<string, unknown> {
  return { binding_id: "bind-example", generation: 3 };
}

function currentAuthority(): Record<string, unknown> {
  return {
    authority_scope_ref: { grant_id: "grant-example", revision: 7 },
    freshness: "fresh",
    observed_at: "2026-08-23T12:00:00.000Z",
    session_binding_ref: sessionBindingRef(),
    source_revision: "revision-example",
    task_authority: "gitlab",
    task_ref: "gitlab:example-group/example-project#68",
  };
}

function durableAttemptStore(): LoopXRunOnceAttemptStore {
  const attempts = new Map<string, string>();
  return {
    async read(turnKey) {
      const attemptId = attempts.get(turnKey);
      return attemptId === undefined
        ? { status: "not_found", turn_key: turnKey }
        : {
            attempt_id: attemptId,
            durable: true,
            status: "prepared",
            turn_key: turnKey,
          };
    },
    async prepare(plan) {
      const prior = attempts.get(plan.turn_key);
      if (prior !== undefined) {
        return {
          attempt_id: prior,
          created: false,
          durable: true,
          status: "prepared",
          turn_key: plan.turn_key,
        };
      }
      const attemptId = `attempt:${plan.turn_key}`;
      attempts.set(plan.turn_key, attemptId);
      return {
        attempt_id: attemptId,
        created: true,
        durable: true,
        status: "prepared",
        turn_key: plan.turn_key,
      };
    },
  };
}

function configuredConsumer(
  port: LoopXRunOncePort,
  validator: LoopXTypedResultValidatorPort,
  attemptStore: LoopXRunOnceAttemptStore = durableAttemptStore(),
): LoopXRunOnceConsumer {
  return createLoopXRunOnceConsumer({
    activation_receipt: assertBridgeActivationReceipt(
      qualifiedActivationReceipt(),
    ),
    attempt_store: attemptStore,
    authority: assertAuthorityCrossing(currentAuthority()),
    port,
    validator,
  });
}

function qualifiedActivationReceipt(): Record<string, unknown> {
  const capabilities = {
    durable_attempt_journal: true,
    independent_typed_result_validator: true,
    readback: true,
    run_once: true,
    turn_plan: true,
  };
  const semantic = {
    adapter_id: "example.loopx-run-once",
    adapter_version: "1",
    capabilities,
    loopx_commit: LOOPX_RUN_ONCE_BASELINE.commit,
    loopx_release: LOOPX_RUN_ONCE_BASELINE.release,
    observed_at: "2026-08-23T12:00:00.000Z",
    qualification: "qualified",
    receipt_id: "cap-loopx-example",
    runtime_locator_ref: "runtime:loopx-wrapper-example",
    validator_id: "example.independent-validator",
  };
  return { ...semantic, capability_digest: digestPayload(semantic) };
}

function activationReceiptWithRuntimeLocator(
  runtimeLocatorRef: string,
): Record<string, unknown> {
  const receipt = qualifiedActivationReceipt();
  const { capability_digest: _digest, ...semantic } = receipt;
  const changed = { ...semantic, runtime_locator_ref: runtimeLocatorRef };
  return { ...changed, capability_digest: digestPayload(changed) };
}

describe("LoopX v0.5.2 run-once consumer (#68)", () => {
  it("enables the bridge only from an explicit qualified capability receipt", () => {
    assert.equal(isBridgeEnabled([]), false);
    assert.equal(isBridgeEnabled(undefined), false);
    assert.equal(
      isBridgeEnabled({
        ...qualifiedActivationReceipt(),
        qualification: "declared",
      }),
      false,
    );

    const receipt = assertBridgeActivationReceipt(qualifiedActivationReceipt());
    assert.equal(receipt.loopx_release, "v0.5.2");
    assert.equal(
      receipt.loopx_commit,
      "423035f402e2f1703f076c3cfe60c14c5803433f",
    );
    assert.equal(isBridgeEnabled(receipt), true);
    assert.equal(
      isBridgeEnabled(
        activationReceiptWithRuntimeLocator("wrapper\\example\\loopx"),
      ),
      false,
    );
  });

  it("plans one bounded turn with the real envelope and SessionBinding refs", () => {
    assert.throws(
      () => prepareOutboundTurn(executionEnvelopeRef(), undefined),
      (error: unknown) =>
        error instanceof CommandError && error.code === "CONTRACT_INVALID",
    );

    const inactive = prepareOutboundTurn(
      executionEnvelopeRef(),
      sessionBindingRef(),
    );
    assert.equal(inactive.execution_allowed, false);
    assert.equal(inactive.session_binding_ref.binding_id, "bind-example");
    assert.equal(inactive.session_binding_ref.generation, 3);
    assert.equal(inactive.envelope_ref.envelope_id, "env-example");
    assert.equal(inactive.loopx_baseline.commit, LOOPX_RUN_ONCE_BASELINE.commit);
    assert.match(inactive.turn_key, /^sha256:[0-9a-f]{64}$/);

    const active = prepareOutboundTurn(
      executionEnvelopeRef(),
      sessionBindingRef(),
      qualifiedActivationReceipt(),
    );
    assert.equal(active.execution_allowed, false);
    assert.equal(active.activation_receipt_ref?.receipt_id, "cap-loopx-example");
    assert.equal(active.runtime_locator_ref, "runtime:loopx-wrapper-example");
    assert.equal(active.turn_key, inactive.turn_key);
  });

  it("keeps execution disabled when no RunOncePort is injected", async () => {
    const consumer = createLoopXRunOnceConsumer();
    const plan = consumer.plan(executionEnvelopeRef(), sessionBindingRef());
    assert.equal(plan.execution_allowed, false);
    await assert.rejects(
      () => consumer.execute(plan),
      (error: unknown) =>
        error instanceof CommandError && error.code === "BRIDGE_NOT_AUTHORIZED",
    );
  });

  it("keeps execution disabled when capability and runtime exist without current authority", () => {
    const port: LoopXRunOncePort = {
      adapter_id: "example.loopx-run-once",
      runtime_locator_ref: "runtime:loopx-wrapper-example",
      async execute() {
        throw new Error("must not execute");
      },
      async readback(turnKey) {
        return { status: "not_found", turn_key: turnKey };
      },
    };
    const validator: LoopXTypedResultValidatorPort = {
      validator_id: "example.independent-validator",
      async validate() {
        return { accepted: false, reason: "must not validate" };
      },
    };
    const consumer = createLoopXRunOnceConsumer({
      activation_receipt: assertBridgeActivationReceipt(
        qualifiedActivationReceipt(),
      ),
      attempt_store: durableAttemptStore(),
      port,
      validator,
    });
    assert.equal(
      consumer.plan(executionEnvelopeRef(), sessionBindingRef()).execution_allowed,
      false,
    );
  });

  it("allows next only after execute, independent validation, readback, and Receipt", async () => {
    const calls: string[] = [];
    let readbacks = 0;
    const port: LoopXRunOncePort = {
      adapter_id: "example.loopx-run-once",
      runtime_locator_ref: "runtime:loopx-wrapper-example",
      async execute(plan) {
        calls.push("execute");
        return {
          effect_ref: { effect_id: "effect-example" },
          mode: "run_once",
          schema_version: "loopx_turn_execution_v0",
          status: "committed",
          turn_key: plan.turn_key,
          typed_result: {
            completed_phases: ["host_execute", "typed_result"],
            result_kind: "validated_progress",
            schema_version: "loopx_turn_result_v0",
            turn_key: plan.turn_key,
          },
          typed_result_ref: { result_id: "result-example" },
        };
      },
      async readback(turnKey) {
        calls.push("readback");
        readbacks += 1;
        if (readbacks === 1) {
          return { status: "not_found", turn_key: turnKey };
        }
        return {
          effect_ref: { effect_id: "effect-example" },
          readback_status: "complete",
          receipt_ref: { receipt_id: "receipt-example" },
          status: "complete",
          turn_key: turnKey,
          typed_result_ref: { result_id: "result-example" },
          validation_receipt_ref: { receipt_id: "validation-example" },
        };
      },
    };
    const validator: LoopXTypedResultValidatorPort = {
      validator_id: "example.independent-validator",
      async validate(plan, _typedResult) {
        calls.push("validate");
        return {
          accepted: true,
          result_id: "result-example",
          turn_key: plan.turn_key,
          validation_receipt_ref: { receipt_id: "validation-example" },
        };
      },
    };
    const consumer = configuredConsumer(port, validator);
    const plan = consumer.plan(executionEnvelopeRef(), sessionBindingRef());
    assert.equal(plan.execution_allowed, true);

    const outcome = await consumer.execute(plan);
    assert.equal(outcome.status, "committed");
    assert.equal(outcome.next_allowed, true);
    assert.equal(outcome.idempotent_replay, false);
    assert.equal(outcome.effect_ref.effect_id, "effect-example");
    assert.equal(outcome.receipt_ref.receipt_id, "receipt-example");
    assert.equal(outcome.typed_result_ref.result_id, "result-example");
    assert.deepEqual(calls, ["readback", "execute", "validate", "readback"]);
  });

  it("recovers an uncertain timeout by readback without invoking run-once twice", async () => {
    const calls: string[] = [];
    let readbacks = 0;
    let executions = 0;
    const port: LoopXRunOncePort = {
      adapter_id: "example.loopx-run-once",
      runtime_locator_ref: "runtime:loopx-wrapper-example",
      async execute() {
        calls.push("execute");
        executions += 1;
        throw new Error("simulated timeout");
      },
      async readback(turnKey) {
        calls.push("readback");
        readbacks += 1;
        if (readbacks === 1) {
          return { status: "not_found", turn_key: turnKey };
        }
        return {
          effect_ref: { effect_id: "effect-timeout" },
          readback_status: "complete",
          receipt_ref: { receipt_id: "receipt-timeout" },
          status: "complete",
          turn_key: turnKey,
          typed_result_ref: { result_id: "result-timeout" },
          validation_receipt_ref: { receipt_id: "validation-timeout" },
        };
      },
    };
    const validator: LoopXTypedResultValidatorPort = {
      validator_id: "example.independent-validator",
      async validate() {
        throw new Error("must not validate an already committed recovery");
      },
    };
    const consumer = configuredConsumer(port, validator);
    const outcome = await consumer.execute(
      consumer.plan(executionEnvelopeRef(), sessionBindingRef()),
    );
    assert.equal(outcome.idempotent_replay, true);
    assert.equal(outcome.next_allowed, true);
    assert.equal(executions, 1);
    assert.deepEqual(calls, ["readback", "execute", "readback"]);
  });

  it("does not execute a second time when a prior attempt has unknown effects", async () => {
    let executions = 0;
    const port: LoopXRunOncePort = {
      adapter_id: "example.loopx-run-once",
      runtime_locator_ref: "runtime:loopx-wrapper-example",
      async execute() {
        executions += 1;
        throw new Error("simulated lost response");
      },
      async readback(turnKey) {
        return { status: "not_found", turn_key: turnKey };
      },
    };
    const validator: LoopXTypedResultValidatorPort = {
      validator_id: "example.independent-validator",
      async validate() {
        return { accepted: false, reason: "no result" };
      },
    };
    const consumer = configuredConsumer(port, validator);
    const plan = consumer.plan(executionEnvelopeRef(), sessionBindingRef());
    await assert.rejects(() => consumer.execute(plan));
    await assert.rejects(() => consumer.execute(plan));
    assert.equal(executions, 1);
  });

  it("rejects a forged TypedResult when the independent validator does not accept it", async () => {
    let readbacks = 0;
    const port: LoopXRunOncePort = {
      adapter_id: "example.loopx-run-once",
      runtime_locator_ref: "runtime:loopx-wrapper-example",
      async execute(plan) {
        return {
          effect_ref: { effect_id: "effect-forged" },
          mode: "run_once",
          schema_version: "loopx_turn_execution_v0",
          status: "committed",
          turn_key: plan.turn_key,
          typed_result: {
            completed_phases: ["host_execute", "typed_result"],
            result_kind: "validated_progress",
            schema_version: "loopx_turn_result_v0",
            turn_key: `sha256:${"f".repeat(64)}`,
          },
          typed_result_ref: { result_id: "result-forged" },
        };
      },
      async readback(turnKey) {
        readbacks += 1;
        return { status: "not_found", turn_key: turnKey };
      },
    };
    const validator: LoopXTypedResultValidatorPort = {
      validator_id: "example.independent-validator",
      async validate() {
        return { accepted: false, reason: "turn_key mismatch" };
      },
    };
    const consumer = configuredConsumer(port, validator);
    await assert.rejects(
      () =>
        consumer.execute(
          consumer.plan(executionEnvelopeRef(), sessionBindingRef()),
        ),
      (error: unknown) =>
        error instanceof CommandError && error.code === "RECEIPT_INVALID",
    );
    assert.equal(readbacks, 1);
  });

  it("rejects a forged or stale turn plan before invoking the RunOncePort", async () => {
    let invoked = 0;
    const port: LoopXRunOncePort = {
      adapter_id: "example.loopx-run-once",
      runtime_locator_ref: "runtime:loopx-wrapper-example",
      async execute(plan) {
        invoked += 1;
        return {
          effect_ref: { effect_id: "must-not-run" },
          mode: "run_once",
          schema_version: "loopx_turn_execution_v0",
          status: "committed",
          turn_key: plan.turn_key,
          typed_result: {},
          typed_result_ref: { result_id: "must-not-run" },
        };
      },
      async readback(turnKey) {
        invoked += 1;
        return { status: "not_found", turn_key: turnKey };
      },
    };
    const validator: LoopXTypedResultValidatorPort = {
      validator_id: "example.independent-validator",
      async validate() {
        return { accepted: false, reason: "must not run" };
      },
    };
    const consumer = configuredConsumer(port, validator);
    const plan = consumer.plan(executionEnvelopeRef(), sessionBindingRef());
    await assert.rejects(
      () =>
        consumer.execute({
          ...plan,
          activation_receipt_ref: {
            capability_digest: `sha256:${"0".repeat(64)}`,
            receipt_id: "forged-receipt",
          },
          turn_key: `sha256:${"f".repeat(64)}`,
        }),
      (error: unknown) =>
        error instanceof CommandError &&
        error.code === "HOST_CAPABILITY_REJECTED",
    );
    assert.equal(invoked, 0);
  });

  it("readbacks a returned failure and never allows the next turn without a commit", async () => {
    let readbacks = 0;
    const port: LoopXRunOncePort = {
      adapter_id: "example.loopx-run-once",
      runtime_locator_ref: "runtime:loopx-wrapper-example",
      async execute(plan) {
        return {
          mode: "run_once",
          reason: "host_failure",
          schema_version: "loopx_turn_execution_v0",
          status: "failed",
          turn_key: plan.turn_key,
        };
      },
      async readback(turnKey) {
        readbacks += 1;
        return { status: "not_found", turn_key: turnKey };
      },
    };
    const validator: LoopXTypedResultValidatorPort = {
      validator_id: "example.independent-validator",
      async validate() {
        throw new Error("failure observations are not typed results");
      },
    };
    const consumer = configuredConsumer(port, validator);
    await assert.rejects(
      () =>
        consumer.execute(
          consumer.plan(executionEnvelopeRef(), sessionBindingRef()),
        ),
      (error: unknown) =>
        error instanceof CommandError && error.code === "DATA_INSUFFICIENT",
    );
    assert.equal(readbacks, 2);
  });

  it("does not repeat a turn after restart when readback already has the complete chain", async () => {
    let executions = 0;
    let validations = 0;
    const port: LoopXRunOncePort = {
      adapter_id: "example.loopx-run-once",
      runtime_locator_ref: "runtime:loopx-wrapper-example",
      async execute(plan) {
        executions += 1;
        return {
          effect_ref: { effect_id: "must-not-repeat" },
          mode: "run_once",
          schema_version: "loopx_turn_execution_v0",
          status: "committed",
          turn_key: plan.turn_key,
          typed_result: {},
          typed_result_ref: { result_id: "must-not-repeat" },
        };
      },
      async readback(turnKey) {
        return {
          effect_ref: { effect_id: "effect-recovered" },
          readback_status: "complete",
          receipt_ref: { receipt_id: "receipt-recovered" },
          status: "complete",
          turn_key: turnKey,
          typed_result_ref: { result_id: "result-recovered" },
          validation_receipt_ref: { receipt_id: "validation-recovered" },
        };
      },
    };
    const validator: LoopXTypedResultValidatorPort = {
      validator_id: "example.independent-validator",
      async validate() {
        validations += 1;
        return { accepted: false, reason: "must not revalidate committed readback" };
      },
    };
    const restarted = configuredConsumer(port, validator);
    const outcome = await restarted.execute(
      restarted.plan(executionEnvelopeRef(), sessionBindingRef()),
    );
    assert.equal(outcome.idempotent_replay, true);
    assert.equal(outcome.typed_result_ref.result_id, "result-recovered");
    assert.equal(executions, 0);
    assert.equal(validations, 0);
  });

  it("keeps next disabled when post-execution readback is still prepared", async () => {
    let readbacks = 0;
    const port: LoopXRunOncePort = {
      adapter_id: "example.loopx-run-once",
      runtime_locator_ref: "runtime:loopx-wrapper-example",
      async execute(plan) {
        return {
          effect_ref: { effect_id: "effect-prepared" },
          mode: "run_once",
          schema_version: "loopx_turn_execution_v0",
          status: "committed",
          turn_key: plan.turn_key,
          typed_result: {},
          typed_result_ref: { result_id: "result-prepared" },
        };
      },
      async readback(turnKey) {
        readbacks += 1;
        return readbacks === 1
          ? { status: "not_found", turn_key: turnKey }
          : { status: "prepared", turn_key: turnKey };
      },
    };
    const validator: LoopXTypedResultValidatorPort = {
      validator_id: "example.independent-validator",
      async validate(plan) {
        return {
          accepted: true,
          result_id: "result-prepared",
          turn_key: plan.turn_key,
          validation_receipt_ref: { receipt_id: "validation-prepared" },
        };
      },
    };
    const consumer = configuredConsumer(port, validator);
    await assert.rejects(
      () =>
        consumer.execute(
          consumer.plan(executionEnvelopeRef(), sessionBindingRef()),
        ),
      (error: unknown) =>
        error instanceof CommandError && error.code === "DATA_INSUFFICIENT",
    );
    assert.equal(readbacks, 2);
  });

  it("sanitizes a readback adapter failure instead of leaking provider details", async () => {
    const port: LoopXRunOncePort = {
      adapter_id: "example.loopx-run-once",
      runtime_locator_ref: "runtime:loopx-wrapper-example",
      async execute() {
        throw new Error("must not execute");
      },
      async readback() {
        throw new Error("provider failed with token=example-sensitive-value");
      },
    };
    const validator: LoopXTypedResultValidatorPort = {
      validator_id: "example.independent-validator",
      async validate() {
        return { accepted: false, reason: "must not validate" };
      },
    };
    const consumer = configuredConsumer(port, validator);
    await assert.rejects(
      () =>
        consumer.execute(
          consumer.plan(executionEnvelopeRef(), sessionBindingRef()),
        ),
      (error: unknown) => {
        if (!(error instanceof CommandError)) {
          return false;
        }
        assert.equal(error.code, "DATA_INSUFFICIENT");
        assert.doesNotMatch(error.message, /example-sensitive-value/);
        return true;
      },
    );
  });

  it("sanitizes an independent Validator failure", async () => {
    const port: LoopXRunOncePort = {
      adapter_id: "example.loopx-run-once",
      runtime_locator_ref: "runtime:loopx-wrapper-example",
      async execute(plan) {
        return {
          effect_ref: { effect_id: "effect-validator-error" },
          mode: "run_once",
          schema_version: "loopx_turn_execution_v0",
          status: "committed",
          turn_key: plan.turn_key,
          typed_result: {},
          typed_result_ref: { result_id: "result-validator-error" },
        };
      },
      async readback(turnKey) {
        return { status: "not_found", turn_key: turnKey };
      },
    };
    const validator: LoopXTypedResultValidatorPort = {
      validator_id: "example.independent-validator",
      async validate() {
        throw new Error("validator leaked token=example-validator-secret");
      },
    };
    const consumer = configuredConsumer(port, validator);
    await assert.rejects(
      () =>
        consumer.execute(
          consumer.plan(executionEnvelopeRef(), sessionBindingRef()),
        ),
      (error: unknown) => {
        if (!(error instanceof CommandError)) {
          return false;
        }
        assert.equal(error.code, "RECEIPT_INVALID");
        assert.doesNotMatch(error.message, /example-validator-secret/);
        return true;
      },
    );
  });
});
