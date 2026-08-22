import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)),
    "utf8",
  );
}

describe("0.1.0 release documentation (#29)", () => {
  it("dates CHANGELOG 0.1.0 and drops unpublished wording from VERSION and README", () => {
    const changelog = readRepo("CHANGELOG.md");
    const versionDoc = readRepo("VERSION.md");
    const readme = readRepo("README.md");

    assert.match(changelog, /^## \[0\.1\.0\] - 2026-08-23$/m);
    assert.doesNotMatch(changelog, /^## \[0\.1\.0\] - 未发布$/m);
    assert.doesNotMatch(changelog, /合入不等于 `0\.1\.0` 已发布/);

    assert.match(versionDoc, /Current version: `0\.1\.0`/);
    assert.doesNotMatch(versionDoc, /尚未发布/);
    assert.doesNotMatch(versionDoc, /必须完成对应验收后\s*才能标记为正式发布/);

    assert.doesNotMatch(readme, /尚未发布的 `0\.1\.0`|尚未发布/);
    assert.doesNotMatch(readme, /合入不等于 `0\.1\.0` 已发布/);
    assert.match(readme, /ADR 0006|LoopX 下游|严格项目协调/);

    const spec = readRepo("docs/SPEC.md");
    const architecture = readRepo("docs/ARCHITECTURE.md");
    assert.doesNotMatch(spec, /`0\.1\.0` 仍未发布/);
    assert.doesNotMatch(spec, /不表示 `0\.1\.0` 已发布/);
    assert.doesNotMatch(architecture, /`0\.1\.0` 仍未发布/);
    assert.doesNotMatch(
      architecture,
      /不表示 `0\.1\.0` 已正式发布|不等于 `0\.1\.0` 已正式发布|或 `0\.1\.0` 已正式发布/,
    );
    assert.match(spec, /ADR 0006/);
    assert.match(architecture, /ADR 0006/);
  });

  it("keeps the release-gate bar as the four-command local-plus-GitHub slice", () => {
    const readme = readRepo("README.md");
    const spec = readRepo("docs/SPEC.md");

    assert.match(readme, /四个有界命令/);
    assert.match(readme, /`local` JSONL 正本/);
    assert.match(readme, /GitHub 只读投影/);
    assert.match(
      spec,
      /`connect`、`doctor`、`status`、\s*`handoff` 四个有界命令/,
    );
    assert.match(spec, /CurrentView 能区分 `fact_class`、`availability` 和 `freshness` 三轴/);
    assert.match(readme, /仍不阻塞发布门/);
    assert.match(spec, /不阻塞 `0\.1\.0` 发布/);
  });
});
