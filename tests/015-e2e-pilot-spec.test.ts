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

const KIT_DIR = "specs/015-e2e-pilot";
const KIT_FILES = [
  `${KIT_DIR}/spec.md`,
  `${KIT_DIR}/plan.md`,
  `${KIT_DIR}/tasks.md`,
  `${KIT_DIR}/research.md`,
  `${KIT_DIR}/checklists/requirements.md`,
] as const;

describe("015 e2e pilot outline kit (#60)", () => {
  it("lands the outline and keeps the fixture public-safe", () => {
    for (const relative of KIT_FILES) {
      assert.equal(existsSync(repoPath(relative)), true, relative);
    }
    const spec = readRepo(`${KIT_DIR}/spec.md`);
    assert.match(spec, /#60/);
    assert.match(spec, /#57/);
    assert.match(spec, /#58/);
    assert.match(spec, /#59/);
    assert.match(spec, /一个父/);
    assert.match(spec, /四个子/);
    assert.match(spec, /comment→label→assignee→close|comment → label → assignee → close/);
    assert.match(spec, /gitlab\.example\.com/);
    assert.match(spec, /http:\/\/192\.0\.2\.10:41101/);
    assert.match(spec, /Goal\/Todo/);
    assert.match(spec, /IMPLEMENTATION_COMPLETE/);
    assert.match(spec, /NO_GO/);
    assert.match(spec, /0\.1\.0/);
    assert.doesNotMatch(spec, /本票实现 PM Engine|本票交付 Wave Engine/);
    assert.match(readRepo(`${KIT_DIR}/tasks.md`), /T001/);
  });
});
