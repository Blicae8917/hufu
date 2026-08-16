import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createIsolatedHufuHost } from "hufu-dsh";
import {
  CONNECT_ARGS,
  hufuDshDir,
  withIsolatedDirs,
} from "./helpers.js";

describe("unmount", () => {
  it("revokes tools and keeps the ledger", async () => {
    await withIsolatedDirs(async ({ workspace }) => {
      const host = await createIsolatedHufuHost();
      const connected = await host.invoke("hufu.connect", {
        workspaceRoot: workspace,
        ...CONNECT_ARGS,
      });
      assert.equal(connected.ok, true);
      const ledger = join(workspace, ".hufu", "ledger", "events.jsonl");
      assert.equal(existsSync(ledger), true);
      await host.dispose();
      assert.equal(host.get("hufu"), undefined);
      assert.deepEqual([...host.listTools()], []);
      const after = await host.invoke("hufu.status", {
        workspaceRoot: workspace,
      });
      assert.equal(after.ok, false);
      assert.equal(existsSync(ledger), true);

      const again = await createIsolatedHufuHost();
      try {
        const status = await again.invoke("hufu.status", {
          workspaceRoot: workspace,
        });
        assert.equal(status.ok, true);
        const view = status.result as Record<string, unknown>;
        const project = view["project"] as Record<string, unknown>;
        const value = project["value"] as Record<string, unknown>;
        assert.equal(value["project_id"], "demo");
      } finally {
        await again.dispose();
      }
    });
  });

  it("does not treat a remaining package directory as proof that tools are loaded", async () => {
    const host = await createIsolatedHufuHost();
    await host.dispose();
    assert.equal(existsSync(hufuDshDir), true);
    assert.equal(host.get("hufu"), undefined);
  });
});
