import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createNativeHostRuntimeProvider,
  type NativeHostAdapter,
  type NativeHostActionPacket,
  type NativeHostAdapterResult,
  type NativeHostRuntimeProvider,
  type SessionBinding,
} from "../src/hufu/codex-native-host.js";
import { connectWorkspace, type ConnectResult } from "../src/hufu/connect.js";
import { decideWorkspace } from "../src/hufu/decide.js";
import { CommandError } from "../src/hufu/errors.js";
import { type EventEnvelope } from "../src/hufu/envelope.js";
import {
  canonicalGitLabInstanceExternalRef,
  parseGitLabInstanceIdentity,
} from "../src/hufu/gitlab-instance-ref.js";
import { type GitLabPort } from "../src/hufu/gitlab-port.js";
import {
  createGitLabTaskMutationProvider,
  MANAGED_MUTATION_KINDS,
  mutationPayloadDigest,
  PRODUCTION_EXECUTE_GRANTED,
  type GitLabTaskMutationProvider,
  type ManagedMutationKind,
  type MutationKindPayload,
  type MutationPlan,
  type MutationReceipt,
  type MutationTarget,
  type MutationWriteAllowance,
  type TaskMutationIntent,
} from "../src/hufu/gitlab-task-mutation-provider.js";
import { type SecretProvider } from "../src/hufu/secret-provider.js";
import { appendEvents, readLedger } from "../src/hufu/storage.js";
import { statusWorkspace } from "../src/hufu/status.js";
import { VERSION } from "../src/hufu/version.js";
import { basePacket } from "./decision-harness.js";

export const PILOT_HTTPS_ORIGIN = "https://gitlab.example.com";
export const PILOT_HTTP_IPV4_ORIGIN = "http://192.0.2.10:41101";
export const PILOT_HTTP_HOST_ORIGIN = "http://gitlab.example.com:41101";
export const PILOT_PROJECT = "example/parent";
export const PILOT_REVISION = "2026-08-23T10:00:00Z";
export const PILOT_CREDENTIAL = "glpat-EXAMPLE0001token";
export const PILOT_EXCEPTION_REF = "test-transport-exception-ref";
const PILOT_MANAGED_LABELS = [
  "status::triage",
  "status::needs-info",
  "status::ready",
  "status::doing",
  "status::review",
  "status::wontfix",
] as const;

export const PILOT_PARENT = {
  iid: 1,
  key: "parent",
  title: "example parent",
} as const;

export const PILOT_CHILDREN = {
  parallelA: {
    dependsOn: undefined,
    iid: 2,
    key: "parallel-a",
    lane: "parallel",
    title: "example child parallel-a",
  },
  parallelB: {
    dependsOn: undefined,
    iid: 3,
    key: "parallel-b",
    lane: "parallel",
    title: "example child parallel-b",
  },
  serial: {
    dependsOn: "parallel-a",
    iid: 4,
    key: "serial",
    lane: "serial",
    title: "example child serial",
  },
  stopLine: {
    blockedOn: "user_decision",
    dependsOn: undefined,
    iid: 5,
    key: "stop-line",
    lane: "stop_line",
    title: "example child stop-line",
  },
} as const;

export type PilotLane = "parent" | "parallel" | "serial" | "stop_line";

export interface PilotIssueSpec {
  readonly blockedOn?: "user_decision";
  readonly dependsOn?: "parallel-a";
  readonly iid: number;
  readonly key: string;
  readonly lane?: PilotLane | "parallel" | "serial" | "stop_line";
  readonly title: string;
}

export interface PilotIssueState {
  readonly assignee?: string;
  readonly iid: number;
  readonly key: string;
  readonly labels: readonly string[];
  readonly lane: PilotLane;
  readonly notes: readonly string[];
  readonly state: string;
  readonly title: string;
  readonly updated_at: string;
  readonly web_url: string;
}

export interface AuthorizedMutationResult {
  readonly reason?: "user_decision" | "serial_predecessor";
  readonly receipt?: MutationReceipt;
  readonly status: "applied" | "blocked";
}

export interface PilotMissingFacts {
  readonly token_usage: "unavailable" | "data_insufficient";
  readonly wall_clock: "unavailable" | "data_insufficient";
}

export interface PublicSafePilotWorld {
  readonly connect: ConnectResult;
  readonly decision_ref: string;
  readonly envelope_ref: { readonly content_digest?: string; readonly envelope_id: string };
  readonly grant_id: string;
  readonly host: NativeHostRuntimeProvider;
  readonly issues: readonly PilotIssueSpec[];
  readonly origin: string;
  readonly project: string;
  readonly provider: GitLabTaskMutationProvider;
  readonly workspaceRoot: string;
  comments(iid: number): readonly string[];
  execute(
    kind: ManagedMutationKind,
    iid: number,
    extras?: Record<string, unknown>,
  ): Promise<MutationReceipt>;
  executeAuthorized(
    kind: ManagedMutationKind,
    iid: number,
    extras?: Record<string, unknown>,
  ): Promise<AuthorizedMutationResult>;
  intent(
    kind: ManagedMutationKind,
    iid: number,
    extras?: Record<string, unknown>,
  ): TaskMutationIntent;
  issue(iid: number): PilotIssueState;
  ledgerEvents(): readonly EventEnvelope[];
  ledgerTypes(): readonly string[];
  missingFacts(): PilotMissingFacts;
  preview(
    kind: ManagedMutationKind,
    iid: number,
    extras?: Record<string, unknown>,
  ): MutationPlan;
  publicDump(): string;
  runOrderedEffectChain(iid: number): Promise<readonly MutationReceipt[]>;
  startLeader(): Promise<SessionBinding>;
  writeCount(iid?: number): number;
}

export interface PilotWorldOptions {
  readonly disconnectAfterWrite?: boolean;
  readonly getIssueUnavailable?: number;
  readonly injectFetch?: boolean;
  readonly omitIssueState?: number;
  readonly origin?: string;
  readonly transportSecurityExceptionRef?: string | null;
}

export class PublicSafePilotNotWiredError extends CommandError {
  constructor() {
    super("DATA_INSUFFICIENT", "public-safe e2e pilot fixture is not wired");
  }
}

interface FakeIssue {
  assignee: { username: string } | null;
  iid: number;
  labels: string[];
  state: string;
  title: string;
  type: string;
  updated_at: string;
  web_url: string;
}

interface RecordedCall {
  readonly body: string | undefined;
  readonly iid?: number;
  readonly method: string;
  readonly url: string;
}

interface PilotFakeGitLab {
  readonly calls: RecordedCall[];
  readonly fetch: typeof fetch;
  issue(iid: number): FakeIssue;
  notes(iid: number): readonly { readonly body: string; readonly id: number }[];
  writeCount(iid?: number): number;
}

const FIXED_NOW = "2026-08-23T12:00:00.000Z";
const ASSIGNEE_BY_ID: Readonly<Record<number, string>> = { 7: "example-owner" };

export function allPilotIssues(): readonly PilotIssueSpec[] {
  return [
    { ...PILOT_PARENT, lane: "parent" },
    PILOT_CHILDREN.parallelA,
    PILOT_CHILDREN.parallelB,
    PILOT_CHILDREN.serial,
    PILOT_CHILDREN.stopLine,
  ];
}

export async function withPublicSafePilot<T>(
  fn: (world: PublicSafePilotWorld) => Promise<T>,
  options: PilotWorldOptions = {},
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "hufu-e2e-pilot-"));
  try {
    const world = await createPublicSafePilotWorld(dir, options);
    return await fn(world);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function createPublicSafePilotWorld(
  workspaceRoot: string,
  options: PilotWorldOptions,
): Promise<PublicSafePilotWorld> {
  const origin = options.origin ?? PILOT_HTTPS_ORIGIN;
  const project = PILOT_PROJECT;
  const issues = allPilotIssues();
  const secretProvider = exampleSecret();
  const connected = connectWorkspace(workspaceRoot, {
    allowedInstanceOrigins: [origin],
    commander: "human:alice",
    grantScope: "read-only projection and handoff",
    identitySource: "explicit",
    instanceKind: "self_hosted",
    instanceOrigin: origin,
    projectId: "example-parent",
    repository: project,
    secretProvider,
    taskAuthority: "gitlab",
  });
  const identity = parseGitLabInstanceIdentity({
    instanceKind: "self_hosted",
    instanceOrigin: origin,
    projectPath: project,
  });
  const writeAllowlist = pilotWriteAllowlist(origin, project, issues);
  const productionGrantRevision = connected.grant_revision + 1;
  appendEvents(workspaceRoot, [
    {
      actor_binding_ref: "human:alice",
      event_type: "hufu/authorization_grant.issued",
      idempotency_key: `hufu/authorization_grant.issued:example-parent:${String(productionGrantRevision)}`,
      payload: {
        grant_id: connected.grant_id,
        issuer_id: "human:alice",
        revision: productionGrantRevision,
        scope: {
          action: "mutate",
          mutation_allowances: writeAllowlist,
          resource: "gitlab_issue",
        },
        scope_text: "public-safe structured GitLab mutation execute grant",
      },
    },
  ]);
  const gitlab = createPilotFakeGitLab(origin, project, options);
  const injectFetch = options.injectFetch !== false;
  const exceptionRef =
    options.transportSecurityExceptionRef === null
      ? undefined
      : (options.transportSecurityExceptionRef ??
        (origin.startsWith("http://") ? PILOT_EXCEPTION_REF : undefined));
  const provider = createGitLabTaskMutationProvider({
    ...(injectFetch ? { fetch: gitlab.fetch } : {}),
    identity,
    productionExecuteGrant: {
      grant_id: connected.grant_id,
      revision: productionGrantRevision,
    },
    readAllowlist: [origin],
    secretProvider,
    ...(exceptionRef === undefined
      ? {}
      : { transportSecurityExceptionRef: exceptionRef }),
    workspaceRoot,
    writeAllowlist,
  });
  const gitlabPort = createPilotProjectionPort(origin, project, gitlab);
  await statusWorkspace(workspaceRoot, {
    gitlabPort,
    refresh: true,
    secretProvider,
  });
  const parentRef = canonicalGitLabInstanceExternalRef(
    identity.instance_host,
    project,
    PILOT_PARENT.iid,
  );
  const packetInput = basePacket(connected.grant_id, productionGrantRevision);
  (packetInput["authoritative_state"] as Record<string, unknown>)["task_ref"] = parentRef;
  packetInput["verified_facts"] = [
    {
      evidence_ref: "evidence:acceptance-matrix",
      proposition: "the public-safe pilot acceptance matrix passed",
    },
  ];
  const packet = decideWorkspace(workspaceRoot, {
    actor: "human:alice",
    kind: "packet",
    payload: packetInput,
  });
  const envelope = decideWorkspace(workspaceRoot, {
    actor: "human:alice",
    kind: "envelope",
    payload: {
      content_digest: packet["content_digest"],
      decision_id: packet["decision_id"],
      executor_principal_id: "human:alice",
      version: packet["version"],
      work_item_ids: issues.map((issue) =>
        canonicalGitLabInstanceExternalRef(identity.instance_host, project, issue.iid),
      ),
    },
  });
  const host = createNativeHostRuntimeProvider({
    capability: "codex_app",
    hostAdapter: fakePilotHostAdapter(),
    now: () => new Date(FIXED_NOW),
  });
  const completed = new Set<number>();
  const cachedIntents = new Map<string, TaskMutationIntent>();
  const decisionRef = String(packet["decision_id"]);
  const envelopeRef = {
    content_digest: typeof envelope["content_digest"] === "string"
      ? envelope["content_digest"]
      : undefined,
    envelope_id: String(envelope["envelope_id"]),
  };

  function specByIid(iid: number): PilotIssueSpec {
    const spec = issues.find((item) => item.iid === iid);
    if (spec === undefined) {
      throw new CommandError("CONTRACT_INVALID", `unknown pilot issue ${String(iid)}`);
    }
    return spec;
  }

  function intent(
    kind: ManagedMutationKind,
    iid: number,
    extras: Record<string, unknown> = {},
  ): TaskMutationIntent {
    const cacheKey = `${kind}:${String(iid)}:${JSON.stringify(extras)}`;
    const cached = cachedIntents.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    const current = gitlab.issue(iid);
    const target = {
      iid,
      instance_origin: origin,
      project_path: project,
      ...((extras["target"] as MutationTarget | undefined) ?? {}),
    };
    const payload = {
      ...kindPayload(kind, iid),
      ...payloadOverrides(extras),
    };
    const base = {
      actor_binding: "human:alice",
      authority_scope_ref: connected.grant_id,
      decision_ref: decisionRef,
      effect_id: `effect:${kind}:${String(iid)}`,
      execution_envelope_ref: envelopeRef.envelope_id,
      expected_source_revision: current.updated_at,
      idempotency_key: `idem:${kind}:${String(iid)}`,
      mutation_kind: kind,
      task_ref: canonicalGitLabInstanceExternalRef(
        identity.instance_host,
        project,
        iid,
      ),
      ...extras,
    };
    delete (base as { payload?: unknown }).payload;
    delete (base as { target?: unknown }).target;
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
    const built: TaskMutationIntent = {
      ...(base as unknown as TaskMutationIntent),
      ...payload,
      canonical_payload_digest: digest,
      target: {
        iid: Number(target.iid),
        instance_origin: String(target.instance_origin),
        project_path: String(target.project_path),
      },
    };
    cachedIntents.set(cacheKey, built);
    return built;
  }

  function preview(
    kind: ManagedMutationKind,
    iid: number,
    extras: Record<string, unknown> = {},
  ): MutationPlan {
    return provider.preview(intent(kind, iid, extras));
  }

  async function execute(
    kind: ManagedMutationKind,
    iid: number,
    extras: Record<string, unknown> = {},
  ): Promise<MutationReceipt> {
    const receipt = await provider.execute(preview(kind, iid, extras));
    if (receipt.outcome === "complete" || receipt.outcome === "noop") {
      completed.add(iid);
    }
    return receipt;
  }

  async function executeAuthorized(
    kind: ManagedMutationKind,
    iid: number,
    extras: Record<string, unknown> = {},
  ): Promise<AuthorizedMutationResult> {
    const spec = specByIid(iid);
    if (spec.blockedOn === "user_decision") {
      return { reason: "user_decision", status: "blocked" };
    }
    if (spec.dependsOn === "parallel-a" && !completed.has(PILOT_CHILDREN.parallelA.iid)) {
      return { reason: "serial_predecessor", status: "blocked" };
    }
    const receipt = await execute(kind, iid, extras);
    return { receipt, status: "applied" };
  }

  function issueState(iid: number): PilotIssueState {
    const spec = specByIid(iid);
    const current = gitlab.issue(iid);
    return {
      ...(current.assignee === null ? {} : { assignee: current.assignee.username }),
      iid,
      key: spec.key,
      labels: [...current.labels],
      lane: (spec.lane ?? "parent") as PilotLane,
      notes: gitlab.notes(iid).map((note) => note.body),
      state: current.state,
      title: current.title,
      updated_at: current.updated_at,
      web_url: current.web_url,
    };
  }

  function readyEvents(): readonly EventEnvelope[] {
    const snapshot = readLedger(workspaceRoot);
    if (snapshot.status !== "ready") {
      throw new CommandError("LEDGER_CORRUPT", "pilot ledger is not ready");
    }
    return snapshot.events;
  }

  function missingFacts(): PilotMissingFacts {
    return {
      token_usage: "unavailable",
      wall_clock: "data_insufficient",
    };
  }

  function publicDump(): string {
    return JSON.stringify({
      PRODUCTION_EXECUTE_GRANTED,
      issues: issues.map((spec) => issueState(spec.iid)),
      ledger_types: readyEvents().map((event) => event.event_type),
      missing_facts: missingFacts(),
      origin,
      project,
      version: VERSION,
      write_count: gitlab.writeCount(),
    });
  }

  return {
    comments(iid) {
      return gitlab.notes(iid).map((note) => note.body);
    },
    connect: connected,
    decision_ref: decisionRef,
    envelope_ref: envelopeRef,
    execute,
    executeAuthorized,
    grant_id: connected.grant_id,
    host,
    intent,
    issue: issueState,
    issues,
    ledgerEvents: readyEvents,
    ledgerTypes() {
      return readyEvents().map((event) => event.event_type);
    },
    missingFacts,
    origin,
    preview,
    project,
    provider,
    publicDump,
    async runOrderedEffectChain(iid) {
      const kinds: readonly ManagedMutationKind[] = [
        "append_comment",
        "transition_managed_status_label",
        "set_assignee",
        "close_issue",
      ];
      const receipts: MutationReceipt[] = [];
      for (const kind of kinds) {
        receipts.push(await execute(kind, iid));
      }
      return receipts;
    },
    startLeader() {
      return host.start(
        envelopeRef,
        "project_lead",
        {
          authority_ref: connected.grant_id,
          channel: "codex-app-main",
          work_item_ref: parentRef,
          workspace_ref: "ws:example-parent",
        },
        "start-lead-1",
      );
    },
    workspaceRoot,
    writeCount(iid) {
      return gitlab.writeCount(iid);
    },
  };
}

function exampleSecret(): SecretProvider {
  return {
    resolve() {
      return PILOT_CREDENTIAL;
    },
  };
}

function kindPayload(kind: ManagedMutationKind, iid: number): MutationKindPayload {
  if (kind === "append_comment") {
    return { comment_body: `example comment for #${String(iid)}` };
  }
  if (kind === "transition_managed_status_label") {
    return { managed_label: "status::doing" };
  }
  if (kind === "set_assignee") {
    return { assignee: "example-owner", assignee_id: 7 };
  }
  if (kind === "close_issue") {
    return {
      acceptance_evidence_refs: ["evidence:acceptance-matrix"],
      acceptance_matrix_ref: "evidence:acceptance-matrix",
    };
  }
  return {};
}

function payloadOverrides(extras: Record<string, unknown>): MutationKindPayload {
  const payload = extras["payload"];
  const fromPayload = isRecord(payload) ? payload : {};
  const merged: Record<string, unknown> = { ...fromPayload };
  for (const key of [
    "acceptance_evidence_refs",
    "acceptance_matrix_ref",
    "assignee",
    "assignee_id",
    "comment_body",
    "managed_label",
  ] as const) {
    if (key in extras) {
      merged[key] = extras[key];
    }
  }
  return merged;
}

function pilotWriteAllowlist(
  origin: string,
  project: string,
  issues: readonly PilotIssueSpec[],
): readonly MutationWriteAllowance[] {
  return issues.flatMap((issue) =>
    MANAGED_MUTATION_KINDS.flatMap((mutation_kind) => {
      const base = {
        iid: issue.iid,
        instance_origin: origin,
        mutation_kind,
        project_path: project,
      };
      if (mutation_kind === "transition_managed_status_label") {
        return PILOT_MANAGED_LABELS.map((managed_label) => ({
          ...base,
          managed_label,
        }));
      }
      if (mutation_kind === "set_assignee") {
        return [{ ...base, assignee: "example-owner", assignee_id: 7 }];
      }
      if (mutation_kind === "append_comment") {
        return [{ ...base, comment_body: `example comment for #${String(issue.iid)}` }];
      }
      if (mutation_kind === "close_issue") {
        return [
          {
            ...base,
            acceptance_evidence_refs: ["evidence:acceptance-matrix"],
            acceptance_matrix_ref: "evidence:acceptance-matrix",
          },
        ];
      }
      return [base];
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issueWebUrl(origin: string, project: string, iid: number): string {
  return `${origin}/${project}/-/issues/${String(iid)}`;
}

function createPilotFakeGitLab(
  origin: string,
  project: string,
  options: PilotWorldOptions,
): PilotFakeGitLab {
  const specs = allPilotIssues();
  const issues = new Map<number, FakeIssue>();
  const notes = new Map<number, { body: string; id: number }[]>();
  let clock = 0;
  for (const spec of specs) {
    issues.set(spec.iid, {
      assignee: null,
      iid: spec.iid,
      labels: [],
      state: "opened",
      title: spec.title,
      type: "Issue",
      updated_at: PILOT_REVISION,
      web_url: issueWebUrl(origin, project, spec.iid),
    });
    notes.set(spec.iid, []);
  }
  const calls: RecordedCall[] = [];
  const encoded = encodeURIComponent(project);
  const issuePrefix = `/api/v4/projects/${encoded}/issues`;
  const decodedPrefix = `/api/v4/projects/${project}/issues`;

  function matchPath(pathname: string):
    | { readonly iid: number; readonly notes: boolean }
    | "list"
    | undefined {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return undefined;
    }
    const candidates = [pathname, decoded];
    for (const path of candidates) {
      if (path === issuePrefix || path === decodedPrefix) {
        return "list";
      }
      const notesMatch = path.match(new RegExp(`^(?:${escapeRegExp(issuePrefix)}|${escapeRegExp(decodedPrefix)})/([1-9][0-9]*)/notes$`));
      if (notesMatch?.[1] !== undefined) {
        return { iid: Number(notesMatch[1]), notes: true };
      }
      const issueMatch = path.match(new RegExp(`^(?:${escapeRegExp(issuePrefix)}|${escapeRegExp(decodedPrefix)})/([1-9][0-9]*)$`));
      if (issueMatch?.[1] !== undefined) {
        return { iid: Number(issueMatch[1]), notes: false };
      }
    }
    return undefined;
  }

  function issueJson(iid: number): Record<string, unknown> {
    const issue = issues.get(iid);
    if (issue === undefined) {
      throw new Error(`unknown issue ${String(iid)}`);
    }
    const state =
      options.omitIssueState === iid
        ? ""
        : issue.state;
    return {
      assignee: issue.assignee,
      iid: issue.iid,
      labels: [...issue.labels],
      references: { full: `${project}#${String(iid)}` },
      state,
      title: issue.title,
      type: "Issue",
      updated_at: issue.updated_at,
      web_url: issue.web_url,
    };
  }

  function bumpRevision(issue: FakeIssue): void {
    clock += 1;
    issue.updated_at = `2026-08-23T10:${String(clock).padStart(2, "0")}:00Z`;
  }

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
    const parsed = new URL(href);
    const matched = matchPath(parsed.pathname);
    const iid = matched === undefined || matched === "list" ? undefined : matched.iid;
    calls.push({ body, iid, method, url: href });
    if (matched === undefined) {
      throw new Error(`unexpected ${method} ${href}`);
    }
    if (
      method === "GET" &&
      matched !== "list" &&
      !matched.notes &&
      options.getIssueUnavailable === matched.iid
    ) {
      throw new Error("upstream unavailable");
    }
    if (method === "GET" && matched === "list") {
      return jsonResponse([...issues.keys()].map((id) => issueJson(id)));
    }
    if (method === "GET" && matched !== "list" && matched.notes) {
      return jsonResponse((notes.get(matched.iid) ?? []).map((note) => ({ ...note })));
    }
    if (method === "GET" && matched !== "list") {
      return jsonResponse(issueJson(matched.iid));
    }
    if (method === "POST" && matched !== "list" && matched.notes) {
      const issue = issues.get(matched.iid);
      if (issue === undefined) {
        throw new Error(`unknown issue ${String(matched.iid)}`);
      }
      const parsedBody = body === undefined ? {} : (JSON.parse(body) as Record<string, unknown>);
      const list = notes.get(matched.iid) ?? [];
      list.push({
        body: String(parsedBody["body"] ?? ""),
        id: list.length + 1,
      });
      notes.set(matched.iid, list);
      bumpRevision(issue);
      if (options.disconnectAfterWrite === true) {
        throw new Error("disconnected after write");
      }
      return jsonResponse({ body: parsedBody["body"], id: list.length }, 201);
    }
    if (method === "PUT" && matched !== "list" && !matched.notes) {
      const issue = issues.get(matched.iid);
      if (issue === undefined) {
        throw new Error(`unknown issue ${String(matched.iid)}`);
      }
      const parsedBody = body === undefined ? {} : (JSON.parse(body) as Record<string, unknown>);
      if (typeof parsedBody["add_labels"] === "string") {
        const label = parsedBody["add_labels"];
        if (!issue.labels.includes(label)) {
          issue.labels = [...issue.labels, label];
        }
      }
      if (Array.isArray(parsedBody["assignee_ids"])) {
        const first = parsedBody["assignee_ids"][0];
        const username =
          typeof first === "number" ? ASSIGNEE_BY_ID[first] : undefined;
        issue.assignee = { username: username ?? "example-owner" };
      }
      if (parsedBody["state_event"] === "close") {
        issue.state = "closed";
      }
      if (parsedBody["state_event"] === "reopen") {
        issue.state = "opened";
      }
      bumpRevision(issue);
      if (options.disconnectAfterWrite === true) {
        throw new Error("disconnected after write");
      }
      return jsonResponse(issueJson(matched.iid));
    }
    throw new Error(`unexpected ${method} ${href}`);
  }) as typeof fetch;

  return {
    calls,
    fetch: fetchFn,
    issue(iid) {
      const found = issues.get(iid);
      if (found === undefined) {
        throw new CommandError("CONTRACT_INVALID", `unknown issue ${String(iid)}`);
      }
      return found;
    },
    notes(iid) {
      return notes.get(iid) ?? [];
    },
    writeCount(iid) {
      return calls.filter((call) => {
        if (call.method === "GET") {
          return false;
        }
        return iid === undefined || call.iid === iid;
      }).length;
    },
  };
}

function createPilotProjectionPort(
  origin: string,
  project: string,
  gitlab: PilotFakeGitLab,
): GitLabPort {
  const identity = parseGitLabInstanceIdentity({
    instanceKind: "self_hosted",
    instanceOrigin: origin,
    projectPath: project,
  });
  return {
    async listIssueProjections() {
      return {
        incomplete: false,
        items: allPilotIssues().map((spec) => {
          const issue = gitlab.issue(spec.iid);
          return {
            external_ref: canonicalGitLabInstanceExternalRef(
              identity.instance_host,
              project,
              spec.iid,
            ),
            native_state: issue.state,
            original_url: issue.web_url,
            title: issue.title,
            observed_at: issue.updated_at,
            source_revision: issue.updated_at,
            updated_at: issue.updated_at,
            labels: [...issue.labels],
            ...(issue.assignee === null ? {} : { assignee: issue.assignee.username }),
          };
        }),
        observed_at: PILOT_REVISION,
      };
    },
  };
}

function fakePilotHostAdapter(): NativeHostAdapter {
  let turns = 0;
  return {
    capability_id: "codex_app",
    dispatch(packet: NativeHostActionPacket): NativeHostAdapterResult {
      turns += 1;
      if (packet.action === "create_thread") {
        return {
          action: packet.action,
          delivered: true,
          delivery_evidence: true,
          host_thread_ref: "thread:example-opaque",
          idle: true,
          turn_ref: `turn:${String(turns)}`,
        };
      }
      if (packet.action === "wait_threads") {
        return { action: packet.action, cursor: "cursor:1", idle: true };
      }
      if (packet.action === "observe") {
        return {
          action: packet.action,
          cursor: "cursor:1",
          idle: true,
          readback_evidence: true,
          turn_ref: `turn:${String(turns)}`,
        };
      }
      if (packet.action === "handoff_thread") {
        return { action: packet.action, idle: true };
      }
      if (packet.action === "interrupt") {
        return { action: packet.action, idle: true, interrupted: true };
      }
      return {
        action: packet.action,
        delivered: true,
        delivery_evidence: true,
        idle: false,
        turn_ref: `turn:${String(turns)}`,
      };
    },
  };
}

function jsonResponse(payload: unknown, status = 200): {
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  ok: boolean;
  status: number;
} {
  return {
    headers: { get: () => null },
    json: async () => payload,
    ok: status >= 200 && status < 300,
    status,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
