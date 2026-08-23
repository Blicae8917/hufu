import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  createCodexAppConsumerV2,
  type CodexAppHostToolCall,
  type CodexAppWorkspaceResolver,
} from "../src/hufu/codex-native-host.js";

const FIXED_NOW = "2026-08-23T16:00:00.000Z";
const PRIVATE_PROMPT = "private prompt bytes must stay outside the ledger";

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

describe("Codex App Consumer v2 durable two-phase contract (#67)", () => {
  it("persists prepare before the Host call and restores the completed binding after restart", async () => {
    await withTempDir(async (workspaceRoot) => {
      const calls: CodexAppHostToolCall[] = [];
      const consumer = createCodexAppConsumerV2({
        actorBindingRef: "binding:example-owner",
        messageResolver: { resolve: () => "unused" },
        now: () => new Date(FIXED_NOW),
        workspaceResolver: workspaceResolver(),
        workspaceRoot,
      });

      const prepared = consumer.prepareStart(
        { envelope_id: "envelope:example" },
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
      const consumer = createCodexAppConsumerV2({
        actorBindingRef: "binding:example-owner",
        messageResolver: { resolve: () => "unused" },
        now: () => new Date(FIXED_NOW),
        workspaceResolver: workspaceResolver(),
        workspaceRoot,
      });
      const start = consumer.prepareStart(
        { envelope_id: "envelope:pending" },
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
        { envelope_id: "envelope:send" },
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
    });
  });

  it("prepares one bounded wait and durably advances hostId/cursor only after completion", async () => {
    await withTempDir(async (workspaceRoot) => {
      const consumer = createCodexAppConsumerV2({
        actorBindingRef: "binding:example-owner",
        messageResolver: { resolve: () => "unused" },
        now: () => new Date(FIXED_NOW),
        workspaceResolver: workspaceResolver(),
        workspaceRoot,
      });
      const start = consumer.prepareStart(
        { envelope_id: "envelope:wait" },
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
      const consumer = createCodexAppConsumerV2({
        actorBindingRef: "binding:example-lead",
        messageResolver: { resolve: () => "unused" },
        now: () => new Date(FIXED_NOW),
        workspaceResolver: workspaceResolver(),
        workspaceRoot,
      });
      const firstPrepared = consumer.prepareStart(
        { envelope_id: "envelope:handoff" },
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
          { envelope_id: "envelope:handoff" },
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
          { envelope_id: "envelope:handoff" },
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
          { envelope_id: "envelope:handoff" },
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
          { envelope_id: "envelope:different" },
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
          error instanceof Error && "code" in error && error.code === "LEDGER_DIGEST_CONFLICT",
      );

      const handedOff = consumer.recordLogicalHandoff(
        first.binding.ref,
        "handoff-example-1",
      );
      assert.equal(handedOff.state, "handed_off");
      assert.equal(consumer.interrupt(first.binding.ref).availability, "unavailable");

      const successorPrepared = consumer.prepareStart(
        { envelope_id: "envelope:handoff" },
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
});
