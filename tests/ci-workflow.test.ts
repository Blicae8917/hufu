import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const workflowPath = fileURLToPath(
  new URL("../../.github/workflows/ci.yml", import.meta.url),
);
const workflowsDir = fileURLToPath(
  new URL("../../.github/workflows", import.meta.url),
);

function readWorkflow(): string {
  assert.equal(
    existsSync(workflowPath),
    true,
    "expected .github/workflows/ci.yml to exist",
  );
  return readFileSync(workflowPath, "utf8");
}

describe("GitHub Actions quality gates", () => {
  it("runs the three constitution gates on pull requests and main pushes", () => {
    const workflow = readWorkflow();

    assert.match(workflow, /^name:\s*ci\s*$/m);
    assert.match(workflow, /pull_request:/);
    assert.match(workflow, /branches:\s*\n(?:[^\n]*\n)*?\s*-\s*main/m);
    assert.match(workflow, /pnpm test/);
    assert.match(workflow, /node scripts\/check-version\.mjs/);
    assert.match(workflow, /git diff --check/);
  });

  it("stays read-only and does not add secrets or product side effects", () => {
    const workflow = readWorkflow();

    assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/m);
    assert.doesNotMatch(workflow, /secrets\./);
    assert.doesNotMatch(workflow, /contents:\s*write/);
    assert.doesNotMatch(workflow, /npm publish/);
    assert.doesNotMatch(workflow, /gh release/);
    assert.doesNotMatch(workflow, /HUFU_/);
    assert.equal(
      existsSync(join(workflowsDir, "close-accepted-modules.yml")),
      false,
      "temporary issue-closer workflow must not ship",
    );
  });

  it("uses the declared Node and pnpm versions and is included in pnpm test", () => {
    const workflow = readWorkflow();
    const packageJson = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../../package.json", import.meta.url)),
        "utf8",
      ),
    ) as {
      engines: { node: string };
      packageManager: string;
      scripts: { test: string };
    };

    assert.equal(packageJson.engines.node, ">=22.19.0");
    assert.equal(packageJson.packageManager, "pnpm@10.14.0");
    assert.match(workflow, /node-version:\s*["']?22\.19\.0["']?/);
    assert.match(workflow, /(?:version:\s*["']?10\.14\.0["']?|pnpm@10\.14\.0)/);
    assert.match(workflow, /pnpm install --frozen-lockfile/);
    assert.match(
      packageJson.scripts.test,
      /ci-workflow\.test|dist\/tests\/(?:\*\*)?/,
    );
  });
});
