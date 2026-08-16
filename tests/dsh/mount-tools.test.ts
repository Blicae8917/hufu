import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createIsolatedHufuHost } from "hufu-dsh";
import { openWorkItem } from "../../src/hufu/work-item.js";
import { CONNECT_ARGS, hufuDshDir, withIsolatedDirs } from "./helpers.js";

const TOOLS = [
  "hufu.validate",
  "hufu.connect",
  "hufu.doctor",
  "hufu.status",
  "hufu.handoff",
  "hufu.decide",
] as const;

describe("mount tools", () => {
  it("registers six hufu.* tools that call the domain layer", async () => {
    await withIsolatedDirs(async ({ workspace }) => {
      const host = await createIsolatedHufuHost();
      try {
        assert.deepEqual([...host.listTools()].sort(), [...TOOLS].sort());
        const connected = await host.invoke("hufu.connect", {
          workspaceRoot: workspace,
          ...CONNECT_ARGS,
        });
        assert.equal(connected.ok, true);
        const status = await host.invoke("hufu.status", {
          workspaceRoot: workspace,
        });
        assert.equal(status.ok, true);
        const view = status.result as Record<string, unknown>;
        assert.equal(view["view_schema_version"], 1);
        const doctor = await host.invoke("hufu.doctor", {
          workspaceRoot: workspace,
        });
        assert.equal(doctor.ok, true);
        openWorkItem(workspace, {
          objective: "Exercise plugin decide",
          terminal_conditions: ["receipt has digest"],
          work_item_id: "wi-1",
        });
        const connectResult = connected.result as {
          grant_id: string;
          grant_revision: number;
        };
        const decided = await host.invoke("hufu.decide", {
          actor: "human:alice",
          kind: "packet",
          payload: {
            acceptance_metric: "digest present",
            authoritative_state: {
              freshness: "not_applicable",
              observed_at: "2026-08-16T00:00:00.000Z",
              task_ref: "wi-1",
            },
            authority_scope_ref: {
              grant_id: connectResult.grant_id,
              revision: connectResult.grant_revision,
            },
            business_outcome: "Record one canonical decision",
            decision_id: "decision-plugin",
            evidence_as_of: "2026-08-16T00:00:00.000Z",
            non_goals: ["copy issue body"],
            recheck_when: {
              at_or_after: "2026-01-01T00:00:00.000Z",
              type: "wall_clock",
            },
            simplest_safe_route: "record packet",
            true_stoplines: ["do not write back issues"],
            unknowns: ["runtime token usage"],
            verified_facts: [
              {
                evidence_ref: "ev-connect",
                proposition: "workspace is connected",
              },
            ],
            version: 1,
          },
          workspaceRoot: workspace,
        });
        assert.equal(decided.ok, true);
        const receipt = decided.result as Record<string, unknown>;
        assert.equal(receipt["version"], 1);
        assert.match(String(receipt["content_digest"]), /^sha256:[0-9a-f]{64}$/);
        assert.equal(
          Object.prototype.hasOwnProperty.call(receipt, "business_outcome"),
          false,
        );
      } finally {
        await host.dispose();
      }
    });
  });

  it("does not spawn the hufu CLI", () => {
    const source = readFileSync(join(hufuDshDir, "src", "tools.ts"), "utf8");
    assert.doesNotMatch(source, /spawnSync|spawn\(|execFile|execSync/);
    assert.doesNotMatch(source, /hufu\/main/);
  });

  it("returns CommandError bodies for invalid tool input", async () => {
    const host = await createIsolatedHufuHost();
    try {
      const result = await host.invoke("hufu.status", {});
      assert.equal(result.ok, false);
      assert.equal(result.error?.code, "CONTRACT_INVALID");
      assert.equal(result.error?.schema_version, "1");
    } finally {
      await host.dispose();
    }
  });
});
