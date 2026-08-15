import { CommandError } from "./errors.js";
import {
  lockPresent,
  readLedger,
  repairTruncatedTail,
} from "./storage.js";

export interface DoctorResult {
  readonly event_count: number;
  readonly healthy: true;
  readonly lock_present: false;
  readonly project_id: string;
  readonly task_authority: "local";
}

export function doctorWorkspace(
  workspaceRoot: string,
  options: { repairTruncatedTail?: boolean } = {},
): DoctorResult {
  if (lockPresent(workspaceRoot)) {
    throw new CommandError(
      "LEDGER_WRITER_CONFLICT",
      "write.lock is present; another writer may be active",
    );
  }

  if (options.repairTruncatedTail === true) {
    const before = readLedger(workspaceRoot);
    if (before.status === "missing") {
      throw new CommandError(
        "TASK_AUTHORITY_MISSING",
        "workspace is not connected as a local project",
      );
    }
    if (before.status !== "truncated_tail") {
      throw new CommandError(
        "CONTRACT_INVALID",
        "no truncated tail to repair",
      );
    }
    repairTruncatedTail(workspaceRoot);
  }

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
      "ledger tail is unfinished; re-run with --repair-truncated-tail after confirming no writer is active",
    );
  }

  const connected = snapshot.events.find(
    (event) => event.event_type === "hufu/project.connected",
  );
  if (connected === undefined) {
    throw new CommandError(
      "TASK_AUTHORITY_MISSING",
      "workspace is not connected as a local project",
    );
  }
  if (connected.payload["task_authority"] !== "local") {
    throw new CommandError(
      "TASK_AUTHORITY_UNSUPPORTED",
      "connected task_authority is not local",
    );
  }

  return {
    event_count: snapshot.events.length,
    healthy: true,
    lock_present: false,
    project_id: String(connected.payload["project_id"]),
    task_authority: "local",
  };
}
