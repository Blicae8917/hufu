import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const scriptHref = new URL(
  "../../scripts/check-upstream-drift.mjs",
  import.meta.url,
).href;

function gateTable(rows: readonly string[]): string {
  return [
    "## 门禁核对表",
    "",
    "| 上游 | 仓库 | ref | 记录 SHA | 观测日期 |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

const VALID_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const VALID_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const BRANCH_ROW = `| LoopX | \`huangruiteng/loopx\` | \`refs/heads/main\` | \`${VALID_A}\` | 2026-08-22 |`;
const TAG_ROW = `| LoopX | \`huangruiteng/loopx\` | \`refs/tags/v0.4.7\` | \`${VALID_A}\` | 2026-08-22 |`;

describe("upstream drift gate (#27 / #41)", () => {
  it("defaults to static mode and does not query live refs", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    let called = 0;
    const result = await checkUpstreamDrift({
      markdown: gateTable([BRANCH_ROW]),
      now: () => new Date("2026-08-22T12:00:00.000Z"),
      lsRemote: async () => {
        called += 1;
        return VALID_B;
      },
    });
    assert.equal(called, 0);
    assert.equal(result.mode, "static");
    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "static_ok");
    assert.doesNotMatch(result.message, /通过/);
    assert.doesNotMatch(JSON.stringify(result), /"distance":0/);
  });

  it("static mode stays green when live HEAD would have advanced", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    const result = await checkUpstreamDrift({
      markdown: gateTable([BRANCH_ROW]),
      mode: "static",
      lsRemote: async () => VALID_B,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "static_ok");
    assert.notEqual(result.status, "drift");
  });

  it("observe mode reports HEAD advance as typed drift, not incompatibility", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    const result = await checkUpstreamDrift({
      markdown: gateTable([BRANCH_ROW]),
      mode: "observe",
      now: () => new Date("2026-08-22T12:00:00.000Z"),
      lsRemote: async () => VALID_B,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "drift");
    assert.equal(result.incompatibility, false);
    const text = JSON.stringify(result);
    assert.match(text, /LoopX/);
    assert.match(text, new RegExp(VALID_A));
    assert.match(text, new RegExp(VALID_B));
    assert.match(text, /2026-08-22T12:00:00.000Z/);
    assert.doesNotMatch(text, /"distance":0/);
    assert.match(text, /data_insufficient/);
    assert.doesNotMatch(result.message, /不兼容|incompatible/i);
  });

  it("observe mode passes when recorded SHAs match injected ls-remote", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    const markdown = gateTable([
      `| DeepSeek Harness | \`deepseek-ai/deepseek-harness\` | \`refs/heads/master\` | \`${VALID_A}\` | 2026-08-22 |`,
      `| LoopX | \`huangruiteng/loopx\` | \`refs/heads/main\` | \`${VALID_B}\` | 2026-08-22 |`,
    ]);
    const result = await checkUpstreamDrift({
      markdown,
      mode: "observe",
      now: () => new Date("2026-08-22T12:00:00.000Z"),
      lsRemote: async (repository: string, ref: string) => {
        if (repository === "deepseek-ai/deepseek-harness" && ref === "refs/heads/master") {
          return VALID_A;
        }
        if (repository === "huangruiteng/loopx" && ref === "refs/heads/main") {
          return VALID_B;
        }
        throw new Error(`unexpected ${repository} ${ref}`);
      },
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "match");
    assert.equal(
      JSON.stringify(result).includes('"distance":0') ||
        JSON.stringify(result).includes('"distance": 0'),
      false,
    );
  });

  it("release mode does not fail when a branch HEAD advanced but the recorded commit is reachable", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    const result = await checkUpstreamDrift({
      markdown: gateTable([BRANCH_ROW]),
      mode: "release",
      lsRemote: async () => VALID_B,
      isReachable: async () => true,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "head_advanced");
    assert.equal(result.incompatibility, false);
  });

  it("release mode fails closed when an immutable tag moved", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    const result = await checkUpstreamDrift({
      markdown: gateTable([TAG_ROW]),
      mode: "release",
      now: () => new Date("2026-08-22T12:00:00.000Z"),
      lsRemote: async () => VALID_B,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, "tag_moved");
    const text = JSON.stringify(result);
    assert.match(text, /LoopX/);
    assert.match(text, new RegExp(VALID_A));
    assert.match(text, new RegExp(VALID_B));
    assert.doesNotMatch(text, /"distance":0/);
  });

  it("release mode fails closed when the recorded commit is unreachable", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    const result = await checkUpstreamDrift({
      markdown: gateTable([BRANCH_ROW]),
      mode: "release",
      lsRemote: async () => VALID_B,
      isReachable: async () => false,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, "unreachable");
  });

  it("release mode matches when a tag still points at the recorded SHA", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    const result = await checkUpstreamDrift({
      markdown: gateTable([TAG_ROW]),
      mode: "release",
      lsRemote: async () => VALID_A,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "match");
  });

  it("observe and release report unavailable when ls-remote cannot reach the network", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    for (const mode of ["observe", "release"] as const) {
      const result = await checkUpstreamDrift({
        markdown: gateTable([BRANCH_ROW]),
        mode,
        lsRemote: async () => {
          throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
        },
      });
      assert.equal(result.exitCode, 1, mode);
      assert.equal(result.status, "unavailable", mode);
      assert.match(JSON.stringify(result), /unavailable/);
      assert.doesNotMatch(JSON.stringify(result), /"distance":0/);
    }
  });

  it("observe and release report unavailable when the repository cannot be resolved", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    for (const mode of ["observe", "release"] as const) {
      const result = await checkUpstreamDrift({
        markdown: gateTable([
          `| Missing | \`no-such-org/no-such-repo\` | \`refs/heads/main\` | \`${VALID_A}\` | 2026-08-22 |`,
        ]),
        mode,
        lsRemote: async () => null,
      });
      assert.equal(result.exitCode, 1, mode);
      assert.equal(result.status, "unavailable", mode);
    }
  });

  it("all modes report a contract error when the gate table is missing", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    for (const mode of ["static", "observe", "release"] as const) {
      const result = await checkUpstreamDrift({
        markdown: "# 上游兼容性与同步基线\n\n没有门禁表。\n",
        mode,
      });
      assert.equal(result.exitCode, 1, mode);
      assert.equal(result.status, "contract_invalid", mode);
    }
  });

  it("all modes report a contract error when a recorded SHA is not a commit", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    const markdown = gateTable([
      "| LoopX | `huangruiteng/loopx` | `refs/heads/main` | `not-a-sha` | 2026-08-22 |",
    ]);
    for (const mode of ["static", "observe", "release"] as const) {
      const result = await checkUpstreamDrift({
        markdown,
        mode,
      });
      assert.equal(result.exitCode, 1, mode);
      assert.equal(result.status, "contract_invalid", mode);
    }
  });

  it("static mode does not treat HUFU_DENY_NETWORK as a live-check pass or skip", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    let called = 0;
    const result = await checkUpstreamDrift({
      markdown: gateTable([BRANCH_ROW]),
      mode: "static",
      denyNetwork: true,
      lsRemote: async () => {
        called += 1;
        return VALID_A;
      },
    });
    assert.equal(called, 0);
    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "static_ok");
    assert.doesNotMatch(result.message, /通过/);
    assert.doesNotMatch(result.message, /未核对/);
  });

  it("observe and release mark HUFU_DENY_NETWORK as unchecked instead of passing", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    for (const mode of ["observe", "release"] as const) {
      let called = 0;
      const result = await checkUpstreamDrift({
        markdown: gateTable([BRANCH_ROW]),
        mode,
        denyNetwork: true,
        lsRemote: async () => {
          called += 1;
          return VALID_A;
        },
      });
      assert.equal(called, 0, mode);
      assert.equal(result.exitCode, 1, mode);
      assert.equal(result.status, "unchecked", mode);
      assert.match(result.message, /未核对/);
      assert.doesNotMatch(result.message, /通过/);
    }
  });

  it("rejects an unknown mode as a contract error", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    const result = await checkUpstreamDrift({
      markdown: gateTable([BRANCH_ROW]),
      mode: "continue-on-error",
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, "contract_invalid");
  });

  it("parses docs/COMPATIBILITY.md without treating later tables as rows", async () => {
    const { parseGateTable } = await import(scriptHref);
    const markdown = readFileSync(
      fileURLToPath(new URL("../../docs/COMPATIBILITY.md", import.meta.url)),
      "utf8",
    );
    const rows = parseGateTable(markdown);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.repository, "deepseek-ai/deepseek-harness");
    assert.equal(rows[1]?.repository, "huangruiteng/loopx");
  });

  it("reads a fixture path without writing it back", async () => {
    const { runCli } = await import(scriptHref);
    const dir = mkdtempSync(join(tmpdir(), "hufu-drift-"));
    try {
      const file = join(dir, "COMPATIBILITY.md");
      writeFileSync(file, gateTable([BRANCH_ROW]), "utf8");
      const before = readFileSync(file, "utf8");
      const result = await runCli({
        compatibilityPath: file,
        mode: "observe",
        denyNetwork: true,
      });
      assert.equal(result.exitCode, 1);
      assert.match(result.message, /未核对/);
      assert.equal(readFileSync(file, "utf8"), before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
