import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  connectOpenGrant,
  parseStdout,
  recordDefaultHandoff,
  recordEnvelope,
  recordPacket,
  recordPilotFromFixture,
  statusView,
  withTempDir,
} from "./decision-harness.js";

function ledgerPayload(dir: string): Record<string, unknown> {
  const events = readFileSync(join(dir, ".hufu", "ledger", "events.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const recorded = events.filter((event) => event["event_type"] === "hufu/pilot.recorded");
  return recorded[recorded.length - 1]?.["payload"] as Record<string, unknown>;
}

function derivedSlot(
  payload: Record<string, unknown>,
  name: string,
): Record<string, unknown> {
  const derived = payload["derived_metrics"] as Record<string, unknown>;
  return derived[name] as Record<string, unknown>;
}

describe("pilot metrics", () => {
  it("derives coordination wakeups and rework from events and rejects missing zeros", () => {
    withTempDir((dir) => {
      const { grant_id } = connectOpenGrant(dir);
      const packet = recordPacket(dir, grant_id);
      recordEnvelope(dir, packet);
      recordDefaultHandoff(dir);
      const result = recordPilotFromFixture(dir, "net-benefit.json");
      assert.equal(result.status, 0, result.stdout);
      const payload = ledgerPayload(dir);
      const wakeups = derivedSlot(payload, "coordination_wakeups");
      const rework = derivedSlot(payload, "rework");
      assert.equal(wakeups["availability"], "available");
      assert.equal(wakeups["origin"], "measured");
      assert.equal(wakeups["value"], 3);
      assert.equal(rework["availability"], "available");
      assert.equal(rework["value"], 0);
      assert.notEqual(wakeups["value"], null);
    });
  });

  it("marks zero-effect data_insufficient without a window and counts one with an empty window", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      recordDefaultHandoff(dir);
      const withoutWindow = recordPilotFromFixture(dir, "net-benefit.json");
      assert.equal(withoutWindow.status, 0, withoutWindow.stdout);
      const missing = derivedSlot(ledgerPayload(dir), "zero_effect_attempts");
      assert.equal(missing["availability"], "data_insufficient");
      assert.equal(missing["value"], null);
      assert.notEqual(missing["value"], 0);

      const seq = Number(
        (parseStdout(withoutWindow.stdout)["result"] as Record<string, unknown>)[
          "ledger_seq"
        ],
      );
      const withWindow = recordPilotFromFixture(dir, "net-benefit-round-2.json", {
        observation_window: { from_ledger_seq: 1, to_ledger_seq: seq },
      });
      assert.equal(withWindow.status, 0, withWindow.stdout);
      const counted = derivedSlot(ledgerPayload(dir), "zero_effect_attempts");
      assert.equal(counted["availability"], "available");
      assert.equal(counted["value"], 1);
    });
  });

  it("does not mark estimated usage as measured and does not emit 0 for missing native usage", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      recordDefaultHandoff(dir);
      const rejected = recordPilotFromFixture(dir, "estimated-as-measured.json");
      assert.equal(rejected.status, 2);
      const error = parseStdout(rejected.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "PILOT_INVALID");

      const recorded = recordPilotFromFixture(dir, "net-benefit.json");
      assert.equal(recorded.status, 0, recorded.stdout);
      const metrics = ledgerPayload(dir)["metrics"] as Record<string, unknown>;
      const native = metrics["native_usage"] as Record<string, unknown>;
      assert.notEqual(native["availability"], "available");
      assert.equal(native["value"], null);
      assert.notEqual(native["value"], 0);
      const view = JSON.stringify(statusView(dir));
      assert.doesNotMatch(view, /"native_usage":\s*0/);
    });
  });
});
