import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  CONNECT_ARGS,
  connectOpenGrant,
  parseStdout,
  recordDefaultHandoff,
  recordPilotFromFixture,
  runHufu,
  statusView,
  withTempDir,
} from "./decision-harness.js";

function sourceText(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("pilot expansion gate", () => {
  it("keeps the gate closed before three rounds and rejects serve without listening", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      recordDefaultHandoff(dir);
      const recorded = recordPilotFromFixture(dir, "net-benefit.json");
      assert.equal(recorded.status, 0, recorded.stdout);
      const gate = (
        statusView(dir)["expansion_gate"] as Record<string, unknown>
      )["value"] as Record<string, unknown>;
      assert.equal(gate["status"], "closed");
      assert.equal(gate["web_implemented"], false);
      assert.equal(gate["serve_allowed"], false);
      const served = runHufu(["serve"], dir);
      assert.equal(served.status, 2);
      const error = parseStdout(served.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "EXPANSION_GATE_CLOSED");
      assert.doesNotMatch(
        sourceText("../../src/hufu/cli.ts"),
        /createServer|\.listen\(/,
      );
    });
  });

  it("opens evaluation after three NET_BENEFIT rounds but still refuses serve", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      recordDefaultHandoff(dir);
      assert.equal(recordPilotFromFixture(dir, "net-benefit-round-1.json").status, 0);
      assert.equal(recordPilotFromFixture(dir, "net-benefit-round-2.json").status, 0);
      const third = recordPilotFromFixture(dir, "net-benefit-round-3.json");
      assert.equal(third.status, 0, third.stdout);
      const result = parseStdout(third.stdout)["result"] as Record<string, unknown>;
      const gate = result["expansion_gate"] as Record<string, unknown>;
      assert.equal(gate["status"], "evaluation_allowed");
      assert.equal(gate["web_implemented"], false);
      assert.equal(gate["serve_allowed"], false);
      const served = runHufu(["serve"], dir);
      assert.equal(served.status, 2);
      const error = parseStdout(served.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "EXPANSION_GATE_CLOSED");
    });
  });

  it("pauses after three NO_NET_BENEFIT rounds and rejects web task_authority", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      recordDefaultHandoff(dir);
      assert.equal(
        recordPilotFromFixture(dir, "no-net-benefit-round-1.json").status,
        0,
      );
      assert.equal(
        recordPilotFromFixture(dir, "no-net-benefit-round-2.json").status,
        0,
      );
      const third = recordPilotFromFixture(dir, "no-net-benefit-round-3.json");
      assert.equal(third.status, 0, third.stdout);
      const gate = (
        parseStdout(third.stdout)["result"] as Record<string, unknown>
      )["expansion_gate"] as Record<string, unknown>;
      assert.equal(gate["status"], "paused");

      const tradeoff = recordPilotFromFixture(dir, "tradeoff.json", {
        comparison_class: "other-class",
        pilot_id: "pilot-tradeoff-other",
      });
      assert.equal(tradeoff.status, 0, tradeoff.stdout);
      const tradeoffGate = (
        parseStdout(tradeoff.stdout)["result"] as Record<string, unknown>
      )["expansion_gate"] as Record<string, unknown>;
      assert.equal(tradeoffGate["status"], "closed");
    });

    withTempDir((dir) => {
      for (const authority of ["web", "ui", "dashboard"] as const) {
        const args: string[] = [...CONNECT_ARGS];
        const index = args.indexOf("local");
        args[index] = authority;
        const connected = runHufu(args, dir);
        assert.equal(connected.status, 2, authority);
        const error = parseStdout(connected.stdout)["error"] as Record<string, unknown>;
        assert.equal(error["code"], "TASK_AUTHORITY_UNSUPPORTED");
      }
    });
  });
});
