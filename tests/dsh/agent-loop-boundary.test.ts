import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { repoRoot } from "./helpers.js";

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

describe("agent loop boundary", () => {
  it("does not patch the Host Agent Loop or open outbound sessions", () => {
    const pluginSrc = join(repoRoot, "packages", "hufu-dsh", "src");
    const source = walkTsFiles(pluginSrc)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    assert.doesNotMatch(source, /agentLoop|agent-loop|ctx\.agents/);
    assert.doesNotMatch(source, /sessions\.create|sessions\.fork|sessions\.resume/);
    assert.doesNotMatch(source, /outbound runtime|createHostSession/i);
  });
});
