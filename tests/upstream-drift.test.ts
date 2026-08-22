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

describe("upstream drift gate (#27)", () => {
  it("passes when recorded SHAs match injected ls-remote", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    const markdown = gateTable([
      `| DeepSeek Harness | \`deepseek-ai/deepseek-harness\` | \`refs/heads/master\` | \`${VALID_A}\` | 2026-08-22 |`,
      `| LoopX | \`huangruiteng/loopx\` | \`refs/heads/main\` | \`${VALID_B}\` | 2026-08-22 |`,
    ]);
    const result = await checkUpstreamDrift({
      markdown,
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

  it("fails closed on SHA drift without writing distance 0", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    const markdown = gateTable([
      `| LoopX | \`huangruiteng/loopx\` | \`refs/heads/main\` | \`${VALID_A}\` | 2026-08-22 |`,
    ]);
    const result = await checkUpstreamDrift({
      markdown,
      now: () => new Date("2026-08-22T12:00:00.000Z"),
      lsRemote: async () => VALID_B,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, "drift");
    const text = JSON.stringify(result);
    assert.match(text, /LoopX/);
    assert.match(text, new RegExp(VALID_A));
    assert.match(text, new RegExp(VALID_B));
    assert.match(text, /2026-08-22T12:00:00.000Z/);
    assert.doesNotMatch(text, /"distance":0/);
    assert.match(text, /data_insufficient/);
  });

  it("reports unavailable when ls-remote cannot reach the network", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    const markdown = gateTable([
      `| LoopX | \`huangruiteng/loopx\` | \`refs/heads/main\` | \`${VALID_A}\` | 2026-08-22 |`,
    ]);
    const result = await checkUpstreamDrift({
      markdown,
      lsRemote: async () => {
        throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
      },
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, "unavailable");
    assert.match(JSON.stringify(result), /unavailable/);
    assert.doesNotMatch(JSON.stringify(result), /"distance":0/);
  });

  it("reports unavailable when the repository cannot be resolved", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    const markdown = gateTable([
      `| Missing | \`no-such-org/no-such-repo\` | \`refs/heads/main\` | \`${VALID_A}\` | 2026-08-22 |`,
    ]);
    const result = await checkUpstreamDrift({
      markdown,
      lsRemote: async () => null,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, "unavailable");
  });

  it("reports a contract error when the gate table is missing", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    const result = await checkUpstreamDrift({
      markdown: "# 上游兼容性与同步基线\n\n没有门禁表。\n",
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, "contract_invalid");
  });

  it("reports a contract error when a recorded SHA is not a commit", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    const markdown = gateTable([
      "| LoopX | `huangruiteng/loopx` | `refs/heads/main` | `not-a-sha` | 2026-08-22 |",
    ]);
    const result = await checkUpstreamDrift({
      markdown,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, "contract_invalid");
  });

  it("marks HUFU_DENY_NETWORK as unchecked instead of passing", async () => {
    const { checkUpstreamDrift } = await import(scriptHref);
    let called = 0;
    const result = await checkUpstreamDrift({
      markdown: gateTable([
        `| LoopX | \`huangruiteng/loopx\` | \`refs/heads/main\` | \`${VALID_A}\` | 2026-08-22 |`,
      ]),
      denyNetwork: true,
      lsRemote: async () => {
        called += 1;
        return VALID_A;
      },
    });
    assert.equal(called, 0);
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, "unchecked");
    assert.match(result.message, /未核对/);
    assert.doesNotMatch(result.message, /通过/);
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
      writeFileSync(
        file,
        gateTable([
          `| LoopX | \`huangruiteng/loopx\` | \`refs/heads/main\` | \`${VALID_A}\` | 2026-08-22 |`,
        ]),
        "utf8",
      );
      const result = await runCli({
        compatibilityPath: file,
        denyNetwork: true,
      });
      assert.equal(result.exitCode, 1);
      assert.match(result.message, /未核对/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
