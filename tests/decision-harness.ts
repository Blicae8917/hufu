import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { openWorkItem } from "../src/hufu/work-item.js";

export const mainJs = fileURLToPath(new URL("../src/hufu/main.js", import.meta.url));

export const CONNECT_ARGS = [
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

export function runHufu(
  args: readonly string[],
  cwd: string,
  env: Record<string, string | undefined> = process.env,
) {
  return spawnSync(process.execPath, [mainJs, ...args], {
    cwd,
    encoding: "utf8",
    env,
  });
}

export function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "hufu-decide-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function parseStdout(stdout: string): Record<string, unknown> {
  return JSON.parse(stdout) as Record<string, unknown>;
}

export function connectOpenGrant(dir: string): {
  grant_id: string;
  grant_revision: number;
} {
  const connected = runHufu(CONNECT_ARGS, dir);
  if (connected.status !== 0) {
    throw new Error(connected.stderr || connected.stdout);
  }
  const result = parseStdout(connected.stdout)["result"] as Record<string, unknown>;
  openWorkItem(dir, {
    objective: "Implement zero-copy decisions",
    terminal_conditions: ["tests pass"],
    work_item_id: "wi-1",
  });
  return {
    grant_id: String(result["grant_id"]),
    grant_revision: Number(result["grant_revision"]),
  };
}

export function basePacket(grantId: string, revision = 1): Record<string, unknown> {
  return {
    acceptance_metric: "tests pass and status shows a decision ref",
    authoritative_state: {
      freshness: "not_applicable",
      observed_at: "2026-08-16T00:00:00.000Z",
      task_ref: "wi-1",
    },
    authority_scope_ref: { grant_id: grantId, revision },
    business_outcome: "Record one canonical decision",
    decision_id: "decision-demo",
    evidence_as_of: "2026-08-16T00:00:00.000Z",
    non_goals: ["rewrite the github issue"],
    recheck_when: {
      at_or_after: "2026-01-01T00:00:00.000Z",
      type: "wall_clock",
    },
    simplest_safe_route: "record packet then envelope then ack",
    true_stoplines: ["do not write back issues"],
    unknowns: ["runtime token usage"],
    verified_facts: [
      { evidence_ref: "ev-connect", proposition: "workspace is connected" },
    ],
    version: 1,
  };
}

export function writeJson(dir: string, name: string, value: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
  return path;
}

export function recordPacket(dir: string, grantId: string): Record<string, unknown> {
  const path = writeJson(dir, "packet.json", basePacket(grantId));
  const result = runHufu(
    ["decide", "--actor", "human:alice", "--packet", path],
    dir,
  );
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`);
  }
  return parseStdout(result.stdout)["result"] as Record<string, unknown>;
}

export function recordEnvelope(
  dir: string,
  packet: Record<string, unknown>,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  const path = writeJson(dir, "envelope.json", {
    content_digest: packet["content_digest"],
    decision_id: packet["decision_id"],
    executor_principal_id: "human:alice",
    version: packet["version"],
    work_item_ids: ["wi-1"],
    ...extras,
  });
  const result = runHufu(
    ["decide", "--actor", "human:alice", "--envelope", path],
    dir,
  );
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`);
  }
  return parseStdout(result.stdout)["result"] as Record<string, unknown>;
}

export function engineFixture(name: string): Record<string, unknown> {
  const path = fileURLToPath(
    new URL(`../../tests/fixtures/engine/${name}`, import.meta.url),
  );
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

export function bindEngine(
  dir: string,
  actor = "human:alice",
): Record<string, unknown> {
  const path = writeJson(dir, "engine.json", engineFixture("engine.json"));
  const result = runHufu(["decide", "--actor", actor, "--engine", path], dir);
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`);
  }
  return parseStdout(result.stdout)["result"] as Record<string, unknown>;
}

export function statusView(dir: string): Record<string, unknown> {
  const result = runHufu(["status"], dir);
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`);
  }
  return parseStdout(result.stdout)["result"] as Record<string, unknown>;
}
