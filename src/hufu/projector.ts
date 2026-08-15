import { type EventEnvelope } from "./envelope.js";
import { CommandError } from "./errors.js";
import { type ProjectionCache } from "./projection-cache.js";

export type FactClass = "authoritative" | "observed" | "derived";
export type Availability =
  | "available"
  | "unavailable"
  | "data_insufficient"
  | "conflict";
export type Freshness = "fresh" | "stale" | "unknown" | "not_applicable";
export type TaskAuthority = "local" | "github";

export interface FactSlot<T> {
  readonly availability: Availability;
  readonly fact_class: FactClass;
  readonly freshness: Freshness;
  readonly value: T | null;
}

export interface WorkItemView {
  readonly latest_handoff: FactSlot<{
    completed: string;
    handoff_id: string;
    remaining: string;
  }>;
  readonly native_state?: FactSlot<string>;
  readonly objective: string;
  readonly original_url?: string;
  readonly owner: FactSlot<{ binding_id: string; principal_id: string }>;
  readonly observed_at?: FactSlot<string>;
  readonly work_item_id: string;
}

export interface CurrentView {
  readonly authorization_grant: FactSlot<{
    expires_at: string | null;
    grant_id: string;
    revision: number;
    scope_text: string;
  }>;
  readonly commander: FactSlot<string>;
  readonly latest_handoff: FactSlot<{
    completed: string;
    handoff_id: string;
    remaining: string;
    work_item_id: string;
  }>;
  readonly ledger: FactSlot<{ event_count: number; ledger_seq_end: number }>;
  readonly project: FactSlot<{ project_id: string; repository: string }>;
  readonly project_lead: FactSlot<{ binding_id: string; principal_id: string }>;
  readonly run: FactSlot<null>;
  readonly session: FactSlot<null>;
  readonly task_authority: FactSlot<TaskAuthority>;
  readonly view_schema_version: 1;
  readonly work_item_set: FactSlot<{ count: number; incomplete: boolean }>;
  readonly work_items: readonly WorkItemView[];
}

export interface ProjectViewOptions {
  readonly cache?: ProjectionCache;
  readonly now?: Date;
}

export function projectCurrentView(
  events: readonly EventEnvelope[],
  options: ProjectViewOptions = {},
): CurrentView {
  const connected = lastOfType(events, "hufu/project.connected");
  if (connected === undefined) {
    throw new CommandError(
      "TASK_AUTHORITY_MISSING",
      "workspace is not connected as a local project",
    );
  }
  const taskAuthority = connected.payload["task_authority"];
  if (taskAuthority !== "local" && taskAuthority !== "github") {
    throw new CommandError(
      "TASK_AUTHORITY_UNSUPPORTED",
      "only local and github task_authority can be projected in this module",
    );
  }

  const commander = lastOfType(events, "hufu/commander.declared");
  const grants = events.filter(
    (event) => event.event_type === "hufu/authorization_grant.issued",
  );
  const currentGrant = grants[grants.length - 1];
  const leadBindings = events.filter(
    (event) =>
      event.event_type === "hufu/role_binding.established" &&
      event.payload["role"] === "project_lead",
  );
  const currentLeads = currentProjectLeads(leadBindings);
  const handoffs = events.filter(
    (event) => event.event_type === "hufu/handoff.recorded",
  );
  const latestHandoff = handoffs[handoffs.length - 1];
  const last = events[events.length - 1];
  const staleAfterHours = Number(connected.payload["stale_after_hours"] ?? 24);
  const now = options.now ?? new Date();
  const workItems =
    taskAuthority === "github"
      ? githubWorkItems(options.cache, handoffs, now, staleAfterHours)
      : events
          .filter((event) => event.event_type === "hufu/work_item.opened")
          .map((item) => workItemView(item, events, handoffs));
  const workItemSet = githubWorkItemSet(
    taskAuthority,
    options.cache,
    workItems.length,
    now,
    staleAfterHours,
  );

  return {
    authorization_grant: grantSlot(currentGrant),
    commander: commanderSlot(commander),
    latest_handoff: latestHandoffSlot(latestHandoff),
    ledger: slot(
      {
        event_count: events.length,
        ledger_seq_end: last?.ledger_seq ?? events.length,
      },
      "observed",
      "available",
      "fresh",
    ),
    project: slot(
      {
        project_id: String(connected.payload["project_id"]),
        repository: String(connected.payload["repository"]),
      },
      "authoritative",
      "available",
      "not_applicable",
    ),
    project_lead: projectLeadSlot(currentLeads),
    run: missingNull("observed", "unavailable"),
    session: missingNull("observed", "unavailable"),
    task_authority: slot(
      taskAuthority,
      "authoritative",
      "available",
      "not_applicable",
    ),
    view_schema_version: 1,
    work_item_set: workItemSet,
    work_items: workItems,
  };
}

function githubWorkItemSet(
  taskAuthority: TaskAuthority,
  cache: ProjectionCache | undefined,
  count: number,
  now: Date,
  staleAfterHours: number,
): FactSlot<{ count: number; incomplete: boolean }> {
  if (taskAuthority !== "github") {
    return slot(
      { count, incomplete: false },
      "authoritative",
      "available",
      "not_applicable",
    );
  }
  if (cache === undefined) {
    return missing("observed", "data_insufficient");
  }
  const freshness = freshnessFor(cache.observed_at, now, staleAfterHours);
  const availability = cache.incomplete ? "data_insufficient" : "available";
  return slot(
    { count, incomplete: cache.incomplete },
    "observed",
    availability,
    freshness,
  );
}

function githubWorkItems(
  cache: ProjectionCache | undefined,
  handoffs: readonly EventEnvelope[],
  now: Date,
  staleAfterHours: number,
): WorkItemView[] {
  if (cache === undefined) {
    return [];
  }
  const freshness = freshnessFor(cache.observed_at, now, staleAfterHours);
  return cache.items.map((item) => {
    const itemHandoff = lastMatching(
      handoffs,
      (event) => event.payload["work_item_id"] === item.external_ref,
    );
    return {
      latest_handoff:
        itemHandoff === undefined
          ? missing("observed", "data_insufficient")
          : slot(
              {
                completed: String(itemHandoff.payload["completed"]),
                handoff_id: String(itemHandoff.payload["handoff_id"]),
                remaining: String(itemHandoff.payload["remaining"]),
              },
              "observed",
              "available",
              "fresh",
            ),
      native_state: slot(item.native_state, "observed", "available", freshness),
      objective: item.title,
      original_url: item.original_url,
      owner: missing("authoritative", "data_insufficient"),
      observed_at: slot(cache.observed_at, "observed", "available", freshness),
      work_item_id: item.external_ref,
    };
  });
}

function freshnessFor(
  observedAt: string,
  now: Date,
  staleAfterHours: number,
): Freshness {
  const observedMs = Date.parse(observedAt);
  if (Number.isNaN(observedMs)) {
    return "unknown";
  }
  const ageMs = now.getTime() - observedMs;
  if (ageMs > staleAfterHours * 60 * 60 * 1000) {
    return "stale";
  }
  return "fresh";
}

function workItemView(
  opened: EventEnvelope,
  events: readonly EventEnvelope[],
  handoffs: readonly EventEnvelope[],
): WorkItemView {
  const workItemId = String(opened.payload["work_item_id"]);
  const ownerBinding = events.find(
    (event) =>
      event.event_type === "hufu/role_binding.established" &&
      event.payload["role"] === "owner" &&
      event.payload["scope_kind"] === "work_item" &&
      event.payload["scope_id"] === workItemId,
  );
  const itemHandoff = lastMatching(
    handoffs,
    (event) => event.payload["work_item_id"] === workItemId,
  );
  return {
    latest_handoff:
      itemHandoff === undefined
        ? missing("observed", "data_insufficient")
        : slot(
            {
              completed: String(itemHandoff.payload["completed"]),
              handoff_id: String(itemHandoff.payload["handoff_id"]),
              remaining: String(itemHandoff.payload["remaining"]),
            },
            "observed",
            "available",
            "fresh",
          ),
    objective: String(opened.payload["objective"]),
    owner:
      ownerBinding === undefined
        ? missing("authoritative", "data_insufficient")
        : slot(
            {
              binding_id: String(ownerBinding.payload["binding_id"]),
              principal_id: String(ownerBinding.payload["principal_id"]),
            },
            "authoritative",
            "available",
            "not_applicable",
          ),
    work_item_id: workItemId,
  };
}

function currentProjectLeads(
  bindings: readonly EventEnvelope[],
): EventEnvelope[] {
  const superseded = new Set<string>();
  for (const binding of bindings) {
    const previous = binding.payload["supersedes"];
    if (typeof previous === "string" && previous !== "") {
      superseded.add(previous);
    }
  }
  return bindings.filter((binding) => {
    const bindingId = binding.payload["binding_id"];
    return typeof bindingId === "string" && !superseded.has(bindingId);
  });
}

function grantSlot(
  grant: EventEnvelope | undefined,
): CurrentView["authorization_grant"] {
  if (grant === undefined) {
    return missing("authoritative", "data_insufficient");
  }
  const expires = grant.payload["expires_at"];
  return slot(
    {
      expires_at: typeof expires === "string" ? expires : null,
      grant_id: String(grant.payload["grant_id"]),
      revision: Number(grant.payload["revision"]),
      scope_text: String(grant.payload["scope_text"]),
    },
    "authoritative",
    "available",
    "not_applicable",
  );
}

function commanderSlot(
  commander: EventEnvelope | undefined,
): CurrentView["commander"] {
  if (commander === undefined) {
    return missing("observed", "data_insufficient");
  }
  return slot(
    String(commander.payload["commander_id"]),
    "observed",
    "available",
    "fresh",
  );
}

function projectLeadSlot(
  leads: readonly EventEnvelope[],
): CurrentView["project_lead"] {
  if (leads.length === 0) {
    return missing("authoritative", "data_insufficient");
  }
  if (leads.length > 1) {
    return {
      availability: "conflict",
      fact_class: "derived",
      freshness: "not_applicable",
      value: null,
    };
  }
  const lead = leads[0];
  if (lead === undefined) {
    return missing("authoritative", "data_insufficient");
  }
  return slot(
    {
      binding_id: String(lead.payload["binding_id"]),
      principal_id: String(lead.payload["principal_id"]),
    },
    "authoritative",
    "available",
    "not_applicable",
  );
}

function latestHandoffSlot(
  handoff: EventEnvelope | undefined,
): CurrentView["latest_handoff"] {
  if (handoff === undefined) {
    return missing("observed", "data_insufficient");
  }
  return slot(
    {
      completed: String(handoff.payload["completed"]),
      handoff_id: String(handoff.payload["handoff_id"]),
      remaining: String(handoff.payload["remaining"]),
      work_item_id: String(handoff.payload["work_item_id"]),
    },
    "observed",
    "available",
    "fresh",
  );
}

function slot<T>(
  value: T,
  fact_class: FactClass,
  availability: Availability,
  freshness: Freshness,
): FactSlot<T> {
  return { availability, fact_class, freshness, value };
}

function missing<T>(
  fact_class: FactClass,
  availability: Exclude<Availability, "available">,
): FactSlot<T> {
  return {
    availability,
    fact_class,
    freshness: "not_applicable",
    value: null,
  };
}

function missingNull(
  fact_class: FactClass,
  availability: Exclude<Availability, "available">,
): FactSlot<null> {
  return missing(fact_class, availability);
}

function lastOfType(
  events: readonly EventEnvelope[],
  eventType: EventEnvelope["event_type"],
): EventEnvelope | undefined {
  return lastMatching(events, (event) => event.event_type === eventType);
}

function lastMatching(
  events: readonly EventEnvelope[],
  predicate: (event: EventEnvelope) => boolean,
): EventEnvelope | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event !== undefined && predicate(event)) {
      return event;
    }
  }
  return undefined;
}
