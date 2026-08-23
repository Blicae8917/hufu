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

function collectKitFiles(directory: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectKitFiles(full, acc);
      continue;
    }
    if (entry.name.endsWith(".md")) {
      acc.push(full);
    }
  }
  return acc;
}

const KIT_DIR = "specs/011-gitlab-authority";
const KIT_FILES = [
  `${KIT_DIR}/spec.md`,
  `${KIT_DIR}/plan.md`,
  `${KIT_DIR}/tasks.md`,
  `${KIT_DIR}/research.md`,
  `${KIT_DIR}/data-model.md`,
  `${KIT_DIR}/quickstart.md`,
  `${KIT_DIR}/checklists/requirements.md`,
  `${KIT_DIR}/contracts/gitlab-authority.v1.md`,
  `${KIT_DIR}/contracts/identity-auth-fail-closed.v1.md`,
  `${KIT_DIR}/contracts/007-non-expansion.v1.md`,
  `${KIT_DIR}/contracts/cli.md`,
  `${KIT_DIR}/contracts/command-error.v1.md`,
  `${KIT_DIR}/contracts/current-view.v1.md`,
] as const;

function readKit(): string {
  return KIT_FILES.map((relative) => readRepo(relative)).join("\n");
}

describe("011 GitLab AuthorityProvider design kit (#49)", () => {
  it("lands the spec kit and cites ADR 0006 plus issue #49 as class (1)", () => {
    for (const relative of KIT_FILES) {
      assert.equal(existsSync(repoPath(relative)), true, relative);
    }
    const kitFiles = collectKitFiles(repoPath(KIT_DIR));
    assert.equal(kitFiles.length >= KIT_FILES.length, true);

    const spec = readRepo(`${KIT_DIR}/spec.md`);
    const plan = readRepo(`${KIT_DIR}/plan.md`);
    const authority = readRepo(`${KIT_DIR}/contracts/gitlab-authority.v1.md`);
    const combined = [spec, plan, authority].join("\n");

    assert.match(combined, /ADR 0006/);
    assert.match(combined, /#49/);
    assert.match(combined, /自建 GitLab AuthorityProvider/);
    assert.match(combined, /类 \(1\)|class \(1\)|\(1\) 自建 GitLab/);
    assert.match(spec, /007-gitlab-readonly|#8/);
  });

  it("states this is design only and not implementation authorization", () => {
    const spec = readRepo(`${KIT_DIR}/spec.md`);
    const plan = readRepo(`${KIT_DIR}/plan.md`);
    const tasks = readRepo(`${KIT_DIR}/tasks.md`);
    const combined = [spec, plan, tasks].join("\n");

    assert.match(combined, /Design Only|设计 only|设计合同/);
    assert.match(combined, /不是实现授权|不授权实现|不是 Adapter 实现授权/);
    assert.match(plan, /不修订|不因本 Kit 而修订/);
    assert.match(spec, /Constitution/);
    assert.match(tasks, /未来实现 PR|实现票|#53/);
    assert.match(tasks, /T001/);
    assert.match(tasks, /gitlab-authority-adapter\.test\.ts/);
    assert.match(tasks, /写失败测试/);
  });

  it("does not resurrect M10-M15 or outbound Runtime", () => {
    const kit = readKit();
    assert.match(kit, /M10[–-]M15|M10－M15/);
    assert.match(kit, /不复活|不得复活|禁止复活|已废止/);
    assert.match(kit, /出站 Runtime/);
    assert.doesNotMatch(kit, /M10[–-]M15 是已接受方向|恢复自行建设的 M10/);
    assert.doesNotMatch(kit, /出站 Runtime 是已接受方向|本票实现出站 Runtime/);
    assert.doesNotMatch(kit, /本票实现 Hufu↔LoopX|本票交付企业 Renderer/);
  });

  it("does not treat gitlab.com SaaS as the default writable authority", () => {
    const kit = readKit();
    assert.match(kit, /gitlab\.com/);
    assert.match(kit, /默认为可写正本|默认可写正本|可写正本/);
    assert.match(kit, /MUST NOT|不得|拒绝|失败关闭/);
    assert.match(kit, /默认不写回|write_back_enabled|写回默认/);
    assert.doesNotMatch(kit, /gitlab\.com 默认可写|默认把 gitlab\.com 当作可写|SaaS 默认可写/);
  });

  it("contains no credentials, private endpoints, or machine-room or family details", () => {
    const kit = readKit();
    assert.match(kit, /示例/);
    assert.match(kit, /gitlab\.example\.com/);
    assert.match(kit, /example-group\/example-project/);
    assert.match(kit, /凭据/);
    assert.match(kit, /机房|家庭/);

    assert.doesNotMatch(kit, /ghp_[A-Za-z0-9]{8,}/);
    assert.doesNotMatch(kit, /glpat-[A-Za-z0-9_-]{8,}/);
    assert.doesNotMatch(kit, /(?:^|[^A-Za-z-])sk-[A-Za-z0-9]{20,}/);
    assert.doesNotMatch(kit, /xox[baprs]-[A-Za-z0-9-]{8,}/i);
    assert.doesNotMatch(kit, /\/home\/|\/Users\/|[A-Za-z]:\\/);
    assert.doesNotMatch(kit, /\b(?:10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    assert.doesNotMatch(kit, /\b192\.168\.\d{1,3}\.\d{1,3}\b/);
    assert.doesNotMatch(kit, /\b172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}\b/);
    assert.doesNotMatch(kit, /gitlab\.internal|corp\.local|lan\.home/i);
    assert.doesNotMatch(kit, /机房主机名:\s*\S+/);
    assert.doesNotMatch(kit, /家庭(?:部署|主机|机房)[：:].+/);
  });

  it("keeps package version at 0.1.0 while #53 lands the implementation tests", () => {
    const pkg = JSON.parse(readRepo("package.json")) as { version: string };
    assert.equal(pkg.version, "0.1.0");
    assert.equal(existsSync(repoPath("tests/gitlab-authority-adapter.test.ts")), true);
    assert.equal(existsSync(repoPath("tests/gitlab-authority-identity.test.ts")), true);
    assert.equal(existsSync(repoPath("tests/gitlab-authority-nowrite.test.ts")), true);
  });
});
