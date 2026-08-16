import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CORDIS_IMPLEMENTATION,
  CORDIS_VERSION,
  HARNESS_COMMIT,
  UPSTREAM_CORDIS_SUPPORTED,
} from "hufu-dsh";
import { coreSrcDir, repoRoot } from "./helpers.js";

function walkTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTsFiles(path));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

describe("runtime identity", () => {
  it("declares the verified @deepseek-ai/cordis implementation", () => {
    assert.equal(CORDIS_IMPLEMENTATION, "@deepseek-ai/cordis");
    assert.equal(CORDIS_VERSION, "4.0.1");
    assert.equal(HARNESS_COMMIT, "47f943859bef60e4160492346772ded9b24f765a");
    assert.equal(UPSTREAM_CORDIS_SUPPORTED, false);
  });

  it("keeps src/hufu free of cordis and hufu-dsh imports", () => {
    const forbidden = /from\s+["']([^"']*cordis[^"']*|hufu-dsh)["']/;
    for (const file of walkTsFiles(coreSrcDir)) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, forbidden, file);
    }
  });

  it("does not put Cordis on the root package", () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    assert.equal(manifest.dependencies, undefined);
    assert.equal(
      (manifest.devDependencies ?? {})["@deepseek-ai/cordis"],
      undefined,
    );
    const pluginManifest = JSON.parse(
      readFileSync(join(repoRoot, "packages", "hufu-dsh", "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    assert.equal(
      pluginManifest.dependencies["@deepseek-ai/cordis"],
      "4.0.1",
    );
  });

  it("does not claim compatibility with upstream cordis", () => {
    const pluginSources = walkTsFiles(join(repoRoot, "packages", "hufu-dsh", "src"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    assert.doesNotMatch(pluginSources, /兼容上游\s*cordis/);
    assert.doesNotMatch(pluginSources, /compatible with upstream cordis/i);
  });
});
