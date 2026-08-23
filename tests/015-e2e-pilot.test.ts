import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { CommandError } from "../src/hufu/errors.js";
import {
  PRODUCTION_EXECUTE_GRANTED,
  commentEffectMarker,
} from "../src/hufu/gitlab-task-mutation-provider.js";
import { projectBridgeSnapshot } from "../src/hufu/loopx-bridge.js";
import { VERSION } from "../src/hufu/version.js";
import {
  PILOT_CHILDREN,
  PILOT_CREDENTIAL,
  PILOT_EXCEPTION_REF,
  PILOT_HTTPS_ORIGIN,
  PILOT_HTTP_HOST_ORIGIN,
  PILOT_HTTP_IPV4_ORIGIN,
  PILOT_PARENT,
  PILOT_PROJECT,
  PILOT_REVISION,
  allPilotIssues,
  withPublicSafePilot,
  type PublicSafePilotWorld,
} from "./e2e-pilot-fixture.js";

const root = fileURLToPath(new URL("../..", import.meta.url));

const FORBIDDEN_HOST_RE =
  /\b(?:10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b192\.168\.\d{1,3}\.\d{1,3}\b|\b172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}\b/;
const FORBIDDEN_INVENTORY_RE = /8917|Blicae8917|hufu-prod|corp\.local|gitlab\.internal/i;
const GOAL_TODO_RE = /goal_id|todo_id|"goal"|"todo"|LoopX Goal|LoopX Todo/i;
const ZERO_FACT_RE = /"(?:token_usage|wall_clock|token_count|tokens|duration_ms)"\s*:\s*0\b/;

function asCode(error: unknown): string | undefined {
  return error instanceof CommandError ? error.code : undefined;
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) {
    return acc;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      walkFiles(path, acc);
      continue;
    }
    if (entry.isFile()) {
      acc.push(path);
    }
  }
  return acc;
}

function assertPublicSafeText(text: string, label: string): void {
  assert.doesNotMatch(text, FORBIDDEN_HOST_RE, label);
  assert.doesNotMatch(text, FORBIDDEN_INVENTORY_RE, label);
  assert.doesNotMatch(text, /glpat-[A-Za-z0-9_-]{8,}/, label);
  assert.doesNotMatch(text, /Bearer /i, label);
  assert.equal(text.includes(PILOT_CREDENTIAL), false, label);
  assert.equal(text.includes(PILOT_EXCEPTION_REF), false, label);
}

function assertNoGoalTodoLeak(text: string, label: string): void {
  assert.doesNotMatch(text, GOAL_TODO_RE, label);
}

function assertPreparedThenReadback(world: PublicSafePilotWorld, effectId: string): void {
  const events = world.ledgerEvents();
  const prepared = events.findIndex(
    (event) =>
      event.event_type === "hufu/mutation.prepared" && event.payload["effect_id"] === effectId,
  );
  const receipt = events.findIndex(
    (event) =>
      event.event_type === "hufu/mutation.receipt" && event.payload["effect_id"] === effectId,
  );
  const delta = events.findIndex(
    (event) =>
      event.event_type === "hufu/decision.effect_delta" && event.payload["effect_id"] === effectId,
  );
  assert.ok(prepared >= 0, `missing prepared for ${effectId}`);
  assert.ok(receipt >= 0, `missing receipt for ${effectId}`);
  assert.ok(delta >= 0, `missing effect delta for ${effectId}`);
  assert.ok(prepared < receipt, `prepared must precede receipt for ${effectId}`);
  assert.ok(prepared < delta, `prepared must precede effect delta for ${effectId}`);
}

function assertSingleOwnerAndSession(world: PublicSafePilotWorld): void {
  const owners = new Map<number, string>();
  for (const spec of world.issues) {
    const issue = world.issue(spec.iid);
    if (issue.assignee !== undefined) {
      assert.equal(owners.has(spec.iid), false, `dual owners on #${String(spec.iid)}`);
      owners.set(spec.iid, issue.assignee);
    }
  }
  const active = world.host
    .receipts()
    .filter((item) => {
      if (typeof item !== "object" || item === null) {
        return false;
      }
      return (item as { kind?: string }).kind === "start";
    });
  const generations = new Set(
    active.map((item) => JSON.stringify([
      (item as { binding_id?: string }).binding_id,
      (item as { generation?: number }).generation,
    ])),
  );
  assert.equal(generations.size, active.length);
}

describe("015 e2e public-safe pilot fixture (#60)", () => {
  it("describes one parent plus four children using only example.com / RFC 5737 hosts", () => {
    const issues = allPilotIssues();
    assert.equal(issues.length, 5);
    assert.equal(PILOT_PARENT.iid, 1);
    assert.equal(PILOT_PROJECT, "example/parent");
    assert.equal(PILOT_HTTPS_ORIGIN, "https://gitlab.example.com");
    assert.equal(PILOT_HTTP_IPV4_ORIGIN, "http://192.0.2.10:41101");
    assert.equal(PILOT_HTTP_HOST_ORIGIN, "http://gitlab.example.com:41101");
    assert.equal(PILOT_CHILDREN.parallelA.lane, "parallel");
    assert.equal(PILOT_CHILDREN.parallelB.lane, "parallel");
    assert.equal(PILOT_CHILDREN.serial.dependsOn, "parallel-a");
    assert.equal(PILOT_CHILDREN.stopLine.blockedOn, "user_decision");
    const corpus = JSON.stringify({
      children: PILOT_CHILDREN,
      issues,
      origins: [PILOT_HTTPS_ORIGIN, PILOT_HTTP_IPV4_ORIGIN, PILOT_HTTP_HOST_ORIGIN],
      parent: PILOT_PARENT,
      project: PILOT_PROJECT,
      revision: PILOT_REVISION,
    });
    assert.doesNotMatch(corpus, FORBIDDEN_HOST_RE);
    assert.doesNotMatch(corpus, FORBIDDEN_INVENTORY_RE);
    assert.doesNotMatch(corpus, GOAL_TODO_RE);
    assert.equal(PRODUCTION_EXECUTE_GRANTED, false);
    assert.equal(VERSION, "0.1.0");
  });

  it("1. runs two independent children in parallel", async () => {
    await withPublicSafePilot(async (world) => {
      const [left, right] = await Promise.all([
        world.executeAuthorized("append_comment", PILOT_CHILDREN.parallelA.iid),
        world.executeAuthorized("append_comment", PILOT_CHILDREN.parallelB.iid),
      ]);
      assert.equal(left.status, "applied");
      assert.equal(right.status, "applied");
      assert.equal(left.receipt?.outcome, "complete");
      assert.equal(right.receipt?.outcome, "complete");
      assert.equal(world.writeCount(PILOT_CHILDREN.parallelA.iid), 1);
      assert.equal(world.writeCount(PILOT_CHILDREN.parallelB.iid), 1);
      assertPreparedThenReadback(world, left.receipt?.effect_id ?? "");
      assertPreparedThenReadback(world, right.receipt?.effect_id ?? "");
      assertNoGoalTodoLeak(world.publicDump(), "parallel dump");
    });
  });

  it("2. enforces one serial dependency", async () => {
    await withPublicSafePilot(async (world) => {
      const blocked = await world.executeAuthorized(
        "append_comment",
        PILOT_CHILDREN.serial.iid,
      );
      assert.equal(blocked.status, "blocked");
      assert.equal(blocked.reason, "serial_predecessor");
      assert.equal(world.writeCount(PILOT_CHILDREN.serial.iid), 0);
      assert.equal(world.issue(PILOT_CHILDREN.serial.iid).state, "opened");

      const pred = await world.executeAuthorized(
        "append_comment",
        PILOT_CHILDREN.parallelA.iid,
      );
      assert.equal(pred.status, "applied");
      const serial = await world.executeAuthorized(
        "append_comment",
        PILOT_CHILDREN.serial.iid,
      );
      assert.equal(serial.status, "applied");
      assert.equal(world.writeCount(PILOT_CHILDREN.serial.iid), 1);
      assertPreparedThenReadback(world, serial.receipt?.effect_id ?? "");
    });
  });

  it("3. keeps the user-decision stop line blocked and does not auto-continue", async () => {
    await withPublicSafePilot(async (world) => {
      const blocked = await world.executeAuthorized(
        "close_issue",
        PILOT_CHILDREN.stopLine.iid,
        { acceptance_evidence_complete: true },
      );
      assert.equal(blocked.status, "blocked");
      assert.equal(blocked.reason, "user_decision");
      assert.equal(world.writeCount(PILOT_CHILDREN.stopLine.iid), 0);
      assert.equal(world.issue(PILOT_CHILDREN.stopLine.iid).state, "opened");
      assert.equal(world.comments(PILOT_CHILDREN.stopLine.iid).length, 0);
      const types = world.ledgerTypes();
      assert.equal(
        types.some((type) => type === "hufu/mutation.receipt"),
        false,
      );
    });
  });

  it("4. performs PM/Leader succession via Handoff then supersedes", async () => {
    await withPublicSafePilot(async (world) => {
      const leader = await world.startLeader();
      assert.equal(leader.generation, 1);
      assert.equal(leader.role, "project_lead");
      await assert.rejects(
        () =>
          world.host.start(
            world.envelope_ref,
            "project_lead",
            {
              authority_ref: world.grant_id,
              channel: "codex-app-main",
              supersedes: {
                binding_id: leader.binding_id,
                generation: leader.generation,
              },
              work_item_ref: `gitlab-instance:gitlab.example.com/${PILOT_PROJECT}#1`,
              workspace_ref: "ws:example-parent",
            },
            "start-lead-early",
          ),
        (error: unknown) => asCode(error) === "SESSION_HANDOFF_REQUIRED",
      );
      const handed = await world.host.handoff(leader, "handoff-lead-1");
      assert.equal(handed.handed_off, true);
      const successor = await world.host.start(
        world.envelope_ref,
        "project_lead",
        {
          authority_ref: world.grant_id,
          channel: "codex-app-main",
          supersedes: {
            binding_id: leader.binding_id,
            generation: leader.generation,
          },
          work_item_ref: `gitlab-instance:gitlab.example.com/${PILOT_PROJECT}#1`,
          workspace_ref: "ws:example-parent",
        },
        "start-lead-2",
      );
      assert.ok(successor.generation > leader.generation);
      assert.equal(successor.supersedes?.binding_id, leader.binding_id);
      assert.equal(successor.supersedes?.generation, leader.generation);
      await assert.rejects(
        () =>
          world.host.send(
            { binding_id: leader.binding_id, generation: leader.generation },
            { message_ref: "msg:stale-lead" },
            true,
            "send-stale-lead",
          ),
        (error: unknown) => asCode(error) === "SESSION_GENERATION_STALE",
      );
    });
  });

  it("5. treats a duplicate callback with the same effect_id+digest as replay", async () => {
    await withPublicSafePilot(async (world) => {
      const first = await world.execute("append_comment", PILOT_PARENT.iid);
      const second = await world.execute("append_comment", PILOT_PARENT.iid);
      assert.equal(first.outcome, "complete");
      assert.equal(second.idempotent_replay, true);
      assert.equal(second.effect_id, first.effect_id);
      assert.equal(second.canonical_payload_digest, first.canonical_payload_digest);
      assert.equal(world.writeCount(PILOT_PARENT.iid), 1);
      assert.equal(world.comments(PILOT_PARENT.iid).length, 1);
      const marker = commentEffectMarker(
        first.effect_id,
        first.canonical_payload_digest,
      );
      assert.equal(
        world.comments(PILOT_PARENT.iid).filter((body) => body.includes(marker)).length,
        1,
      );
    });
  });

  it("6. refuses a stale expected_source_revision and does not write", async () => {
    await withPublicSafePilot(async (world) => {
      await assert.rejects(
        () =>
          world.execute("set_assignee", PILOT_CHILDREN.parallelB.iid, {
            expected_source_revision: "2026-01-01T00:00:00Z",
          }),
        (error: unknown) =>
          asCode(error) === "CONTRACT_INVALID" ||
          asCode(error) === "LEDGER_CAUSALITY_CONFLICT",
      );
      assert.equal(world.writeCount(PILOT_CHILDREN.parallelB.iid), 0);
      assert.equal(world.issue(PILOT_CHILDREN.parallelB.iid).assignee, undefined);
    });
  });

  it("7. recovers a prepared Effect via readback and never blind-retries", async () => {
    await withPublicSafePilot(
      async (world) => {
        const plan = world.preview("append_comment", PILOT_PARENT.iid);
        await assert.rejects(() => world.provider.execute(plan), CommandError);
        assert.equal(world.ledgerTypes().includes("hufu/mutation.prepared"), true);
        assert.equal(world.ledgerTypes().includes("hufu/mutation.receipt"), false);
        assert.equal(world.writeCount(PILOT_PARENT.iid), 1);
        const recovered = await world.provider.execute(plan);
        assert.equal(recovered.write_performed, false);
        assert.equal(world.writeCount(PILOT_PARENT.iid), 1);
        assert.equal(world.comments(PILOT_PARENT.iid).length, 1);
        const readback = await world.provider.readback(recovered);
        assert.equal(readback.availability, "available");
        assert.equal(readback.matches_target, true);
      },
      { disconnectAfterWrite: true },
    );
  });

  it("8. treats a duplicate start on the same Session slot as CAS replay or conflict", async () => {
    await withPublicSafePilot(async (world) => {
      const first = await world.startLeader();
      const replay = await world.startLeader();
      assert.equal(replay.binding_id, first.binding_id);
      assert.equal(replay.generation, first.generation);
      await assert.rejects(
        () =>
          world.host.start(
            world.envelope_ref,
            "project_lead",
            {
              authority_ref: world.grant_id,
              channel: "codex-app-main",
              work_item_ref: `gitlab-instance:gitlab.example.com/${PILOT_PROJECT}#1`,
              workspace_ref: "ws:example-parent",
            },
            "start-lead-other",
          ),
        (error: unknown) => asCode(error) === "SESSION_BINDING_CONFLICT",
      );
    });
  });

  it("9. queues or rejects an extra message during an active Turn without force-interrupt", async () => {
    await withPublicSafePilot(async (world) => {
      const binding = await world.startLeader();
      const first = await world.host.send(
        binding,
        { message_ref: "msg:pilot-1" },
        true,
        "send-pilot-1",
      );
      assert.notEqual(first.delivery, "delivered");
      try {
        const extra = await world.host.send(
          binding,
          { message_ref: "msg:pilot-2" },
          true,
          "send-pilot-2",
        );
        assert.equal(extra.queued, true);
        assert.notEqual(extra.delivery, "delivered");
      } catch (error) {
        assert.equal(asCode(error), "SESSION_TURN_BUSY");
      }
      assert.equal(
        world.host.journal().some((entry) => entry.action === "interrupt"),
        false,
      );
    });
  });

  it("10. applies the ordered Effect chain comment → label → assignee → close", async () => {
    await withPublicSafePilot(async (world) => {
      const receipts = await world.runOrderedEffectChain(PILOT_PARENT.iid);
      assert.equal(receipts.length, 4);
      assert.deepEqual(
        receipts.map((item) => item.mutation_kind),
        [
          "append_comment",
          "transition_managed_status_label",
          "set_assignee",
          "close_issue",
        ],
      );
      for (const receipt of receipts) {
        assert.equal(receipt.outcome, "complete");
        assertPreparedThenReadback(world, receipt.effect_id);
        const readback = await world.provider.readback(receipt);
        assert.equal(readback.availability, "available");
        assert.equal(readback.matches_target, true);
      }
      const issue = world.issue(PILOT_PARENT.iid);
      assert.equal(issue.state, "closed");
      assert.equal(issue.labels.includes("status::doing"), true);
      assert.equal(issue.assignee, "example-owner");
      assert.equal(world.comments(PILOT_PARENT.iid).length, 1);
      assert.equal(world.writeCount(PILOT_PARENT.iid), 4);
      assertSingleOwnerAndSession(world);
    });
  });

  it("does not copy LoopX Goal/Todo into GitLab issues and keeps GitLab as sole issue authority", async () => {
    await withPublicSafePilot(async (world) => {
      await world.executeAuthorized("append_comment", PILOT_CHILDREN.parallelA.iid);
      const dump = world.publicDump();
      assertNoGoalTodoLeak(dump, "world dump");
      for (const spec of world.issues) {
        const issue = world.issue(spec.iid);
        assertNoGoalTodoLeak(issue.title, spec.title);
        for (const body of world.comments(spec.iid)) {
          assertNoGoalTodoLeak(body, `${spec.key} comment`);
        }
      }
      const types = world.ledgerTypes();
      assert.equal(types.includes("hufu/project.connected"), true);
      assert.equal(
        types.some((type) => /goal|todo|wave|scheduler|heartbeat/i.test(type)),
        false,
      );
      const connected = world.ledgerEvents().find(
        (event) => event.event_type === "hufu/project.connected",
      );
      assert.equal(connected?.payload["task_authority"], "gitlab");
    });
  });

  it("lets a new Session read only stable refs/digests from the bridge snapshot", async () => {
    await withPublicSafePilot(async (world) => {
      const snapshot = projectBridgeSnapshot(world.ledgerEvents());
      const text = JSON.stringify(snapshot);
      assert.ok(snapshot.content_digest.startsWith("sha256:"));
      assert.ok(snapshot.decision_ref?.decision_id);
      assert.ok(snapshot.execution_envelope_ref?.envelope_id);
      assert.doesNotMatch(text, /business_outcome|scope_text|issue body|PM long/i);
      assertNoGoalTodoLeak(text, "bridge snapshot");
      assert.doesNotMatch(text, ZERO_FACT_RE);
      const successor = await world.host.start(
        {
          content_digest: snapshot.execution_envelope_ref?.content_digest,
          envelope_id: snapshot.execution_envelope_ref?.envelope_id ?? "",
        },
        "owner",
        {
          authority_ref: world.grant_id,
          channel: "codex-app-owner",
          work_item_ref: `gitlab-instance:gitlab.example.com/${PILOT_PROJECT}#1`,
          workspace_ref: "ws:example-parent",
        },
        "start-owner-from-snapshot",
      );
      assert.equal(successor.authority_ref, world.grant_id);
      assert.doesNotMatch(JSON.stringify(successor), /true_stoplines|verified_facts/);
    });
  });

  it("reports missing facts as unavailable/data_insufficient and never writes 0", async () => {
    await withPublicSafePilot(
      async (world) => {
        const facts = world.missingFacts();
        assert.notEqual(facts.token_usage, "0");
        assert.notEqual(facts.wall_clock, "0");
        assert.match(facts.token_usage, /unavailable|data_insufficient/);
        assert.match(facts.wall_clock, /unavailable|data_insufficient/);
        await assert.rejects(
          () => world.execute("append_comment", PILOT_PARENT.iid),
          (error: unknown) =>
            asCode(error) === "OBSERVATION_UNAVAILABLE" ||
            asCode(error) === "DATA_INSUFFICIENT",
        );
        const dump = world.publicDump();
        assert.doesNotMatch(dump, ZERO_FACT_RE);
        assert.doesNotMatch(JSON.stringify(facts), ZERO_FACT_RE);
        assert.equal(world.writeCount(PILOT_PARENT.iid), 0);
      },
      { getIssueUnavailable: PILOT_PARENT.iid },
    );
  });

  it("fail-closes live execute without an injected fetch and keeps PRODUCTION_EXECUTE_GRANTED false", async () => {
    await withPublicSafePilot(
      async (world) => {
        assert.equal(PRODUCTION_EXECUTE_GRANTED, false);
        await assert.rejects(
          () => world.execute("reopen_issue", PILOT_PARENT.iid),
          (error: unknown) =>
            asCode(error) === "GRANT_SCOPE_EXCEEDED" ||
            asCode(error) === "CONTRACT_INVALID",
        );
        assert.equal(world.writeCount(), 0);
      },
      { injectFetch: false },
    );
  });

  it("still requires transport_security_exception_ref for HTTP write (test double only)", async () => {
    await withPublicSafePilot(
      async (world) => {
        assert.throws(
          () => world.preview("append_comment", PILOT_PARENT.iid),
          (error: unknown) =>
            asCode(error) === "REPOSITORY_NOT_ALLOWED" ||
            asCode(error) === "GRANT_SCOPE_EXCEEDED",
        );
        assert.equal(world.writeCount(), 0);
      },
      {
        origin: PILOT_HTTP_IPV4_ORIGIN,
        transportSecurityExceptionRef: null,
      },
    );

    await withPublicSafePilot(
      async (world) => {
        const receipt = await world.execute("append_comment", PILOT_PARENT.iid);
        assert.equal(receipt.outcome, "complete");
        assert.equal(world.writeCount(PILOT_PARENT.iid), 1);
        assertPublicSafeText(world.publicDump(), "http write dump");
      },
      {
        origin: PILOT_HTTP_IPV4_ORIGIN,
        transportSecurityExceptionRef: PILOT_EXCEPTION_REF,
      },
    );
  });

  it("stores only Decision/Envelope/Binding/Effect/Receipt/Readback and stays public-safe", async () => {
    await withPublicSafePilot(async (world) => {
      await world.runOrderedEffectChain(PILOT_PARENT.iid);
      const types = new Set(world.ledgerTypes());
      for (const required of [
        "hufu/decision.packet_recorded",
        "hufu/decision.envelope_attached",
        "hufu/mutation.prepared",
        "hufu/decision.effect_delta",
        "hufu/mutation.receipt",
      ]) {
        assert.equal(types.has(required), true, required);
      }
      assert.equal(types.has("hufu/goal.created"), false);
      assert.equal(types.has("hufu/todo.created"), false);
      const dump = world.publicDump();
      assertPublicSafeText(dump, "final dump");
      assertNoGoalTodoLeak(dump, "final dump goals");
      for (const file of walkFiles(world.workspaceRoot)) {
        const raw = readFileSync(file, "utf8");
        assertPublicSafeText(raw, file);
      }
      const fixtureSource = readFileSync(
        join(root, "tests/e2e-pilot-fixture.ts"),
        "utf8",
      );
      assert.doesNotMatch(fixtureSource, FORBIDDEN_INVENTORY_RE);
      assert.doesNotMatch(fixtureSource, FORBIDDEN_HOST_RE);
    });
  });
});
