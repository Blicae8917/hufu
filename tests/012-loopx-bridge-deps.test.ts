import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;
const VENDOR_PATHS = [
  "vendor/loopx",
  "third_party/loopx",
  "src/vendor/loopx",
  "src/hufu/vendor/loopx",
  "specs/012-loopx-bridge/vendor",
] as const;

function walkFiles(dir: string, suffix: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      found.push(...walkFiles(path, suffix));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(suffix)) {
      found.push(path);
    }
  }
  return found;
}

function packageJsonPaths(): string[] {
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

describe("012 LoopX bridge dependency lock (#58)", () => {
  it("keeps package.json at 0.1.0 and omits loopx from every dependency field", () => {
    const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version?: string;
    };
    assert.equal(rootPkg.version, "0.1.0");
    for (const path of packageJsonPaths()) {
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
    const lockfile = join(root, "pnpm-lock.yaml");
    if (existsSync(lockfile)) {
      const lock = readFileSync(lockfile, "utf8");
      assert.doesNotMatch(lock, /^ {2}loopx@/m);
      assert.doesNotMatch(lock, /\/loopx@/);
    }
  });

  it("does not import loopx from src/ and does not vendor upstream source", () => {
    const sources = walkFiles(join(root, "src"), ".ts");
    assert.ok(sources.length > 0);
    for (const path of sources) {
      const text = readFileSync(path, "utf8");
      assert.equal(
        /from\s+["']loopx(?:\/[^"']*)?["']/.test(text),
        false,
        `${path} must not import loopx`,
      );
      assert.equal(
        /require\(\s*["']loopx(?:\/[^"']*)?["']\s*\)/.test(text),
        false,
        `${path} must not require loopx`,
      );
    }
    for (const relative of VENDOR_PATHS) {
      assert.equal(existsSync(join(root, relative)), false, relative);
    }
  });

  it("keeps NOTICE as design-research citation and not adopted LoopX source", () => {
    const notice = readFileSync(join(root, "NOTICE.md"), "utf8");
    assert.match(notice, /设计研究/);
    assert.match(notice, /LoopX/);
    assert.doesNotMatch(notice, /已采用源码|采用 LoopX 源码|vendored LoopX/);
    assert.match(notice, /初始实现未包含第三方源代码/);
  });

  it("does not import GitLabTaskMutationProvider from the bridge", () => {
    const bridge = readFileSync(join(root, "src/hufu/loopx-bridge.ts"), "utf8");
    const schema = readFileSync(join(root, "src/hufu/loopx-bridge-schema.ts"), "utf8");
    assert.doesNotMatch(bridge, /gitlab-task-mutation-provider/);
    assert.doesNotMatch(schema, /gitlab-task-mutation-provider/);
    assert.doesNotMatch(bridge, /createGitLabTaskMutationProvider/);
  });
});
