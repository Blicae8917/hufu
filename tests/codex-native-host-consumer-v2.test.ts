import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CODEX_APP_PROVIDER_CONTRACT_REF,
  CODEX_APP_V2_CAPABILITY_DIGEST,
  createCodexAppConsumerV2,
  type CodexAppHostToolCall,
  type CodexAppWorkspaceResolver,
} from "../src/hufu/codex-native-host.js";
import { appendEvents, type EventDraft } from "../src/hufu/storage.js";

const FIXED_NOW = "2026-08-23T16:00:00.000Z";
const PRIVATE_PROMPT = "private prompt bytes must stay outside the ledger";
const CONTENT_DIGEST = `sha256:${"a".repeat(64)}`;

function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "hufu-codex-app-v2-"));
  return run(dir).finally(() => rmSync(dir, { force: true, recursive: true }));
}

function workspaceResolver(): CodexAppWorkspaceResolver {
  return {
    resolve(workspace) {
      assert.equal(workspace.workspace_ref, "workspace:example");
      return {
        project_id: "example-project",
        target: {
          environment: { type: "local" },
          projectId: "example-project",
          type: "project",
        },
      };
    },
  };
}

function seedAuthority(
  workspaceRoot: string,
  envelopeId: string,
  workItemRef: string,
  options: {
    readonly bindingId?: string;
    readonly capabilityId?: string;
    readonly capabilityProviderRef?: string;
    readonly capabilityExpiresAt?: string;
    readonly includeCapability?: boolean;
    readonly role?: string;
  } = {},
): void {
  const bindingId = options.bindingId ?? "binding:example-owner";
  const role = options.role ?? "owner";
  const events: EventDraft[] = [
    ...(options.includeCapability === false ? [] : [{
      actor_binding_ref: "host:codex-app",
      event_type: "hufu/mutation.receipt" as const,
      idempotency_key: `capability:${envelopeId}`,
      payload: {
        capability_digest: CODEX_APP_V2_CAPABILITY_DIGEST,
        capability_id: options.capabilityId ?? "codex_app",
        capability_receipt_ref: `capability:${envelopeId}`,
        contract: "codex_app_host_capability_v1",
        declared: true,
        expires_at: options.capabilityExpiresAt ?? "2026-08-23T16:05:00.000Z",
        observed: true,
        observed_at: "2026-08-23T15:59:00.000Z",
        provider_contract_ref:
          options.capabilityProviderRef ?? CODEX_APP_PROVIDER_CONTRACT_REF,
        qualified: true,
        runtime_event_kind: "host_capability_observed",
      },
    }]),
    {
      actor_binding_ref: "human:example",
      event_type: "hufu/project.connected",
      idempotency_key: `project:${envelopeId}`,
      payload: {
        project_id: "example-project",
        repository: "https://example.com/example.git",
        stale_after_hours: 24,
        task_authority: "local",
      },
    },
    {
      actor_binding_ref: "human:example",
      event_type: "hufu/authorization_grant.issued",
      idempotency_key: `grant:${envelopeId}`,
      payload: {
        grant_id: "grant:example",
        issuer_id: "human:example",
        revision: 1,
        scope: { project_id: "example-project" },
        scope_text: "example runtime scope",
      },
    },
    {
      actor_binding_ref: "human:example",
      event_type: "hufu/decision.packet_recorded",
      idempotency_key: `decision:${envelopeId}`,
      payload: {
        authority_scope_ref: { grant_id: "grant:example", revision: 1 },
        content_digest: CONTENT_DIGEST,
        decision_id: `decision:${envelopeId}`,
        version: 1,
      },
    },
    {
      actor_binding_ref: "human:example",
      event_type: "hufu/role_binding.established",
      idempotency_key: `role:${envelopeId}`,
      payload: {
        binding_id: bindingId,
        principal_id: "agent:example",
        role,
        scope_id: role === "project_lead" ? "example-project" : workItemRef,
        scope_kind: role === "project_lead" ? "project" : "work_item",
      },
    },
    {
      actor_binding_ref: "human:example",
      event_type: "hufu/decision.envelope_attached",
      idempotency_key: `envelope:${envelopeId}`,
      payload: {
        content_digest: CONTENT_DIGEST,
        decision_id: `decision:${envelopeId}`,
        envelope_id: envelopeId,
        executor_principal_id: "agent:example",
        version: 1,
        work_item_ids: [workItemRef],
      },
    },
  ];
  appendEvents(workspaceRoot, events);
}

describe("Codex App Consumer v2 durable two-phase contract (#67)", () => {
  it("persists prepare before the Host call and restores the completed binding after restart", async () => {
    await withTempDir(async (workspaceRoot) => {
      seedAuthority(workspaceRoot, "envelope:example", "work-item:example");
      const calls: CodexAppHostToolCall[] = [];
      const consumer = createCodexAppConsumerV2({
        actorBindingRef: "binding:example-owner",
        messageResolver: { resolve: () => "unused" },
        now: () => new Date(FIXED_NOW),
        workspaceResolver: workspaceResolver(),
        workspaceRoot,
      });

      const prepared = consumer.prepareStart(
        { content_digest: CONTENT_DIGEST, envelope_id: "envelope:example" },
        "owner",
        {
          authority_ref: "grant:example",
          channel: "codex-app",
          work_item_ref: "work-item:example",
          workspace_ref: "workspace:example",
        },
        "start-example-1",
      );
      assert.equal(prepared.call.tool, "create_thread");
      assert.equal(typeof prepared.call.input["prompt"], "string");
      assert.deepEqual(prepared.call.input["target"], {
        environment: { type: "local" },
        projectId: "example-project",
        type: "project",
      });
      calls.push(prepared.call);
      const beforeComplete = readFileSync(
        join(workspaceRoot, ".hufu", "ledger", "events.jsonl"),
        "utf8",
      );
      assert.match(beforeComplete, /codex_app_consumer_v2/);
      assert.match(beforeComplete, /action_prepared/);
      assert.doesNotMatch(beforeComplete, /action_completed/);

      const completed = consumer.completeStart(prepared.ref, {
        availability: "available",
        cursor: "cursor:1",
        host_id: "host:example",
        idle: true,
        thread_id: "thread:example",
      });
      assert.equal(completed.status, "ready");
      if (completed.status === "unavailable") {
        throw new Error("start unexpectedly unavailable");
      }
      assert.equal(completed.binding.generation, 1);
      assert.equal(completed.binding.host_id, "host:example");
      assert.equal(completed.binding.cursor, "cursor:1");
      assert.equal(calls.length, 1);
      assert.throws(
        () => consumer.recoverPrepared(prepared.ref),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "CONTRACT_INVALID",
      );

      const restarted = createCodexAppConsumerV2({
        actorBindingRef: "binding:example-owner",
        messageResolver: { resolve: () => "unused" },
        now: () => new Date(FIXED_NOW),
        workspaceResolver: workspaceResolver(),
        workspaceRoot,
      });
      const binding = restarted.binding(completed.binding.ref);
      assert.equal(binding.host_thread_ref, "thread:example");
      assert.equal(binding.host_id, "host:example");
      assert.equal(binding.cursor, "cursor:1");
      assert.equal(binding.state, "ready");
    });
  });

  it("keeps clientThreadId pending until read_thread returns a stable threadId", async () => {
    await withTempDir(async (workspaceRoot) => {
      seedAuthority(workspaceRoot, "envelope:pending", "work-item:pending");
      const consumer = createCodexAppConsumerV2({
        actorBindingRef: "binding:example-owner",
        messageResolver: { resolve: () => "unused" },
        now: () => new Date(FIXED_NOW),
        workspaceResolver: workspaceResolver(),
        workspaceRoot,
      });
      const start = consumer.prepareStart(
        { content_digest: CONTENT_DIGEST, envelope_id: "envelope:pending" },
        "owner",
        {
          authority_ref: "grant:example",
          channel: "codex-app",
          work_item_ref: "work-item:pending",
          workspace_ref: "workspace:example",
        },
        "start-pending-1",
      );
      const pending = consumer.completeStart(start.ref, {
        availability: "available",
        client_thread_id: "client-thread:pending",
        idle: true,
      });
      assert.equal(pending.status, "pending");
      if (pending.status === "unavailable") {
        throw new Error("pending start unexpectedly unavailable");
      }
      assert.equal(pending.binding.host_thread_ref, undefined);
      assert.equal(pending.binding.client_thread_ref, "client-thread:pending");

      const preparedReadback = consumer.prepareReadback(
        pending.binding.ref,
        "readback-pending-1",
      );
      assert.equal(preparedReadback.call.tool, "list_threads");
      assert.deepEqual(preparedReadback.call.input, { limit: 100 });

      const restarted = createCodexAppConsumerV2({
        actorBindingRef: "binding:example-owner",
        messageResolver: { resolve: () => "unused" },
        now: () => new Date(FIXED_NOW),
        workspaceResolver: workspaceResolver(),
        workspaceRoot,
      });
      assert.deepEqual(restarted.recoverPrepared(preparedReadback.ref), preparedReadback);
      const observed = restarted.completeReadback(preparedReadback.ref, {
        availability: "available",
        cursor: "cursor:pending-ready",
        host_id: "host:example",
        idle: true,
        matched_title: pending.binding.correlation_title,
        thread_id: "thread:ready",
      });
      assert.equal(observed.availability, "available");
      assert.equal(observed.binding?.state, "ready");
      assert.equal(observed.binding?.host_thread_ref, "thread:ready");
      assert.equal(observed.binding?.client_thread_ref, undefined);
      assert.equal(observed.binding?.cursor, "cursor:pending-ready");

      const stableReadback = restarted.prepareReadback(
        observed.binding?.ref ?? pending.binding.ref,
        "readback-ready-1",
      );
      assert.equal(stableReadback.call.tool, "read_thread");
      assert.equal(stableReadback.call.input["threadId"], "thread:ready");
    });
  });

  it("resolves message_ref outside the ledger and rejects a second send during an active Turn", async () => {
    await withTempDir(async (workspaceRoot) => {
      seedAuthority(workspaceRoot, "envelope:send", "work-item:send");
      const build = () => createCodexAppConsumerV2({
        actorBindingRef: "binding:example-owner",
        messageResolver: {
          resolve(message) {
            assert.equal(message.message_ref, "message:example");
            return PRIVATE_PROMPT;
          },
        },
        now: () => new Date(FIXED_NOW),
        workspaceResolver: workspaceResolver(),
        workspaceRoot,
      });
      const consumer = build();
      const start = consumer.prepareStart(
        { content_digest: CONTENT_DIGEST, envelope_id: "envelope:send" },
        "owner",
        {
          authority_ref: "grant:example",
          channel: "codex-app",
          work_item_ref: "work-item:send",
          workspace_ref: "workspace:example",
        },
        "start-send-1",
      );
      const started = consumer.completeStart(start.ref, {
        availability: "available",
        host_id: "host:example",
        idle: true,
        thread_id: "thread:send",
      });
      if (started.status === "unavailable") {
        throw new Error("start unexpectedly unavailable");
      }

      const send = consumer.prepareSend(
        started.binding.ref,
        { message_ref: "message:example" },
        true,
        "send-example-1",
      );
      assert.equal(send.call.tool, "send_message_to_thread");
      assert.equal(send.call.input["prompt"], PRIVATE_PROMPT);
      const ledger = readFileSync(
        join(workspaceRoot, ".hufu", "ledger", "events.jsonl"),
        "utf8",
      );
      assert.equal(ledger.includes(PRIVATE_PROMPT), false);
      assert.match(ledger, /message:example/);
      assert.match(ledger, /prompt_digest/);
      assert.deepEqual(build().recoverPrepared(send.ref), send);

      const completed = consumer.completeSend(send.ref, {
        availability: "available",
        cursor: "cursor:send",
        delivered: true,
        host_id: "host:example",
        idle: false,
        turn_ref: "turn:send",
      });
      assert.equal(completed.delivery, "accepted");
      assert.equal(completed.binding?.idle, false);
      assert.equal(completed.binding?.turn_ref, "turn:send");
      assert.throws(
        () => consumer.prepareSend(
          started.binding.ref,
          { message_ref: "message:example" },
          true,
          "send-example-2",
        ),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "SESSION_TURN_BUSY",
      );
      assert.throws(
        () => consumer.prepareSend(
          started.binding.ref,
          { message_ref: "message:example" },
          false,
          "send-example-bypass",
        ),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "SESSION_TURN_BUSY",
      );
    });
  });

  it("prepares one bounded wait and durably advances hostId/cursor only after completion", async () => {
    await withTempDir(async (workspaceRoot) => {
      seedAuthority(workspaceRoot, "envelope:wait", "work-item:wait");
      const consumer = createCodexAppConsumerV2({
        actorBindingRef: "binding:example-owner",
        messageResolver: { resolve: () => "unused" },
        now: () => new Date(FIXED_NOW),
        workspaceResolver: workspaceResolver(),
        workspaceRoot,
      });
      const start = consumer.prepareStart(
        { content_digest: CONTENT_DIGEST, envelope_id: "envelope:wait" },
        "owner",
        {
          authority_ref: "grant:example",
          channel: "codex-app",
          work_item_ref: "work-item:wait",
          workspace_ref: "workspace:example",
        },
        "start-wait-1",
      );
      const started = consumer.completeStart(start.ref, {
        availability: "available",
        cursor: "cursor:0",
        host_id: "host:example",
        idle: false,
        thread_id: "thread:wait",
        turn_ref: "turn:wait",
      });
      if (started.status === "unavailable") {
        throw new Error("start unexpectedly unavailable");
      }

      const wait = consumer.prepareWait(
        started.binding.ref,
        "cursor:0",
        { timeout_ms: 250 },
        "wait-example-1",
      );
      assert.equal(wait.call.tool, "wait_threads");
      assert.equal(wait.call.input["timeoutMs"], 250);
      assert.deepEqual(wait.call.input["targets"], [{
        afterCursor: "cursor:0",
        hostId: "host:example",
        threadId: "thread:wait",
      }]);
      const completed = consumer.completeWait(wait.ref, {
        availability: "available",
        cursor: "cursor:1",
        host_id: "host:example",
        idle: true,
        thread_id: "thread:wait",
        turn_ref: "turn:wait",
      });
      assert.equal(completed.availability, "available");
      assert.equal(completed.binding?.cursor, "cursor:1");
      assert.equal(completed.binding?.idle, true);

      const unavailable = consumer.prepareWait(
        started.binding.ref,
        "cursor:1",
        { timeout_ms: 100 },
        "wait-example-2",
      );
      const failed = consumer.completeWait(unavailable.ref, {
        availability: "unavailable",
        error_code: "host_temporarily_unavailable",
      });
      assert.equal(failed.availability, "unavailable");
      assert.deepEqual(
        createCodexAppConsumerV2({
          actorBindingRef: "binding:example-owner",
          messageResolver: { resolve: () => "unused" },
          now: () => new Date(FIXED_NOW),
          workspaceResolver: workspaceResolver(),
          workspaceRoot,
        }).completeWait(unavailable.ref, {
          availability: "unavailable",
          error_code: "different_retry_must_not_replace_receipt",
        }),
        failed,
      );
    });
  });

  it("uses logical handoff plus generation fencing and releases only after Host readback", async () => {
    await withTempDir(async (workspaceRoot) => {
      seedAuthority(workspaceRoot, "envelope:handoff", "work-item:handoff", {
        bindingId: "binding:example-lead",
        role: "project_lead",
      });
      const consumer = createCodexAppConsumerV2({
        actorBindingRef: "binding:example-lead",
        messageResolver: { resolve: () => "unused" },
        now: () => new Date(FIXED_NOW),
        workspaceResolver: workspaceResolver(),
        workspaceRoot,
      });
      const firstPrepared = consumer.prepareStart(
        { content_digest: CONTENT_DIGEST, envelope_id: "envelope:handoff" },
        "project_lead",
        {
          authority_ref: "grant:example",
          channel: "codex-app",
          work_item_ref: "work-item:handoff",
          workspace_ref: "workspace:example",
        },
        "start-handoff-1",
      );
      assert.deepEqual(
        consumer.prepareStart(
          { content_digest: CONTENT_DIGEST, envelope_id: "envelope:handoff" },
          "project_lead",
          {
            authority_ref: "grant:example",
            channel: "codex-app",
            work_item_ref: "work-item:handoff",
            workspace_ref: "workspace:example",
          },
          "start-handoff-1",
        ),
        firstPrepared,
      );
      assert.throws(
        () => consumer.prepareStart(
          { content_digest: CONTENT_DIGEST, envelope_id: "envelope:handoff" },
          "project_lead",
          {
            authority_ref: "grant:example",
            channel: "codex-app",
            work_item_ref: "work-item:handoff",
            workspace_ref: "workspace:example",
          },
          "start-handoff-conflict",
        ),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "SESSION_BINDING_CONFLICT",
      );
      const first = consumer.completeStart(firstPrepared.ref, {
        availability: "available",
        host_id: "host:example",
        idle: true,
        thread_id: "thread:first",
      });
      if (first.status === "unavailable") {
        throw new Error("start unexpectedly unavailable");
      }
      assert.deepEqual(
        consumer.prepareStart(
          { content_digest: CONTENT_DIGEST, envelope_id: "envelope:handoff" },
          "project_lead",
          {
            authority_ref: "grant:example",
            channel: "codex-app",
            work_item_ref: "work-item:handoff",
            workspace_ref: "workspace:example",
          },
          "start-handoff-1",
        ),
        firstPrepared,
      );
      assert.throws(
        () => consumer.prepareStart(
          { content_digest: CONTENT_DIGEST, envelope_id: "envelope:different" },
          "project_lead",
          {
            authority_ref: "grant:example",
            channel: "codex-app",
            work_item_ref: "work-item:handoff",
            workspace_ref: "workspace:example",
          },
          "start-handoff-1",
        ),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "DATA_INSUFFICIENT",
      );

      const handedOff = consumer.recordLogicalHandoff(
        first.binding.ref,
        "handoff-example-1",
      );
      assert.equal(handedOff.state, "handed_off");
      assert.equal(consumer.interrupt(first.binding.ref).availability, "unavailable");

      const successorPrepared = consumer.prepareStart(
        { content_digest: CONTENT_DIGEST, envelope_id: "envelope:handoff" },
        "project_lead",
        {
          authority_ref: "grant:example",
          channel: "codex-app",
          supersedes: first.binding.ref,
          work_item_ref: "work-item:handoff",
          workspace_ref: "workspace:example",
        },
        "start-handoff-2",
      );
      const successor = consumer.completeStart(successorPrepared.ref, {
        availability: "available",
        host_id: "host:example",
        idle: true,
        thread_id: "thread:second",
      });
      if (successor.status === "unavailable") {
        throw new Error("successor unexpectedly unavailable");
      }
      assert.equal(successor.binding.generation, 2);
      assert.equal(successor.binding.supersedes?.binding_id, first.binding.binding_id);
      assert.throws(
        () => consumer.prepareReadback(first.binding.ref, "readback-stale"),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "SESSION_GENERATION_STALE",
      );

      const release = consumer.prepareRelease(
        successor.binding.ref,
        true,
        "release-example-1",
      );
      assert.equal(release.call.tool, "read_thread");
      assert.equal(release.call.input["threadId"], "thread:second");
      const released = consumer.completeRelease(release.ref, {
        availability: "available",
        host_id: "host:example",
        idle: true,
        thread_id: "thread:second",
      });
      assert.equal(released.availability, "available");
      assert.equal(released.released, true);
      assert.equal(released.binding?.state, "released");
    });
  });

  it("fails start before prepare when Host capability or current authority scope is missing", async () => {
    await withTempDir(async (workspaceRoot) => {
      seedAuthority(workspaceRoot, "envelope:scope", "work-item:scope", {
        includeCapability: false,
      });
      const base = {
        actorBindingRef: "binding:example-owner",
        messageResolver: { resolve: () => "unused" },
        now: () => new Date(FIXED_NOW),
        workspaceResolver: workspaceResolver(),
        workspaceRoot,
      };
      const unqualified = createCodexAppConsumerV2(base);
      assert.throws(
        () => unqualified.prepareStart(
          { content_digest: CONTENT_DIGEST, envelope_id: "envelope:scope" },
          "owner",
          {
            authority_ref: "grant:example",
            channel: "codex-app",
            work_item_ref: "work-item:scope",
            workspace_ref: "workspace:example",
          },
          "start-unqualified",
        ),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "HOST_CAPABILITY_REJECTED",
      );

      appendEvents(workspaceRoot, [{
        actor_binding_ref: "host:codex-app",
        event_type: "hufu/mutation.receipt",
        idempotency_key: "capability:scope:valid",
        payload: {
          capability_digest: CODEX_APP_V2_CAPABILITY_DIGEST,
          capability_id: "codex_app",
          capability_receipt_ref: "capability:scope:valid",
          contract: "codex_app_host_capability_v1",
          declared: true,
          expires_at: "2026-08-23T16:05:00.000Z",
          observed: true,
          observed_at: "2026-08-23T15:59:00.000Z",
          provider_contract_ref: CODEX_APP_PROVIDER_CONTRACT_REF,
          qualified: true,
          runtime_event_kind: "host_capability_observed",
        },
      }]);
      const qualified = createCodexAppConsumerV2(base);
      assert.throws(
        () => qualified.prepareStart(
          { content_digest: CONTENT_DIGEST, envelope_id: "envelope:scope" },
          "owner",
          {
            authority_ref: "grant:other",
            channel: "codex-app",
            work_item_ref: "work-item:scope",
            workspace_ref: "workspace:example",
          },
          "start-wrong-scope",
        ),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "GRANT_SCOPE_EXCEEDED",
      );
    });
  });

  it("rejects forged, wrong-id, and stale Host capability observations", async () => {
    const cases = [
      {
        expected: "HOST_CAPABILITY_REJECTED",
        seed: { capabilityProviderRef: "caller:all-true" },
      },
      {
        expected: "HOST_CAPABILITY_REJECTED",
        seed: { capabilityId: "codex_cli" },
      },
      {
        expected: "HOST_CAPABILITY_REJECTED",
        seed: { capabilityExpiresAt: "2026-08-23T15:59:59.000Z" },
      },
    ] as const;
    for (const [index, item] of cases.entries()) {
      await withTempDir(async (workspaceRoot) => {
        const envelopeId = `envelope:capability:${String(index)}`;
        seedAuthority(workspaceRoot, envelopeId, "work-item:capability", item.seed);
        const consumer = createCodexAppConsumerV2({
          actorBindingRef: "binding:example-owner",
          messageResolver: { resolve: () => "unused" },
          now: () => new Date(FIXED_NOW),
          workspaceResolver: workspaceResolver(),
          workspaceRoot,
        });
        assert.throws(
          () => consumer.prepareStart(
            { content_digest: CONTENT_DIGEST, envelope_id: envelopeId },
            "owner",
            {
              authority_ref: "grant:example",
              channel: "codex-app",
              work_item_ref: "work-item:capability",
              workspace_ref: "workspace:example",
            },
            `start-capability-${String(index)}`,
          ),
          (error: unknown) =>
            error instanceof Error && "code" in error && error.code === item.expected,
        );
      });
    }
  });
});
