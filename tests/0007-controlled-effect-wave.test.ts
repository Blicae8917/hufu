import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function repoPath(relativePath: string): string {
  return fileURLToPath(new URL(`../../${relativePath}`, import.meta.url));
}

function readRepo(relativePath: string): string {
  return readFileSync(repoPath(relativePath), "utf8");
}

function collectMarkdown(directory: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectMarkdown(full, acc);
      continue;
    }
    if (entry.name.endsWith(".md")) {
      acc.push(full);
    }
  }
  return acc;
}

const KIT_DIRS = [
  "specs/012-loopx-bridge",
  "specs/013-gitlab-mutation",
  "specs/014-codex-native-host",
  "specs/015-e2e-pilot",
] as const;

const FIVE_KINDS = [
  "append_comment",
  "transition_managed_status_label",
  "set_assignee",
  "close_issue",
  "reopen_issue",
] as const;

function kitCorpus(): string {
  return KIT_DIRS.flatMap((dir) => collectMarkdown(repoPath(dir)).map((file) => readFileSync(file, "utf8"))).join(
    "\n\n",
  );
}

describe("0007 commander authorization wave (constitution / ADR / kits)", () => {
  it("lands ADR 0007 as accepted and points from ADR 0006 without rewriting 0006 history", () => {
    assert.equal(existsSync(repoPath("docs/adr/0007-controlled-gitlab-effect-and-host-runtime.md")), true);
    const adr = readRepo("docs/adr/0007-controlled-gitlab-effect-and-host-runtime.md");
    const adr0006 = readRepo("docs/adr/0006-upstream-positioning.md");
    assert.match(adr, /已接受/);
    assert.match(adr, /2026-08-23/);
    assert.match(adr, /#57/);
    assert.match(adr, /#58/);
    assert.match(adr, /#59/);
    assert.match(adr, /#60/);
    for (const kind of FIVE_KINDS) {
      assert.match(adr, new RegExp(kind));
    }
    assert.match(adr, /v0\.5\.2/);
    assert.match(adr, /423035f402e2f1703f076c3cfe60c14c5803433f/);
    assert.match(adr, /不 vendoring|不得 vendoring|不增加 `loopx`/);
    assert.match(adr, /企业 Renderer/);
    assert.match(adr, /M10[–-]M15/);
    assert.match(adr, /GitLab 仍是唯一议题权威/);
    assert.match(adr, /不复制 LoopX/);
    assert.match(adr0006, /ADR 0007/);
    assert.match(adr0006, /后续仅可设计、尚未授权实现的能力/);
    assert.match(adr0006, /本 ADR 与 #26 评论都\*\*不是\*\*实现授权/);
  });

  it("names the five GitLab mutation kinds and still forbids passthrough, body edit, and delete", () => {
    const constitution = readRepo(".specify/memory/constitution.md");
    for (const kind of FIVE_KINDS) {
      assert.match(constitution, new RegExp(kind));
    }
    assert.match(constitution, /GitLabTaskMutationProvider/);
    assert.match(constitution, /preview/);
    assert.match(constitution, /execute/);
    assert.match(constitution, /readback/);
    assert.match(constitution, /transport_security_exception_ref/);
    assert.match(constitution, /只读 allowlist 不授权 HTTP 写/);
    assert.match(constitution, /通用 GitLab 透传/);
    assert.match(constitution, /编辑正文/);
    assert.match(constitution, /删除议题或评论/);
    assert.match(constitution, /GitHub Adapter 保持只读/);
    assert.match(constitution, /不授权对真实生产项目/);
    assert.match(constitution, /\*\*版本\*\*：0\.1\.0/);
    assert.doesNotMatch(constitution, /第一版 GitHub 和 GitLab Adapter 只读，外部写回不在已接受范围内/);
  });

  it("keeps kits 012-015 free of Goal/Todo engines, real hosts, and tokens", () => {
    const corpus = kitCorpus();
    assert.match(corpus, /Goal/);
    assert.match(corpus, /Todo/);
    assert.doesNotMatch(corpus, /自行实现通用 Goal\/Todo\/Scheduler\/Heartbeat 作为本票范围/);
    assert.doesNotMatch(corpus, /本票实现 PM Engine|本票交付 Wave Engine/);
    assert.doesNotMatch(corpus, /ghp_[A-Za-z0-9]{8,}/);
    assert.doesNotMatch(corpus, /glpat-[A-Za-z0-9_-]{8,}/);
    assert.doesNotMatch(corpus, /(?:^|[^A-Za-z-])sk-[A-Za-z0-9]{20,}/);
    assert.doesNotMatch(corpus, /xox[baprs]-[A-Za-z0-9-]{8,}/i);
    assert.doesNotMatch(corpus, /\/home\/|\/Users\/|[A-Za-z]:\\/);
    assert.doesNotMatch(corpus, /\b(?:10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    assert.doesNotMatch(corpus, /\b192\.168\.\d{1,3}\.\d{1,3}\b/);
    assert.doesNotMatch(corpus, /\b172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}\b/);
    assert.match(corpus, /gitlab\.example\.com/);
    assert.match(corpus, /http:\/\/192\.0\.2\.10:41101/);
    assert.match(corpus, /http:\/\/gitlab\.example\.com:41101/);
    assert.doesNotMatch(corpus, /gitlab\.internal|corp\.local|lan\.home/i);

    const pkg = JSON.parse(readRepo("package.json")) as { version: string };
    assert.equal(pkg.version, "0.1.0");
    assert.equal(existsSync(repoPath("src/hufu/gitlab-task-mutation-provider.ts")), false);
    assert.equal(existsSync(repoPath("src/hufu/loopx-bridge.ts")), false);
    assert.equal(existsSync(repoPath("src/hufu/codex-native-host.ts")), false);
  });

  it("records one Unreleased CHANGELOG bullet for this authorization wave", () => {
    const changelog = readRepo("CHANGELOG.md");
    assert.match(changelog, /^## \[Unreleased\]$/m);
    assert.match(changelog, /#57/);
    assert.match(changelog, /#58/);
    assert.match(changelog, /#59/);
    assert.match(changelog, /#60/);
    assert.match(changelog, /ADR 0007/);
    assert.match(changelog, /013-gitlab-mutation/);
    assert.match(changelog, /0\.1\.0/);
    assert.match(changelog, /^## \[0\.1\.0\] - 2026-08-23$/m);
  });
});
