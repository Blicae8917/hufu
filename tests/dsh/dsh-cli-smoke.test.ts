import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const hasDsh =
  process.platform !== "win32" &&
  spawnSync("dsh", ["--help"], {
    encoding: "utf8",
    env: process.env,
  }).status === 0;

describe("optional dsh CLI smoke", () => {
  it(
    "is skipped unless dsh is on PATH in a POSIX environment",
    { skip: !hasDsh },
    () => {
      assert.equal(hasDsh, true);
    },
  );
});
