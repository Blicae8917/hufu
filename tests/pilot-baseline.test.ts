import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { METRIC_SLOT_NAMES, PILOT_CONCLUSIONS } from "../src/hufu/pilot-schema.js";

const root = fileURLToPath(new URL("../..", import.meta.url));

function readRepo(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)),
    "utf8",
  );
}

describe("first-round efficiency pilot baseline (#39)", () => {
  it("publishes a redacted method note, aggregate, and the three slot gaps", () => {
    const text = readRepo("docs/pilot-baseline.md");
    assert.match(text, /本轮结论[^\n]*`DATA_INSUFFICIENT`|本轮结论[^\n]*`TRADEOFF`/);
    assert.match(text, /NET_BENEFIT/);
    assert.match(text, /留给有对比对象的后续轮次|留给后续对比/);
    assert.match(text, /1\s*轮基线\s*\+\s*3\s*轮对比/);
    assert.match(text, /comparison_class/);
    assert.match(text, /conclusion_counts/);
    assert.match(text, /metric_names/);
    assert.match(text, /method_ref/);
    assert.match(text, /普通修复升级\s*PM|升级 PM 的次数/);
    assert.match(text, /重复 Session|重复投递|丢回调/);
    assert.match(text, /人工接点/);
    assert.match(text, /human_coordination_time/);
    assert.match(text, /coordination_wakeups/);
    assert.match(text, /zero_effect_attempts/);
    assert.match(text, /expansion_gate/);
    assert.match(text, /closed/);
    assert.match(text, /serve_allowed/);
    for (const name of METRIC_SLOT_NAMES) {
      assert.match(text, new RegExp(name));
    }
    assert.equal(METRIC_SLOT_NAMES.length, 9);
    assert.ok(PILOT_CONCLUSIONS.includes("DATA_INSUFFICIENT"));
    assert.doesNotMatch(text, /\/home\/|\/Users\/|\/tmp\/|[A-Za-z]:\\/);
    assert.doesNotMatch(text, /ghp_|sk-[A-Za-z0-9]{8,}|xox[baprs]-/i);
    assert.doesNotMatch(text, /Internal[A-Za-z]+|internal[-_](?:project|crm|repo)/i);
    assert.doesNotMatch(text, /events\.jsonl|session_id|occurred_at/);
    assert.doesNotMatch(text, /"value":\s*0/);
  });

  it("does not check a raw pilot dump into fixtures or a research directory", () => {
    const gitignore = readFileSync(`${root}/.gitignore`, "utf8");
    assert.doesNotMatch(gitignore, /^pilots\/$/m);
    assert.doesNotMatch(gitignore, /^research-data\/$/m);
    const fixtures = readRepo("tests/fixtures/pilot/data-insufficient.json");
    assert.match(fixtures, /"pilot_id": "pilot-data-insufficient"/);
    assert.doesNotMatch(fixtures, /pilot-baseline-r1/);
  });
});
