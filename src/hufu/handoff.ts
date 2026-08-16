import { randomUUID } from "node:crypto";

import { CommandError } from "./errors.js";
import { parseExternalRef } from "./github-ref.js";
import { readProjectionCache } from "./projection-cache.js";
import { projectCurrentView } from "./projector.js";
import { mutateLedger, readLedger } from "./storage.js";
import { findWorkItem } from "./work-item.js";

export interface HandoffInput {
  readonly workItemId: string;
  readonly completed: string;
  readonly remaining: string;
  readonly risks?: string;
  readonly nextReview?: string;
}

export interface HandoffResult {
  readonly grant_id: string;
  readonly grant_revision: number;
  readonly handoff_id: string;
  readonly next_action_text: string;
  readonly work_item_id: string;
}

export function recordHandoff(
  workspaceRoot: string,
  input: HandoffInput,
): HandoffResult {
  const workItemId = requiredText(input.workItemId, "work-item");
  const completed = requiredText(input.completed, "completed");
  const remaining = requiredText(input.remaining, "remaining");
  const risks = optionalText(input.risks);
  const nextReview = optionalText(input.nextReview);
  const existing = readLedger(workspaceRoot);
  if (existing.status === "missing") {
    throw new CommandError(
      "TASK_AUTHORITY_MISSING",
      "workspace is not connected as a local project",
    );
  }

  return mutateLedger(workspaceRoot, (events, append) => {
    const connected = events.find(
      (event) => event.event_type === "hufu/project.connected",
    );
    const taskAuthority = connected?.payload["task_authority"];
    const cache =
      taskAuthority === "github"
        ? readProjectionCache(workspaceRoot)
        : undefined;
    const view = projectCurrentView(events, { cache });
    if (view.authorization_grant.availability !== "available") {
      throw new CommandError(
        "DATA_INSUFFICIENT",
        "no current authorization grant is available",
      );
    }
    const grant = view.authorization_grant.value;
    if (grant === null) {
      throw new CommandError(
        "DATA_INSUFFICIENT",
        "no current authorization grant is available",
      );
    }
    if (taskAuthority === "github") {
      const parsed = parseExternalRef(workItemId);
      const cached = cache?.items.find(
        (item) => item.external_ref === parsed.external_ref,
      );
      if (cached === undefined) {
        throw new CommandError(
          "DATA_INSUFFICIENT",
          `work item ${parsed.external_ref} is not in the projection cache`,
        );
      }
    } else if (findWorkItem(events, workItemId) === undefined) {
      throw new CommandError(
        "DATA_INSUFFICIENT",
        `work item ${workItemId} does not exist`,
      );
    }

    const nextActionText = `Work item ${workItemId}: continue within recorded authorization scope.`;
    assertNextActionInScope(nextActionText, grant.scope_text);

    const handoffId = randomUUID();
    const last = events[events.length - 1];
    const actor =
      view.commander.availability === "available" && view.commander.value !== null
        ? view.commander.value
        : "hufu:local";
    const payload: Record<string, unknown> = {
      completed,
      grant_id: grant.grant_id,
      grant_revision: grant.revision,
      handoff_id: handoffId,
      remaining,
      work_item_id: workItemId,
    };
    if (risks !== undefined) {
      payload["risks"] = risks;
    }
    if (nextReview !== undefined) {
      payload["next_review"] = nextReview;
    }

    append([
      {
        actor_binding_ref: actor,
        caused_by: last?.event_id,
        event_type: "hufu/handoff.recorded",
        idempotency_key: `hufu/handoff.recorded:${handoffId}`,
        payload,
      },
    ]);

    return {
      grant_id: grant.grant_id,
      grant_revision: grant.revision,
      handoff_id: handoffId,
      next_action_text: nextActionText,
      work_item_id: workItemId,
    };
  });
}

function assertNextActionInScope(
  nextActionText: string,
  scopeText: string,
): void {
  if (!nextActionText.includes("continue within recorded authorization scope")) {
    if (!scopeText.includes(nextActionText)) {
      throw new CommandError(
        "GRANT_SCOPE_EXCEEDED",
        "next action is not covered by the recorded grant scope",
      );
    }
  }
}

function requiredText(value: string, field: string): string {
  if (value.trim() === "") {
    throw new CommandError("CONTRACT_INVALID", `${field} must be non-empty`);
  }
  return value.trim();
}

function optionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value.trim() === "") {
    throw new CommandError("CONTRACT_INVALID", "optional text must be non-empty when provided");
  }
  return value.trim();
}
