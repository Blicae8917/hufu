import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { EVENT_TYPES } from "../src/hufu/envelope.js";
import { CommandError } from "../src/hufu/errors.js";
import { validatePilotRecordInput } from "../src/hufu/pilot-schema.js";
import {
  connectOpenGrant,
  parseStdout,
  recordDefaultHandoff,
  recordPilotFromFixture,
  runHufu,
  statusView,
  withTempDir,
  writeJson,
  pilotFixture,
} from "./decision-harness.js";

function ledgerText(dir: string): string {
  return readFileSync(join(dir, ".hufu", "ledger", "events.jsonl"), "utf8");
}

function assertPilotInvalid(name: string): void {
  assert.throws(
    () => validatePilotRecordInput(pilotFixture(name)),
    (error: unknown) =>
      error instanceof CommandError && error.code === "PILOT_INVALID",
  );
}

describe("pilot record schema", () => {
  it("rejects an illegal conclusion, missing quality, missing zero, and estimated measured usage", () => {
    assertPilotInvalid("invalid-conclusion.json");
    assertPilotInvalid("missing-quality.json");
    assertPilotInvalid("missing-as-zero.json");
    assertPilotInvalid("estimated-as-measured.json");
    assertPilotInvalid("usage-as-success.json");
  });

  it("registers hufu/pilot.recorded without a system timestamp field in the payload contract", () => {
    assert.equal(EVENT_TYPES.includes("hufu/pilot.recorded"), true);
  });
});

describe("hufu pilot --record", () => {
  it("records NET_BENEFIT after handoff and projects the pilot slot", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      recordDefaultHandoff(dir);
      const result = recordPilotFromFixture(dir, "net-benefit.json");
      assert.equal(result.status, 0, result.stdout);
      const payload = parseStdout(result.stdout)["result"] as Record<string, unknown>;
      assert.equal(payload["pilot_id"], "pilot-001");
      assert.equal(payload["conclusion"], "NET_BENEFIT");
      assert.equal(payload["work_item_id"], "wi-1");
      assert.doesNotMatch(result.stdout, /bound_at|recorded_at/);
      const events = ledgerText(dir)
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const recorded = events.filter(
        (event) => event["event_type"] === "hufu/pilot.recorded",
      );
      assert.equal(recorded.length, 1);
      assert.equal(recorded[0]?.["idempotency_key"], "hufu/pilot.recorded:pilot-001");
      const eventPayload = recorded[0]?.["payload"] as Record<string, unknown>;
      assert.equal("occurred_at" in eventPayload, false);
      assert.equal("bound_at" in eventPayload, false);
      const view = statusView(dir);
      const pilot = view["pilot"] as Record<string, unknown>;
      const value = pilot["value"] as Record<string, unknown>;
      assert.equal(pilot["availability"], "available");
      assert.equal(value["pilot_id"], "pilot-001");
      assert.equal(value["conclusion"], "NET_BENEFIT");
    });
  });

  it("returns DATA_INSUFFICIENT when the work item has no handoff", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      const result = recordPilotFromFixture(dir, "net-benefit.json");
      assert.equal(result.status, 4);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "DATA_INSUFFICIENT");
    });
  });

  it("returns ROLE_NOT_ACTIVE for an actor that is not commander or project_lead", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      recordDefaultHandoff(dir);
      const result = recordPilotFromFixture(
        dir,
        "net-benefit.json",
        {},
        "human:bob",
      );
      assert.equal(result.status, 2);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "ROLE_NOT_ACTIVE");
    });
  });

  it("is idempotent for the same pilot_id and conflicts on a different payload", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      recordDefaultHandoff(dir);
      const first = recordPilotFromFixture(dir, "net-benefit.json");
      const second = recordPilotFromFixture(dir, "net-benefit.json");
      assert.equal(first.status, 0, first.stdout);
      assert.equal(second.status, 0, second.stdout);
      const firstResult = parseStdout(first.stdout)["result"] as Record<string, unknown>;
      const secondResult = parseStdout(second.stdout)["result"] as Record<
        string,
        unknown
      >;
      assert.equal(secondResult["ledger_seq"], firstResult["ledger_seq"]);
      assert.equal(
        ledgerText(dir).split("\n").filter((line) => line.includes("hufu/pilot.recorded"))
          .length,
        1,
      );
      const changed = writeJson(dir, "pilot-changed.json", {
        ...pilotFixture("net-benefit.json"),
        conclusion: "TRADEOFF",
      });
      const conflict = runHufu(
        ["pilot", "--actor", "human:alice", "--record", changed],
        dir,
      );
      assert.equal(conflict.status, 3);
      const error = parseStdout(conflict.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "LEDGER_DIGEST_CONFLICT");
    });
  });

  it("marks unrecorded pilot slots data_insufficient and not 0", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      const view = statusView(dir);
      for (const key of ["pilot", "expansion_gate"] as const) {
        const slot = view[key] as Record<string, unknown>;
        assert.equal(slot["availability"], "data_insufficient");
        assert.equal(slot["value"], null);
        assert.notEqual(slot["value"], 0);
      }
    });
  });
});
