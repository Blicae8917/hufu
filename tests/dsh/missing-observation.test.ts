import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { stableStringify } from "../../src/hufu/errors.js";
import { createIsolatedHufuHost } from "hufu-dsh";
import { CONNECT_ARGS, withIsolatedDirs } from "./helpers.js";

describe("missing observations", () => {
  it("keeps session and run unavailable and never writes 0", async () => {
    await withIsolatedDirs(async ({ workspace }) => {
      const host = await createIsolatedHufuHost();
      try {
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
        for (const key of ["session", "run"] as const) {
          const slot = view[key] as Record<string, unknown>;
          assert.notEqual(slot["availability"], "available");
          assert.equal(slot["value"], null);
          assert.notEqual(slot["value"], 0);
        }
        const encoded = stableStringify(view);
        assert.doesNotMatch(encoded, /"session":\{[^}]*"value":0/);
        assert.doesNotMatch(encoded, /"run":\{[^}]*"value":0/);
        assert.equal(
          Object.prototype.hasOwnProperty.call(view, "token_usage"),
          false,
        );
      } finally {
        await host.dispose();
      }
    });
  });
});
