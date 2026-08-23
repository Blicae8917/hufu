import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
import { CommandError } from "../src/hufu/errors.js";
import { createHttpGitLabPort } from "../src/hufu/gitlab-http.js";
import { WRITE_BACK_CONSTITUTION_AMENDED } from "../src/hufu/gitlab-authority.js";
import { createHttpGitLabInstancePort } from "../src/hufu/gitlab-instance-http.js";
import { readGitLabInstanceProjectionCache } from "../src/hufu/gitlab-instance-cache.js";
import { parseGitLabInstanceIdentity } from "../src/hufu/gitlab-instance-ref.js";
import { type GitLabPort } from "../src/hufu/gitlab-port.js";
import {
  commentEffectMarker,
  createGitLabTaskMutationProvider,
  MANAGED_MUTATION_KINDS,
  mutationPayloadDigest,
  PRODUCTION_EXECUTE_GRANTED,
  type ManagedMutationKind,
  type TaskMutationIntent,
} from "../src/hufu/gitlab-task-mutation-provider.js";
import { type SecretProvider } from "../src/hufu/secret-provider.js";
import { statusWorkspace } from "../src/hufu/status.js";
import { readLedger } from "../src/hufu/storage.js";

const mainJs = fileURLToPath(new URL("../src/hufu/main.js", import.meta.url));
const EXAMPLE_ORIGIN = "https://gitlab.example.com";
const EXAMPLE_HTTP_IPV4_ORIGIN = "http://192.0.2.10:41101";
const EXAMPLE_HTTP_HOST_PORT_ORIGIN = "http://gitlab.example.com:41101";
const EXAMPLE_PROJECT = "example-group/example-project";
const EXAMPLE_OTHER_PROJECT = "example-group/other-project";
const EXAMPLE_IID = 456;
const EXAMPLE_REVISION = "2026-08-16T10:00:00Z";
const EXAMPLE_REF =
  "gitlab-instance:gitlab.example.com/example-group/example-project#456";
const EXAMPLE_CREDENTIAL = "glpat-EXAMPLE0001token";
const EXAMPLE_EXCEPTION_REF = "test-transport-exception-ref";
const FORBIDDEN_KINDS = [
  "delete_comment",
  "edit_body",
  "delete_issue",
  "replace_labels",
  "create_merge_request",
  "create_branch",
  "create_release",
  "passthrough",
] as const;
const BINDING_FIELDS = [
  "effect_id",
  "task_ref",
  "decision_ref",
  "execution_envelope_ref",
  "authority_scope_ref",
  "expected_source_revision",
  "mutation_kind",
  "canonical_payload_digest",
  "actor_binding",
  "idempotency_key",
] as const;
const WRITE_METHODS = [
  "createIssue",
  "updateIssue",
  "closeIssue",
  "comment",
  "merge",
  "create",
  "update",
  "close",
] as const;

interface FakeIssue {
  iid: number;
  title: string;
  web_url: string;
  state: string;
  updated_at: string;
  labels: string[];
  assignee: { username: string } | null;
  type: string;
}

interface RecordedCall {
  body: string | undefined;
  method: string;
  url: string;
}

function exampleSecret(): SecretProvider {
  return {
    resolve() {
      return EXAMPLE_CREDENTIAL;
    },
  };
}

function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "hufu-gl-mut-"));
  return fn(dir).finally(() => {
    rmSync(dir, { recursive: true, force: true });
  });
}

function connectExample(
  dir: string,
  origin: string = EXAMPLE_ORIGIN,
): ReturnType<typeof connectWorkspace> {
  return connectWorkspace(dir, {
    commander: "human:alice",
    grantScope: "read-only projection and handoff",
    projectId: "demo",
    repository: EXAMPLE_PROJECT,
    taskAuthority: "gitlab",
    instanceKind: "self_hosted",
    instanceOrigin: origin,
    allowedInstanceOrigins: [origin],
    identitySource: "explicit",
    secretProvider: exampleSecret(),
  });
}

function identityFor(origin: string = EXAMPLE_ORIGIN) {
  return parseGitLabInstanceIdentity({
    instanceKind: "self_hosted",
    instanceOrigin: origin,
    projectPath: EXAMPLE_PROJECT,
  });
}

function issueUrl(origin: string, project: string, iid: number): string {
  return `${origin}/${project}/-/issues/${String(iid)}`;
}

function baseIssue(origin: string = EXAMPLE_ORIGIN): FakeIssue {
  return {
    iid: EXAMPLE_IID,
    title: "Example self-hosted issue",
    web_url: issueUrl(origin, EXAMPLE_PROJECT, EXAMPLE_IID),
    state: "opened",
    updated_at: EXAMPLE_REVISION,
    labels: ["example-label"],
    assignee: { username: "example-user" },
    type: "Issue",
  };
}

function kindPayload(kind: ManagedMutationKind): Record<string, unknown> {
  if (kind === "append_comment") {
    return { comment_body: "example comment" };
  }
  if (kind === "transition_managed_status_label") {
    return { managed_label: "status::doing" };
  }
  if (kind === "set_assignee") {
    return { assignee: "example-owner", assignee_id: 7 };
  }
  if (kind === "close_issue") {
    return { acceptance_evidence_complete: true };
  }
  return {};
}

function buildIntent(
  kind: ManagedMutationKind,
  overrides: Record<string, unknown> = {},
): TaskMutationIntent {
  const target = {
    instance_origin: EXAMPLE_ORIGIN,
    project_path: EXAMPLE_PROJECT,
    iid: EXAMPLE_IID,
    ...((overrides["target"] as Record<string, unknown> | undefined) ?? {}),
  };
  const payload = {
    ...kindPayload(kind),
    ...((overrides["payload"] as Record<string, unknown> | undefined) ?? {}),
  };
  const base = {
    actor_binding: "human:alice",
    authority_scope_ref: "grant:demo",
    decision_ref: "decision:demo",
    effect_id: `effect-${kind}`,
    execution_envelope_ref: "envelope:demo",
    expected_source_revision: EXAMPLE_REVISION,
    idempotency_key: `idem-${kind}`,
    mutation_kind: kind,
    task_ref: EXAMPLE_REF,
    target,
    ...overrides,
  };
  delete (base as { payload?: unknown }).payload;
  const digest = mutationPayloadDigest({
    actor_binding: String(base.actor_binding),
    authority_scope_ref: String(base.authority_scope_ref),
    decision_ref: String(base.decision_ref),
    effect_id: String(base.effect_id),
    execution_envelope_ref: String(base.execution_envelope_ref),
    expected_source_revision: String(base.expected_source_revision),
    idempotency_key: String(base.idempotency_key),
    mutation_kind: String(base.mutation_kind),
    payload,
    target: {
      iid: Number(target.iid),
      instance_origin: String(target.instance_origin),
      project_path: String(target.project_path),
    },
    task_ref: String(base.task_ref),
  });
  return {
    ...(base as unknown as TaskMutationIntent),
    ...payload,
    canonical_payload_digest: digest,
    target: {
      iid: Number(target.iid),
      instance_origin: String(target.instance_origin),
      project_path: String(target.project_path),
    },
  };
}

function jsonHeaders(): { get(name: string): string | null } {
  return { get: () => null };
}

function createFakeGitLab(options: {
  readonly origin: string;
  readonly issue?: FakeIssue;
  readonly notes?: { body: string; id: number }[];
  readonly failGetAfterWrites?: boolean;
  readonly disconnectAfterWrite?: boolean;
  readonly getIssueError?: Error;
}): {
  calls: RecordedCall[];
  fetch: typeof fetch;
  issue: () => FakeIssue;
  notes: () => { body: string; id: number }[];
  writeCount: () => number;
} {
  const issue = { ...(options.issue ?? baseIssue(options.origin)) };
  const notes = [...(options.notes ?? [])];
  const calls: RecordedCall[] = [];
  let writes = 0;
  const encoded = encodeURIComponent(EXAMPLE_PROJECT);
  const issuePath = `/api/v4/projects/${encoded}/issues/${String(EXAMPLE_IID)}`;
  const notesPath = `${issuePath}/notes`;
  const listPath = `/api/v4/projects/${encoded}/issues`;

  const fetchFn = (async (
    url: string,
    init?: { body?: string; headers?: Record<string, string>; method?: string },
  ) => {
    const href = String(url);
    const method = String(init?.method ?? "GET").toUpperCase();
    const body =
      typeof init?.body === "string"
        ? init.body
        : init?.body === undefined
          ? undefined
          : String(init.body);
    calls.push({ body, method, url: href });
    const parsed = new URL(href);
    if (options.getIssueError !== undefined && method === "GET" && parsed.pathname === issuePath) {
      throw options.getIssueError;
    }
    if (method === "GET" && parsed.pathname === issuePath) {
      if (options.failGetAfterWrites === true && writes > 0) {
        throw new Error("readback unavailable after write");
      }
      return {
        headers: jsonHeaders(),
        json: async () => ({ ...issue, assignee: issue.assignee }),
        ok: true,
        status: 200,
      };
    }
    if (method === "GET" && parsed.pathname === notesPath) {
      return {
        headers: jsonHeaders(),
        json: async () => notes.map((note) => ({ ...note })),
        ok: true,
        status: 200,
      };
    }
    if (method === "GET" && parsed.pathname === listPath) {
      return {
        headers: jsonHeaders(),
        json: async () => [{ ...issue, assignee: issue.assignee }],
        ok: true,
        status: 200,
      };
    }
    if (method === "POST" && parsed.pathname === notesPath) {
      writes += 1;
      const parsedBody = body === undefined ? {} : (JSON.parse(body) as Record<string, unknown>);
      notes.push({
        body: String(parsedBody["body"] ?? ""),
        id: notes.length + 1,
      });
      if (options.disconnectAfterWrite === true) {
        throw new Error("disconnected after write");
      }
      return {
        headers: jsonHeaders(),
        json: async () => ({ id: notes.length, body: parsedBody["body"] }),
        ok: true,
        status: 201,
      };
    }
    if (method === "PUT" && parsed.pathname === issuePath) {
      writes += 1;
      const parsedBody = body === undefined ? {} : (JSON.parse(body) as Record<string, unknown>);
      if (typeof parsedBody["add_labels"] === "string") {
        const label = parsedBody["add_labels"];
        if (!issue.labels.includes(label)) {
          issue.labels = [...issue.labels, label];
        }
      }
      if (Array.isArray(parsedBody["assignee_ids"])) {
        issue.assignee = { username: "example-owner" };
      }
      if (parsedBody["state_event"] === "close") {
        issue.state = "closed";
      }
      if (parsedBody["state_event"] === "reopen") {
        issue.state = "opened";
      }
      issue.updated_at = "2026-08-16T11:00:00Z";
      if (options.disconnectAfterWrite === true) {
        throw new Error("disconnected after write");
      }
      return {
        headers: jsonHeaders(),
        json: async () => ({ ...issue }),
        ok: true,
        status: 200,
      };
    }
    throw new Error(`unexpected ${method} ${href}`);
  }) as typeof fetch;

  return {
    calls,
    fetch: fetchFn,
    issue: () => issue,
    notes: () => notes,
    writeCount: () => writes,
  };
}

function createProvider(
  dir: string,
  fake: ReturnType<typeof createFakeGitLab>,
  extras: {
    readonly origin?: string;
    readonly readAllowlist?: readonly string[];
    readonly transportSecurityExceptionRef?: string;
    readonly writeAllowlist?: readonly string[];
    readonly fetch?: typeof fetch;
  } = {},
) {
  const origin = extras.origin ?? EXAMPLE_ORIGIN;
  return createGitLabTaskMutationProvider({
    fetch: extras.fetch ?? fake.fetch,
    identity: identityFor(origin),
    readAllowlist: extras.readAllowlist,
    secretProvider: exampleSecret(),
    transportSecurityExceptionRef: extras.transportSecurityExceptionRef,
    workspaceRoot: dir,
    writeAllowlist: extras.writeAllowlist ?? [origin],
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
    assert.equal(raw.includes(EXAMPLE_CREDENTIAL), false, file);
    assert.equal(raw.includes(EXAMPLE_EXCEPTION_REF), false, file);
    assert.doesNotMatch(raw, /glpat-[A-Za-z0-9_-]{8,}/);
    assert.doesNotMatch(raw, /Bearer /i);
  }
}

function writeCalls(fake: ReturnType<typeof createFakeGitLab>): RecordedCall[] {
  return fake.calls.filter((call) => call.method !== "GET");
}

function ledgerTypes(dir: string): string[] {
  const snapshot = readLedger(dir);
  assert.equal(snapshot.status, "ready");
  if (snapshot.status !== "ready") {
    throw new Error("ledger is not ready");
  }
  return snapshot.events.map((event) => event.event_type);
}

describe("GitLabTaskMutationProvider (#57)", () => {
  it("keeps the read-only GitLabPort free of write methods and leaves 007 unchanged", () => {
    assert.equal(PRODUCTION_EXECUTE_GRANTED, false);
    assert.equal(WRITE_BACK_CONSTITUTION_AMENDED, false);
    const saas = createHttpGitLabPort({
      fetch: async () => {
        throw new Error("007 adapter must not be invoked");
      },
    });
    const instance = createHttpGitLabInstancePort({
      fetch: async () => {
        throw new Error("read-only port must not be invoked");
      },
      identity: identityFor(),
      secretProvider: exampleSecret(),
    });
    for (const port of [saas, instance] as const) {
      const typed: GitLabPort = port;
      assert.deepEqual(Object.keys(typed), ["listIssueProjections"]);
      for (const method of WRITE_METHODS) {
        assert.equal(method in typed, false, method);
      }
    }
    const saasSource = readFileSync(
      fileURLToPath(new URL("../../src/hufu/gitlab-http.ts", import.meta.url)),
      "utf8",
    );
    assert.match(saasSource, /https:\/\/gitlab\.com\/api\/v4\/projects\//);
    assert.doesNotMatch(saasSource, /method:\s*"POST"/);
    assert.doesNotMatch(saasSource, /method:\s*"PUT"/);
    assert.equal(MANAGED_MUTATION_KINDS.length, 5);
  });

  it("previews each of the five kinds and refuses forbidden kinds and missing bindings", async () => {
    await withTempDir(async (dir) => {
      connectExample(dir);
      const fake = createFakeGitLab({ origin: EXAMPLE_ORIGIN });
      const provider = createProvider(dir, fake);
      for (const kind of MANAGED_MUTATION_KINDS) {
        const plan = provider.preview(buildIntent(kind));
        assert.equal(plan.mutation_kind, kind);
        assert.equal(plan.effect_id, `effect-${kind}`);
        assert.match(plan.canonical_payload_digest, /^sha256:[0-9a-f]{64}$/);
        for (const field of BINDING_FIELDS) {
          assert.equal(typeof plan[field], "string");
          assert.notEqual(plan[field], "");
        }
      }
      assert.equal(writeCalls(fake).length, 0);

      for (const kind of FORBIDDEN_KINDS) {
        assert.throws(
          () =>
            provider.preview({
              ...buildIntent("append_comment"),
              mutation_kind: kind,
            }),
          (error: unknown) =>
            error instanceof CommandError && error.code === "CONTRACT_INVALID",
        );
      }

      const complete = buildIntent("append_comment");
      for (const field of BINDING_FIELDS) {
        assert.throws(
          () =>
            provider.preview({
              ...complete,
              [field]: "",
            }),
          (error: unknown) =>
            error instanceof CommandError && error.code === "CONTRACT_INVALID",
          field,
        );
      }
    });
  });

  it("executes one write then readback so the projection shows the target state", async () => {
    await withTempDir(async (dir) => {
      connectExample(dir);
      const fake = createFakeGitLab({ origin: EXAMPLE_ORIGIN });
      const provider = createProvider(dir, fake);
      const plan = provider.preview(buildIntent("transition_managed_status_label"));
      const receipt = await provider.execute(plan);
      assert.equal(receipt.write_performed, true);
      assert.equal(receipt.outcome, "complete");
      assert.equal(writeCalls(fake).length, 1);
      assert.equal(writeCalls(fake)[0]?.method, "PUT");
      assert.match(writeCalls(fake)[0]?.body ?? "", /add_labels/);
      assert.doesNotMatch(writeCalls(fake)[0]?.body ?? "", /"labels":/);
      const types = ledgerTypes(dir);
      assert.equal(types.includes("hufu/mutation.prepared"), true);
      assert.equal(types.includes("hufu/decision.effect_delta"), true);
      assert.equal(types.includes("hufu/mutation.receipt"), true);
      assert.ok(
        types.indexOf("hufu/mutation.prepared") <
          types.indexOf("hufu/decision.effect_delta"),
      );
      const cache = readGitLabInstanceProjectionCache(dir);
      assert.equal(cache?.items[0]?.labels?.includes("status::doing"), true);
      const view = await statusWorkspace(dir);
      const item = view.work_items.find((entry) => entry.work_item_id === EXAMPLE_REF);
      assert.equal(item?.labels?.includes("status::doing"), true);
      const readback = await provider.readback(receipt);
      assert.equal(readback.availability, "available");
      assert.equal(readback.matches_target, true);
      assertSecretAbsent(dir);
    });
  });

  it("does not write on revision, project, or origin mismatch", async () => {
    await withTempDir(async (dir) => {
      connectExample(dir);
      const fake = createFakeGitLab({ origin: EXAMPLE_ORIGIN });
      const provider = createProvider(dir, fake);
      const stale = buildIntent("set_assignee", {
        expected_source_revision: "2026-08-15T00:00:00Z",
      });
      await assert.rejects(
        () => provider.execute(provider.preview(stale)),
        (error: unknown) =>
          error instanceof CommandError &&
          (error.code === "CONTRACT_INVALID" || error.code === "LEDGER_CAUSALITY_CONFLICT"),
      );
      assert.equal(writeCalls(fake).length, 0);

      const wrongProject = createFakeGitLab({
        issue: {
          ...baseIssue(),
          web_url: issueUrl(EXAMPLE_ORIGIN, EXAMPLE_OTHER_PROJECT, EXAMPLE_IID),
        },
        origin: EXAMPLE_ORIGIN,
      });
      const otherProvider = createProvider(dir, wrongProject);
      await assert.rejects(
        () => otherProvider.execute(otherProvider.preview(buildIntent("reopen_issue"))),
        (error: unknown) =>
          error instanceof CommandError &&
          (error.code === "OBSERVATION_UNAVAILABLE" ||
            error.code === "REPOSITORY_NOT_ALLOWED"),
      );
      assert.equal(writeCalls(wrongProject).length, 0);

      const wrongOrigin = createFakeGitLab({
        issue: {
          ...baseIssue(EXAMPLE_HTTP_HOST_PORT_ORIGIN),
          web_url: issueUrl(EXAMPLE_HTTP_HOST_PORT_ORIGIN, EXAMPLE_PROJECT, EXAMPLE_IID),
        },
        origin: EXAMPLE_ORIGIN,
      });
      const originProvider = createProvider(dir, wrongOrigin);
      await assert.rejects(
        () => originProvider.execute(originProvider.preview(buildIntent("append_comment"))),
        (error: unknown) =>
          error instanceof CommandError &&
          (error.code === "OBSERVATION_UNAVAILABLE" ||
            error.code === "REPOSITORY_NOT_ALLOWED"),
      );
      assert.equal(writeCalls(wrongOrigin).length, 0);
    });
  });

  it("fails closed on HTTP write without exception_ref and ignores the read-only allowlist", async () => {
    await withTempDir(async (dir) => {
      connectExample(dir, EXAMPLE_HTTP_IPV4_ORIGIN);
      const fake = createFakeGitLab({
        issue: baseIssue(EXAMPLE_HTTP_IPV4_ORIGIN),
        origin: EXAMPLE_HTTP_IPV4_ORIGIN,
      });
      const noException = createGitLabTaskMutationProvider({
        fetch: fake.fetch,
        identity: identityFor(EXAMPLE_HTTP_IPV4_ORIGIN),
        readAllowlist: [EXAMPLE_HTTP_IPV4_ORIGIN],
        secretProvider: exampleSecret(),
        workspaceRoot: dir,
        writeAllowlist: [EXAMPLE_HTTP_IPV4_ORIGIN],
      });
      const intent = buildIntent("append_comment", {
        target: {
          iid: EXAMPLE_IID,
          instance_origin: EXAMPLE_HTTP_IPV4_ORIGIN,
          project_path: EXAMPLE_PROJECT,
        },
      });
      assert.throws(
        () => noException.preview(intent),
        (error: unknown) =>
          error instanceof CommandError &&
          (error.code === "REPOSITORY_NOT_ALLOWED" || error.code === "GRANT_SCOPE_EXCEEDED"),
      );
      assert.equal(writeCalls(fake).length, 0);

      const readOnlyOnly = createGitLabTaskMutationProvider({
        fetch: fake.fetch,
        identity: identityFor(EXAMPLE_HTTP_IPV4_ORIGIN),
        readAllowlist: [EXAMPLE_HTTP_IPV4_ORIGIN],
        secretProvider: exampleSecret(),
        transportSecurityExceptionRef: EXAMPLE_EXCEPTION_REF,
        workspaceRoot: dir,
        writeAllowlist: [EXAMPLE_ORIGIN],
      });
      assert.throws(
        () => readOnlyOnly.preview(intent),
        (error: unknown) =>
          error instanceof CommandError &&
          (error.code === "REPOSITORY_NOT_ALLOWED" ||
            error.code === "GRANT_SCOPE_EXCEEDED" ||
            error.code === "CONTRACT_INVALID"),
      );
    });
  });

  it("may write to an example HTTP origin when an injected exception ref is present", async () => {
    await withTempDir(async (dir) => {
      connectExample(dir, EXAMPLE_HTTP_IPV4_ORIGIN);
      const fake = createFakeGitLab({
        issue: baseIssue(EXAMPLE_HTTP_IPV4_ORIGIN),
        origin: EXAMPLE_HTTP_IPV4_ORIGIN,
      });
      const provider = createGitLabTaskMutationProvider({
        fetch: fake.fetch,
        identity: identityFor(EXAMPLE_HTTP_IPV4_ORIGIN),
        readAllowlist: [EXAMPLE_HTTP_IPV4_ORIGIN],
        secretProvider: exampleSecret(),
        transportSecurityExceptionRef: EXAMPLE_EXCEPTION_REF,
        workspaceRoot: dir,
        writeAllowlist: [EXAMPLE_HTTP_IPV4_ORIGIN],
      });
      const plan = provider.preview(
        buildIntent("append_comment", {
          target: {
            iid: EXAMPLE_IID,
            instance_origin: EXAMPLE_HTTP_IPV4_ORIGIN,
            project_path: EXAMPLE_PROJECT,
          },
        }),
      );
      const receipt = await provider.execute(plan);
      assert.equal(receipt.outcome, "complete");
      assert.equal(writeCalls(fake).length, 1);
      assert.equal(writeCalls(fake)[0]?.method, "POST");
      assert.match(
        fake.notes()[0]?.body ?? "",
        new RegExp(commentEffectMarker(plan.effect_id, plan.canonical_payload_digest)),
      );
      assertSecretAbsent(dir);
    });
  });

  it("replays the same effect_id and digest and stops on digest conflict", async () => {
    await withTempDir(async (dir) => {
      connectExample(dir);
      const fake = createFakeGitLab({ origin: EXAMPLE_ORIGIN });
      const provider = createProvider(dir, fake);
      const plan = provider.preview(buildIntent("set_assignee"));
      const first = await provider.execute(plan);
      const second = await provider.execute(plan);
      assert.equal(first.outcome, "complete");
      assert.equal(second.idempotent_replay, true);
      assert.equal(writeCalls(fake).length, 1);

      const conflictIntent = buildIntent("set_assignee", {
        payload: { assignee: "other-owner", assignee_id: 8 },
      });
      await assert.rejects(
        () => provider.execute(provider.preview(conflictIntent)),
        (error: unknown) =>
          error instanceof CommandError &&
          (error.code === "LEDGER_DIGEST_CONFLICT" || error.code === "DECISION_CONFLICT"),
      );
      assert.equal(writeCalls(fake).length, 1);
    });
  });

  it("uses the comment marker to prevent a duplicate comment and no-ops when already at target", async () => {
    await withTempDir(async (dir) => {
      connectExample(dir);
      const plan = buildIntent("append_comment");
      const digest = plan.canonical_payload_digest;
      const marked = createFakeGitLab({
        notes: [
          {
            body: `already posted ${commentEffectMarker(plan.effect_id, digest)}`,
            id: 9,
          },
        ],
        origin: EXAMPLE_ORIGIN,
      });
      const provider = createProvider(dir, marked);
      const receipt = await provider.execute(provider.preview(plan));
      assert.equal(receipt.write_performed, false);
      assert.equal(writeCalls(marked).length, 0);

      const labeled = createFakeGitLab({
        issue: { ...baseIssue(), labels: ["example-label", "status::doing"] },
        origin: EXAMPLE_ORIGIN,
      });
      const labelProvider = createProvider(dir, labeled);
      const labelReceipt = await labelProvider.execute(
        labelProvider.preview(buildIntent("transition_managed_status_label")),
      );
      assert.equal(labelReceipt.outcome, "noop");
      assert.equal(labelReceipt.write_performed, false);
      assert.equal(writeCalls(labeled).length, 0);

      const closed = createFakeGitLab({
        issue: { ...baseIssue(), state: "closed" },
        origin: EXAMPLE_ORIGIN,
      });
      const closeProvider = createProvider(dir, closed);
      const closeReceipt = await closeProvider.execute(
        closeProvider.preview(buildIntent("close_issue")),
      );
      assert.equal(closeReceipt.outcome, "noop");
      assert.equal(writeCalls(closed).length, 0);
    });
  });

  it("refuses close without evidence and refuses close when readback is unavailable", async () => {
    await withTempDir(async (dir) => {
      connectExample(dir);
      const fake = createFakeGitLab({ origin: EXAMPLE_ORIGIN });
      const provider = createProvider(dir, fake);
      assert.throws(
        () =>
          provider.preview(
            buildIntent("close_issue", {
              payload: { acceptance_evidence_complete: false },
            }),
          ),
        (error: unknown) =>
          error instanceof CommandError && error.code === "CONTRACT_INVALID",
      );

      const unavailable = createFakeGitLab({
        getIssueError: new Error("upstream unavailable"),
        origin: EXAMPLE_ORIGIN,
      });
      const closedProvider = createProvider(dir, unavailable);
      await assert.rejects(
        () => closedProvider.execute(closedProvider.preview(buildIntent("close_issue"))),
        (error: unknown) =>
          error instanceof CommandError &&
          (error.code === "OBSERVATION_UNAVAILABLE" || error.code === "DATA_INSUFFICIENT"),
      );
      assert.equal(writeCalls(unavailable).length, 0);
      assert.equal(unavailable.issue().state, "opened");
    });
  });

  it("reads back after a disconnect and never blind-retries a second write", async () => {
    await withTempDir(async (dir) => {
      connectExample(dir);
      const fake = createFakeGitLab({
        disconnectAfterWrite: true,
        origin: EXAMPLE_ORIGIN,
      });
      const provider = createProvider(dir, fake);
      const plan = provider.preview(buildIntent("append_comment"));
      await assert.rejects(() => provider.execute(plan), CommandError);
      assert.equal(writeCalls(fake).length, 1);
      const recovered = await provider.execute(plan);
      assert.equal(recovered.write_performed, false);
      assert.equal(writeCalls(fake).length, 1);
    });
  });

  it("keeps production execute fail-closed without an injected test fetch", async () => {
    await withTempDir(async (dir) => {
      connectExample(dir);
      const provider = createGitLabTaskMutationProvider({
        identity: identityFor(),
        secretProvider: exampleSecret(),
        workspaceRoot: dir,
        writeAllowlist: [EXAMPLE_ORIGIN],
      });
      const plan = provider.preview(buildIntent("reopen_issue"));
      await assert.rejects(
        () => provider.execute(plan),
        (error: unknown) =>
          error instanceof CommandError &&
          (error.code === "GRANT_SCOPE_EXCEEDED" || error.code === "CONTRACT_INVALID"),
      );
      assert.equal(PRODUCTION_EXECUTE_GRANTED, false);
    });
  });

  it("never echoes the token through errors, CLI, or workspace files", async () => {
    await withTempDir(async (dir) => {
      connectExample(dir);
      const leaking = createFakeGitLab({
        getIssueError: new Error(`upstream said Bearer ${EXAMPLE_CREDENTIAL}`),
        origin: EXAMPLE_ORIGIN,
      });
      const provider = createProvider(dir, leaking);
      let captured = "";
      try {
        await provider.execute(provider.preview(buildIntent("append_comment")));
      } catch (error) {
        captured = error instanceof Error ? error.message : String(error);
        assert.equal(error instanceof CommandError, true);
      }
      assert.doesNotMatch(captured, /glpat-/);
      assert.doesNotMatch(captured, /Bearer /i);
      assert.equal(captured.includes(EXAMPLE_CREDENTIAL), false);
      assertSecretAbsent(dir);

      const cli = spawnSync(process.execPath, [mainJs, "mutate", "--execute"], {
        encoding: "utf8",
        env: {
          ...process.env,
          HUFU_DENY_NETWORK: "1",
          HUFU_GITLAB_INSTANCE_TOKEN: EXAMPLE_CREDENTIAL,
        },
      });
      assert.equal(cli.status, 1);
      assert.match(cli.stderr, /unknown command/);
      assert.doesNotMatch(cli.stdout, /glpat-/);
      assert.doesNotMatch(cli.stderr, /glpat-/);
      assert.equal(`${cli.stdout}${cli.stderr}`.includes(EXAMPLE_CREDENTIAL), false);
    });
  });
});
