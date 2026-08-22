import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { connectWorkspace } from "../src/hufu/connect.js";
import { CommandError } from "../src/hufu/errors.js";
import { gitlabCachePath, readGitLabProjectionCache } from "../src/hufu/gitlab-cache.js";
import { createHttpGitLabPort } from "../src/hufu/gitlab-http.js";
import { type GitLabPort } from "../src/hufu/gitlab-port.js";
import { statusWorkspace } from "../src/hufu/status.js";

const fixturePath = fileURLToPath(
  new URL("../../tests/fixtures/gitlab/list-issues.sample.json", import.meta.url),
);

function loadFixture(): unknown {
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "hufu-gl-adapter-"));
  return fn(dir).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

describe("gitlab adapter", () => {
  it("lists with GET only, drops merge requests, and omits issue description", async () => {
    const calls: { headers: unknown; method: string; url: string }[] = [];
    const port = createHttpGitLabPort({
      fetch: async (url, init) => {
        calls.push({
          headers: init?.headers ?? null,
          method: init?.method ?? "GET",
          url: String(url),
        });
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => loadFixture(),
        };
      },
      now: () => new Date("2026-08-16T12:00:00.000Z"),
    });
    assert.deepEqual(Object.keys(port), ["listIssueProjections"]);
    assert.equal("createIssue" in port, false);
    assert.equal("updateIssue" in port, false);
    assert.equal("closeIssue" in port, false);
    assert.equal("comment" in port, false);
    assert.equal("merge" in port, false);

    const listed = await port.listIssueProjections("example-group/example-project");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, "GET");
    assert.match(
      calls[0]?.url ?? "",
      /gitlab\.com\/api\/v4\/projects\/example-group%2Fexample-project\/issues/,
    );
    assert.equal(JSON.stringify(calls[0]?.headers ?? {}).includes("Authorization"), false);
    assert.equal(listed.items.length, 2);
    assert.equal(
      listed.items[0]?.external_ref,
      "gitlab:example-group/example-project#456",
    );
    assert.equal(
      listed.items.some((item) => item.original_url.includes("/merge_requests/")),
      false,
    );
    assert.equal(
      JSON.stringify(listed).includes("THIS DESCRIPTION MUST NOT REACH"),
      false,
    );
  });

  it("keeps the old cache when a later list fails", async () => {
    await withTempDir(async (dir) => {
      connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: "read-only projection and handoff",
        projectId: "demo",
        repository: "example-group/example-project",
        taskAuthority: "gitlab",
      });
      const okPort: GitLabPort = {
        async listIssueProjections() {
          return {
            incomplete: false,
            items: [
              {
                external_ref: "gitlab:example-group/example-project#456",
                native_state: "opened",
                original_url:
                  "https://gitlab.com/example-group/example-project/-/issues/456",
                title: "M6",
                observed_at: "2026-08-16T12:00:00.000Z",
              },
            ],
            observed_at: "2026-08-16T12:00:00.000Z",
          };
        },
      };
      await statusWorkspace(dir, { refresh: true, gitlabPort: okPort });
      const before = readFileSync(gitlabCachePath(dir), "utf8");

      const failing: GitLabPort = {
        async listIssueProjections() {
          throw new CommandError("OBSERVATION_UNAVAILABLE", "offline");
        },
      };
      await assert.rejects(
        () => statusWorkspace(dir, { refresh: true, gitlabPort: failing }),
        (error: unknown) =>
          error instanceof CommandError &&
          error.code === "OBSERVATION_UNAVAILABLE",
      );
      assert.equal(readFileSync(gitlabCachePath(dir), "utf8"), before);
      const view = await statusWorkspace(dir, {
        now: new Date("2026-08-18T00:00:00.000Z"),
      });
      assert.equal(view.work_items.length, 1);
      assert.notEqual(view.work_item_set.freshness, "fresh");
      assert.equal(
        readGitLabProjectionCache(dir)?.items[0]?.external_ref,
        "gitlab:example-group/example-project#456",
      );
    });
  });

  it("times out a hanging GitLab fetch and keeps the old observation stale", async () => {
    await withTempDir(async (dir) => {
      connectWorkspace(dir, {
        commander: "human:alice",
        grantScope: "read-only projection and handoff",
        projectId: "demo",
        repository: "example-group/example-project",
        taskAuthority: "gitlab",
      });
      const okPort: GitLabPort = {
        async listIssueProjections() {
          return {
            incomplete: false,
            items: [
              {
                external_ref: "gitlab:example-group/example-project#456",
                native_state: "opened",
                original_url:
                  "https://gitlab.com/example-group/example-project/-/issues/456",
                title: "M6",
                observed_at: "2026-08-16T12:00:00.000Z",
              },
            ],
            observed_at: "2026-08-16T12:00:00.000Z",
          };
        },
      };
      await statusWorkspace(dir, { refresh: true, gitlabPort: okPort });
      const before = readFileSync(gitlabCachePath(dir), "utf8");

      const hanging = createHttpGitLabPort({
        fetch: () => new Promise(() => {}),
        timeoutMs: 30,
      });
      await assert.rejects(
        () => statusWorkspace(dir, { refresh: true, gitlabPort: hanging }),
        (error: unknown) =>
          error instanceof CommandError &&
          error.code === "OBSERVATION_UNAVAILABLE" &&
          /timed out/i.test((error as CommandError).message),
      );
      assert.equal(readFileSync(gitlabCachePath(dir), "utf8"), before);
      const view = await statusWorkspace(dir, {
        now: new Date("2026-08-18T00:00:00.000Z"),
      });
      assert.equal(view.work_item_set.freshness, "stale");
      assert.equal(view.work_items.length, 1);
      assert.equal(
        JSON.stringify(view).includes('"value":0'),
        false,
      );
    });
  });
});
