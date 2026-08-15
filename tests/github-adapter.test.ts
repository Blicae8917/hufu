import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { connectWorkspace } from "../src/hufu/connect.js";
import { CommandError } from "../src/hufu/errors.js";
import { createHttpGitHubPort } from "../src/hufu/github-http.js";
import { type GitHubPort } from "../src/hufu/github-port.js";
import { cachePath, readProjectionCache } from "../src/hufu/projection-cache.js";
import { statusWorkspace } from "../src/hufu/status.js";

const fixturePath = fileURLToPath(
  new URL("../../tests/fixtures/github/list-issues.sample.json", import.meta.url),
);

function loadFixture(): unknown {
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "hufu-gh-adapter-"));
  return fn(dir).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

describe("github adapter", () => {
  it("lists with GET only, drops pull requests, and omits issue body", async () => {
    const calls: { method: string; url: string }[] = [];
    const port = createHttpGitHubPort({
      fetch: async (url, init) => {
        calls.push({ method: init?.method ?? "GET", url: String(url) });
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => loadFixture(),
        };
      },
      now: () => new Date("2026-08-15T23:00:00.000Z"),
    });
    assert.deepEqual(Object.keys(port), ["listIssueProjections"]);
    assert.equal("createIssue" in port, false);
    assert.equal("updateIssue" in port, false);
    assert.equal("closeIssue" in port, false);

    const listed = await port.listIssueProjections();
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, "GET");
    assert.match(calls[0]?.url ?? "", /api\.github\.com\/repos\/Blicae8917\/hufu\/issues/);
    assert.equal(listed.items.length, 2);
    assert.equal(listed.items[0]?.external_ref, "github:Blicae8917/hufu#4");
    assert.equal(
      listed.items.some((item) => item.original_url.includes("/pull/")),
      false,
    );
    assert.equal(
      JSON.stringify(listed).includes("THIS BODY MUST NOT REACH"),
      false,
    );
  });

  it("keeps the old cache when a later list fails", async () => {
    await withTempDir(async (dir) => {
      connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: "read-only projection and handoff",
        projectId: "hufu",
        repository: "https://github.com/Blicae8917/hufu",
        taskAuthority: "github",
      });
      const okPort: GitHubPort = {
        async listIssueProjections() {
          return {
            incomplete: false,
            items: [
              {
                external_ref: "github:Blicae8917/hufu#4",
                native_state: "open",
                original_url: "https://github.com/Blicae8917/hufu/issues/4",
                title: "M3",
                observed_at: "2026-08-15T23:00:00.000Z",
              },
            ],
            observed_at: "2026-08-15T23:00:00.000Z",
          };
        },
      };
      await statusWorkspace(dir, { refresh: true, githubPort: okPort });
      const before = readFileSync(cachePath(dir), "utf8");

      const failing: GitHubPort = {
        async listIssueProjections() {
          throw new CommandError("OBSERVATION_UNAVAILABLE", "offline");
        },
      };
      await assert.rejects(
        () => statusWorkspace(dir, { refresh: true, githubPort: failing }),
        (error: unknown) =>
          error instanceof CommandError &&
          error.code === "OBSERVATION_UNAVAILABLE",
      );
      assert.equal(readFileSync(cachePath(dir), "utf8"), before);
      const view = await statusWorkspace(dir, {
        now: new Date("2026-08-17T00:00:00.000Z"),
      });
      assert.equal(view.work_items.length, 1);
      assert.notEqual(view.work_item_set.freshness, "fresh");
      assert.equal(readProjectionCache(dir)?.items[0]?.external_ref, "github:Blicae8917/hufu#4");
    });
  });
});
