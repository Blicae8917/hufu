import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function repoPath(relativePath: string): string {
  return fileURLToPath(new URL(`../../${relativePath}`, import.meta.url));
}

function readRepo(relativePath: string): string {
  return readFileSync(repoPath(relativePath), "utf8");
}

const KIT_DIR = "specs/014-codex-native-host";
const KIT_FILES = [
  `${KIT_DIR}/spec.md`,
  `${KIT_DIR}/plan.md`,
  `${KIT_DIR}/tasks.md`,
  `${KIT_DIR}/research.md`,
  `${KIT_DIR}/checklists/requirements.md`,
] as const;

describe("014 Codex NativeHost RuntimeProvider kit (#59)", () => {
  it("lands the kit and cites #59 plus the minimum host interface", () => {
    for (const relative of KIT_FILES) {
      assert.equal(existsSync(repoPath(relative)), true, relative);
    }
    const spec = readRepo(`${KIT_DIR}/spec.md`);
    assert.match(spec, /#59/);
    assert.match(spec, /ADR 0007/);
    assert.match(spec, /capabilities/);
    assert.match(spec, /create_thread/);
    assert.match(spec, /send_message_to_thread/);
    assert.match(spec, /wait_threads/);
    assert.match(spec, /handoff_thread/);
    assert.match(spec, /SessionBinding/);
    assert.match(spec, /host_thread_ref/);
    assert.match(spec, /capability_digest/);
    assert.match(spec, /失败关闭/);
    assert.match(spec, /Claude Chat/);
    assert.match(spec, /IMPLEMENTATION_COMPLETE/);
    assert.match(spec, /0\.1\.0/);
    assert.match(readRepo(`${KIT_DIR}/tasks.md`), /T001/);
    assert.match(readRepo(`${KIT_DIR}/tasks.md`), /codex-native-host-provider\.test\.ts/);
  });
});
