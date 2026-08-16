import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { CommandError } from "../../src/hufu/errors.js";
import {
  applyPatch,
  hufuRowPresent,
  loadListedBundle,
  packageHasBundle,
  parseCordisPatchYaml,
  readBundlePatchOrThrow,
} from "hufu-dsh";
import { fixtureDir, hufuDshDir } from "./helpers.js";

describe("plugin bundle contract", () => {
  it("declares dsh.bundle.patch and a self-contained isolate insert", () => {
    const manifest = JSON.parse(
      readFileSync(join(hufuDshDir, "package.json"), "utf8"),
    ) as {
      dsh?: { bundle?: { patch?: string } };
    };
    assert.equal(manifest.dsh?.bundle?.patch, "./cordis.patch.yml");
    assert.equal(existsSync(join(hufuDshDir, "cordis.patch.yml")), true);
    const rows = loadListedBundle(hufuDshDir);
    assert.equal(hufuRowPresent(rows), true);
    const row = rows[0];
    assert.equal(row?.id, "hufu");
    assert.equal(row?.name, "hufu-dsh");
    assert.equal(row?.runtime, "isolate");
    assert.deepEqual(row?.inject, ["hufu"]);
  });

  it("does not enable a plain dependency that has no bundle", () => {
    const plainDir = join(fixtureDir, "plain-dep");
    assert.equal(packageHasBundle(plainDir), false);
    assert.equal(hufuRowPresent([]), false);
  });

  it("fails closed when a listed package has no valid bundle", () => {
    const invalidDir = join(fixtureDir, "invalid-bundle");
    assert.throws(
      () => readBundlePatchOrThrow(invalidDir),
      (error: unknown) =>
        error instanceof CommandError && error.code === "CONTRACT_INVALID",
    );
  });

  it("fails closed when an incomplete user patch replaces the hufu row", () => {
    const rows = loadListedBundle(hufuDshDir);
    const overlay = parseCordisPatchYaml(
      readFileSync(join(fixtureDir, "incomplete-hufu-override.yml"), "utf8"),
    );
    const replaced = overlay.reduce(applyPatch, rows);
    assert.equal(hufuRowPresent(replaced), false);
    assert.equal(replaced[0]?.runtime, undefined);
    assert.equal(replaced[0]?.inject, undefined);
  });
});
