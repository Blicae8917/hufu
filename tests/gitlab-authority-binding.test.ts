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

import { main } from "../src/hufu/cli.js";
import { connectWorkspace } from "../src/hufu/connect.js";
import { decideWorkspace } from "../src/hufu/decide.js";
import { doctorWorkspace } from "../src/hufu/doctor.js";
import { CommandError } from "../src/hufu/errors.js";
import { createHttpGitLabInstancePort } from "../src/hufu/gitlab-instance-http.js";
import {
  gitlabInstanceCachePath,
  writeGitLabInstanceProjectionCache,
} from "../src/hufu/gitlab-instance-cache.js";
import { parseGitLabInstanceIdentity } from "../src/hufu/gitlab-instance-ref.js";
import { recordHandoff } from "../src/hufu/handoff.js";
import { projectCurrentView } from "../src/hufu/projector.js";
import { type SecretProvider } from "../src/hufu/secret-provider.js";
import { statusWorkspace } from "../src/hufu/status.js";
import { readLedger } from "../src/hufu/storage.js";
import { basePacket } from "./decision-harness.js";

const EXAMPLE_ORIGIN = "https://gitlab.example.com";
const EXAMPLE_HTTP_IPV4_ORIGIN = "http://192.0.2.10:41101";
const EXAMPLE_HTTP_HOST_PORT_ORIGIN = "http://gitlab.example.com:41101";
const PROJECT_A = "group/a";
const PROJECT_B = "group/b";
const LEAK_TOKEN = "glpat-TEST-LEAK-TOKEN-DO-NOT-ECHO-9f3c";
const HOST_CREDENTIAL = "example-host-injected-credential";

function leakSecret(): SecretProvider {
  return {
    resolve() {
      return LEAK_TOKEN;
    },
  };
}

function exampleSecret(): SecretProvider {
  return {
    resolve() {
      return HOST_CREDENTIAL;
    },
  };
}

function jsonHeaders(init: {
  get(name: string): string | null;
}): { get(name: string): string | null } {
  return init;
}

function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "hufu-gl-bind-"));
  return fn(dir).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

function connectSelfHosted(
  dir: string,
  input: {
    readonly origin?: string;
    readonly project?: string;
    readonly secret?: SecretProvider;
  } = {},
) {
  return connectWorkspace(dir, {
    commander: "human:alice",
    grantScope: "read-only projection and handoff",
    projectId: "demo",
    repository: input.project ?? PROJECT_A,
    taskAuthority: "gitlab",
    instanceKind: "self_hosted",
    instanceOrigin: input.origin ?? EXAMPLE_ORIGIN,
    allowedInstanceOrigins: [input.origin ?? EXAMPLE_ORIGIN],
    identitySource: "explicit",
    secretProvider: input.secret ?? exampleSecret(),
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

function errorSurfaces(error: unknown): string {
  const chunks: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      chunks.push(current.message);
      chunks.push(current.name);
      chunks.push(current.stack ?? "");
      current = current.cause;
      continue;
    }
    chunks.push(String(current));
    break;
  }
  try {
    chunks.push(JSON.stringify(error));
  } catch {
    chunks.push("[unserializable]");
  }
  return chunks.join("\n");
}

function assertTokenAbsent(surface: string, label: string): void {
  assert.equal(
    surface.includes(LEAK_TOKEN),
    false,
    `${label} must not contain the token`,
  );
  assert.equal(
    surface.includes(`Bearer ${LEAK_TOKEN}`),
    false,
    `${label} must not contain Bearer plus the token`,
  );
}

function assertWorkspaceHasNoToken(dir: string): void {
  for (const file of collectFiles(dir)) {
    const raw = readFileSync(file, "utf8");
    assert.equal(
      raw.includes(LEAK_TOKEN),
      false,
      `${file} must not store the token`,
    );
    assert.doesNotMatch(raw, /Bearer /i);
    assert.doesNotMatch(raw, /PRIVATE-TOKEN/i);
    assert.doesNotMatch(raw, /HUFU_GITLAB_INSTANCE_TOKEN=/);
  }
}

function issuePayload(input: {
  readonly origin: string;
  readonly project: string;
  readonly iid: number;
  readonly title?: string;
}): Record<string, unknown> {
  return {
    iid: input.iid,
    title: input.title ?? "Example bound issue",
    web_url: `${input.origin}/${input.project}/-/issues/${String(input.iid)}`,
    state: "opened",
    updated_at: "2026-08-16T10:00:00Z",
    type: "Issue",
    references: {
      full: `${input.project}#${String(input.iid)}`,
      short: `#${String(input.iid)}`,
    },
  };
}

function cacheItem(input: {
  readonly origin: string;
  readonly project: string;
  readonly iid: number;
}) {
  const host = new URL(input.origin).hostname.toLowerCase();
  return {
    external_ref: `gitlab-instance:${host}/${input.project}#${String(input.iid)}`,
    native_state: "opened",
    original_url: `${input.origin}/${input.project}/-/issues/${String(input.iid)}`,
    title: "Cached example issue",
    observed_at: "2026-08-16T12:00:00.000Z",
    source_revision: "2026-08-16T10:00:00Z",
    updated_at: "2026-08-16T10:00:00Z",
  };
}

function writeInstanceCache(
  dir: string,
  input: {
    readonly origin: string;
    readonly project: string;
    readonly iid?: number;
  },
): void {
  writeGitLabInstanceProjectionCache(dir, {
    cache_schema_version: 1,
    incomplete: false,
    items: [
      cacheItem({
        origin: input.origin,
        project: input.project,
        iid: input.iid ?? 1,
      }),
    ],
    observed_at: "2026-08-16T12:00:00.000Z",
    repository: input.project,
    instance_origin: input.origin,
    instance_kind: "self_hosted",
    task_authority: "gitlab",
  });
}

function isIdentityMismatch(error: unknown): boolean {
  return (
    error instanceof CommandError &&
    (error.code === "OBSERVATION_UNAVAILABLE" ||
      error.code === "CONTRACT_INVALID" ||
      error.code === "DATA_INSUFFICIENT") &&
    /gitlab instance cache does not match connected identity/i.test(error.message)
  );
}

function isFailClosed(error: unknown): boolean {
  return (
    error instanceof CommandError &&
    (error.code === "OBSERVATION_UNAVAILABLE" ||
      error.code === "REPOSITORY_NOT_ALLOWED" ||
      error.code === "CONTRACT_INVALID")
  );
}

describe("gitlab authority token redaction (#53 Codex)", () => {
  it("does not echo a host-injected token when fetch throws Bearer details", async () => {
    await withTempDir(async (dir) => {
      connectSelfHosted(dir, { secret: leakSecret() });
      const identity = parseGitLabInstanceIdentity({
        instanceKind: "self_hosted",
        instanceOrigin: EXAMPLE_ORIGIN,
        projectPath: PROJECT_A,
      });
      const port = createHttpGitLabInstancePort({
        identity,
        secretProvider: leakSecret(),
        fetch: async () => {
          throw new Error(
            `request failed Authorization: Bearer ${LEAK_TOKEN} PRIVATE-TOKEN: ${LEAK_TOKEN} HUFU_GITLAB_INSTANCE_TOKEN=${LEAK_TOKEN}`,
          );
        },
      });
      await assert.rejects(
        () => port.listIssueProjections(PROJECT_A),
        (error: unknown) => {
          assertTokenAbsent(errorSurfaces(error), "thrown fetch error");
          return error instanceof CommandError;
        },
      );
      assertWorkspaceHasNoToken(dir);
    });
  });

  it("does not echo the token on HTTP 401 or through CLI stdout/stderr", async () => {
    await withTempDir(async (dir) => {
      connectSelfHosted(dir, { secret: leakSecret() });
      const identity = parseGitLabInstanceIdentity({
        instanceKind: "self_hosted",
        instanceOrigin: EXAMPLE_ORIGIN,
        projectPath: PROJECT_A,
      });
      const port = createHttpGitLabInstancePort({
        identity,
        secretProvider: leakSecret(),
        fetch: async () => ({
          ok: false,
          status: 401,
          statusText: `Unauthorized Authorization: Bearer ${LEAK_TOKEN}`,
          headers: jsonHeaders({
            get(name: string) {
              if (name.toLowerCase() === "www-authenticate") {
                return `Bearer realm="gitlab", error="invalid_token"`;
              }
              return null;
            },
          }),
          json: async () => ({
            message: `401 Authorization: Bearer ${LEAK_TOKEN}`,
          }),
          text: async () => `Authorization: Bearer ${LEAK_TOKEN}`,
        }),
      });
      await assert.rejects(
        () => port.listIssueProjections(PROJECT_A),
        (error: unknown) => {
          assertTokenAbsent(errorSurfaces(error), "401 CommandError");
          return error instanceof CommandError;
        },
      );

      const previousFetch = globalThis.fetch;
      const stdout: string[] = [];
      const stderr: string[] = [];
      const writeOut = process.stdout.write.bind(process.stdout);
      const writeErr = process.stderr.write.bind(process.stderr);
      process.stdout.write = ((chunk: unknown) => {
        stdout.push(String(chunk));
        return true;
      }) as typeof process.stdout.write;
      process.stderr.write = ((chunk: unknown) => {
        stderr.push(String(chunk));
        return true;
      }) as typeof process.stderr.write;
      globalThis.fetch = (async () => {
        throw new Error(`Authorization: Bearer ${LEAK_TOKEN}`);
      }) as typeof fetch;
      const previousToken = process.env["HUFU_GITLAB_INSTANCE_TOKEN"];
      const previousDeny = process.env["HUFU_DENY_NETWORK"];
      process.env["HUFU_GITLAB_INSTANCE_TOKEN"] = LEAK_TOKEN;
      delete process.env["HUFU_DENY_NETWORK"];
      try {
        const code = await main(["status", "--refresh", "--project-root", dir]);
        assert.notEqual(code, 0);
        const captured = `${stdout.join("")}\n${stderr.join("")}`;
        assertTokenAbsent(captured, "CLI stdout+stderr");
        assert.doesNotMatch(captured, /Bearer\s+\S+/i);
        assert.doesNotMatch(captured, /PRIVATE-TOKEN/i);
        assert.doesNotMatch(captured, /HUFU_GITLAB_INSTANCE_TOKEN=/);
        assert.doesNotMatch(captured, /glpat-[A-Za-z0-9_-]+/);
      } finally {
        globalThis.fetch = previousFetch;
        process.stdout.write = writeOut;
        process.stderr.write = writeErr;
        if (previousToken === undefined) {
          delete process.env["HUFU_GITLAB_INSTANCE_TOKEN"];
        } else {
          process.env["HUFU_GITLAB_INSTANCE_TOKEN"] = previousToken;
        }
        if (previousDeny === undefined) {
          delete process.env["HUFU_DENY_NETWORK"];
        } else {
          process.env["HUFU_DENY_NETWORK"] = previousDeny;
        }
      }
      assertWorkspaceHasNoToken(dir);
    });
  });
});

describe("gitlab authority issue project binding (#53 Codex)", () => {
  it("rejects an issue from another project on the same origin", async () => {
    const identity = parseGitLabInstanceIdentity({
      instanceKind: "self_hosted",
      instanceOrigin: EXAMPLE_ORIGIN,
      projectPath: PROJECT_A,
    });
    const port = createHttpGitLabInstancePort({
      identity,
      secretProvider: exampleSecret(),
      fetch: async () => ({
        ok: true,
        status: 200,
        headers: jsonHeaders({ get: () => null }),
        json: async () => [
          issuePayload({ origin: EXAMPLE_ORIGIN, project: PROJECT_B, iid: 1 }),
        ],
      }),
    });
    await assert.rejects(
      () => port.listIssueProjections(PROJECT_A),
      (error: unknown) => isFailClosed(error),
    );
  });

  it("requires origin, project path, and iid to match the declared identity", async () => {
    const identity = parseGitLabInstanceIdentity({
      instanceKind: "self_hosted",
      instanceOrigin: EXAMPLE_HTTP_IPV4_ORIGIN,
      projectPath: PROJECT_A,
    });
    const mismatches = [
      issuePayload({
        origin: "http://192.0.2.10",
        project: PROJECT_A,
        iid: 1,
      }),
      issuePayload({
        origin: EXAMPLE_HTTP_HOST_PORT_ORIGIN,
        project: PROJECT_A,
        iid: 1,
      }),
      {
        ...issuePayload({
          origin: EXAMPLE_HTTP_IPV4_ORIGIN,
          project: PROJECT_A,
          iid: 1,
        }),
        iid: 2,
      },
    ];
    for (const payload of mismatches) {
      const port = createHttpGitLabInstancePort({
        identity,
        secretProvider: exampleSecret(),
        fetch: async () => ({
          ok: true,
          status: 200,
          headers: jsonHeaders({ get: () => null }),
          json: async () => [payload],
        }),
      });
      await assert.rejects(
        () => port.listIssueProjections(PROJECT_A),
        (error: unknown) => isFailClosed(error),
        JSON.stringify(payload),
      );
    }
  });

  it("still projects a matching HTTP IPv4:port issue without regressing #55", async () => {
    const identity = parseGitLabInstanceIdentity({
      instanceKind: "self_hosted",
      instanceOrigin: EXAMPLE_HTTP_IPV4_ORIGIN,
      projectPath: PROJECT_A,
    });
    const port = createHttpGitLabInstancePort({
      identity,
      secretProvider: exampleSecret(),
      fetch: async () => ({
        ok: true,
        status: 200,
        headers: jsonHeaders({ get: () => null }),
        json: async () => [
          issuePayload({
            origin: EXAMPLE_HTTP_IPV4_ORIGIN,
            project: PROJECT_A,
            iid: 7,
            title: "HTTP IPv4 bound issue",
          }),
        ],
      }),
      now: () => new Date("2026-08-16T12:00:00.000Z"),
    });
    const listed = await port.listIssueProjections(PROJECT_A);
    assert.equal(listed.items.length, 1);
    assert.equal(
      listed.items[0]?.external_ref,
      "gitlab-instance:192.0.2.10/group/a#7",
    );
    assert.equal(
      listed.items[0]?.original_url,
      `${EXAMPLE_HTTP_IPV4_ORIGIN}/${PROJECT_A}/-/issues/7`,
    );
  });
});

describe("gitlab authority cache identity rebind (#53 Codex)", () => {
  it("refuses a foreign instance or project cache from status, decide, handoff, and projector", async () => {
    await withTempDir(async (dir) => {
      const connected = connectSelfHosted(dir, {
        origin: EXAMPLE_ORIGIN,
        project: PROJECT_A,
      });
      writeInstanceCache(dir, { origin: EXAMPLE_ORIGIN, project: PROJECT_B });
      await assert.rejects(
        () => statusWorkspace(dir),
        isIdentityMismatch,
      );
      assert.throws(
        () =>
          decideWorkspace(dir, {
            actor: "human:alice",
            kind: "packet",
            payload: {
              ...basePacket(connected.grant_id),
              authoritative_state: {
                freshness: "not_applicable",
                observed_at: "2026-08-16T00:00:00.000Z",
                task_ref: "gitlab-instance:gitlab.example.com/group/b#1",
              },
            },
          }),
        isIdentityMismatch,
      );
      assert.throws(
        () =>
          recordHandoff(dir, {
            completed: "spec drafted",
            remaining: "review",
            workItemId: "gitlab-instance:gitlab.example.com/group/b#1",
          }),
        isIdentityMismatch,
      );
      const snapshot = readLedger(dir);
      assert.equal(snapshot.status, "ready");
      if (snapshot.status === "ready") {
        assert.throws(
          () =>
            projectCurrentView(snapshot.events, {
              gitlabInstanceCache: {
                cache_schema_version: 1,
                incomplete: false,
                items: [
                  cacheItem({
                    origin: EXAMPLE_HTTP_IPV4_ORIGIN,
                    project: PROJECT_A,
                    iid: 1,
                  }),
                ],
                observed_at: "2026-08-16T12:00:00.000Z",
                repository: PROJECT_A,
                instance_origin: EXAMPLE_HTTP_IPV4_ORIGIN,
                instance_kind: "self_hosted",
                task_authority: "gitlab",
              },
            }),
          isIdentityMismatch,
        );
      }
      try {
        const doctor = doctorWorkspace(dir, { secretProvider: exampleSecret() });
        assert.notEqual(doctor.cache_status, "present");
        assert.equal(
          JSON.stringify(doctor).includes(
            "gitlab-instance:gitlab.example.com/group/b#1",
          ),
          false,
        );
        assert.equal(JSON.stringify(doctor).includes(HOST_CREDENTIAL), false);
      } catch (error) {
        assert.equal(
          isIdentityMismatch(error) || isFailClosed(error),
          true,
        );
        assertTokenAbsent(errorSurfaces(error), "doctor mismatch");
      }
    });
  });

  it("still consumes a cache that matches the connected identity", async () => {
    await withTempDir(async (dir) => {
      const connected = connectSelfHosted(dir, {
        origin: EXAMPLE_HTTP_IPV4_ORIGIN,
        project: PROJECT_A,
      });
      writeInstanceCache(dir, {
        origin: EXAMPLE_HTTP_IPV4_ORIGIN,
        project: PROJECT_A,
        iid: 9,
      });
      const view = await statusWorkspace(dir, {
        now: new Date("2026-08-16T12:05:00.000Z"),
      });
      assert.equal(view.work_items.length, 1);
      assert.equal(
        view.work_items[0]?.work_item_id,
        "gitlab-instance:192.0.2.10/group/a#9",
      );
      const packet = basePacket(connected.grant_id);
      (packet["authoritative_state"] as Record<string, unknown>)["task_ref"] =
        "gitlab-instance:192.0.2.10/group/a#9";
      const decided = decideWorkspace(dir, {
        actor: "human:alice",
        kind: "packet",
        payload: packet,
      });
      assert.equal(decided["version"], 1);
      const handoff = recordHandoff(dir, {
        completed: "cached item used",
        remaining: "review",
        workItemId: "gitlab-instance:192.0.2.10/group/a#9",
      });
      assert.equal(
        handoff.work_item_id,
        "gitlab-instance:192.0.2.10/group/a#9",
      );
      assert.equal(existsSync(gitlabInstanceCachePath(dir)), true);
      const raw = readFileSync(gitlabInstanceCachePath(dir), "utf8");
      assert.equal(raw.includes("body"), false);
      assert.equal(raw.includes("description"), false);
      assert.equal(raw.includes("token"), false);
      assert.equal(raw.includes("credential"), false);
    });
  });
});

describe("gitlab authority pagination fail-closed (#53 Codex)", () => {
  it("throws when x-next-page is present but not a later page integer", async () => {
    const identity = parseGitLabInstanceIdentity({
      instanceKind: "self_hosted",
      instanceOrigin: EXAMPLE_ORIGIN,
      projectPath: PROJECT_A,
    });
    for (const nextPage of ["not-a-number", "0", "1"]) {
      const port = createHttpGitLabInstancePort({
        identity,
        secretProvider: exampleSecret(),
        fetch: async () => ({
          ok: true,
          status: 200,
          headers: jsonHeaders({
            get(name: string) {
              return name.toLowerCase() === "x-next-page" ? nextPage : null;
            },
          }),
          json: async () => [
            issuePayload({ origin: EXAMPLE_ORIGIN, project: PROJECT_A, iid: 1 }),
          ],
        }),
      });
      await assert.rejects(
        () => port.listIssueProjections(PROJECT_A),
        (error: unknown) => isFailClosed(error),
        nextPage,
      );
    }
  });

  it("throws when the Link next URL escapes the authorized origin", async () => {
    const identity = parseGitLabInstanceIdentity({
      instanceKind: "self_hosted",
      instanceOrigin: EXAMPLE_ORIGIN,
      projectPath: PROJECT_A,
    });
    const port = createHttpGitLabInstancePort({
      identity,
      secretProvider: exampleSecret(),
      fetch: async () => ({
        ok: true,
        status: 200,
        headers: jsonHeaders({
          get(name: string) {
            if (name.toLowerCase() === "link") {
              return `<https://evil.example.com/api/v4/projects/group%2Fa/issues?page=2>; rel="next"`;
            }
            return null;
          },
        }),
        json: async () => [
          issuePayload({ origin: EXAMPLE_ORIGIN, project: PROJECT_A, iid: 1 }),
        ],
      }),
    });
    await assert.rejects(
      () => port.listIssueProjections(PROJECT_A),
      (error: unknown) => isFailClosed(error),
    );
  });

  it("still paginates a well-formed x-next-page: 2 on page 1", async () => {
    const identity = parseGitLabInstanceIdentity({
      instanceKind: "self_hosted",
      instanceOrigin: EXAMPLE_ORIGIN,
      projectPath: PROJECT_A,
    });
    const calls: string[] = [];
    const port = createHttpGitLabInstancePort({
      identity,
      secretProvider: exampleSecret(),
      fetch: async (url) => {
        const href = String(url);
        calls.push(href);
        if (/[?&]page=2(?:&|$)/.test(href)) {
          return {
            ok: true,
            status: 200,
            headers: jsonHeaders({ get: () => null }),
            json: async () => [
              issuePayload({
                origin: EXAMPLE_ORIGIN,
                project: PROJECT_A,
                iid: 2,
                title: "Page two",
              }),
            ],
          };
        }
        return {
          ok: true,
          status: 200,
          headers: jsonHeaders({
            get(name: string) {
              return name.toLowerCase() === "x-next-page" ? "2" : null;
            },
          }),
          json: async () => [
            issuePayload({
              origin: EXAMPLE_ORIGIN,
              project: PROJECT_A,
              iid: 1,
              title: "Page one",
            }),
          ],
        };
      },
    });
    const listed = await port.listIssueProjections(PROJECT_A);
    assert.equal(calls.length, 2);
    assert.equal(listed.items.length, 2);
    assert.equal(listed.incomplete, false);
    assert.equal(
      listed.items[1]?.external_ref,
      "gitlab-instance:gitlab.example.com/group/a#2",
    );
  });
});
