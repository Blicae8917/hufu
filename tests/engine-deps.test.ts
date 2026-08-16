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

describe("loopx dependency lock", () => {
  it("keeps package.json version 0.1.0 and omits loopx from every dependency field", () => {
    const rootPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      version?: string;
      scripts?: Record<string, string>;
    };
    assert.equal(rootPkg.version, "0.1.0");
    assert.match(String(rootPkg.scripts?.["test"] ?? ""), /tsc/);
    assert.match(String(rootPkg.scripts?.["test"] ?? ""), /node --test/);
    for (const path of packageJsonPaths()) {
      const pkg = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      for (const field of DEPENDENCY_FIELDS) {
        const deps = pkg[field];
        if (deps === undefined) {
          continue;
        }
        assert.equal(
          deps !== null && typeof deps === "object" && !Array.isArray(deps),
          true,
          `${path} ${field} must be an object`,
        );
        assert.equal(
          Object.keys(deps as Record<string, unknown>).some((name) => name === "loopx"),
          false,
          `${path} ${field} must not list loopx`,
        );
      }
    }
  });

  it("does not import loopx from src/", () => {
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
});
