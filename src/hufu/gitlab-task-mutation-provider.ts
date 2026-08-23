import { randomUUID } from "node:crypto";

import { digestPayload } from "./digest.js";
import { type EventEnvelope } from "./envelope.js";
import { CommandError, isJsonObject } from "./errors.js";
import { fetchWithTimeout } from "./fetch-timeout.js";
import { assertCommanderAllowlist } from "./gitlab-authority.js";
import { createHttpGitLabInstancePort } from "./gitlab-instance-http.js";
import { writeGitLabInstanceProjectionCache } from "./gitlab-instance-cache.js";
import {
  parseGitLabInstanceIdentity,
  parseGitLabInstanceOrigin,
  parseGitLabInstanceProjectPath,
  type GitLabInstanceIdentity,
} from "./gitlab-instance-ref.js";
import {
  GITLAB_INSTANCE_CREDENTIAL_NAME,
  type SecretProvider,
} from "./secret-provider.js";
import { redactUnknown } from "./secret-redact.js";
import { appendEvents, readLedger } from "./storage.js";

export const PRODUCTION_EXECUTE_GRANTED = false;
export const MANAGED_MUTATION_KINDS = [
  "append_comment",
  "transition_managed_status_label",
  "set_assignee",
  "close_issue",
  "reopen_issue",
] as const;
export type ManagedMutationKind = (typeof MANAGED_MUTATION_KINDS)[number];

const FETCH_TIMEOUT_MS = 10_000;
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

export interface MutationTarget {
  readonly instance_origin: string;
  readonly project_path: string;
  readonly iid: number;
}

export interface MutationKindPayload {
  readonly acceptance_evidence_complete?: boolean;
  readonly assignee?: string;
  readonly assignee_id?: number;
  readonly comment_body?: string;
  readonly managed_label?: string;
}

export interface TaskMutationIntent extends MutationKindPayload {
  readonly actor_binding: string;
  readonly authority_scope_ref: string;
  readonly canonical_payload_digest: string;
  readonly decision_ref: string;
  readonly effect_id: string;
  readonly execution_envelope_ref: string;
  readonly expected_source_revision: string;
  readonly idempotency_key: string;
  readonly mutation_kind: string;
  readonly target: MutationTarget;
  readonly task_ref: string;
}

export interface MutationPlan extends MutationKindPayload {
  readonly actor_binding: string;
  readonly authority_scope_ref: string;
  readonly canonical_payload_digest: string;
  readonly decision_ref: string;
  readonly effect_id: string;
  readonly execution_envelope_ref: string;
  readonly expected_source_revision: string;
  readonly idempotency_key: string;
  readonly mutation_kind: ManagedMutationKind;
  readonly payload: MutationKindPayload;
  readonly target: MutationTarget;
  readonly task_ref: string;
}

export type MutationOutcome =
  | "complete"
  | "noop"
  | "unavailable"
  | "data_insufficient"
  | "conflict";

export interface MutationReceipt {
  readonly canonical_payload_digest: string;
  readonly effect_id: string;
  readonly idempotent_replay: boolean;
  readonly mutation_kind: ManagedMutationKind;
  readonly outcome: MutationOutcome;
  readonly write_performed: boolean;
}

export interface MutationReadback {
  readonly availability: "available" | "unavailable" | "data_insufficient" | "conflict";
  readonly effect_id: string;
  readonly matches_target: boolean;
}

export interface GitLabTaskMutationProvider {
  execute(plan: MutationPlan): Promise<MutationReceipt>;
  preview(intent: TaskMutationIntent): MutationPlan;
  readback(receipt: MutationReceipt): Promise<MutationReadback>;
}

export interface MutationDigestInput {
  readonly actor_binding: string;
  readonly authority_scope_ref: string;
  readonly decision_ref: string;
  readonly effect_id: string;
  readonly execution_envelope_ref: string;
  readonly expected_source_revision: string;
  readonly idempotency_key: string;
  readonly mutation_kind: string;
  readonly payload: MutationKindPayload;
  readonly target: MutationTarget;
  readonly task_ref: string;
}

export interface CreateGitLabTaskMutationProviderOptions {
  readonly fetch?: typeof fetch;
  readonly identity: GitLabInstanceIdentity;
  readonly now?: () => Date;
  readonly readAllowlist?: readonly string[];
  readonly secretProvider: SecretProvider;
  readonly timeoutMs?: number;
  readonly transportSecurityExceptionRef?: string;
  readonly workspaceRoot: string;
  readonly writeAllowlist: readonly string[];
}

interface ObservedIssue {
  readonly assignee?: string;
  readonly iid: number;
  readonly labels: readonly string[];
  readonly state: string;
  readonly updated_at?: string;
  readonly web_url: string;
}

export function mutationPayloadDigest(input: MutationDigestInput): string {
  return digestPayload({
    actor_binding: input.actor_binding,
    authority_scope_ref: input.authority_scope_ref,
    decision_ref: input.decision_ref,
    effect_id: input.effect_id,
    execution_envelope_ref: input.execution_envelope_ref,
    expected_source_revision: input.expected_source_revision,
    idempotency_key: input.idempotency_key,
    mutation_kind: input.mutation_kind,
    payload: { ...input.payload },
    target: {
      iid: input.target.iid,
      instance_origin: input.target.instance_origin,
      project_path: input.target.project_path,
    },
    task_ref: input.task_ref,
  });
}

export function commentEffectMarker(effectId: string, digest: string): string {
  return `<!-- hufu-effect:${effectId}:${digest} -->`;
}

export function createGitLabTaskMutationProvider(
  options: CreateGitLabTaskMutationProviderOptions,
): GitLabTaskMutationProvider {
  const identity = parseGitLabInstanceIdentity({
    instanceKind: options.identity.instance_kind,
    instanceOrigin: options.identity.instance_origin,
    projectPath: options.identity.project_path,
  });
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;

  function token(): string {
    const value = options.secretProvider.resolve(GITLAB_INSTANCE_CREDENTIAL_NAME);
    if (value === undefined || value.trim() === "") {
      throw new CommandError(
        "CONTRACT_INVALID",
        "self-hosted GitLab requires a host-injected credential",
      );
    }
    return value;
  }

  function preview(intent: TaskMutationIntent): MutationPlan {
    return validateIntent(intent, identity, options);
  }

  async function execute(plan: MutationPlan): Promise<MutationReceipt> {
    const validated = validateIntent(planToIntent(plan), identity, options);
    if (options.fetch === undefined) {
      throw new CommandError(
        "GRANT_SCOPE_EXCEEDED",
        "live GitLab execute is not granted",
      );
    }
    const events = readyEvents(options.workspaceRoot);
    const existingReceipt = findReceipt(events, validated.effect_id);
    if (existingReceipt !== undefined) {
      if (existingReceipt.canonical_payload_digest !== validated.canonical_payload_digest) {
        throw new CommandError(
          "LEDGER_DIGEST_CONFLICT",
          "effect_id collides with a different mutation digest",
        );
      }
      return { ...existingReceipt, idempotent_replay: true };
    }
    const prepared = findPrepared(events, validated.effect_id);
    if (
      prepared !== undefined &&
      prepared.canonical_payload_digest !== validated.canonical_payload_digest
    ) {
      throw new CommandError(
        "LEDGER_DIGEST_CONFLICT",
        "effect_id collides with a different mutation digest",
      );
    }

    const recovering = prepared !== undefined;
    const issue = await getIssue(validated, identity, options, timeoutMs, token());
    if (!recovering) {
      assertRevisionMatch(issue, validated.expected_source_revision);
    }
    const notes = await maybeGetNotes(
      validated,
      identity,
      options,
      timeoutMs,
      token(),
    );
    const alreadyAtTarget = matchesTarget(validated, issue, notes);
    if (validated.mutation_kind === "close_issue" && !alreadyAtTarget) {
      if (issue.state.trim() === "") {
        throw new CommandError(
          "DATA_INSUFFICIENT",
          "close_issue requires a reliable issue state readback",
        );
      }
    }
    if (prepared === undefined) {
      persistPrepared(options.workspaceRoot, validated);
    }

    let writePerformed = false;
    if (!alreadyAtTarget) {
      try {
        await performWrite(validated, identity, options, timeoutMs, token());
        writePerformed = true;
      } catch (error) {
        if (error instanceof CommandError) {
          throw error;
        }
        throw new CommandError(
          "OBSERVATION_UNAVAILABLE",
          `gitlab mutation write failed: ${redactUnknown(error, [token()])}`,
        );
      }
    }

    const readback = await observeReadback(validated, identity, options, timeoutMs, token());
    const projection = await refreshProjection(identity, options);
    const projectionMatches = projectionShowsTarget(validated, projection);
    const outcome = declareOutcome({
      alreadyAtTarget,
      kind: validated.mutation_kind,
      projectionMatches,
      readback,
      recovering,
      writePerformed,
    });
    persistEffectAndReceipt(options.workspaceRoot, validated, {
      outcome,
      readback,
      writePerformed,
    });
    return {
      canonical_payload_digest: validated.canonical_payload_digest,
      effect_id: validated.effect_id,
      idempotent_replay: false,
      mutation_kind: validated.mutation_kind,
      outcome,
      write_performed: writePerformed,
    };
  }

  async function readback(receipt: MutationReceipt): Promise<MutationReadback> {
    if (options.fetch === undefined) {
      return {
        availability: "unavailable",
        effect_id: receipt.effect_id,
        matches_target: false,
      };
    }
    const events = readyEvents(options.workspaceRoot);
    const prepared = findPrepared(events, receipt.effect_id);
    if (prepared === undefined) {
      return {
        availability: "data_insufficient",
        effect_id: receipt.effect_id,
        matches_target: false,
      };
    }
    try {
      const observed = await observeReadback(
        prepared,
        identity,
        options,
        timeoutMs,
        token(),
      );
      return {
        availability: observed.availability,
        effect_id: receipt.effect_id,
        matches_target: observed.matches_target,
      };
    } catch (error) {
      if (error instanceof CommandError) {
        if (error.code === "OBSERVATION_UNAVAILABLE") {
          return {
            availability: "unavailable",
            effect_id: receipt.effect_id,
            matches_target: false,
          };
        }
        if (error.code === "DATA_INSUFFICIENT") {
          return {
            availability: "data_insufficient",
            effect_id: receipt.effect_id,
            matches_target: false,
          };
        }
        throw error;
      }
      throw new CommandError(
        "OBSERVATION_UNAVAILABLE",
        `gitlab mutation readback failed: ${redactUnknown(error, [token()])}`,
      );
    }
  }

  return { execute, preview, readback };
}

function validateIntent(
  intent: TaskMutationIntent,
  identity: GitLabInstanceIdentity,
  options: CreateGitLabTaskMutationProviderOptions,
): MutationPlan {
  for (const field of BINDING_FIELDS) {
    const value = intent[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new CommandError("CONTRACT_INVALID", `${field} must be a non-empty string`);
    }
  }
  if (!isManagedKind(intent.mutation_kind)) {
    throw new CommandError(
      "CONTRACT_INVALID",
      `mutation_kind ${intent.mutation_kind} is not allowed`,
    );
  }
  const target = parseTarget(intent.target, identity);
  const payload = kindPayload(intent.mutation_kind, intent);
  if (
    intent.mutation_kind === "close_issue" &&
    payload.acceptance_evidence_complete !== true
  ) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "close_issue requires complete acceptance evidence",
    );
  }
  const digest = mutationPayloadDigest({
    actor_binding: intent.actor_binding,
    authority_scope_ref: intent.authority_scope_ref,
    decision_ref: intent.decision_ref,
    effect_id: intent.effect_id,
    execution_envelope_ref: intent.execution_envelope_ref,
    expected_source_revision: intent.expected_source_revision,
    idempotency_key: intent.idempotency_key,
    mutation_kind: intent.mutation_kind,
    payload,
    target,
    task_ref: intent.task_ref,
  });
  if (digest !== intent.canonical_payload_digest) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "canonical_payload_digest does not match the mutation payload",
    );
  }
  assertCommanderAllowlist(target.instance_origin, options.writeAllowlist);
  assertWriteTransport(target.instance_origin, options.transportSecurityExceptionRef);
  return {
    actor_binding: intent.actor_binding,
    authority_scope_ref: intent.authority_scope_ref,
    canonical_payload_digest: digest,
    decision_ref: intent.decision_ref,
    effect_id: intent.effect_id,
    execution_envelope_ref: intent.execution_envelope_ref,
    expected_source_revision: intent.expected_source_revision,
    idempotency_key: intent.idempotency_key,
    mutation_kind: intent.mutation_kind,
    payload,
    target,
    task_ref: intent.task_ref,
    ...payload,
  };
}

function planToIntent(plan: MutationPlan): TaskMutationIntent {
  return {
    actor_binding: plan.actor_binding,
    authority_scope_ref: plan.authority_scope_ref,
    canonical_payload_digest: plan.canonical_payload_digest,
    decision_ref: plan.decision_ref,
    effect_id: plan.effect_id,
    execution_envelope_ref: plan.execution_envelope_ref,
    expected_source_revision: plan.expected_source_revision,
    idempotency_key: plan.idempotency_key,
    mutation_kind: plan.mutation_kind,
    target: plan.target,
    task_ref: plan.task_ref,
    ...plan.payload,
  };
}

function parseTarget(
  target: MutationTarget | undefined,
  identity: GitLabInstanceIdentity,
): MutationTarget {
  if (target === undefined) {
    throw new CommandError("CONTRACT_INVALID", "target is required");
  }
  const instance_origin = parseGitLabInstanceOrigin(String(target.instance_origin ?? ""));
  const project_path = parseGitLabInstanceProjectPath(String(target.project_path ?? ""));
  const iid = target.iid;
  if (typeof iid !== "number" || !Number.isInteger(iid) || iid < 1) {
    throw new CommandError("CONTRACT_INVALID", "target.iid must be a positive integer");
  }
  if (instance_origin !== identity.instance_origin || project_path !== identity.project_path) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "mutation target does not match the declared instance identity",
    );
  }
  return { iid, instance_origin, project_path };
}

function kindPayload(
  kind: ManagedMutationKind,
  intent: MutationKindPayload,
): MutationKindPayload {
  if (kind === "append_comment") {
    const comment_body = requiredText(intent.comment_body, "comment_body");
    return { comment_body };
  }
  if (kind === "transition_managed_status_label") {
    const managed_label = requiredText(intent.managed_label, "managed_label");
    return { managed_label };
  }
  if (kind === "set_assignee") {
    const assignee = requiredText(intent.assignee, "assignee");
    const assignee_id = intent.assignee_id;
    if (typeof assignee_id !== "number" || !Number.isInteger(assignee_id) || assignee_id < 1) {
      throw new CommandError("CONTRACT_INVALID", "assignee_id must be a positive integer");
    }
    return { assignee, assignee_id };
  }
  if (kind === "close_issue") {
    return { acceptance_evidence_complete: intent.acceptance_evidence_complete === true };
  }
  return {};
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CommandError("CONTRACT_INVALID", `${field} must be a non-empty string`);
  }
  return value;
}

function isManagedKind(value: string): value is ManagedMutationKind {
  return (MANAGED_MUTATION_KINDS as readonly string[]).includes(value);
}

function assertWriteTransport(
  origin: string,
  exceptionRef: string | undefined,
): void {
  const parsed = new URL(origin);
  if (parsed.protocol === "https:") {
    return;
  }
  if (parsed.protocol === "http:") {
    if (exceptionRef === undefined || exceptionRef.trim() === "") {
      throw new CommandError(
        "REPOSITORY_NOT_ALLOWED",
        "plaintext HTTP write requires a transport_security_exception_ref",
      );
    }
    return;
  }
  throw new CommandError(
    "REPOSITORY_NOT_ALLOWED",
    "mutation origin must use HTTP or HTTPS",
  );
}

function readyEvents(workspaceRoot: string): readonly EventEnvelope[] {
  const snapshot = readLedger(workspaceRoot);
  if (snapshot.status === "missing") {
    throw new CommandError("TASK_AUTHORITY_MISSING", "workspace is not connected");
  }
  if (snapshot.status === "truncated_tail") {
    throw new CommandError(
      "LEDGER_CORRUPT",
      "ledger has an unfinished tail; repair it before appending",
    );
  }
  return snapshot.events;
}

function findPrepared(
  events: readonly EventEnvelope[],
  effectId: string,
): MutationPlan | undefined {
  const event = [...events]
    .reverse()
    .find(
      (item) =>
        item.event_type === "hufu/mutation.prepared" &&
        item.payload["effect_id"] === effectId,
    );
  if (event === undefined) {
    return undefined;
  }
  const payload = event.payload;
  const kind = payload["mutation_kind"];
  const target = payload["target"];
  if (
    typeof kind !== "string" ||
    !isManagedKind(kind) ||
    !isJsonObject(target) ||
    typeof payload["effect_id"] !== "string" ||
    typeof payload["canonical_payload_digest"] !== "string"
  ) {
    throw new CommandError("DATA_INSUFFICIENT", "mutation prepared event is malformed");
  }
  const kindPayloadValue = isJsonObject(payload["payload"]) ? payload["payload"] : {};
  return {
    actor_binding: String(payload["actor_binding"] ?? ""),
    authority_scope_ref: String(payload["authority_scope_ref"] ?? ""),
    canonical_payload_digest: payload["canonical_payload_digest"],
    decision_ref: String(payload["decision_ref"] ?? ""),
    effect_id: payload["effect_id"],
    execution_envelope_ref: String(payload["execution_envelope_ref"] ?? ""),
    expected_source_revision: String(payload["expected_source_revision"] ?? ""),
    idempotency_key: String(payload["idempotency_key"] ?? ""),
    mutation_kind: kind,
    payload: kindPayloadValue,
    target: {
      iid: Number(target["iid"]),
      instance_origin: String(target["instance_origin"] ?? ""),
      project_path: String(target["project_path"] ?? ""),
    },
    task_ref: String(payload["task_ref"] ?? ""),
    ...kindPayloadValue,
  };
}

function findReceipt(
  events: readonly EventEnvelope[],
  effectId: string,
): MutationReceipt | undefined {
  const event = [...events]
    .reverse()
    .find(
      (item) =>
        item.event_type === "hufu/mutation.receipt" &&
        item.payload["effect_id"] === effectId,
    );
  if (event === undefined) {
    return undefined;
  }
  const payload = event.payload;
  if (
    typeof payload["effect_id"] !== "string" ||
    typeof payload["canonical_payload_digest"] !== "string" ||
    typeof payload["mutation_kind"] !== "string" ||
    !isManagedKind(payload["mutation_kind"]) ||
    typeof payload["outcome"] !== "string"
  ) {
    throw new CommandError("DATA_INSUFFICIENT", "mutation receipt is malformed");
  }
  return {
    canonical_payload_digest: payload["canonical_payload_digest"],
    effect_id: payload["effect_id"],
    idempotent_replay: false,
    mutation_kind: payload["mutation_kind"],
    outcome: payload["outcome"] as MutationOutcome,
    write_performed: payload["write_performed"] === true,
  };
}

function persistPrepared(workspaceRoot: string, plan: MutationPlan): void {
  appendEvents(workspaceRoot, [
    {
      actor_binding_ref: plan.actor_binding,
      event_type: "hufu/mutation.prepared",
      idempotency_key: `hufu/mutation.prepared:${plan.effect_id}`,
      payload: {
        actor_binding: plan.actor_binding,
        authority_scope_ref: plan.authority_scope_ref,
        canonical_payload_digest: plan.canonical_payload_digest,
        decision_ref: plan.decision_ref,
        effect_id: plan.effect_id,
        execution_envelope_ref: plan.execution_envelope_ref,
        expected_source_revision: plan.expected_source_revision,
        idempotency_key: plan.idempotency_key,
        mutation_kind: plan.mutation_kind,
        payload: { ...plan.payload },
        target: { ...plan.target },
        task_ref: plan.task_ref,
      },
    },
  ]);
}

function persistEffectAndReceipt(
  workspaceRoot: string,
  plan: MutationPlan,
  result: {
    readonly outcome: MutationOutcome;
    readonly readback: MutationReadback;
    readonly writePerformed: boolean;
  },
): void {
  const observationId = randomUUID();
  appendEvents(workspaceRoot, [
    {
      actor_binding_ref: plan.actor_binding,
      event_type: "hufu/decision.effect_delta",
      idempotency_key: `hufu/decision.effect_delta:${plan.effect_id}:${observationId}`,
      payload: {
        decision_id: plan.decision_ref,
        durability:
          result.outcome === "complete" || result.outcome === "noop"
            ? "durable"
            : "unknown",
        effect_id: plan.effect_id,
        envelope_id: plan.execution_envelope_ref,
        observation_id: observationId,
        observed_result: result.writePerformed ? "applied" : "noop",
        readback_status: result.readback.availability,
        version: 1,
      },
    },
    {
      actor_binding_ref: plan.actor_binding,
      event_type: "hufu/mutation.receipt",
      idempotency_key: `hufu/mutation.receipt:${plan.effect_id}`,
      payload: {
        canonical_payload_digest: plan.canonical_payload_digest,
        effect_id: plan.effect_id,
        mutation_kind: plan.mutation_kind,
        outcome: result.outcome,
        write_performed: result.writePerformed,
      },
    },
  ]);
}

async function getIssue(
  plan: MutationPlan,
  identity: GitLabInstanceIdentity,
  options: CreateGitLabTaskMutationProviderOptions,
  timeoutMs: number,
  credential: string,
): Promise<ObservedIssue> {
  const url = issueUrl(identity, plan.target.iid);
  const response = await authorizedRequest({
    credential,
    fetchFn: options.fetch,
    identity,
    method: "GET",
    timeoutMs,
    url,
  });
  const payload = await readJson(response, credential, "issue");
  if (!isJsonObject(payload)) {
    throw new CommandError("DATA_INSUFFICIENT", "gitlab issue readback is not an object");
  }
  return parseObservedIssue(payload, identity, plan.target.iid);
}

async function maybeGetNotes(
  plan: MutationPlan,
  identity: GitLabInstanceIdentity,
  options: CreateGitLabTaskMutationProviderOptions,
  timeoutMs: number,
  credential: string,
): Promise<readonly { readonly body: string }[]> {
  if (plan.mutation_kind !== "append_comment") {
    return [];
  }
  return getNotes(plan, identity, options, timeoutMs, credential);
}

async function getNotes(
  plan: MutationPlan,
  identity: GitLabInstanceIdentity,
  options: CreateGitLabTaskMutationProviderOptions,
  timeoutMs: number,
  credential: string,
): Promise<readonly { readonly body: string }[]> {
  const url = notesUrl(identity, plan.target.iid);
  const response = await authorizedRequest({
    credential,
    fetchFn: options.fetch,
    identity,
    method: "GET",
    timeoutMs,
    url,
  });
  const payload = await readJson(response, credential, "notes");
  if (!Array.isArray(payload)) {
    throw new CommandError("DATA_INSUFFICIENT", "gitlab notes readback is not an array");
  }
  return payload.flatMap((item) => {
    if (!isJsonObject(item) || typeof item["body"] !== "string") {
      return [];
    }
    return [{ body: item["body"] }];
  });
}

async function observeReadback(
  plan: MutationPlan,
  identity: GitLabInstanceIdentity,
  options: CreateGitLabTaskMutationProviderOptions,
  timeoutMs: number,
  credential: string,
): Promise<MutationReadback> {
  try {
    const issue = await getIssue(plan, identity, options, timeoutMs, credential);
    const notes = await maybeGetNotes(plan, identity, options, timeoutMs, credential);
    return {
      availability: "available",
      effect_id: plan.effect_id,
      matches_target: matchesTarget(plan, issue, notes),
    };
  } catch (error) {
    if (error instanceof CommandError) {
      if (error.code === "DATA_INSUFFICIENT") {
        return {
          availability: "data_insufficient",
          effect_id: plan.effect_id,
          matches_target: false,
        };
      }
      if (error.code === "OBSERVATION_UNAVAILABLE") {
        return {
          availability: "unavailable",
          effect_id: plan.effect_id,
          matches_target: false,
        };
      }
    }
    throw error;
  }
}

async function performWrite(
  plan: MutationPlan,
  identity: GitLabInstanceIdentity,
  options: CreateGitLabTaskMutationProviderOptions,
  timeoutMs: number,
  credential: string,
): Promise<void> {
  const request = writeRequest(plan, identity);
  await authorizedRequest({
    body: request.body,
    credential,
    fetchFn: options.fetch,
    identity,
    method: request.method,
    timeoutMs,
    url: request.url,
  });
}

function writeRequest(
  plan: MutationPlan,
  identity: GitLabInstanceIdentity,
): { readonly body: Record<string, unknown>; readonly method: "POST" | "PUT"; readonly url: string } {
  if (plan.mutation_kind === "append_comment") {
    const marker = commentEffectMarker(plan.effect_id, plan.canonical_payload_digest);
    return {
      body: { body: `${String(plan.payload.comment_body)}\n${marker}` },
      method: "POST",
      url: notesUrl(identity, plan.target.iid),
    };
  }
  if (plan.mutation_kind === "transition_managed_status_label") {
    return {
      body: { add_labels: plan.payload.managed_label },
      method: "PUT",
      url: issueUrl(identity, plan.target.iid),
    };
  }
  if (plan.mutation_kind === "set_assignee") {
    return {
      body: { assignee_ids: [plan.payload.assignee_id] },
      method: "PUT",
      url: issueUrl(identity, plan.target.iid),
    };
  }
  if (plan.mutation_kind === "close_issue") {
    return {
      body: { state_event: "close" },
      method: "PUT",
      url: issueUrl(identity, plan.target.iid),
    };
  }
  return {
    body: { state_event: "reopen" },
    method: "PUT",
    url: issueUrl(identity, plan.target.iid),
  };
}

function matchesTarget(
  plan: MutationPlan,
  issue: ObservedIssue,
  notes: readonly { readonly body: string }[],
): boolean {
  if (plan.mutation_kind === "append_comment") {
    const marker = commentEffectMarker(plan.effect_id, plan.canonical_payload_digest);
    return notes.some((note) => note.body.includes(marker));
  }
  if (plan.mutation_kind === "transition_managed_status_label") {
    return issue.labels.includes(String(plan.payload.managed_label));
  }
  if (plan.mutation_kind === "set_assignee") {
    return issue.assignee === plan.payload.assignee;
  }
  if (plan.mutation_kind === "close_issue") {
    return issue.state === "closed";
  }
  return issue.state === "opened";
}

function assertRevisionMatch(issue: ObservedIssue, expected: string): void {
  const actual = issue.updated_at;
  if (actual === undefined || actual !== expected) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "issue source revision does not match expected_source_revision",
    );
  }
}

function declareOutcome(input: {
  readonly alreadyAtTarget: boolean;
  readonly kind: ManagedMutationKind;
  readonly projectionMatches: boolean;
  readonly readback: MutationReadback;
  readonly recovering: boolean;
  readonly writePerformed: boolean;
}): MutationOutcome {
  if (input.readback.availability === "unavailable") {
    return "unavailable";
  }
  if (input.readback.availability === "data_insufficient") {
    return "data_insufficient";
  }
  if (input.kind === "append_comment") {
    if (input.readback.matches_target !== true) {
      return "data_insufficient";
    }
    return input.writePerformed || input.recovering ? "complete" : "noop";
  }
  if (input.projectionMatches !== true || input.readback.matches_target !== true) {
    return input.readback.availability === "available" ? "data_insufficient" : input.readback.availability;
  }
  if (input.writePerformed || input.recovering) {
    return "complete";
  }
  return input.alreadyAtTarget ? "noop" : "data_insufficient";
}

async function refreshProjection(
  identity: GitLabInstanceIdentity,
  options: CreateGitLabTaskMutationProviderOptions,
): Promise<{ readonly incomplete: boolean; readonly items: readonly ObservedIssue[] }> {
  if (options.fetch === undefined) {
    return { incomplete: true, items: [] };
  }
  try {
    const port = createHttpGitLabInstancePort({
      fetch: options.fetch,
      identity,
      now: options.now,
      secretProvider: options.secretProvider,
    });
    const listed = await port.listIssueProjections(identity.project_path);
    writeGitLabInstanceProjectionCache(options.workspaceRoot, {
      cache_schema_version: 1,
      incomplete: listed.incomplete,
      instance_kind: "self_hosted",
      instance_origin: identity.instance_origin,
      items: listed.items,
      observed_at: listed.observed_at,
      repository: identity.project_path,
      task_authority: "gitlab",
    });
    return {
      incomplete: listed.incomplete,
      items: listed.items.map((item) => ({
        assignee: item.assignee,
        iid: Number(item.external_ref.split("#")[1] ?? "0"),
        labels: item.labels ?? [],
        state: item.native_state,
        updated_at: item.updated_at ?? item.source_revision,
        web_url: item.original_url,
      })),
    };
  } catch (error) {
    if (error instanceof CommandError) {
      throw error;
    }
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      `gitlab instance refresh failed: ${redactUnknown(error)}`,
    );
  }
}

function projectionShowsTarget(
  plan: MutationPlan,
  projection: { readonly incomplete: boolean; readonly items: readonly ObservedIssue[] },
): boolean {
  if (plan.mutation_kind === "append_comment") {
    return true;
  }
  if (projection.incomplete) {
    return false;
  }
  const item = projection.items.find((entry) => entry.iid === plan.target.iid);
  if (item === undefined) {
    return false;
  }
  return matchesTarget(plan, item, []);
}

function issueUrl(identity: GitLabInstanceIdentity, iid: number): string {
  return `${identity.instance_origin}/api/v4/projects/${encodeURIComponent(identity.project_path)}/issues/${String(iid)}`;
}

function notesUrl(identity: GitLabInstanceIdentity, iid: number): string {
  return `${issueUrl(identity, iid)}/notes`;
}

async function authorizedRequest(input: {
  readonly body?: Record<string, unknown>;
  readonly credential: string;
  readonly fetchFn: typeof fetch | undefined;
  readonly identity: GitLabInstanceIdentity;
  readonly method: "GET" | "POST" | "PUT";
  readonly timeoutMs: number;
  readonly url: string;
}): Promise<Response> {
  const fetchFn = input.fetchFn;
  if (fetchFn === undefined) {
    throw new CommandError("GRANT_SCOPE_EXCEEDED", "live GitLab execute is not granted");
  }
  assertMutationUrl(input.url, input.identity, input.method);
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${input.credential}`,
  };
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  let response: Response;
  try {
    response = await fetchWithTimeout(
      () =>
        fetchFn(input.url, {
          body: input.body === undefined ? undefined : JSON.stringify(input.body),
          headers,
          method: input.method,
          redirect: "manual",
        }),
      input.timeoutMs,
      "gitlab mutation request timed out",
    );
  } catch (error) {
    if (error instanceof CommandError) {
      throw error;
    }
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      `gitlab mutation request failed: ${redactUnknown(error, [input.credential])}`,
    );
  }
  if (isRedirect(response.status)) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab mutation redirect escaped the authorized origin",
    );
  }
  if (!response.ok) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      `gitlab mutation request failed with HTTP ${String(response.status)}`,
    );
  }
  return response;
}

async function readJson(
  response: Response,
  credential: string,
  label: string,
): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      `gitlab ${label} read returned non-JSON: ${redactUnknown(error, [credential])}`,
    );
  }
}

function parseObservedIssue(
  item: Record<string, unknown>,
  identity: GitLabInstanceIdentity,
  iid: number,
): ObservedIssue {
  const webUrl = item["web_url"];
  const state = item["state"];
  if (typeof webUrl !== "string" || webUrl.trim() === "") {
    throw new CommandError("DATA_INSUFFICIENT", "gitlab issue web_url is missing");
  }
  if (typeof state !== "string" || state.trim() === "") {
    throw new CommandError("DATA_INSUFFICIENT", "gitlab issue state is missing");
  }
  assertIssueMatchesIdentity(item, identity, iid, webUrl);
  const labels = readLabels(item["labels"]);
  const assignee = readAssignee(item["assignee"] ?? item["assignees"]);
  const updatedAt =
    typeof item["updated_at"] === "string" && item["updated_at"].trim() !== ""
      ? item["updated_at"].trim()
      : undefined;
  return {
    ...(assignee === undefined ? {} : { assignee }),
    iid,
    labels,
    state: state.trim(),
    ...(updatedAt === undefined ? {} : { updated_at: updatedAt }),
    web_url: webUrl.trim(),
  };
}

function assertIssueMatchesIdentity(
  item: Record<string, unknown>,
  identity: GitLabInstanceIdentity,
  iid: number,
  webUrl: string,
): void {
  let parsed: URL;
  try {
    parsed = new URL(webUrl);
  } catch {
    throw new CommandError("OBSERVATION_UNAVAILABLE", "gitlab issue web_url is invalid");
  }
  const origin = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${
    parsed.port === "" ? "" : `:${parsed.port}`
  }`;
  if (origin !== identity.instance_origin.toLowerCase()) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance issue origin does not match the declared identity",
    );
  }
  const pathMatch = parsed.pathname.match(/^\/(.+)\/-\/issues\/([1-9][0-9]*)$/);
  if (pathMatch === null || pathMatch[1] === undefined || pathMatch[2] === undefined) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance issue web_url is not an issue URL for the declared project",
    );
  }
  let projectPath: string;
  try {
    projectPath = decodeURIComponent(pathMatch[1]);
  } catch {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance issue web_url project path is invalid",
    );
  }
  if (projectPath !== identity.project_path) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance issue does not belong to the declared project",
    );
  }
  const urlIid = Number(pathMatch[2]);
  if (!Number.isInteger(urlIid) || urlIid !== iid) {
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      "gitlab instance issue iid does not match the declared issue URL",
    );
  }
  const references = item["references"];
  if (isJsonObject(references) && typeof references["full"] === "string") {
    const expected = `${identity.project_path}#${String(iid)}`;
    if (references["full"] !== expected) {
      throw new CommandError(
        "OBSERVATION_UNAVAILABLE",
        "gitlab instance issue references do not match the declared project",
      );
    }
  }
}

function assertMutationUrl(
  url: string,
  identity: GitLabInstanceIdentity,
  method: "GET" | "POST" | "PUT",
): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CommandError("REPOSITORY_NOT_ALLOWED", "gitlab mutation request URL is invalid");
  }
  const declared = new URL(identity.instance_origin);
  if (declared.protocol === "https:" && parsed.protocol !== "https:") {
    throw new CommandError("REPOSITORY_NOT_ALLOWED", "gitlab mutation requests must use HTTPS");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab mutation requests must use HTTP or HTTPS",
    );
  }
  const origin = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${
    parsed.port === "" ? "" : `:${parsed.port}`
  }`;
  if (origin !== identity.instance_origin.toLowerCase()) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab mutation request escaped the authorized origin",
    );
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab mutation request URL must not embed credentials",
    );
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "gitlab.com" || host === "www.gitlab.com") {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab.com cannot impersonate a self-hosted instance",
    );
  }
  const encodedIssue = `/api/v4/projects/${encodeURIComponent(identity.project_path)}/issues/`;
  const decodedIssue = `/api/v4/projects/${identity.project_path}/issues/`;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(parsed.pathname);
  } catch {
    throw new CommandError("REPOSITORY_NOT_ALLOWED", "gitlab mutation request URL is invalid");
  }
  const allowed =
    pathnameAllowed(parsed.pathname, encodedIssue, method) ||
    pathnameAllowed(decodedPath, decodedIssue, method);
  if (!allowed) {
    throw new CommandError(
      "REPOSITORY_NOT_ALLOWED",
      "gitlab mutation request escaped the authorized issue path",
    );
  }
}

function pathnameAllowed(
  pathname: string,
  prefix: string,
  method: "GET" | "POST" | "PUT",
): boolean {
  if (!pathname.startsWith(prefix)) {
    return false;
  }
  const rest = pathname.slice(prefix.length);
  const issueOnly = /^[1-9][0-9]*$/.test(rest);
  const notes = /^[1-9][0-9]*\/notes$/.test(rest);
  if (method === "GET") {
    return issueOnly || notes;
  }
  if (method === "POST") {
    return notes;
  }
  return issueOnly;
}

function readLabels(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim() !== "") {
      return [item.trim()];
    }
    if (isJsonObject(item) && typeof item["name"] === "string" && item["name"].trim() !== "") {
      return [item["name"].trim()];
    }
    return [];
  });
}

function readAssignee(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return readAssignee(value[0]);
  }
  if (!isJsonObject(value)) {
    return undefined;
  }
  const username = value["username"];
  if (typeof username === "string" && username.trim() !== "") {
    return username.trim();
  }
  return undefined;
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
