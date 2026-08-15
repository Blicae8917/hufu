import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { projectCurrentView } from "../src/hufu/projector.js";
import { openWorkItem, requireReadyEvents } from "../src/hufu/work-item.js";

const mainJs = fileURLToPath(new URL("../src/hufu/main.js", import.meta.url));

const CONNECT_ARGS = [
  "connect",
  "--project-id",
  "demo",
  "--repository",
  "https://example.com/demo.git",
  "--task-authority",
  "local",
  "--commander",
  "human:alice",
  "--grant-scope",
  "local ledger and handoff",
] as const;

function runHufu(args: readonly string[], cwd: string) {
  return spawnSync(process.execPath, [mainJs, ...args], {
    cwd,
    encoding: "utf8",
    env: process.env,
  });
}

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "hufu-replay-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseStdout(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe("CurrentView replay", () => {
  it("returns the same work items, grant revision, and project lead across three projections and three status calls", () => {
    withTempDir((dir) => {
      assert.equal(runHufu(CONNECT_ARGS, dir).status, 0);
      openWorkItem(dir, {
        objective: "Implement local ledger commands",
        terminal_conditions: ["tests pass"],
        work_item_id: "wi-1",
      });

      const projected = [0, 1, 2].map(() =>
        projectCurrentView(requireReadyEvents(dir)),
      );
      const statuses = [0, 1, 2].map(() => {
        const result = runHufu(["status"], dir);
        assert.equal(result.status, 0, result.stderr);
        return parseStdout(result.stdout)["result"] as Record<string, unknown>;
      });

      const first = projected[0];
      const firstStatus = statuses[0];
      if (first === undefined || firstStatus === undefined) {
        throw new Error("expected replay samples");
      }
      for (const view of projected) {
        assert.deepEqual(
          view.work_items.map((item) => item.work_item_id),
          first.work_items.map((item) => item.work_item_id),
        );
        assert.equal(
          view.authorization_grant.value?.revision,
          first.authorization_grant.value?.revision,
        );
        assert.equal(
          view.project_lead.value?.binding_id,
          first.project_lead.value?.binding_id,
        );
      }
      for (const view of statuses) {
        const grant = view["authorization_grant"] as {
          value: { revision: number };
        };
        const lead = view["project_lead"] as {
          value: { binding_id: string };
        };
        const workItems = view["work_items"] as Array<{ work_item_id: string }>;
        const firstGrant = firstStatus["authorization_grant"] as {
          value: { revision: number };
        };
        const firstLead = firstStatus["project_lead"] as {
          value: { binding_id: string };
        };
        const firstItems = firstStatus["work_items"] as Array<{
          work_item_id: string;
        }>;
        assert.deepEqual(
          workItems.map((item) => item.work_item_id),
          firstItems.map((item) => item.work_item_id),
        );
        assert.equal(grant.value.revision, firstGrant.value.revision);
        assert.equal(lead.value.binding_id, firstLead.value.binding_id);
      }
    });
  });
});
