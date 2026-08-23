import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { CommandError } from "../src/hufu/errors.js";
import {
  CODEX_CONSUMER_MAPPING,
  HOST_CAPABILITY_IDS,
  createNativeHostRuntimeProvider,
  type NativeHostAdapter,
  type NativeHostActionPacket,
  type NativeHostAdapterResult,
  type NativeWorkspaceRef,
  type SessionBinding,
} from "../src/hufu/codex-native-host.js";
import { type SessionBindingRef } from "../src/hufu/loopx-bridge.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const ENVELOPE_REF = {
  content_digest: `sha256:${"c".repeat(64)}`,
  envelope_id: "env-native-1",
};
const FIXED_NOW = "2026-08-23T12:00:00.000Z";
const TRANSCRIPT_DECOY = "SECRET_TRANSCRIPT_BYTES_MUST_NOT_LEAK";

function workspaceRef(overrides: Partial<NativeWorkspaceRef> = {}): NativeWorkspaceRef {
  return {
    authority_ref: "grant:demo",
    branch_ref: "branch:main",
    channel: "codex-app-main",
    work_item_ref: "wi-native-1",
    workspace_ref: "ws:demo",
    worktree_ref: "wt:demo",
    ...overrides,
  };
}

function asCode(error: unknown): string | undefined {
  return error instanceof CommandError ? error.code : undefined;
}

async function rejectCode(
  fn: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(fn, (error: unknown) => {
    assert.equal(asCode(error), code, error instanceof Error ? error.message : String(error));
    return true;
  });
}

function fakeAppAdapter(
  hooks: {
    onDispatch?: (packet: NativeHostActionPacket) => void;
    result?: (packet: NativeHostActionPacket) => Partial<NativeHostAdapterResult>;
  } = {},
): NativeHostAdapter {
  let turns = 0;
  return {
    capability_id: "codex_app",
    dispatch(packet) {
      hooks.onDispatch?.(packet);
      const extra = hooks.result?.(packet) ?? {};
      turns += 1;
      if (packet.action === "create_thread") {
        return {
          action: packet.action,
          delivered: true,
          delivery_evidence: true,
          host_thread_ref: "thread:opaque-1",
          idle: true,
          turn_ref: `turn:${String(turns)}`,
          ...extra,
        };
      }
      if (packet.action === "wait_threads") {
        return {
          action: packet.action,
          cursor: "cursor:1",
          idle: true,
          ...extra,
        };
      }
      if (packet.action === "observe") {
        return {
          action: packet.action,
          cursor: "cursor:1",
          idle: extra.idle ?? true,
          readback_evidence: extra.readback_evidence ?? true,
          turn_ref: extra.turn_ref ?? `turn:${String(turns)}`,
          ...extra,
        };
      }
      if (packet.action === "handoff_thread") {
        return { action: packet.action, idle: true, ...extra };
      }
      if (packet.action === "interrupt") {
        return { action: packet.action, idle: true, interrupted: true, ...extra };
      }
      return {
        action: packet.action,
        delivered: extra.delivered ?? true,
        delivery_evidence: extra.delivery_evidence ?? true,
        idle: extra.idle ?? false,
        turn_ref: extra.turn_ref ?? `turn:${String(turns)}`,
        ...extra,
      };
    },
  };
}

async function startedApp(adapter: NativeHostAdapter = fakeAppAdapter()): Promise<{
  binding: SessionBinding;
  provider: ReturnType<typeof createNativeHostRuntimeProvider>;
}> {
  const provider = createNativeHostRuntimeProvider({
    capability: "codex_app",
    hostAdapter: adapter,
    now: () => new Date(FIXED_NOW),
  });
  const binding = await provider.start(ENVELOPE_REF, "owner", workspaceRef(), "start-1");
  return { binding, provider };
}

function walkTs(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      found.push(...walkTs(path));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      found.push(path);
    }
  }
  return found;
}

describe("Codex NativeHost RuntimeProvider + SessionBinding (#59)", () => {
  it("maps Consumer actions only as documentary capability ids", () => {
    assert.deepEqual([...HOST_CAPABILITY_IDS], [
      "codex_app",
      "codex_cli",
      "claude_chat",
      "attached",
    ]);
    assert.equal(CODEX_CONSUMER_MAPPING.start, "create_thread");
    assert.equal(CODEX_CONSUMER_MAPPING.send, "send_message_to_thread");
    assert.equal(CODEX_CONSUMER_MAPPING.resume, "send_message_to_thread");
    assert.equal(CODEX_CONSUMER_MAPPING.wait, "wait_threads");
    assert.equal(CODEX_CONSUMER_MAPPING.handoff, "handoff_thread");
    assert.equal(CODEX_CONSUMER_MAPPING.interrupt, "interrupt");
    assert.equal(CODEX_CONSUMER_MAPPING.observe, "observe");
  });

  it("fail-closes capabilities and start/send when no host adapter is injected", async () => {
    const provider = createNativeHostRuntimeProvider();
    const report = provider.capabilities();
    assert.equal(report.host_adapter_present, false);
    for (const id of HOST_CAPABILITY_IDS) {
      assert.equal(report.capabilities[id].declared, false, id);
      assert.equal(report.capabilities[id].observed, false, id);
      assert.equal(report.capabilities[id].qualified, false, id);
    }
    await rejectCode(
      () => provider.start(ENVELOPE_REF, "owner", workspaceRef(), "start-1"),
      "HOST_RUNTIME_UNAVAILABLE",
    );
    await rejectCode(
      () =>
        provider.send({ binding_id: "missing", generation: 1 }, { message_ref: "msg:1" }, true, "send-1"),
      "HOST_RUNTIME_UNAVAILABLE",
    );
    const source = readFileSync(join(root, "src/hufu/codex-native-host.ts"), "utf8");
    assert.doesNotMatch(source, /codex\s+exec/);
    assert.doesNotMatch(source, /subagent/);
    assert.doesNotMatch(source, /from\s+["']loopx["']/);
  });

  it("declared App without observed/qualified adapter still fail-closes and does not downgrade to CLI", async () => {
    const provider = createNativeHostRuntimeProvider({ capability: "codex_app" });
    const report = provider.capabilities();
    assert.equal(report.capabilities.codex_app.declared, true);
    assert.equal(report.capabilities.codex_app.observed, false);
    assert.equal(report.capabilities.codex_app.qualified, false);
    assert.equal(report.capabilities.codex_cli.qualified, false);
    await rejectCode(
      () => provider.start(ENVELOPE_REF, "owner", workspaceRef(), "start-1"),
      "HOST_RUNTIME_UNAVAILABLE",
    );
  });

  it("start/send/wait/observe/readback/release with an injected App adapter and idempotent start", async () => {
    const actions: string[] = [];
    const adapter = fakeAppAdapter({
      onDispatch(packet) {
        actions.push(packet.action);
      },
    });
    const { binding, provider } = await startedApp(adapter);
    assert.equal(binding.authority_ref, "grant:demo");
    assert.equal(binding.work_item_ref, "wi-native-1");
    assert.equal(binding.role, "owner");
    assert.equal(binding.workspace_ref, "ws:demo");
    assert.equal(binding.worktree_ref, "wt:demo");
    assert.equal(binding.branch_ref, "branch:main");
    assert.equal(binding.generation, 1);
    assert.equal(binding.fence, 1);
    assert.equal(binding.host_thread_ref, "thread:opaque-1");
    assert.equal(binding.created_at, FIXED_NOW);
    assert.equal(binding.observed_at, FIXED_NOW);
    assert.ok(binding.capability_digest.startsWith("sha256:"));
    assert.ok(binding.current_turn_ref);
    assert.ok(binding.binding_id);

    const sent = await provider.send(binding, { message_ref: "msg:1" }, true, "send-1");
    assert.notEqual(sent.delivery, "delivered");
    const waited = await provider.wait(binding, "cursor:0", { timeout_ms: 250 });
    assert.equal(waited.idle, true);
    const observed = await provider.observe(binding);
    const readback = await provider.readback(binding);
    assert.equal(readback.delivery, "delivered");
    const released = await provider.release(binding, true, "release-1");
    assert.equal(released.released, true);
    assert.ok(observed.observed_at);
    assert.deepEqual(actions, [
      "create_thread",
      "send_message_to_thread",
      "wait_threads",
      "observe",
      "observe",
    ]);

    const replay = await provider.start(ENVELOPE_REF, "owner", workspaceRef(), "start-1");
    assert.equal(replay.binding_id, binding.binding_id);
    assert.equal(replay.generation, binding.generation);
  });

  it("rejects a second start on the same authority/work-item/role/channel or returns the same generation", async () => {
    const { binding, provider } = await startedApp();
    const same = await provider.start(ENVELOPE_REF, "owner", workspaceRef(), "start-1");
    assert.equal(same.generation, binding.generation);
    await rejectCode(
      () => provider.start(ENVELOPE_REF, "owner", workspaceRef(), "start-other"),
      "SESSION_BINDING_CONFLICT",
    );
  });

  it("rejects send/result/close from a stale generation after succession (ABA)", async () => {
    const { binding, provider } = await startedApp();
    await provider.handoff(binding, "handoff-1");
    const successor = await provider.start(
      ENVELOPE_REF,
      "owner",
      workspaceRef({ supersedes: { binding_id: binding.binding_id, generation: binding.generation } }),
      "start-2",
    );
    assert.ok(successor.generation > binding.generation);
    const stale: SessionBindingRef = {
      binding_id: binding.binding_id,
      generation: binding.generation,
    };
    await rejectCode(
      () => provider.send(stale, { message_ref: "msg:stale" }, true, "send-stale"),
      "SESSION_GENERATION_STALE",
    );
    await rejectCode(() => provider.release(stale, true, "release-stale"), "SESSION_GENERATION_STALE");
  });

  it("requires handoff before a successor with supersedes can start", async () => {
    const { binding, provider } = await startedApp();
    await rejectCode(
      () =>
        provider.start(
          ENVELOPE_REF,
          "owner",
          workspaceRef({
            supersedes: { binding_id: binding.binding_id, generation: binding.generation },
          }),
          "start-2",
        ),
      "SESSION_HANDOFF_REQUIRED",
    );
    const receipt = await provider.handoff(binding, "handoff-1");
    assert.equal(receipt.handed_off, true);
    const successor = await provider.start(
      ENVELOPE_REF,
      "owner",
      workspaceRef({
        supersedes: { binding_id: binding.binding_id, generation: binding.generation },
      }),
      "start-2",
    );
    assert.equal(successor.supersedes?.binding_id, binding.binding_id);
    assert.equal(successor.supersedes?.generation, binding.generation);
    assert.ok(successor.parent === undefined || successor.parent.binding_id === binding.binding_id);
  });

  it("queues or rejects an extra send during an active turn and does not force-interrupt", async () => {
    const actions: string[] = [];
    const adapter = fakeAppAdapter({
      onDispatch(packet) {
        actions.push(packet.action);
      },
      result(packet) {
        if (packet.action === "send_message_to_thread") {
          return { idle: false };
        }
        return {};
      },
    });
    const { binding, provider } = await startedApp(adapter);
    await provider.send(binding, { message_ref: "msg:1" }, true, "send-1");
    try {
      const extra = await provider.send(binding, { message_ref: "msg:2" }, true, "send-2");
      assert.equal(extra.queued, true);
      assert.notEqual(extra.delivery, "delivered");
    } catch (error) {
      assert.equal(asCode(error), "SESSION_TURN_BUSY");
    }
    assert.equal(actions.includes("interrupt"), false);
  });

  it("waits once with a bounded timeout and does not tight-poll", async () => {
    let waitCalls = 0;
    const adapter = fakeAppAdapter({
      onDispatch(packet) {
        if (packet.action === "wait_threads") {
          waitCalls += 1;
          assert.equal(packet.timeout_ms, 250);
        }
      },
    });
    const { binding, provider } = await startedApp(adapter);
    await provider.send(binding, { message_ref: "msg:1" }, true, "send-1");
    const waited = await provider.wait(binding, "cursor:0", { timeout_ms: 250 });
    assert.equal(waited.idle, true);
    assert.equal(waitCalls, 1);
    const source = readFileSync(join(root, "src/hufu/codex-native-host.ts"), "utf8");
    assert.doesNotMatch(source, /while\s*\(\s*true\s*\)/);
    assert.doesNotMatch(source, /setInterval\s*\(/);
    assert.doesNotMatch(source, /for\s*\(\s*;\s*;\s*\)/);
  });

  it("does not let a CLI provider satisfy App-only capabilities", async () => {
    const dispatched: string[] = [];
    const cliAdapter: NativeHostAdapter = {
      capability_id: "codex_cli",
      dispatch(packet) {
        dispatched.push(packet.action);
        return { action: packet.action };
      },
    };
    const provider = createNativeHostRuntimeProvider({
      capability: "codex_cli",
      hostAdapter: cliAdapter,
    });
    const report = provider.capabilities();
    assert.equal(report.capabilities.codex_cli.declared, true);
    assert.equal(report.capabilities.codex_cli.observed, true);
    assert.equal(report.capabilities.codex_cli.qualified, true);
    assert.equal(report.capabilities.codex_app.qualified, false);
    await rejectCode(
      () => provider.start(ENVELOPE_REF, "owner", workspaceRef(), "start-1"),
      "HOST_CAPABILITY_REJECTED",
    );
    assert.equal(dispatched.includes("create_thread"), false);
  });

  it("does not let Claude Chat start a write-construction session", async () => {
    const dispatched: string[] = [];
    const provider = createNativeHostRuntimeProvider({
      capability: "claude_chat",
      hostAdapter: {
        capability_id: "claude_chat",
        dispatch(packet) {
          dispatched.push(packet.action);
          return { action: packet.action };
        },
      },
    });
    const report = provider.capabilities();
    assert.equal(report.capabilities.claude_chat.declared, true);
    assert.equal(report.capabilities.claude_chat.qualified, true);
    assert.equal(report.write_construction, false);
    await rejectCode(
      () => provider.start(ENVELOPE_REF, "owner", workspaceRef(), "start-1"),
      "HOST_CAPABILITY_REJECTED",
    );
    assert.equal(dispatched.includes("create_thread"), false);
  });

  it("does not let an attached provider create a session", async () => {
    const dispatched: string[] = [];
    const provider = createNativeHostRuntimeProvider({
      capability: "attached",
      hostAdapter: {
        capability_id: "attached",
        dispatch(packet) {
          dispatched.push(packet.action);
          return { action: packet.action, host_thread_ref: "thread:existing" };
        },
      },
    });
    assert.equal(provider.capabilities().create_session, false);
    await rejectCode(
      () => provider.start(ENVELOPE_REF, "owner", workspaceRef(), "start-1"),
      "HOST_CAPABILITY_REJECTED",
    );
    assert.equal(dispatched.includes("create_thread"), false);
  });

  it("cannot claim delivered or awake without delivery/readback evidence", async () => {
    const adapter = fakeAppAdapter({
      result(packet) {
        if (packet.action === "send_message_to_thread") {
          return { delivered: false, delivery_evidence: false, idle: false };
        }
        if (packet.action === "observe") {
          return { idle: false, readback_evidence: false };
        }
        return {};
      },
    });
    const { binding, provider } = await startedApp(adapter);
    const sent = await provider.send(binding, { message_ref: "msg:1" }, true, "send-1");
    assert.notEqual(sent.delivery, "delivered");
    const readback = await provider.readback(binding);
    assert.notEqual(readback.delivery, "delivered");
    assert.notEqual(readback.wake, "observed");
  });

  it("does not persist or return transcript bytes in journal or receipts", async () => {
    const { binding, provider } = await startedApp();
    await provider.send(binding, { message_ref: "msg:1" }, true, "send-1");
    await provider.wait(binding, "cursor:0", { timeout_ms: 50 });
    const observed = await provider.observe(binding);
    const readback = await provider.readback(binding);
    const dump = JSON.stringify({
      binding,
      journal: provider.journal(),
      observed,
      readback,
      receipts: provider.receipts(),
    });
    assert.equal(dump.includes(TRANSCRIPT_DECOY), false);
    assert.doesNotMatch(dump, /transcript/i);
    assert.doesNotMatch(dump, /SECRET_TRANSCRIPT/);
  });

  it("keeps 008/bridge off the host runtime and does not add a loopx dependency", () => {
    const engine = readFileSync(join(root, "src/hufu/engine-loopx.ts"), "utf8");
    const bridge = readFileSync(join(root, "src/hufu/loopx-bridge.ts"), "utf8");
    const native = readFileSync(join(root, "src/hufu/codex-native-host.ts"), "utf8");
    assert.doesNotMatch(engine, /codex-native-host/);
    assert.doesNotMatch(bridge, /codex-native-host/);
    assert.doesNotMatch(native, /from\s+["']loopx["']/);
    assert.doesNotMatch(native, /createGoal|heartbeat|schedule|hufu serve/);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version?: string;
      dependencies?: Record<string, string>;
    };
    assert.equal(pkg.version, "0.1.0");
    assert.equal(pkg.dependencies?.["loopx"], undefined);
    for (const path of walkTs(join(root, "src"))) {
      const text = readFileSync(path, "utf8");
      assert.doesNotMatch(text, /from\s+["']loopx["']/);
    }
    assert.equal(existsSync(join(root, "vendor/loopx")), false);
  });
});
