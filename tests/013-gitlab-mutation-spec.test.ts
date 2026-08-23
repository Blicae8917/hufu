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

const KIT_DIR = "specs/013-gitlab-mutation";
const KIT_FILES = [
  `${KIT_DIR}/spec.md`,
  `${KIT_DIR}/plan.md`,
  `${KIT_DIR}/tasks.md`,
  `${KIT_DIR}/research.md`,
  `${KIT_DIR}/checklists/requirements.md`,
] as const;

describe("013 GitLabTaskMutationProvider kit (#57)", () => {
  it("lands the kit and cites #57 plus ADR 0007 with the five mutation kinds", () => {
    for (const relative of KIT_FILES) {
      assert.equal(existsSync(repoPath(relative)), true, relative);
    }
    const spec = readRepo(`${KIT_DIR}/spec.md`);
    assert.match(spec, /#57/);
    assert.match(spec, /ADR 0007/);
    assert.match(spec, /GitLabTaskMutationProvider/);
    assert.match(spec, /append_comment/);
    assert.match(spec, /transition_managed_status_label/);
    assert.match(spec, /set_assignee/);
    assert.match(spec, /close_issue/);
    assert.match(spec, /reopen_issue/);
    assert.match(spec, /preview/);
    assert.match(spec, /execute/);
    assert.match(spec, /readback/);
    assert.match(spec, /transport_security_exception_ref/);
    assert.match(spec, /gitlab\.example\.com/);
    assert.match(spec, /http:\/\/192\.0\.2\.10:41101/);
    assert.match(spec, /IMPLEMENTATION_COMPLETE/);
    assert.match(spec, /NO_GO/);
    assert.match(spec, /0\.1\.0/);
    assert.match(readRepo(`${KIT_DIR}/tasks.md`), /T001/);
    assert.match(readRepo(`${KIT_DIR}/tasks.md`), /gitlab-task-mutation-provider\.test\.ts/);
  });
});
