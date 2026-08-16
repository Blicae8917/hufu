import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CONNECT_ARGS,
  bindEngine,
  connectOpenGrant,
  engineFixture,
  parseStdout,
  runHufu,
  statusView,
  withTempDir,
  writeJson,
} from "./decision-harness.js";

function engineBoundCount(dir: string): number {
  return readFileSync(join(dir, ".hufu", "ledger", "events.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter((line) => line.includes("hufu/engine.bound")).length;
}

describe("hufu decide --engine", () => {
  it("binds loopx-mechanisms without networking and keeps task_authority", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      const bound = bindEngine(dir);
      assert.equal(bound["engine_id"], "loopx-mechanisms");
      assert.equal(typeof bound["ledger_seq"], "number");
      const view = statusView(dir);
      const engine = view["engine"] as Record<string, unknown>;
      const value = engine["value"] as Record<string, unknown>;
      assert.equal(engine["availability"], "available");
      assert.equal(value["engine_id"], "loopx-mechanisms");
      const taskAuthority = view["task_authority"] as Record<string, unknown>;
      assert.equal(taskAuthority["value"], "local");
      assert.notEqual(taskAuthority["value"], "loopx-mechanisms");
    });
  });

  it("is idempotent for the same engine_id", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      const first = bindEngine(dir);
      const second = bindEngine(dir);
      assert.equal(second["engine_id"], first["engine_id"]);
      assert.equal(second["ledger_seq"], first["ledger_seq"]);
      assert.equal(engineBoundCount(dir), 1);
    });
  });

  it("rejects an unknown engine_id with CONTRACT_INVALID", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      const path = writeJson(dir, "engine.json", { engine_id: "not-an-engine" });
      const result = runHufu(
        ["decide", "--actor", "human:alice", "--engine", path],
        dir,
      );
      assert.equal(result.status, 2);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "CONTRACT_INVALID");
      assert.equal(engineBoundCount(dir), 0);
    });
  });

  it("rejects connect --task-authority loopx with TASK_AUTHORITY_UNSUPPORTED", () => {
    withTempDir((dir) => {
      const args: string[] = [...CONNECT_ARGS];
      const index = args.indexOf("local");
      args[index] = "loopx";
      const result = runHufu(args, dir);
      assert.equal(result.status, 2);
      const error = parseStdout(result.stdout)["error"] as Record<string, unknown>;
      assert.equal(error["code"], "TASK_AUTHORITY_UNSUPPORTED");
    });
  });

  it("marks unbound engine slots data_insufficient and omits engine_no_progress", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      const view = statusView(dir);
      for (const key of ["engine", "typed_result", "receipt"] as const) {
        const slot = view[key] as Record<string, unknown>;
        assert.equal(slot["availability"], "data_insufficient");
        assert.equal(slot["value"], null);
        assert.notEqual(slot["value"], 0);
      }
      const guardrails = view["execution_guardrails"] as Record<string, unknown>;
      assert.equal(
        (guardrails["value"] as string[]).includes("engine_no_progress"),
        false,
      );
      assert.equal(
        JSON.stringify(engineFixture("engine.json")),
        JSON.stringify({ engine_id: "loopx-mechanisms" }),
      );
    });
  });
});
