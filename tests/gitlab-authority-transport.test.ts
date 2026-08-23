import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { connectWorkspace } from "../src/hufu/connect.js";
import { decideWorkspace } from "../src/hufu/decide.js";
import { doctorWorkspace } from "../src/hufu/doctor.js";
import { CommandError } from "../src/hufu/errors.js";
import {
  gitlabCachePath,
  readGitLabProjectionCache,
} from "../src/hufu/gitlab-cache.js";
import { createHttpGitLabInstancePort } from "../src/hufu/gitlab-instance-http.js";
import {
  gitlabInstanceCachePath,
  readGitLabInstanceProjectionCache,
} from "../src/hufu/gitlab-instance-cache.js";
import { parseGitLabInstanceIdentity } from "../src/hufu/gitlab-instance-ref.js";
import { type GitLabPort } from "../src/hufu/gitlab-port.js";
import { recordHandoff } from "../src/hufu/handoff.js";
import { type SecretProvider } from "../src/hufu/secret-provider.js";
import { statusWorkspace } from "../src/hufu/status.js";
import { basePacket } from "./decision-harness.js";

const fixturePath = fileURLToPath(
  new URL("../../tests/fixtures/gitlab/instance-list-issues.sample.json", import.meta.url),
);
const EXAMPLE_ORIGIN = "https://gitlab.example.com";
const EXAMPLE_PROJECT = "example-group/example-project";
const EXAMPLE_REF =
  "gitlab-instance:gitlab.example.com/example-group/example-project#456";
const EXAMPLE_CREDENTIAL = "example-host-injected-credential";
const EXAMPLE_ITEM = {
  external_ref: EXAMPLE_REF,
  native_state: "opened",
  original_url:
    "https://gitlab.example.com/example-group/example-project/-/issues/456",
  title: "Example self-hosted issue",
  observed_at: "2026-08-16T12:00:00.000Z",
  source_revision: "2026-08-16T10:00:00Z",
  labels: ["example-label"],
  assignee: "example-user",
  milestone: "example-milestone",
  updated_at: "2026-08-16T10:00:00Z",
} as const;

function loadFixture(): unknown {
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

function exampleSecret(): SecretProvider {
  return {
    resolve() {
      return EXAMPLE_CREDENTIAL;
    },
  };
}

function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "hufu-gl-auth-"));
  return fn(dir).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

function connectExample(dir: string) {
  return connectWorkspace(dir, {
    commander: "human:alice",
    grantScope: "read-only projection and handoff",
    projectId: "demo",
    repository: EXAMPLE_PROJECT,
    taskAuthority: "gitlab",
    instanceKind: "self_hosted",
    instanceOrigin: EXAMPLE_ORIGIN,
    allowedInstanceOrigins: [EXAMPLE_ORIGIN],
    identitySource: "explicit",
    secretProvider: exampleSecret(),
  });
}

function collectFiles(directory: string, acc: string[] = []): string[] {
  if (!existsSync(directory)) {
    return acc;
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, acc);
      continue;
    }
    if (entry.isFile()) {
      acc.push(full);
    }
  }
  return acc;
}

function assertSecretAbsent(dir: string): void {
  for (const file of collectFiles(dir)) {
    const raw = readFileSync(file, "utf8");
    assert.equal(
      raw.includes(EXAMPLE_CREDENTIAL),
      false,
      `${file} must not store the host-injected credential`,
    );
    assert.doesNotMatch(raw, /glpat-[A-Za-z0-9_-]{8,}/);
    assert.doesNotMatch(raw, /"Authorization"|Authorization:|Bearer /i);
  }
}

function jsonHeaders(init: {
  get(name: string): string | null;
}): { get(name: string): string | null } {
  return init;
}

describe("gitlab authority authenticated read (#53)", () => {
  it("issues controlled authenticated GET against the example origin only", async () => {
    const calls: { headers: unknown; method: string; url: string }[] = [];
    const identity = parseGitLabInstanceIdentity({
      instanceKind: "self_hosted",
      instanceOrigin: EXAMPLE_ORIGIN,
      projectPath: EXAMPLE_PROJECT,
    });
    const port = createHttpGitLabInstancePort({
      identity,
      secretProvider: exampleSecret(),
      fetch: async (url, init) => {
        calls.push({
          headers: init?.headers ?? null,
          method: String(init?.method ?? "GET"),
          url: String(url),
        });
        return {
          ok: true,
          status: 200,
          headers: jsonHeaders({ get: () => null }),
          json: async () => loadFixture(),
        };
      },
      now: () => new Date("2026-08-16T12:00:00.000Z"),
    });
    const listed = await port.listIssueProjections(EXAMPLE_PROJECT);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, "GET");
    assert.match(
      calls[0]?.url ?? "",
      /^https:\/\/gitlab\.example\.com\/api\/v4\/projects\/example-group%2Fexample-project\/issues/,
    );
    assert.doesNotMatch(calls[0]?.url ?? "", /gitlab\.com/);
    const headerText = JSON.stringify(calls[0]?.headers ?? {});
    assert.match(headerText, /Authorization/);
    assert.match(headerText, /Bearer example-host-injected-credential/);
    assert.equal(listed.items.length, 2);
    assert.equal(listed.items[0]?.external_ref, EXAMPLE_REF);
    assert.deepEqual(listed.items[0]?.labels, ["example-label"]);
    assert.equal(listed.items[0]?.assignee, "example-user");
    assert.equal(listed.items[0]?.milestone, "example-milestone");
    assert.equal(JSON.stringify(listed).includes("THIS DESCRIPTION MUST NOT REACH"), false);
    assert.equal(
      listed.items.some((item) => item.original_url.includes("/merge_requests/")),
      false,
    );
  });

  it("follows classic Issue pagination on the same origin and keeps GET-only", async () => {
    const calls: string[] = [];
    const identity = parseGitLabInstanceIdentity({
      instanceKind: "self_hosted",
      instanceOrigin: EXAMPLE_ORIGIN,
      projectPath: EXAMPLE_PROJECT,
    });
    const page1 = [
      {
        iid: 456,
        title: "Page one",
        web_url:
          "https://gitlab.example.com/example-group/example-project/-/issues/456",
        state: "opened",
        updated_at: "2026-08-16T10:00:00Z",
        type: "Issue",
      },
    ];
    const page2 = [
      {
        iid: 457,
        title: "Page two",
        web_url:
          "https://gitlab.example.com/example-group/example-project/-/issues/457",
        state: "opened",
        updated_at: "2026-08-16T11:00:00Z",
        type: "Issue",
      },
    ];
    const port = createHttpGitLabInstancePort({
      identity,
      secretProvider: exampleSecret(),
      fetch: async (url, init) => {
        assert.equal(init?.method ?? "GET", "GET");
        const href = String(url);
        calls.push(href);
        if (/[?&]page=2(?:&|$)/.test(href)) {
          return {
            ok: true,
            status: 200,
            headers: jsonHeaders({ get: () => null }),
            json: async () => page2,
          };
        }
        return {
          ok: true,
          status: 200,
          headers: jsonHeaders({
            get(name: string) {
              if (name.toLowerCase() === "x-next-page") {
                return "2";
              }
              if (name.toLowerCase() === "link") {
                return `<${EXAMPLE_ORIGIN}/api/v4/projects/example-group%2Fexample-project/issues?state=all&per_page=100&page=2>; rel="next"`;
              }
              return null;
            },
          }),
          json: async () => page1,
        };
      },
    });
    const listed = await port.listIssueProjections(EXAMPLE_PROJECT);
    assert.equal(calls.length, 2);
    assert.equal(listed.items.length, 2);
    assert.equal(listed.incomplete, false);
    assert.equal(
      listed.items[1]?.external_ref,
      "gitlab-instance:gitlab.example.com/example-group/example-project#457",
    );
  });

  it("fails closed on a redirect that escapes the authorized origin", async () => {
    const identity = parseGitLabInstanceIdentity({
      instanceKind: "self_hosted",
      instanceOrigin: EXAMPLE_ORIGIN,
      projectPath: EXAMPLE_PROJECT,
    });
    const port = createHttpGitLabInstancePort({
      identity,
      secretProvider: exampleSecret(),
      fetch: async () => ({
        ok: false,
        status: 302,
        headers: jsonHeaders({
          get(name: string) {
            return name.toLowerCase() === "location"
              ? "https://gitlab.com/api/v4/projects/example-group%2Fexample-project/issues"
              : null;
          },
        }),
        json: async () => {
          throw new Error("redirect body must not be parsed");
        },
      }),
    });
    await assert.rejects(
      () => port.listIssueProjections(EXAMPLE_PROJECT),
      (error: unknown) =>
        error instanceof CommandError &&
        (error.code === "REPOSITORY_NOT_ALLOWED" ||
          error.code === "OBSERVATION_UNAVAILABLE"),
    );
  });

  it("connects, refreshes, caches, and reports freshness without writing the 007 cache file", async () => {
    await withTempDir(async (dir) => {
      connectExample(dir);
      assert.equal(existsSync(gitlabCachePath(dir)), false);
      const port: GitLabPort = {
        async listIssueProjections() {
          return {
            incomplete: false,
            items: [EXAMPLE_ITEM],
            observed_at: "2026-08-16T12:00:00.000Z",
          };
        },
      };
      const fresh = await statusWorkspace(dir, {
        refresh: true,
        gitlabPort: port,
        now: new Date("2026-08-16T12:05:00.000Z"),
      });
      assert.equal(fresh.work_items.length, 1);
      assert.equal(fresh.work_items[0]?.work_item_id, EXAMPLE_REF);
      assert.deepEqual(fresh.work_items[0]?.labels, ["example-label"]);
      assert.equal(fresh.work_items[0]?.assignee, "example-user");
      assert.equal(fresh.work_items[0]?.milestone, "example-milestone");
      assert.equal(fresh.work_item_set.freshness, "fresh");
      assert.equal(existsSync(gitlabCachePath(dir)), false);
      assert.equal(
        readGitLabInstanceProjectionCache(dir)?.items[0]?.external_ref,
        EXAMPLE_REF,
      );
      assert.equal(readGitLabProjectionCache(dir), undefined);
      const stale = await statusWorkspace(dir, {
        now: new Date("2026-08-18T00:00:00.000Z"),
      });
      assert.equal(stale.work_item_set.freshness, "stale");
      assert.equal(stale.work_items.length, 1);
      assertSecretAbsent(dir);
    });
  });

  it("keeps the old instance cache when a later list fails", async () => {
    await withTempDir(async (dir) => {
      connectExample(dir);
      const okPort: GitLabPort = {
        async listIssueProjections() {
          return {
            incomplete: false,
            items: [EXAMPLE_ITEM],
            observed_at: "2026-08-16T12:00:00.000Z",
          };
        },
      };
      await statusWorkspace(dir, { refresh: true, gitlabPort: okPort });
      const before = readFileSync(gitlabInstanceCachePath(dir), "utf8");
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
      assert.equal(readFileSync(gitlabInstanceCachePath(dir), "utf8"), before);
      const view = await statusWorkspace(dir, {
        now: new Date("2026-08-18T00:00:00.000Z"),
      });
      assert.equal(view.work_item_set.freshness, "stale");
      assert.equal(view.work_items[0]?.work_item_id, EXAMPLE_REF);
      assert.notEqual(JSON.stringify(view).includes('"value":0'), true);
    });
  });

  it("never writes the credential to the ledger, cache, or doctor output", async () => {
    await withTempDir(async (dir) => {
      connectExample(dir);
      const port = createHttpGitLabInstancePort({
        identity: parseGitLabInstanceIdentity({
          instanceKind: "self_hosted",
          instanceOrigin: EXAMPLE_ORIGIN,
          projectPath: EXAMPLE_PROJECT,
        }),
        secretProvider: exampleSecret(),
        fetch: async () => ({
          ok: true,
          status: 200,
          headers: jsonHeaders({ get: () => null }),
          json: async () => loadFixture(),
        }),
        now: () => new Date("2026-08-16T12:00:00.000Z"),
      });
      await statusWorkspace(dir, { refresh: true, gitlabPort: port });
      const doctor = doctorWorkspace(dir, { secretProvider: exampleSecret() });
      assert.equal(doctor.credential_available, true);
      assert.equal(doctor.write_back_enabled, false);
      assert.equal(doctor.instance_kind, "self_hosted");
      assert.equal(doctor.instance_origin, EXAMPLE_ORIGIN);
      assert.equal(JSON.stringify(doctor).includes(EXAMPLE_CREDENTIAL), false);
      assertSecretAbsent(dir);
    });
  });

  it("lets decide and handoff consume only cached gitlab-instance refs", async () => {
    await withTempDir(async (dir) => {
      const connected = connectExample(dir);
      const state = { calls: 0 };
      const port: GitLabPort = {
        async listIssueProjections() {
          state.calls += 1;
          return {
            incomplete: false,
            items: [EXAMPLE_ITEM],
            observed_at: "2026-08-16T12:00:00.000Z",
          };
        },
      };
      await statusWorkspace(dir, { refresh: true, gitlabPort: port });
      const before = state.calls;
      const packet = basePacket(connected.grant_id);
      (packet["authoritative_state"] as Record<string, unknown>)["task_ref"] =
        EXAMPLE_REF;
      const decided = decideWorkspace(dir, {
        actor: "human:alice",
        kind: "packet",
        payload: packet,
      });
      assert.equal(decided["version"], 1);
      assert.equal(state.calls, before);
      const handoff = recordHandoff(dir, {
        completed: "spec drafted",
        remaining: "review",
        workItemId: EXAMPLE_REF,
      });
      assert.equal(handoff.work_item_id, EXAMPLE_REF);
      assert.equal(state.calls, before);
      assert.throws(
        () =>
          decideWorkspace(dir, {
            actor: "human:alice",
            kind: "packet",
            payload: {
              ...packet,
              authoritative_state: {
                ...(packet["authoritative_state"] as Record<string, unknown>),
                task_ref: "gitlab:example-group/example-project#456",
              },
            },
          }),
        (error: unknown) =>
          error instanceof CommandError &&
          (error.code === "EXTERNAL_REF_INVALID" ||
            error.code === "DATA_INSUFFICIENT"),
      );
    });
  });

  it("fails closed when the host credential is missing at connect or refresh", async () => {
    await withTempDir(async (dir) => {
      assert.throws(
        () =>
          connectWorkspace(dir, {
            commander: "human:alice",
            grantScope: "read-only projection and handoff",
            projectId: "demo",
            repository: EXAMPLE_PROJECT,
            taskAuthority: "gitlab",
            instanceKind: "self_hosted",
            instanceOrigin: EXAMPLE_ORIGIN,
            allowedInstanceOrigins: [EXAMPLE_ORIGIN],
            identitySource: "explicit",
            secretProvider: {
              resolve() {
                return undefined;
              },
            },
          }),
        (error: unknown) =>
          error instanceof CommandError && error.code === "CONTRACT_INVALID",
      );
    });
    await withTempDir(async (dir) => {
      connectExample(dir);
      await assert.rejects(
        () =>
          statusWorkspace(dir, {
            refresh: true,
            secretProvider: {
              resolve() {
                return undefined;
              },
            },
          }),
        (error: unknown) =>
          error instanceof CommandError &&
          (error.code === "CONTRACT_INVALID" ||
            error.code === "OBSERVATION_UNAVAILABLE"),
      );
      assert.equal(existsSync(gitlabInstanceCachePath(dir)), false);
    });
  });

  it("lets doctor flag missing credential or cache without printing secret values", async () => {
    await withTempDir(async (dir) => {
      connectExample(dir);
      const doctor = doctorWorkspace(dir, {
        secretProvider: {
          resolve() {
            return undefined;
          },
        },
      });
      assert.equal(doctor.credential_available, false);
      assert.equal(doctor.cache_status, "missing");
      assert.equal(Array.isArray(doctor.findings) && doctor.findings.length > 0, true);
      assert.equal(JSON.stringify(doctor).includes(EXAMPLE_CREDENTIAL), false);
      assert.doesNotMatch(JSON.stringify(doctor), /glpat-|Bearer /);
    });
  });
});
