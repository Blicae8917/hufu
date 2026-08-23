import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function repoUrl(relativePath: string): URL {
  return new URL(`../../${relativePath}`, import.meta.url);
}

function readRepo(relativePath: string): string {
  return readFileSync(fileURLToPath(repoUrl(relativePath)), "utf8");
}

const KIT_DIR = "specs/012-loopx-bridge";
const REQUIRED_KIT_FILES = [
  "spec.md",
  "plan.md",
  "tasks.md",
  "research.md",
  "data-model.md",
  "quickstart.md",
  "checklists/requirements.md",
  "contracts/authority.v1.md",
  "contracts/decision.v1.md",
  "contracts/evidence.v1.md",
  "contracts/stay-on-side.v1.md",
  "contracts/008-non-promotion.v1.md",
  "contracts/run-once.v1.md",
] as const;

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

function walkFiles(dir: string, suffix: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkFiles(path, suffix));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(suffix)) {
      found.push(path);
    }
  }
  return found;
}

function packageJsonPaths(root: string): string[] {
  const paths = [join(root, "package.json")];
  const packagesDir = join(root, "packages");
  if (!existsSync(packagesDir)) {
    return paths;
  }
  for (const entry of readdirSync(packagesDir)) {
    const candidate = join(packagesDir, entry, "package.json");
    if (existsSync(candidate)) {
      paths.push(candidate);
    }
  }
  return paths;
}

function kitCorpus(): string {
  return REQUIRED_KIT_FILES.map((relative) => readRepo(`${KIT_DIR}/${relative}`)).join(
    "\n\n",
  );
}

describe("012 LoopX Authority/Decision/Evidence bridge spec (#50)", () => {
  it("lands the design kit and cites ADR 0006 plus issue #50 as class (2)", () => {
    for (const relative of REQUIRED_KIT_FILES) {
      assert.equal(
        existsSync(fileURLToPath(repoUrl(`${KIT_DIR}/${relative}`))),
        true,
        `missing ${KIT_DIR}/${relative}`,
      );
    }

    const corpus = kitCorpus();
    assert.match(corpus, /ADR 0006/);
    assert.match(corpus, /#50/);
    assert.match(corpus, /第 \(2\) 类/);
    assert.match(corpus, /Hufu↔LoopX Authority \/ Decision \/ Evidence 桥/);
    assert.match(corpus, /三类后续能力/);
    assert.match(corpus, /不是 \(1\)|不做/);
    assert.match(corpus, /GitLab AuthorityProvider/);
    assert.match(corpus, /企业 Renderer/);
    assert.doesNotMatch(corpus, /\/home\/|\/Users\/|[A-Za-z]:\\/);
    assert.doesNotMatch(corpus, /ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}/i);
  });

  it("records #58 / ADR 0007 implementation authorization while this wave ships no adapter", () => {
    const spec = readRepo(`${KIT_DIR}/spec.md`);
    const plan = readRepo(`${KIT_DIR}/plan.md`);
    const corpus = `${spec}\n${plan}\n${kitCorpus()}`;
    assert.match(spec, /implementation-authorized|#58/);
    assert.match(spec, /ADR 0007/);
    assert.match(corpus, /MUST NOT 实现桥 Adapter/);
    assert.match(corpus, /MUST NOT 改变 CLI|不改 CLI/);
    assert.match(plan, /不改 `src\/` 运行时|不修改 src\//);
    assert.match(readRepo(`${KIT_DIR}/data-model.md`), /implementation_authorized` \| 必须为 `true/);
    assert.match(readRepo(`${KIT_DIR}/data-model.md`), /#58/);
    assert.match(readRepo(`${KIT_DIR}/data-model.md`), /v0\.5\.2/);
    assert.match(readRepo(`${KIT_DIR}/tasks.md`), /未来实现 PR/);
    assert.match(readRepo(`${KIT_DIR}/tasks.md`), /T001/);
    assert.match(readRepo(`${KIT_DIR}/tasks.md`), /012-loopx-bridge-adapter\.test\.ts/);
    assert.match(corpus, /SessionBindingRef/);
    assert.match(corpus, /AuthorityResolver/);
    assert.match(corpus, /opaque `authority_ref`|opaque authority_ref/);
    assert.match(corpus, /current Ledger\/status/);
    assert.match(corpus, /ExecutionEnvelopeRef/);
    assert.match(corpus, /EffectRef/);
    assert.match(corpus, /ReceiptRef/);
    assert.match(corpus, /TypedResultRef/);
  });

  it("does not resurrect M10-M15, Goal/Todo/Scheduler/Heartbeat, or hufu serve", () => {
    const corpus = kitCorpus();
    assert.match(corpus, /不得复活 M10[–-]M15/);
    assert.match(corpus, /Goal/);
    assert.match(corpus, /Todo/);
    assert.match(corpus, /Scheduler/);
    assert.match(corpus, /Heartbeat/);
    assert.match(corpus, /不得把 Goal \/ Todo \/ Scheduler \/ Heartbeat 搬进 Hufu/);
    assert.match(corpus, /PM Engine/);
    assert.match(corpus, /Wave Engine/);
    assert.match(corpus, /hufu serve/);
    assert.match(corpus, /hufu serve` 保持拒绝|默认 `hufu serve`/);
    assert.doesNotMatch(corpus, /M10[–-]M15.{0,40}已接受实现方向/);
    assert.doesNotMatch(corpus, /自行实现通用 Goal\/Todo\/Scheduler\/Heartbeat 作为本票范围/);
  });

  it("does not promote 008 / #9 loopx-mechanisms to task authority", () => {
    const nonPromotion = readRepo(`${KIT_DIR}/contracts/008-non-promotion.v1.md`);
    const spec = readRepo(`${KIT_DIR}/spec.md`);
    assert.match(nonPromotion, /008-loopx-engine|#9/);
    assert.match(nonPromotion, /loopx-mechanisms/);
    assert.match(nonPromotion, /须\*\*显式选用\*\*|须显式选用/);
    assert.match(nonPromotion, /不是 `task_authority`/);
    assert.match(nonPromotion, /不是 Hufu↔LoopX Authority \/ Decision \/ Evidence 桥/);
    assert.match(spec, /不得把 #9|MUST NOT 把 #9/);
    assert.match(spec, /升格为 `task_authority`|升格为任务正本/);
    assert.match(nonPromotion, /选用 008 与启用本桥是两件独立的事/);
    assert.doesNotMatch(nonPromotion, /loopx-mechanisms 是任务正本/);
    assert.doesNotMatch(spec, /把 loopx-mechanisms 升格为 task_authority/);
  });

  it("forbids inferring authorization from Journal, Receipt, or execution results", () => {
    const stay = readRepo(`${KIT_DIR}/contracts/stay-on-side.v1.md`);
    const evidence = readRepo(`${KIT_DIR}/contracts/evidence.v1.md`);
    const spec = readRepo(`${KIT_DIR}/spec.md`);
    assert.match(stay, /Journal/);
    assert.match(stay, /Receipt/);
    assert.match(stay, /不得从 Journal、Receipt 或执行结果反推授权|反推或扩大授权/);
    assert.match(evidence, /不得从 Journal、Receipt 或执行结果反推或扩大授权/);
    assert.match(spec, /Journal、Receipt 或任何执行结果反推或扩大授权|执行结果反推或扩大授权/);
    assert.match(stay, /AuthorizationGrant/);
    assert.match(evidence, /TypedResult/);
    assert.match(evidence, /observed_result/);
    assert.doesNotMatch(stay, /Receipt 可以扩大授权|Journal 是授权来源/);
  });

  it("records the three-side field split and native Issue lifecycle ban", () => {
    const authority = readRepo(`${KIT_DIR}/contracts/authority.v1.md`);
    const decision = readRepo(`${KIT_DIR}/contracts/decision.v1.md`);
    const evidence = readRepo(`${KIT_DIR}/contracts/evidence.v1.md`);
    const stay = readRepo(`${KIT_DIR}/contracts/stay-on-side.v1.md`);

    assert.match(authority, /`task_authority`/);
    assert.match(authority, /`task_ref`/);
    assert.match(authority, /AuthoritySnapshotRef/);
    assert.match(authority, /authority_scope_ref/);
    assert.match(authority, /grant_id/);
    assert.match(decision, /DecisionRef/);
    assert.match(decision, /decision_id/);
    assert.match(decision, /content_digest/);
    assert.doesNotMatch(decision, /过桥完整 DECISION_PACKET|过桥 `business_outcome` 原文/);
    assert.match(evidence, /evidence_ref/);
    assert.match(evidence, /fact_class/);
    assert.match(evidence, /freshness/);
    assert.match(stay, /不得取代原生 Issue 生命周期/);
    assert.match(stay, /GitHub \/ GitLab/);
    assert.match(stay, /writeIssue|closeIssue|commentIssue/);
  });

  it("does not vendor LoopX source or add a LoopX runtime dependency", () => {
    const corpus = kitCorpus();
    const root = fileURLToPath(repoUrl(""));
    const rootPkg = JSON.parse(readRepo("package.json")) as {
      version?: string;
    };
    assert.equal(rootPkg.version, "0.1.0");
    assert.match(corpus, /不引入 LoopX 发行包/);
    assert.match(corpus, /不复制上游源码|不 vendoring 上游源码|不得复制或 vendoring 上游源码/);
    assert.match(corpus, /许可证与 NOTICE/);
    assert.equal(existsSync(join(root, "vendor", "loopx")), false);
    assert.equal(existsSync(join(root, KIT_DIR, "vendor")), false);

    for (const path of packageJsonPaths(root)) {
      const pkg = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      for (const field of DEPENDENCY_FIELDS) {
        const deps = pkg[field];
        if (deps === undefined) {
          continue;
        }
        assert.equal(
          Object.keys(deps as Record<string, unknown>).some((name) => name === "loopx"),
          false,
          `${path} ${field} must not list loopx`,
        );
      }
    }

    const sources = walkFiles(join(root, "src"), ".ts");
    assert.ok(sources.length > 0);
    for (const path of sources) {
      const text = readFileSync(path, "utf8");
      assert.equal(
        /from\s+["']loopx(?:\/[^"']*)?["']/.test(text),
        false,
        `${path} must not import loopx`,
      );
    }
  });

  it("keeps a single Unreleased CHANGELOG bullet for this design kit", () => {
    const changelog = readRepo("CHANGELOG.md");
    assert.match(changelog, /^## \[Unreleased\]$/m);
    assert.match(changelog, /#50/);
    assert.match(changelog, /012-loopx-bridge/);
    assert.match(changelog, /仅设计|不是 Adapter 实现授权/);
    assert.match(changelog, /loopx-mechanisms|机制记录口/);
    assert.match(changelog, /^## \[0\.1\.0\] - 2026-08-23$/m);
  });

  it("records the #68 run-once implementation increment without adding a control plane", () => {
    const spec = readRepo(`${KIT_DIR}/spec.md`);
    const plan = readRepo(`${KIT_DIR}/plan.md`);
    const tasks = readRepo(`${KIT_DIR}/tasks.md`);
    const model = readRepo(`${KIT_DIR}/data-model.md`);
    const contract = readRepo(`${KIT_DIR}/contracts/run-once.v1.md`);
    const corpus = `${spec}\n${plan}\n${tasks}\n${model}\n${contract}`;
    assert.match(corpus, /#68/);
    assert.match(corpus, /423035f402e2f1703f076c3cfe60c14c5803433f/);
    assert.match(corpus, /BridgeActivationReceipt/);
    assert.match(corpus, /runtime_locator_ref/);
    assert.match(corpus, /ExecutionEnvelopeRef/);
    assert.match(corpus, /SessionBindingRef/);
    assert.match(corpus, /independent.*Validator|独立.*Validator/i);
    assert.match(corpus, /readback/);
    assert.match(corpus, /Receipt/);
    assert.match(corpus, /一次.*bounded|single bounded|单次.*run-once/i);
    assert.match(corpus, /不得.*while-loop|不实现.*Scheduler|no scheduler/i);
    assert.match(tasks, /T019/);
    assert.match(tasks, /T028/);
  });
});
