import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { CommandError } from "../src/hufu/errors.js";
import { appendEvents, readLedger } from "../src/hufu/storage.js";

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "hufu-ledger-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function sampleDraft(idempotencyKey = "test-key-1") {
  return {
    actor_binding_ref: "human:alice",
    event_type: "hufu/project.connected" as const,
    idempotency_key: idempotencyKey,
    payload: {
      project_id: "demo",
      repository: "https://example.com/demo.git",
      stale_after_hours: 24,
      task_authority: "local",
    },
  };
}

describe("JSONL ledger storage", () => {
  it("appends ledger_seq=1 with a trailing LF on an empty ledger", () => {
    withTempDir((dir) => {
      const written = appendEvents(dir, [sampleDraft()]);
      assert.equal(written.length, 1);
      assert.equal(written[0]?.ledger_seq, 1);

      const eventsPath = join(dir, ".hufu", "ledger", "events.jsonl");
      const raw = readFileSync(eventsPath, "utf8");
      assert.ok(raw.endsWith("\n"));
      assert.equal(raw.includes("\r"), false);

      const snapshot = readLedger(dir);
      assert.equal(snapshot.status, "ready");
      if (snapshot.status === "ready") {
        assert.equal(snapshot.events[0]?.ledger_seq, 1);
      }
    });
  });

  it("rejects writes when write.lock already exists and does not create events.jsonl", () => {
    withTempDir((dir) => {
      const ledgerDir = join(dir, ".hufu", "ledger");
      mkdirSync(ledgerDir, { recursive: true });
      writeFileSync(join(ledgerDir, "write.lock"), "{}\n", "utf8");

      assert.throws(
        () => appendEvents(dir, [sampleDraft()]),
        (error: unknown) =>
          error instanceof CommandError &&
          error.code === "LEDGER_WRITER_CONFLICT",
      );
      assert.equal(existsSync(join(ledgerDir, "events.jsonl")), false);
    });
  });

  it("fails closed when a complete middle line is malformed", () => {
    withTempDir((dir) => {
      const ledgerDir = join(dir, ".hufu", "ledger");
      mkdirSync(ledgerDir, { recursive: true });
      writeFileSync(
        join(ledgerDir, "events.jsonl"),
        "{}\nthis is not json\n{}\n",
        "utf8",
      );

      assert.throws(
        () => readLedger(dir),
        (error: unknown) =>
          error instanceof CommandError && error.code === "LEDGER_CORRUPT",
      );
      const raw = readFileSync(join(ledgerDir, "events.jsonl"), "utf8");
      assert.match(raw, /this is not json/);
    });
  });

  it("reports a truncated tail and does not repair it by default", () => {
    withTempDir((dir) => {
      appendEvents(dir, [sampleDraft()]);
      const eventsPath = join(dir, ".hufu", "ledger", "events.jsonl");
      const before = readFileSync(eventsPath, "utf8");
      writeFileSync(eventsPath, `${before}{"incomplete"`, "utf8");

      const snapshot = readLedger(dir);
      assert.equal(snapshot.status, "truncated_tail");
      if (snapshot.status === "truncated_tail") {
        assert.equal(snapshot.events.length, 1);
        assert.ok(snapshot.truncated_bytes > 0);
      }

      const after = readFileSync(eventsPath, "utf8");
      assert.equal(after, `${before}{"incomplete"`);
    });
  });
});
