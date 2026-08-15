import { type EventEnvelope } from "./envelope.js";
import { CommandError } from "./errors.js";
import { mutateLedger, readLedger } from "./storage.js";

export interface OpenWorkItemInput {
  readonly work_item_id: string;
  readonly objective: string;
  readonly terminal_conditions: readonly string[];
}

export function openWorkItem(
  workspaceRoot: string,
  input: OpenWorkItemInput,
): EventEnvelope {
  const workItemId = requiredText(input.work_item_id, "work_item_id");
  const objective = requiredText(input.objective, "objective");
  if (input.terminal_conditions.length === 0) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "terminal_conditions must be a non-empty list",
    );
  }
  const terminalConditions = input.terminal_conditions.map((item, index) =>
    requiredText(item, `terminal_conditions[${index}]`),
  );
  requireReadyEvents(workspaceRoot);

  return mutateLedger(workspaceRoot, (events, append) => {
    if (!events.some((event) => event.event_type === "hufu/project.connected")) {
      throw new CommandError(
        "TASK_AUTHORITY_MISSING",
        "workspace is not connected as a local project",
      );
    }
    const last = events[events.length - 1];
    const actor = actorRef(events);
    const written = append([
      {
        actor_binding_ref: actor,
        caused_by: last?.event_id,
        event_type: "hufu/work_item.opened",
        idempotency_key: `hufu/work_item.opened:${workItemId}`,
        payload: {
          objective,
          terminal_conditions: terminalConditions,
          work_item_id: workItemId,
        },
      },
    ]);
    const opened = written[written.length - 1];
    if (opened === undefined) {
      throw new CommandError("LEDGER_CORRUPT", "work item was not recorded");
    }
    return opened;
  });
}

export function findWorkItem(
  events: readonly EventEnvelope[],
  workItemId: string,
): EventEnvelope | undefined {
  return events.find(
    (event) =>
      event.event_type === "hufu/work_item.opened" &&
      event.payload["work_item_id"] === workItemId,
  );
}

export function requireReadyEvents(workspaceRoot: string): readonly EventEnvelope[] {
  const snapshot = readLedger(workspaceRoot);
  if (snapshot.status === "missing") {
    throw new CommandError(
      "TASK_AUTHORITY_MISSING",
      "workspace is not connected as a local project",
    );
  }
  if (snapshot.status === "truncated_tail") {
    throw new CommandError(
      "LEDGER_CORRUPT",
      "ledger has an unfinished tail; run doctor --repair-truncated-tail after confirming",
    );
  }
  return snapshot.events;
}

function actorRef(events: readonly EventEnvelope[]): string {
  const commander = events.find(
    (event) => event.event_type === "hufu/commander.declared",
  );
  const commanderId = commander?.payload["commander_id"];
  if (typeof commanderId === "string" && commanderId !== "") {
    return commanderId;
  }
  return "hufu:local";
}

function requiredText(value: string, field: string): string {
  if (value.trim() === "") {
    throw new CommandError("CONTRACT_INVALID", `${field} must be non-empty`);
  }
  return value.trim();
}
