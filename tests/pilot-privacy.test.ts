import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { validatePilotRecordInput } from "../src/hufu/pilot-schema.js";
import { CommandError } from "../src/hufu/errors.js";
import {
  connectOpenGrant,
  parseStdout,
  pilotFixture,
  recordDefaultHandoff,
  recordPilotFromFixture,
  statusView,
  withTempDir,
} from "./decision-harness.js";

const root = fileURLToPath(new URL("../..", import.meta.url));

function assertPilotInvalid(name: string): void {
  assert.throws(
    () => validatePilotRecordInput(pilotFixture(name)),
    (error: unknown) =>
      error instanceof CommandError && error.code === "PILOT_INVALID",
  );
}

describe("pilot privacy boundary", () => {
  it("rejects absolute paths, internal project names, and credential shapes", () => {
    assertPilotInvalid("absolute-path.json");
    assertPilotInvalid("windows-path.json");
    assertPilotInvalid("internal-project.json");
    assertPilotInvalid("credential.json");
  });

  it("emits a sanitized aggregate without per-work-item usage details", () => {
    withTempDir((dir) => {
      connectOpenGrant(dir);
      recordDefaultHandoff(dir);
      const result = recordPilotFromFixture(dir, "net-benefit.json");
      assert.equal(result.status, 0, result.stdout);
      const payload = parseStdout(result.stdout)["result"] as Record<string, unknown>;
      const aggregate = payload["aggregate"] as Record<string, unknown>;
      assert.equal(aggregate["comparison_class"], "loopx-bound-decide");
      assert.deepEqual(Object.keys(aggregate).sort(), [
        "comparison_class",
        "conclusion_counts",
        "method_ref",
        "metric_names",
      ]);
      const counts = aggregate["conclusion_counts"] as Record<string, unknown>;
      assert.equal(counts["NET_BENEFIT"], 1);
      assert.equal(payload["native_usage"], undefined);
      assert.doesNotMatch(result.stdout, /1200/);
      assert.doesNotMatch(result.stdout, /\/home\//);
      assert.doesNotMatch(result.stdout, /AcmeInternalCRM/);
      assert.doesNotMatch(JSON.stringify(statusView(dir)), /\/home\//);
    });
  });

  it("does not add gitignored research directories and keeps fixtures path-free", () => {
    const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
    assert.doesNotMatch(gitignore, /^pilots\/$/m);
    assert.doesNotMatch(gitignore, /^research-data\/$/m);
    assert.equal(existsSync(join(root, "pilots")), false);
    assert.equal(existsSync(join(root, "research-data")), false);
    const fixtureDir = fileURLToPath(
      new URL("../../tests/fixtures/pilot", import.meta.url),
    );
    const names = ["net-benefit.json", "tradeoff.json", "data-insufficient.json"];
    for (const name of names) {
      const text = readFileSync(join(fixtureDir, name), "utf8");
      assert.doesNotMatch(text, /\/home\//);
      assert.doesNotMatch(text, /[A-Za-z]:\\/);
    }
  });
});
