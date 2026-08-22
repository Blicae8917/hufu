import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { METRIC_SLOT_NAMES, PILOT_CONCLUSIONS } from "../src/hufu/pilot-schema.js";

function readRepo(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)),
    "utf8",
  );
}

const OPTIONAL_ENGINE_POSITIONING =
  /LoopX 作为可选 EngineProvider 和机制来源|LoopX 作为 `engine-loopx` Provider 和机制来源|定位裁决见 #26，不在本文件作出/;

const ACCEPTED_CONTROL_PLANE =
  /完整 LoopX 控制面[、，].{0,40}仍是已接受方向|其余仍待独立 Module：关键决策会商、loopback Web Console、出站 Runtime|会商仍由后续 Module 交付/;

describe("ADR 0006 upstream positioning (#26)", () => {
  it("records maintainer choice (a) and abolishes the self-built M10-M15 plan", () => {
    assert.equal(existsSync(fileURLToPath(new URL("../../docs/adr/0006-upstream-positioning.md", import.meta.url))), true);
    const adr = readRepo("docs/adr/0006-upstream-positioning.md");
    assert.match(adr, /已接受|维护者/);
    assert.match(adr, /#26/);
    assert.match(adr, /方案 \(a\)|\(a\)/);
    assert.match(adr, /LoopX 下游|严格项目协调 Provider/);
    assert.match(adr, /M10[–-]M15|M10－M15/);
    assert.match(adr, /Goal/);
    assert.match(adr, /Todo/);
    assert.match(adr, /Scheduler/);
    assert.match(adr, /Heartbeat/);
    assert.match(adr, /PM Engine/);
    assert.match(adr, /Wave Engine/);
    assert.match(adr, /Web 控制面|完整 Web/);
    assert.match(adr, /GitLab AuthorityProvider/);
    assert.match(adr, /Authority\s*[/、]\s*Decision\s*[/、]\s*Evidence/);
    assert.match(adr, /Renderer/);
    assert.match(adr, /不授权|不得现在实现|不是实现授权/);
    assert.doesNotMatch(adr, /NET_BENEFIT/);
    assert.match(adr, /DATA_INSUFFICIENT|TRADEOFF/);
    assert.doesNotMatch(adr, /\/home\/|\/Users\/|[A-Za-z]:\\/);
    assert.doesNotMatch(adr, /ghp_|sk-[A-Za-z0-9]{8,}|xox[baprs]-/i);
  });

  it("clears conflicting positioning from SPEC, COMPATIBILITY, ADR 0003, README, and AGENTS", () => {
    const spec = readRepo("docs/SPEC.md");
    const compatibility = readRepo("docs/COMPATIBILITY.md");
    const adr0003 = readRepo("docs/adr/0003-cordis-first-plugin-architecture.md");
    const readme = readRepo("README.md");
    const agents = readRepo("AGENTS.md");
    const changelog = readRepo("CHANGELOG.md");
    const architecture = readRepo("docs/ARCHITECTURE.md");

    assert.doesNotMatch(spec, /^状态：候选，待 `0\.1\.0` 设计 Pull Request 接受$/m);
    assert.match(spec, /ADR 0006/);
    assert.match(spec, /LoopX 下游|严格项目协调 Provider/);
    assert.doesNotMatch(spec, OPTIONAL_ENGINE_POSITIONING);
    assert.doesNotMatch(spec, ACCEPTED_CONTROL_PLANE);
    assert.doesNotMatch(spec, /其余仍待独立 Module：关键决策会商/);

    assert.match(compatibility, /ADR 0006/);
    assert.doesNotMatch(compatibility, /定位裁决见 #26，不在本文件作出/);
    assert.match(compatibility, /LoopX 下游|严格项目协调 Provider/);

    assert.match(adr0003, /ADR 0006/);
    assert.doesNotMatch(adr0003, /LoopX 作为 `engine-loopx` Provider 和机制来源/);
    assert.doesNotMatch(
      adr0003,
      /完整能力可以按 EngineProvider 分阶段评估/,
    );

    assert.match(readme, /ADR 0006|LoopX 下游|严格项目协调/);
    assert.doesNotMatch(readme, ACCEPTED_CONTROL_PLANE);
    assert.doesNotMatch(agents, OPTIONAL_ENGINE_POSITIONING);
    assert.doesNotMatch(changelog, /会商仍由后续 Module 交付/);
    assert.match(architecture, /ADR 0006/);
    assert.doesNotMatch(architecture, /LoopX 是可选 `engine-loopx` Provider 和机制来源/);
  });

  it("records the positioning efficiency judgment against the #39 baseline without inventing NET_BENEFIT", () => {
    const text = readRepo("docs/pilot-positioning.md");
    assert.match(text, /#26|#39|ADR 0006/);
    assert.match(text, /docs\/pilot-baseline\.md/);
    assert.match(text, /本轮结论[^\n]*`DATA_INSUFFICIENT`|本轮结论[^\n]*`TRADEOFF`/);
    assert.doesNotMatch(text, /本轮结论[^\n]*`NET_BENEFIT`/);
    assert.match(text, /comparison_class/);
    assert.match(text, /conclusion_counts/);
    assert.match(text, /metric_names/);
    assert.match(text, /method_ref/);
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
    const baseline = readRepo("docs/pilot-baseline.md");
    assert.doesNotMatch(baseline, /关闭 #26 时仍须另一次带对比的/);
  });
});
