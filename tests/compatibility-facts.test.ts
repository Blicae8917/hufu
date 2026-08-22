import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const compatibilityPath = fileURLToPath(
  new URL("../../docs/COMPATIBILITY.md", import.meta.url),
);

function readCompatibility(): string {
  return readFileSync(compatibilityPath, "utf8");
}

describe("COMPATIBILITY.md upstream facts (#25)", () => {
  it("does not claim the DeepSeek Harness baseline was unchanged", () => {
    const text = readCompatibility();
    assert.doesNotMatch(
      text,
      /再次核对公开 `master`，提交未变/,
    );
    assert.doesNotMatch(
      text,
      /提交仍为\s*`?47f943859bef60e4160492346772ded9b24f765a`?/,
    );
  });

  it("keeps the accepted DSH baseline and records a dated current observation", () => {
    const text = readCompatibility();
    assert.match(
      text,
      /47f943859bef60e4160492346772ded9b24f765a/,
    );
    assert.match(text, /0\.1\.0-rc\.5/);
    assert.match(text, /99f6f02/);
    assert.match(text, /dsh-v0\.1\.0-rc\.7|0\.1\.0-rc\.7/);
    assert.match(text, /5bb600f/);
    assert.match(text, /不是已接受实现基线|不把 rc\.7|不提升/);
    assert.match(text, /git ls-remote https:\/\/github.com\/deepseek-ai\/deepseek-harness/);
    assert.match(text, /git rev-parse --is-shallow-repository/);
    assert.match(text, /完整历史/);
    assert.match(text, /2026-08-1[69]|2026-08-2[0-2]/);
  });

  it("records that the eight install contracts still hold at rc.7", () => {
    const text = readCompatibility();
    assert.match(text, /8 条安装契约|八条安装契约|安装契约项在 rc\.7/);
    assert.match(text, /@deepseek-ai\/cordis`?\s*`?4\.0\.1/);
    assert.match(text, /dsh plugin --profile/);
    assert.match(text, /node-addon-require-builtin/);
  });

  it("notes DeepSeek Harness built-in host capabilities that overlap Hufu", () => {
    const text = readCompatibility();
    assert.match(text, /packages\/goal\//);
    assert.match(text, /packages\/plan\/plan-mode\//);
    assert.match(text, /packages\/acp\//);
    assert.match(text, /subagent-codex|subagent-claude-code/);
    assert.match(text, /重合面/);
    assert.match(text, /Adapter 未实现/);
  });

  it("updates LoopX observation without promoting a new accepted baseline", () => {
    const text = readCompatibility();
    assert.match(text, /58f545aee1ce00c57b7a4f21b13d78ee0367b3da/);
    assert.match(text, /0\.4\.7/);
    assert.match(text, /当日失效|当天即可能失效/);
    assert.match(text, /146 commits|146 个提交/);
    assert.match(text, /不是已接受实现基线/);
    assert.match(text, /git ls-remote https:\/\/github.com\/huangruiteng\/loopx/);
    assert.doesNotMatch(text, /已接受实现基线.*0\.4\.9/);
  });

  it("does not live-clone upstreams during pnpm test", () => {
    const text = readFileSync(
      fileURLToPath(new URL("./compatibility-facts.test.js", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(text, /github.com\/deepseek-ai\/deepseek-harness/);
    assert.doesNotMatch(text, /huangruiteng\/loopx/);
    assert.equal(
      spawnSync("git", ["rev-parse", "--is-shallow-repository"], {
        encoding: "utf8",
      }).stdout.trim(),
      "false",
    );
  });
});
