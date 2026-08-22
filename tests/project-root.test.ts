import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { candidateProjectRoot } from "../src/hufu/project-root.js";

const mainJs = fileURLToPath(new URL("../src/hufu/main.js", import.meta.url));

const CONNECT_ARGS = [
  "connect",
  "--project-id",
  "demo",
  "--repository",
  "https://example.com/demo.git",
  "--task-authority",
  "local",
  "--commander",
  "human:alice",
  "--grant-scope",
  "local ledger and handoff",
] as const;

function runHufu(
  args: readonly string[],
  cwd: string,
  env: Record<string, string | undefined> = {},
) {
  const next: Record<string, string | undefined> = { ...process.env, ...env };
  if (!Object.prototype.hasOwnProperty.call(env, "HUFU_PROJECT_ROOT")) {
    delete next["HUFU_PROJECT_ROOT"];
  }
  return spawnSync(process.execPath, [mainJs, ...args], {
    cwd,
    encoding: "utf8",
    env: next,
  });
}

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "hufu-root-"));
  try {
    fn(realpathSync(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseStdout(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe("CLI project root contract (#40)", () => {
  it("defaults to process cwd and prints the resolved root", () => {
    withTempDir((dir) => {
      const result = runHufu(CONNECT_ARGS, dir);
      assert.equal(result.status, 0, result.stderr);
      const body = parseStdout(result.stdout);
      assert.equal(body["ok"], true);
      assert.equal(body["project_root"], dir);
      assert.equal(existsSync(join(dir, ".hufu", "ledger", "events.jsonl")), true);
    });
  });

  it("writes the ledger to --project-root instead of cwd", () => {
    withTempDir((cwd) => {
      withTempDir((target) => {
        const result = runHufu([...CONNECT_ARGS, "--project-root", target], cwd);
        assert.equal(result.status, 0, result.stderr);
        const body = parseStdout(result.stdout);
        assert.equal(body["project_root"], target);
        assert.equal(
          existsSync(join(target, ".hufu", "ledger", "events.jsonl")),
          true,
        );
        assert.equal(existsSync(join(cwd, ".hufu")), false);
      });
    });
  });

  it("uses HUFU_PROJECT_ROOT when the flag is absent", () => {
    withTempDir((cwd) => {
      withTempDir((target) => {
        const result = runHufu(CONNECT_ARGS, cwd, {
          HUFU_PROJECT_ROOT: target,
        });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(parseStdout(result.stdout)["project_root"], target);
        assert.equal(
          existsSync(join(target, ".hufu", "ledger", "events.jsonl")),
          true,
        );
        assert.equal(existsSync(join(cwd, ".hufu")), false);
      });
    });
  });

  it("lets --project-root win over HUFU_PROJECT_ROOT", () => {
    withTempDir((cwd) => {
      withTempDir((flagRoot) => {
        withTempDir((envRoot) => {
          const result = runHufu(
            [...CONNECT_ARGS, "--project-root", flagRoot],
            cwd,
            { HUFU_PROJECT_ROOT: envRoot },
          );
          assert.equal(result.status, 0, result.stderr);
          assert.equal(parseStdout(result.stdout)["project_root"], flagRoot);
          assert.equal(
            existsSync(join(flagRoot, ".hufu", "ledger", "events.jsonl")),
            true,
          );
          assert.equal(existsSync(join(envRoot, ".hufu")), false);
        });
      });
    });
  });

  it("fails closed for empty, missing, and non-directory roots", () => {
    withTempDir((dir) => {
      const filePath = join(dir, "not-a-dir");
      writeFileSync(filePath, "x\n", "utf8");
      const missing = join(dir, "missing-root");

      const cases: Array<{
        args: readonly string[];
        env?: Record<string, string | undefined>;
      }> = [
        { args: [...CONNECT_ARGS, "--project-root", ""] },
        { args: [...CONNECT_ARGS, "--project-root", "   "] },
        { args: [...CONNECT_ARGS, "--project-root"] },
        { args: [...CONNECT_ARGS, "--project-root", missing] },
        { args: [...CONNECT_ARGS, "--project-root", filePath] },
        { args: CONNECT_ARGS, env: { HUFU_PROJECT_ROOT: "" } },
      ];

      for (const testCase of cases) {
        const result = runHufu(testCase.args, dir, testCase.env);
        assert.equal(result.status, 2, result.stdout);
        const body = parseStdout(result.stdout);
        assert.equal(body["ok"], false);
        assert.equal(
          (body["error"] as { code: string }).code,
          "CONTRACT_INVALID",
        );
        assert.equal(body["project_root"], undefined);
        assert.equal(existsSync(join(dir, ".hufu")), false);
      }
    });
  });

  it("prints project_root on post-resolution failures for all bounded commands", () => {
    withTempDir((cwd) => {
      withTempDir((target) => {
        const commands: readonly (readonly string[])[] = [
          ["doctor", "--project-root", target],
          ["status", "--project-root", target],
          ["handoff", "--project-root", target],
          ["decide", "--project-root", target],
          ["pilot", "--project-root", target],
        ];
        for (const args of commands) {
          const result = runHufu(args, cwd);
          assert.notEqual(result.status, 0, args[0]);
          assert.ok(result.status === 2 || result.status === 4, args[0]);
          const body = parseStdout(result.stdout);
          assert.equal(body["project_root"], target, args[0]);
          assert.equal(existsSync(join(cwd, ".hufu")), false);
        }
      });
    });
  });
});

describe("Windows path shapes (#40 contract, host FS not required)", () => {
  const win = win32;

  it("treats drive-letter slash variants as the same root", () => {
    assert.equal(
      candidateProjectRoot("C:\\Users\\alice\\proj", "D:\\cwd", win),
      candidateProjectRoot("C:/Users/alice/proj", "D:\\cwd", win),
    );
    assert.equal(
      candidateProjectRoot("C:\\Users\\alice\\proj\\", "D:\\cwd", win),
      candidateProjectRoot("C:\\Users\\alice\\proj", "D:\\cwd", win),
    );
    assert.equal(
      candidateProjectRoot("proj", "C:\\work", win),
      "C:\\work\\proj",
    );
  });

  it("resolves UNC and mixed separators with win32 rules", () => {
    assert.equal(
      candidateProjectRoot("\\\\server\\share\\proj", "C:\\work", win),
      win.resolve("C:\\work", "\\\\server\\share\\proj"),
    );
    assert.equal(
      candidateProjectRoot("C:\\Users/alice\\proj", "D:\\cwd", win),
      candidateProjectRoot("C:\\Users\\alice\\proj", "D:\\cwd", win),
    );
  });
});
