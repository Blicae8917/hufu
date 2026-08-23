import { CommandError } from "./errors.js";
import { connectedInstanceIdentity } from "./gitlab-authority.js";
import { readGitLabInstanceProjectionCache } from "./gitlab-instance-cache.js";
import {
  createEnvSecretProvider,
  isCredentialAvailable,
  type SecretProvider,
} from "./secret-provider.js";
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
  readonly task_authority: "local" | "github" | "gitlab";
  readonly instance_kind?: "self_hosted";
  readonly instance_origin?: string;
  readonly write_back_enabled?: false;
  readonly credential_available?: boolean;
  readonly cache_status?: "present" | "missing" | "unreadable";
  readonly findings?: readonly string[];
}

export function doctorWorkspace(
  workspaceRoot: string,
  options: { repairTruncatedTail?: boolean; secretProvider?: SecretProvider } = {},
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
  const taskAuthority = connected.payload["task_authority"];
  if (
    taskAuthority !== "local" &&
    taskAuthority !== "github" &&
    taskAuthority !== "gitlab"
  ) {
    throw new CommandError(
      "TASK_AUTHORITY_UNSUPPORTED",
      "connected task_authority is not supported",
    );
  }

  const result: DoctorResult = {
    event_count: snapshot.events.length,
    healthy: true,
    lock_present: false,
    project_id: String(connected.payload["project_id"]),
    task_authority: taskAuthority,
  };
  const identity = connectedInstanceIdentity(connected.payload);
  if (identity === undefined) {
    return result;
  }
  const secretProvider = options.secretProvider ?? createEnvSecretProvider();
  const credentialAvailable = isCredentialAvailable(secretProvider);
  let cacheStatus: "present" | "missing" | "unreadable" = "missing";
  try {
    cacheStatus =
      readGitLabInstanceProjectionCache(workspaceRoot) === undefined
        ? "missing"
        : "present";
  } catch {
    cacheStatus = "unreadable";
  }
  const findings: string[] = [];
  if (!credentialAvailable) {
    findings.push("host-injected credential is unavailable");
  }
  if (cacheStatus === "missing") {
    findings.push("instance projection cache is missing");
  }
  if (cacheStatus === "unreadable") {
    findings.push("instance projection cache is unreadable");
  }
  return {
    ...result,
    instance_kind: "self_hosted",
    instance_origin: identity.instance_origin,
    write_back_enabled: false,
    credential_available: credentialAvailable,
    cache_status: cacheStatus,
    findings,
  };
}
