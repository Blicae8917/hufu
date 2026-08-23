import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { connectWorkspace } from "../src/hufu/connect.js";
import { decideWorkspace } from "../src/hufu/decide.js";
import { CommandError } from "../src/hufu/errors.js";
import {
  acceptTypedResult,
  assertAuthorityCrossing,
  assertDecisionCrossing,
  assertEvidenceCrossing,
  bridgePort,
  isBridgeEnabled,
  prepareOutboundTurn,
  projectBridgeSnapshot,
  type BridgePort,
} from "../src/hufu/loopx-bridge.js";
import { readLedger } from "../src/hufu/storage.js";
import {
  basePacket,
  bindEngine,
  connectOpenGrant,
  recordEnvelope,
  recordPacket,
  statusView,
  withTempDir,
} from "./decision-harness.js";

const mainJs = fileURLToPath(new URL("../src/hufu/main.js", import.meta.url));
const root = fileURLToPath(new URL("../..", import.meta.url));
const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;
const EXAMPLE_TASK_REF = "gitlab:example-group/example-project#456";
const EXAMPLE_ISSUE_BODY = "This is a GitLab issue body that must not cross.";
const GRANT_SCOPE = "local ledger and handoff";

type ForbiddenCommands = Extract<
  keyof BridgePort,
  "schedule" | "heartbeat" | "quota" | "startAgent" | "createGoal"
>;
const noEngineCommands: [ForbiddenCommands] extends [never] ? true : false = true;

function legalAuthority(grantId: string): Record<string, unknown> {
  return {
    authority_scope_ref: { grant_id: grantId, revision: 1 },
    freshness: "fresh",
    observed_at: "2026-08-23T00:00:00.000Z",
    session_binding_ref: { binding_id: "bind-example", generation: 1 },
    source_revision: "rev-example",
    task_authority: "gitlab",
    task_ref: EXAMPLE_TASK_REF,
  };
}

function legalEnvelopeRef(): Record<string, unknown> {
  return {
    content_digest: DIGEST_B,
    decision_ref: {
      content_digest: DIGEST_A,
      decision_id: "decision-demo",
      version: 1,
    },
    envelope_id: "env-example",
  };
}

function assertCode(fn: () => unknown, code: string): void {
  assert.throws(fn, (error: unknown) => {
    if (!(error instanceof CommandError)) {
      return false;
    }
    assert.equal(error.code, code, error.message);
    return true;
  });
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

describe("LoopX bridge surface (#58)", () => {
  it("lets only the allowed refs pass through", () => {
    const authority = assertAuthorityCrossing(legalAuthority("grant-example"));
    const decision = assertDecisionCrossing({
      content_digest: DIGEST_A,
      decision_id: "decision-demo",
      execution_envelope_ref: legalEnvelopeRef(),
      version: 1,
    });
    const evidence = assertEvidenceCrossing({
      availability: "available",
      evidence_ref: "ev-example",
      fact_class: "observed",
      freshness: "fresh",
      observed_at: "2026-08-23T00:00:00.000Z",
      effect_ref: { effect_id: "eff-example" },
      receipt_ref: { receipt_id: "rcpt-example" },
      typed_result_ref: { result_id: "tr-example" },
    });
    assert.deepEqual(Object.keys(authority).sort(), [
      "authority_scope_ref",
      "freshness",
      "observed_at",
      "session_binding_ref",
      "source_revision",
      "task_authority",
      "task_ref",
    ]);
    assert.equal(decision.execution_envelope_ref?.envelope_id, "env-example");
    assert.equal(evidence.typed_result_ref?.result_id, "tr-example");
    const turn = prepareOutboundTurn(legalEnvelopeRef());
    assert.equal(turn.turn_kind, "run_once");
    assert.equal(turn.max_invocations, 1);
    assert.equal(turn.envelope_ref.envelope_id, "env-example");
  });

  it("rejects each forbidden payload class", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...legalAuthority("g-1"), body: EXAMPLE_ISSUE_BODY }, "BRIDGE_LIFECYCLE_REJECTED"],
      [{ ...legalAuthority("g-1"), scope_text: GRANT_SCOPE }, "BRIDGE_AUTHORITY_REJECTED"],
      [{ ...legalAuthority("g-1"), issuer_id: "human:alice" }, "BRIDGE_AUTHORITY_REJECTED"],
      [
        { content_digest: DIGEST_A, decision_id: "d1", version: 1, business_outcome: "done" },
        "BRIDGE_AUTHORITY_REJECTED",
      ],
      [
        { content_digest: DIGEST_A, decision_id: "d1", version: 1, DECISION_PACKET: { business_outcome: "x" } },
        "BRIDGE_AUTHORITY_REJECTED",
      ],
      [
        { ...legalAuthority("g-1"), goal_id: "goal-1", todo_id: "todo-1", registry: {} },
        "BRIDGE_CONTROL_PLANE_REJECTED",
      ],
      [{ ...legalAuthority("g-1"), quota: 10, scheduler: {}, heartbeat: true }, "BRIDGE_CONTROL_PLANE_REJECTED"],
      [{ ...legalAuthority("g-1"), host_transcript: "agent said ok" }, "BRIDGE_AUTHORITY_REJECTED"],
      [{ ...legalAuthority("g-1"), token: "glpat-EXAMPLE0001token" }, "BRIDGE_AUTHORITY_REJECTED"],
      [{ journal: "done", authority_scope_ref: { grant_id: "g-1", revision: 2 } }, "BRIDGE_AUTHORITY_REJECTED"],
    ];
    for (const [payload, code] of cases) {
      assertCode(() => assertAuthorityCrossing(payload), code);
    }
    assertCode(
      () =>
        assertDecisionCrossing({
          content_digest: DIGEST_A,
          decision_id: "d1",
          version: 1,
          EXECUTION_ENVELOPE: { executor_principal_id: "human:alice" },
        }),
      "BRIDGE_AUTHORITY_REJECTED",
    );
    assertCode(
      () =>
        assertEvidenceCrossing({
          availability: "available",
          evidence_ref: "ev-1",
          fact_class: "observed",
          freshness: "fresh",
          observed_result: "applied",
        }),
      "BRIDGE_AUTHORITY_REJECTED",
    );
  });

  it("projects a snapshot of refs and digests only", () => {
    withTempDir((dir) => {
      const connected = connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: GRANT_SCOPE,
        projectId: "demo",
        repository: "https://example.com/demo.git",
        taskAuthority: "local",
      });
      const packet = recordPacket(dir, connected.grant_id);
      const envelope = recordEnvelope(dir, packet);
      bindEngine(dir);
      decideWorkspace(dir, {
        actor: "human:alice",
        kind: "result",
        payload: {
          decision_id: packet["decision_id"],
          envelope_id: envelope["envelope_id"],
          kind: "progress",
          observed_at: "2026-08-23T00:00:00.000Z",
          turn_ref: "turn-example",
        },
      });
      const ledger = readLedger(dir);
      if (ledger.status === "missing") {
        throw new Error("ledger missing");
      }
      const fromEvents = projectBridgeSnapshot(ledger.events);
      const fromView = projectBridgeSnapshot(statusView(dir));
      for (const snapshot of [fromEvents, fromView]) {
        const text = JSON.stringify(snapshot);
        assert.match(snapshot.content_digest, /^sha256:[0-9a-f]{64}$/);
        assert.equal(typeof snapshot.authority_scope_ref?.grant_id, "string");
        assert.equal(typeof snapshot.decision_ref?.decision_id, "string");
        assert.doesNotMatch(text, new RegExp(GRANT_SCOPE));
        assert.doesNotMatch(text, /Record one canonical decision/);
        assert.doesNotMatch(text, /rewrite the github issue/);
        assert.doesNotMatch(text, /"ok":true/);
        assert.doesNotMatch(text, /"scope_text"/);
        assert.doesNotMatch(text, /"business_outcome"/);
        assert.doesNotMatch(text, /"body"/);
        assert.doesNotMatch(text, /glpat-|ghp_|sk-/);
      }
    });
  });

  it("does not let TypedResult expand AuthorizationGrant", () => {
    withTempDir((dir) => {
      const { grant_id, grant_revision } = connectOpenGrant(dir);
      const accepted = acceptTypedResult({ result_id: "tr-example" });
      assert.equal(accepted.inferred_grant, false);
      assert.equal(accepted.grant_revision_unchanged, true);
      assertCode(
        () =>
          acceptTypedResult({
            grant_id,
            kind: "progress",
            result_id: "tr-example",
            scope_text: "bigger grant",
          }),
        "BRIDGE_AUTHORITY_REJECTED",
      );
      const ledger = readLedger(dir);
      if (ledger.status === "missing") {
        throw new Error("ledger missing");
      }
      const grants = ledger.events.filter(
        (event) => event.event_type === "hufu/authorization_grant.issued",
      );
      assert.equal(grants.length, 1);
      assert.equal(Number(grants[0]?.payload["revision"]), grant_revision);
    });
  });

  it("does not add serve, consult, goal, wave, or bridge commands", () => {
    assert.equal(noEngineCommands, true);
    const serve = spawnSync(process.execPath, [mainJs, "serve"], {
      encoding: "utf8",
      env: { ...process.env, HUFU_DENY_NETWORK: "1" },
    });
    assert.equal(serve.status, 2);
    assert.match(serve.stdout, /EXPANSION_GATE_CLOSED/);
    for (const command of ["consult", "goal", "todo", "wave", "bridge", "scheduler", "heartbeat"]) {
      const result = spawnSync(process.execPath, [mainJs, command], {
        encoding: "utf8",
        env: { ...process.env, HUFU_DENY_NETWORK: "1" },
      });
      assert.equal(result.status, 1, command);
      assert.match(result.stderr, /unknown command/);
    }
  });

  it("keeps 008 optional and not task_authority, with no scheduler or heartbeat module", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      bindEngine(dir);
      const ledger = readLedger(dir);
      if (ledger.status === "missing") {
        throw new Error("ledger missing");
      }
      assert.equal(isBridgeEnabled(ledger.events), false);
      const connected = ledger.events.find((event) => event.event_type === "hufu/project.connected");
      assert.equal(connected?.payload["task_authority"], "local");
    });
    assert.equal(existsSync(join(root, "src/hufu/scheduler.ts")), false);
    assert.equal(existsSync(join(root, "src/hufu/heartbeat.ts")), false);
    assert.equal(existsSync(join(root, "src/hufu/goal.ts")), false);
    assert.equal(existsSync(join(root, "src/hufu/codex-native-host.ts")), false);
    const bridge = readFileSync(join(root, "src/hufu/loopx-bridge.ts"), "utf8");
    assert.doesNotMatch(bridge, /while\s*\(\s*true\s*\)/);
    assert.doesNotMatch(bridge, /setInterval\s*\(/);
    assert.doesNotMatch(bridge, /createGitLabTaskMutationProvider/);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version?: string;
      dependencies?: Record<string, string>;
    };
    assert.equal(pkg.version, "0.1.0");
    assert.equal(pkg.dependencies?.["loopx"], undefined);
    for (const path of walkTs(join(root, "src"))) {
      const text = readFileSync(path, "utf8");
      assert.doesNotMatch(text, /from\s+["']loopx["']/);
      assert.doesNotMatch(text, /192\.168\.|10\.\d+\.\d+\.\d+|glpat-[A-Za-z0-9]/);
    }
  });

  it("prepares one run-once bounded Turn and does not start a scheduler", () => {
    const first = prepareOutboundTurn(legalEnvelopeRef());
    const second = prepareOutboundTurn(legalEnvelopeRef());
    assert.equal(first.turn_kind, "run_once");
    assert.equal(first.max_invocations, 1);
    assert.equal(second.max_invocations, 1);
    assert.notEqual(first, second);
    assertCode(
      () =>
        prepareOutboundTurn({
          ...legalEnvelopeRef(),
          scheduler: { every: "1s" },
        }),
      "BRIDGE_CONTROL_PLANE_REJECTED",
    );
    assertCode(
      () =>
        prepareOutboundTurn({
          ...legalEnvelopeRef(),
          executor_principal_id: "human:alice",
          work_item_ids: ["wi-1"],
        }),
      "BRIDGE_AUTHORITY_REJECTED",
    );
    assert.equal("schedule" in bridgePort, false);
    assert.equal("heartbeat" in bridgePort, false);
  });
});
