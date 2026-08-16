import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { stableStringify } from "../../src/hufu/errors.js";
import { createIsolatedHufuHost } from "hufu-dsh";
import { fixtureDir, mainJs, withIsolatedDirs, writeLedger } from "./helpers.js";

function runStatus(cwd: string): Record<string, unknown> {
  const result = spawnSync(process.execPath, [mainJs, "status"], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

describe("current view parity", () => {
  it("folds the same fixture three times from each entry", async () => {
    const events = readFileSync(join(fixtureDir, "events.jsonl"), "utf8");
    await withIsolatedDirs(async ({ workspace }) => {
      writeLedger(workspace, events);
      const host = await createIsolatedHufuHost();
      try {
        const cliViews: string[] = [];
        const pluginViews: string[] = [];
        for (let index = 0; index < 3; index += 1) {
          const cli = runStatus(workspace)["result"];
          const plugin = await host.invoke("hufu.status", {
            workspaceRoot: workspace,
          });
          assert.equal(plugin.ok, true);
          cliViews.push(stableStringify(cli));
          pluginViews.push(stableStringify(plugin.result));
        }
        assert.equal(new Set(cliViews).size, 1);
        assert.equal(new Set(pluginViews).size, 1);
        assert.equal(cliViews[0], pluginViews[0]);
        const view = JSON.parse(cliViews[0] ?? "{}") as Record<string, unknown>;
        assert.equal(view["view_schema_version"], 1);
        const decision = view["decision"] as Record<string, unknown>;
        const decisionValue = decision["value"] as Record<string, unknown>;
        assert.equal(typeof decisionValue["decision_id"], "string");
        assert.equal(typeof decisionValue["version"], "number");
        assert.equal(typeof decisionValue["content_digest"], "string");
        assert.doesNotMatch(cliViews[0] ?? "", /business_outcome/);
        assert.doesNotMatch(cliViews[0] ?? "", /Record one canonical decision/);
        const guardrails = view["execution_guardrails"] as Record<string, unknown>;
        assert.equal(typeof guardrails["availability"], "string");
      } finally {
        await host.dispose();
      }
    });
  });
});
