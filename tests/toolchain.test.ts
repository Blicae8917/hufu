import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const bashDir = join(repoRoot, ".specify", "scripts", "bash");
const powershellDir = join(repoRoot, ".specify", "scripts", "powershell");
const agentsSkillsDir = join(repoRoot, ".agents", "skills");
const claudeSkillsDir = join(repoRoot, ".claude", "skills");

const SCRIPT_NAMES = [
  "check-prerequisites",
  "common",
  "create-new-feature",
  "resolve-template",
  "setup-plan",
  "setup-tasks",
] as const;

const SPECKIT_SKILLS = [
  "speckit-analyze",
  "speckit-checklist",
  "speckit-clarify",
  "speckit-constitution",
  "speckit-converge",
  "speckit-implement",
  "speckit-plan",
  "speckit-specify",
  "speckit-tasks",
  "speckit-taskstoissues",
] as const;

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function runBash(
  script: string,
  args: readonly string[],
  env: Record<string, string> = {},
) {
  return spawnSync("bash", [join(bashDir, script), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function parseJsonObject(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  assert.notEqual(trimmed, "", "expected JSON on stdout");
  const parsed: unknown = JSON.parse(trimmed);
  assert.equal(typeof parsed, "object");
  assert.notEqual(parsed, null);
  return parsed as Record<string, unknown>;
}

describe("contributor toolchain (#24)", () => {
  it("keeps PowerShell scripts and adds bash twins", () => {
    for (const name of SCRIPT_NAMES) {
      const ps1 = join(powershellDir, `${name}.ps1`);
      const sh = join(bashDir, `${name}.sh`);
      assert.equal(existsSync(ps1), true, `expected ${ps1}`);
      assert.equal(existsSync(sh), true, `expected ${sh}`);
      assert.equal(
        spawnSync("test", ["-x", sh], { encoding: "utf8" }).status,
        0,
        `expected ${sh} to be executable`,
      );
    }
  });

  it("loads Claude Code through CLAUDE.md without copying AGENTS.md rules", () => {
    const claude = readRepoFile("CLAUDE.md");
    const agents = readRepoFile("AGENTS.md");

    assert.match(claude, /@AGENTS\.md/);
    assert.doesNotMatch(claude, /不得把 Journal、Receipt 或外部 Projection 当作执行授权/);
    assert.match(claude, /\.agents\/skills\//);
    assert.match(claude, /\.specify\/scripts\/bash\//);
    assert.match(claude, /pwsh/);
    assert.notEqual(claude.includes(agents.trim()), true);
  });

  it("adds a simplified-acceptance pre-read exemption without rewriting existing AGENTS.md rules", () => {
    const agents = readRepoFile("AGENTS.md");
    assert.match(agents, /简化验收/);
    assert.match(agents, /Constitution VIII/);
    assert.match(agents, /不得把 Journal、Receipt 或外部 Projection 当作执行授权/);
    assert.match(
      agents,
      /保留无关和进入任务前已有的工作树修改；不得删除、覆盖或重新初始化/,
    );
  });

  it("exposes speckit skills on the Claude Code discovery path", () => {
    for (const name of SPECKIT_SKILLS) {
      const pointer = join(claudeSkillsDir, name, "SKILL.md");
      const source = join(agentsSkillsDir, name, "SKILL.md");
      assert.equal(existsSync(source), true, `expected ${source}`);
      assert.equal(existsSync(pointer), true, `expected ${pointer}`);
      const pointerText = readFileSync(pointer, "utf8");
      assert.match(pointerText, new RegExp(`\\.agents/skills/${name}/SKILL\\.md`));
      assert.match(pointerText, /\.specify\/scripts\/bash\//);
    }
  });

  it("ships two GitHub Issue skeletons", () => {
    const moduleTemplate = readRepoFile(
      ".github/ISSUE_TEMPLATE/module.md",
    );
    const fixTemplate = readRepoFile(".github/ISSUE_TEMPLATE/fix.md");

    for (const heading of ["范围", "必须交付", "明确不做", "正本", "流程"]) {
      assert.match(moduleTemplate, new RegExp(`^## ${heading}\\s*$`, "m"));
      assert.match(fixTemplate, new RegExp(`^## ${heading}\\s*$`, "m"));
    }
    assert.match(moduleTemplate, /完整.*Spec Kit/);
    assert.match(fixTemplate, /简化验收/);
    assert.match(fixTemplate, /父合同/);
  });

  it("runs speckit bash helpers without pwsh and keeps JSON fields aligned", () => {
    const featureDir = join(repoRoot, "specs", "009-pilot-gate");
    const env = {
      SPECIFY_FEATURE_DIRECTORY: featureDir,
    };

    const dryRun = runBash(
      "create-new-feature.sh",
      ["--json", "--dry-run", "--short-name", "toolchain-check", "contributor toolchain"],
      env,
    );
    assert.equal(dryRun.status, 0, dryRun.stderr);
    const dryRunJson = parseJsonObject(dryRun.stdout);
    assert.equal(typeof dryRunJson.BRANCH_NAME, "string");
    assert.equal(typeof dryRunJson.SPEC_FILE, "string");
    assert.equal(typeof dryRunJson.FEATURE_NUM, "string");
    assert.equal(dryRunJson.DRY_RUN, true);

    const pathsOnly = runBash(
      "check-prerequisites.sh",
      ["--json", "--paths-only"],
      env,
    );
    assert.equal(pathsOnly.status, 0, pathsOnly.stderr);
    const pathsJson = parseJsonObject(pathsOnly.stdout);
    for (const key of [
      "REPO_ROOT",
      "BRANCH",
      "FEATURE_DIR",
      "FEATURE_SPEC",
      "IMPL_PLAN",
      "TASKS",
    ]) {
      assert.equal(typeof pathsJson[key], "string", key);
    }

    const prereq = runBash(
      "check-prerequisites.sh",
      ["--json", "--require-tasks", "--include-tasks"],
      env,
    );
    assert.equal(prereq.status, 0, prereq.stderr);
    const prereqJson = parseJsonObject(prereq.stdout);
    assert.equal(typeof prereqJson.FEATURE_DIR, "string");
    assert.equal(Array.isArray(prereqJson.AVAILABLE_DOCS), true);
    assert.equal(
      (prereqJson.AVAILABLE_DOCS as string[]).includes("tasks.md"),
      true,
    );

    const plan = runBash("setup-plan.sh", ["--json"], env);
    assert.equal(plan.status, 0, plan.stderr);
    const planJson = parseJsonObject(plan.stdout);
    for (const key of ["FEATURE_SPEC", "IMPL_PLAN", "SPECS_DIR", "BRANCH"]) {
      assert.equal(typeof planJson[key], "string", key);
    }

    const tasks = runBash("setup-tasks.sh", ["--json"], env);
    assert.equal(tasks.status, 0, tasks.stderr);
    const tasksJson = parseJsonObject(tasks.stdout);
    assert.equal(typeof tasksJson.FEATURE_DIR, "string");
    assert.equal(typeof tasksJson.TASKS_TEMPLATE, "string");
    assert.equal(typeof tasksJson.TASKS_TEMPLATE_CONTENT, "string");
    assert.equal(Array.isArray(tasksJson.AVAILABLE_DOCS), true);

    const template = runBash("resolve-template.sh", ["spec-template", "--json"]);
    assert.equal(template.status, 0, template.stderr);
    const templateJson = parseJsonObject(template.stdout);
    assert.equal(templateJson.TEMPLATE_NAME, "spec-template");
    assert.equal(typeof templateJson.TEMPLATE_CONTENT, "string");
    assert.match(String(templateJson.TEMPLATE_CONTENT), /Feature Specification/);
  });
});
