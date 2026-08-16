import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

export const hufuDshDir = join(repoRoot, "packages", "hufu-dsh");

export const coreSrcDir = join(repoRoot, "src", "hufu");

export const fixtureDir = join(repoRoot, "tests", "fixtures", "dsh");

export const mainJs = fileURLToPath(
  new URL("../../src/hufu/main.js", import.meta.url),
);

export function assertNotHomeDsh(home: string): void {
  const forbidden = join(homedir(), ".dsh");
  if (home === forbidden) {
    throw new Error("tests must not use the maintainer ~/.dsh directory");
  }
}

export async function withIsolatedDirs<T>(
  fn: (dirs: { home: string; workspace: string }) => Promise<T> | T,
): Promise<T> {
  const home = mkdtempSync(join(tmpdir(), "hufu-dsh-home-"));
  const workspace = mkdtempSync(join(tmpdir(), "hufu-dsh-ws-"));
  assertNotHomeDsh(home);
  const previous = process.env["DSH_HOME"];
  process.env["DSH_HOME"] = home;
  try {
    return await fn({ home, workspace });
  } finally {
    if (previous === undefined) {
      delete process.env["DSH_HOME"];
    } else {
      process.env["DSH_HOME"] = previous;
    }
    rmSync(home, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
}

export function writeLedger(workspace: string, eventsJsonl: string): void {
  const ledgerDir = join(workspace, ".hufu", "ledger");
  mkdirSync(ledgerDir, { recursive: true });
  writeFileSync(join(ledgerDir, "events.jsonl"), eventsJsonl, "utf8");
}

export const CONNECT_ARGS = {
  commander: "human:alice",
  grantScope: "local ledger and handoff",
  projectId: "demo",
  repository: "https://example.com/demo.git",
  taskAuthority: "local",
} as const;
