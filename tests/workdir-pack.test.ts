import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

function readRepo(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)),
    "utf8",
  );
}

function packedPaths(): string[] {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as Array<{
    files?: Array<{ path?: string }>;
  }>;
  const files = parsed[0]?.files ?? [];
  return files
    .map((file) => file.path ?? "")
    .filter((path) => path.length > 0);
}

describe("workdir and publish surface (#38)", () => {
  it("documents invoking the built CLI from the intended workdir", () => {
    const readme = readRepo("README.md");
    assert.match(readme, /node <repo>\/dist\/src\/hufu\/main\.js/);
    assert.doesNotMatch(
      readme,
      /^pnpm --dir <repo> hufu /m,
      "README must not use pnpm --dir as the ledger recipe; it sets cwd to the repo",
    );
    assert.match(readme, /pnpm --dir/);
    assert.match(readme, /cwd/);
    assert.match(readme, /--project-root/);
    assert.match(readme, /HUFU_PROJECT_ROOT/);
    assert.match(readme, /project_root/);
  });

  it("keeps types on source and packs only the runtime surface", () => {
    const pkg = JSON.parse(readRepo("package.json")) as {
      bin?: { hufu?: string };
      exports?: { "."?: { types?: string; default?: string } };
      files?: string[];
    };
    assert.equal(pkg.exports?.["."]?.types, "./src/hufu/index.ts");
    assert.equal(pkg.exports?.["."]?.default, "./dist/src/hufu/index.js");
    assert.equal(pkg.bin?.hufu, "dist/src/hufu/main.js");
    assert.ok(Array.isArray(pkg.files), "package.json must declare files");
    assert.equal(pkg.files?.includes("dist/src"), true);
    assert.equal(pkg.files?.includes("src/hufu"), true);

    const paths = packedPaths();
    assert.equal(
      paths.some((path) => path === "src/hufu/index.ts" || path.startsWith("src/hufu/")),
      true,
      "types entry requires src/hufu in the pack",
    );
    assert.equal(
      paths.some((path) => path === "dist/src/hufu/main.js"),
      true,
      "bin must remain resolvable",
    );
    for (const banned of ["dist/tests", "specs/", "docs/handoff"]) {
      assert.equal(
        paths.some((path) => path === banned || path.startsWith(banned)),
        false,
        `${banned} must not be in npm pack`,
      );
    }
  });
});
