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

describe("small fix set (#28)", () => {
  it("builds the GitHub list URL from CANONICAL_OWNER and CANONICAL_REPO", () => {
    const source = readRepo("src/hufu/github-http.ts");
    assert.match(source, /CANONICAL_OWNER/);
    assert.match(source, /CANONICAL_REPO/);
    assert.doesNotMatch(source, /repos\/Blicae8917\/hufu/);
  });

  it("pins a 10s fetch timeout in both HTTP adapters and their contracts", () => {
    const github = readRepo("src/hufu/github-http.ts");
    const gitlab = readRepo("src/hufu/gitlab-http.ts");
    assert.match(github, /FETCH_TIMEOUT_MS\s*=\s*10_000/);
    assert.match(gitlab, /FETCH_TIMEOUT_MS\s*=\s*10_000/);
    const githubContract = readRepo(
      "specs/004-github-readonly/contracts/github-adapter.v1.md",
    );
    const gitlabQuickstart = readRepo("specs/007-gitlab-readonly/quickstart.md");
    const githubResearch = readRepo("specs/004-github-readonly/research.md");
    assert.match(githubContract, /10_000|10 秒|10000 ms|10s/);
    assert.match(githubResearch, /10_000|10 秒/);
    assert.match(gitlabQuickstart, /10_000|10 秒/);
  });

  it("does not say the CLI has five bounded commands", () => {
    const readme = readRepo("README.md");
    assert.doesNotMatch(readme, /五个有界命令/);
    assert.match(readme, /connect.*doctor.*status.*handoff.*decide.*pilot/s);
  });

  it("documents HUFU_DENY_NETWORK=1", () => {
    const readme = readRepo("README.md");
    const quickstart = readRepo("specs/004-github-readonly/quickstart.md");
    assert.match(readme, /HUFU_DENY_NETWORK/);
    assert.match(quickstart, /HUFU_DENY_NETWORK/);
  });

  it("drops retired Python gitignore entries", () => {
    const gitignore = readRepo(".gitignore");
    for (const pattern of [
      "__pycache__/",
      "*.py[cod]",
      ".coverage",
      ".pytest_cache/",
      ".venv/",
      "*.egg-info/",
    ]) {
      assert.equal(
        gitignore.split("\n").includes(pattern),
        false,
        `expected ${pattern} removed from .gitignore`,
      );
    }
    assert.match(gitignore, /node_modules\//);
    assert.match(gitignore, /\.hufu\//);
  });
});
