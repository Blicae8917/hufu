import { randomUUID } from "node:crypto";

import { type EventEnvelope } from "./envelope.js";
import { CommandError } from "./errors.js";
import { parseThisPublicGithubRepository } from "./github-ref.js";
import { parseGitLabProject } from "./gitlab-ref.js";
import { type EventDraft, mutateLedger } from "./storage.js";

export interface ConnectInput {
  readonly projectId: string;
  readonly repository: string;
  readonly taskAuthority: string;
  readonly commander: string;
  readonly grantScope: string;
  readonly projectLead?: string;
  readonly grantExpires?: string;
}

export interface ConnectResult {
  readonly project_id: string;
  readonly task_authority: "local" | "github" | "gitlab";
  readonly commander_id: string;
  readonly grant_id: string;
  readonly grant_revision: number;
  readonly project_lead_binding_id: string;
  readonly ledger_seq_end: number;
  readonly repository_canonical?: string;
}

interface NormalizedConnect {
  readonly projectId: string;
  readonly repository: string;
  readonly taskAuthority: "local" | "github" | "gitlab";
  readonly commander: string;
  readonly projectLead: string;
  readonly grantScope: string;
  readonly grantExpires?: string;
  readonly grantId: string;
  readonly bindingId: string;
}

interface BootstrapEvents {
  readonly connected: EventEnvelope;
  readonly commander: EventEnvelope;
  readonly grant: EventEnvelope;
  readonly lead: EventEnvelope;
}

export function connectWorkspace(
  workspaceRoot: string,
  input: ConnectInput,
): ConnectResult {
  const normalized = normalizeConnectInput(input);
  return mutateLedger(workspaceRoot, (events, append) => {
    const existing = findBootstrap(events);
    if (existing !== undefined) {
      if (bootstrapMatches(existing, normalized)) {
        return toResult(events, existing);
      }
      throw new CommandError(
        "LEDGER_CAUSALITY_CONFLICT",
        "workspace is already connected with a different identity or grant",
      );
    }
    if (events.length > 0) {
      throw new CommandError(
        "LEDGER_CAUSALITY_CONFLICT",
        "ledger already has events but no local project connection",
      );
    }
    const written = append(buildBootstrapDrafts(normalized));
    const created = findBootstrap(written);
    if (created === undefined) {
      throw new CommandError("LEDGER_CORRUPT", "cold-start events were not written");
    }
    return toResult(written, created);
  });
}

function normalizeConnectInput(input: ConnectInput): NormalizedConnect {
  const projectId = requiredName(input.projectId, "project-id");
  const commander = requiredName(input.commander, "commander");
  const grantScope = requiredName(input.grantScope, "grant-scope");
  const requestedAuthority = requiredName(input.taskAuthority, "task-authority");
  let taskAuthority: "local" | "github" | "gitlab";
  let repository = requiredName(input.repository, "repository");
  if (requestedAuthority === "local") {
    taskAuthority = "local";
  } else if (requestedAuthority === "github") {
    taskAuthority = "github";
    repository = parseThisPublicGithubRepository(repository);
  } else if (requestedAuthority === "gitlab") {
    taskAuthority = "gitlab";
    repository = parseGitLabProject(repository);
  } else {
    throw new CommandError(
      "TASK_AUTHORITY_UNSUPPORTED",
      requestedAuthority === "loopx" ||
        requestedAuthority === "engine" ||
        requestedAuthority === "engine-loopx"
        ? "engine is not task_authority"
        : `task_authority ${requestedAuthority} is not supported in this module`,
    );
  }
  let grantExpires: string | undefined;
  if (input.grantExpires !== undefined && input.grantExpires.trim() !== "") {
    grantExpires = input.grantExpires.trim();
    if (Number.isNaN(Date.parse(grantExpires))) {
      throw new CommandError(
        "CONTRACT_INVALID",
        "grant-expires must be ISO-8601",
      );
    }
  }
  const projectLead =
    input.projectLead === undefined || input.projectLead.trim() === ""
      ? commander
      : input.projectLead.trim();
  return {
    projectId,
    repository,
    taskAuthority,
    commander,
    projectLead,
    grantScope,
    grantExpires,
    grantId: `grant:${projectId}`,
    bindingId: `binding:${projectId}:project_lead`,
  };
}

function requiredName(value: string, flag: string): string {
  if (value.trim() === "") {
    throw new CommandError("CONTRACT_INVALID", `${flag} must be non-empty`);
  }
  return value.trim();
}

function buildBootstrapDrafts(input: NormalizedConnect): EventDraft[] {
  const id0 = randomUUID();
  const id1 = randomUUID();
  const id2 = randomUUID();
  const id3 = randomUUID();
  const occurredAt = new Date().toISOString();
  const grantPayload: Record<string, unknown> = {
    grant_id: input.grantId,
    issuer_id: input.commander,
    revision: 1,
    scope: {
      command_classes: "*",
      path_glob: "*",
      repository: input.repository,
    },
    scope_text: input.grantScope,
  };
  if (input.grantExpires !== undefined) {
    grantPayload["expires_at"] = input.grantExpires;
  }
  return [
    {
      actor_binding_ref: input.commander,
      event_id: id0,
      event_type: "hufu/project.connected",
      idempotency_key: `hufu/project.connected:${input.projectId}`,
      occurred_at: occurredAt,
      payload: {
        project_id: input.projectId,
        repository: input.repository,
        stale_after_hours: 24,
        task_authority: input.taskAuthority,
      },
    },
    {
      actor_binding_ref: input.commander,
      caused_by: id0,
      event_id: id1,
      event_type: "hufu/commander.declared",
      idempotency_key: `hufu/commander.declared:${input.projectId}`,
      occurred_at: occurredAt,
      payload: { commander_id: input.commander },
    },
    {
      actor_binding_ref: input.commander,
      caused_by: id1,
      event_id: id2,
      event_type: "hufu/authorization_grant.issued",
      idempotency_key: `hufu/authorization_grant.issued:${input.projectId}:1`,
      occurred_at: occurredAt,
      payload: grantPayload,
    },
    {
      actor_binding_ref: input.commander,
      caused_by: id2,
      event_id: id3,
      event_type: "hufu/role_binding.established",
      idempotency_key: `hufu/role_binding.established:${input.projectId}:project_lead`,
      occurred_at: occurredAt,
      payload: {
        binding_id: input.bindingId,
        principal_id: input.projectLead,
        role: "project_lead",
        scope_id: input.projectId,
        scope_kind: "project",
      },
    },
  ];
}

function findBootstrap(events: readonly EventEnvelope[]): BootstrapEvents | undefined {
  const connected = events.find(
    (event) => event.event_type === "hufu/project.connected",
  );
  const commander = events.find(
    (event) => event.event_type === "hufu/commander.declared",
  );
  const grant = events.find(
    (event) => event.event_type === "hufu/authorization_grant.issued",
  );
  const lead = events.find(
    (event) =>
      event.event_type === "hufu/role_binding.established" &&
      event.payload["role"] === "project_lead",
  );
  if (
    connected === undefined ||
    commander === undefined ||
    grant === undefined ||
    lead === undefined
  ) {
    return undefined;
  }
  return { connected, commander, grant, lead };
}

function bootstrapMatches(
  existing: BootstrapEvents,
  input: NormalizedConnect,
): boolean {
  return (
    existing.connected.payload["project_id"] === input.projectId &&
    existing.connected.payload["repository"] === input.repository &&
    existing.connected.payload["task_authority"] === input.taskAuthority &&
    existing.commander.payload["commander_id"] === input.commander &&
    existing.grant.payload["scope_text"] === input.grantScope &&
    existing.grant.payload["expires_at"] === input.grantExpires &&
    existing.lead.payload["principal_id"] === input.projectLead
  );
}

function toResult(
  events: readonly EventEnvelope[],
  bootstrap: BootstrapEvents,
): ConnectResult {
  const last = events[events.length - 1];
  const taskAuthority = bootstrap.connected.payload["task_authority"];
  const repository = String(bootstrap.connected.payload["repository"]);
  const result: ConnectResult = {
    project_id: String(bootstrap.connected.payload["project_id"]),
    task_authority:
      taskAuthority === "github" || taskAuthority === "gitlab"
        ? taskAuthority
        : "local",
    commander_id: String(bootstrap.commander.payload["commander_id"]),
    grant_id: String(bootstrap.grant.payload["grant_id"]),
    grant_revision: Number(bootstrap.grant.payload["revision"]),
    project_lead_binding_id: String(bootstrap.lead.payload["binding_id"]),
    ledger_seq_end: last?.ledger_seq ?? 4,
  };
  if (taskAuthority === "github" || taskAuthority === "gitlab") {
    return { ...result, repository_canonical: repository };
  }
  return result;
}
