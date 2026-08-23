import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)),
    "utf8",
  );
}

describe("Windows run-shape and pack-surface isolation (#53)", () => {
  it("isolates POSIX executable-bit checks from the Windows PASS contract", () => {
    const toolchain = readRepo("tests/toolchain.test.ts");
    assert.match(toolchain, /win32/);
    assert.match(toolchain, /executable|0o111|statSync|skip/i);
    assert.match(
      toolchain,
      /Windows|win32/,
    );
  });

  it("keeps npm pack-surface assertions path-separator safe", () => {
    const pack = readRepo("tests/workdir-pack.test.ts");
    assert.match(pack, /replace\(\/\\\\\/g,\s*"\/"\)|replaceAll\(|posix|win32/);
    assert.match(pack, /npm\.cmd|win32|shell/);
    assert.match(
      pack,
      /if \(process\.platform === "win32"\) \{\s*return;/,
      "live npm pack stays on POSIX; Windows PASS is the declared files field",
    );
  });

  it("records an explicit GitHub Actions Windows PASS job", () => {
    const workflow = readRepo(".github/workflows/ci.yml");
    assert.match(workflow, /windows-latest/);
    assert.match(workflow, /pnpm test/);
    assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
    assert.equal(
      existsSync(
        fileURLToPath(new URL("../../.github/workflows/ci.yml", import.meta.url)),
      ),
      true,
    );
  });
});
