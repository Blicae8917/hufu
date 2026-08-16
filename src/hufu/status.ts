import { CommandError } from "./errors.js";
import { createHttpGitHubPort } from "./github-http.js";
import { type GitHubPort } from "./github-port.js";
import { CANONICAL_REPOSITORY } from "./github-ref.js";
import {
  readProjectionCache,
  writeProjectionCache,
} from "./projection-cache.js";
import { type CurrentView, projectCurrentView } from "./projector.js";
import { lockPresent } from "./storage.js";
import { requireReadyEvents } from "./work-item.js";

export interface StatusOptions {
  readonly refresh?: boolean;
  readonly githubPort?: GitHubPort;
  readonly now?: Date;
}

export async function statusWorkspace(
  workspaceRoot: string,
  options: StatusOptions = {},
): Promise<CurrentView> {
  if (lockPresent(workspaceRoot)) {
    throw new CommandError(
      "LEDGER_WRITER_CONFLICT",
      "write.lock is present; another writer may be active",
    );
  }
  const events = requireReadyEvents(workspaceRoot);
  const connected = events.find(
    (event) => event.event_type === "hufu/project.connected",
  );
  const taskAuthority = connected?.payload["task_authority"];
  if (options.refresh === true) {
    if (taskAuthority !== "github") {
      throw new CommandError(
        "CONTRACT_INVALID",
        "explicit refresh is not available for this task_authority",
      );
    }
    const port = options.githubPort ?? createHttpGitHubPort();
    try {
      const listed = await port.listIssueProjections();
      writeProjectionCache(workspaceRoot, {
        cache_schema_version: 1,
        incomplete: listed.incomplete,
        items: listed.items,
        observed_at: listed.observed_at,
        repository: CANONICAL_REPOSITORY,
        task_authority: "github",
      });
    } catch (error) {
      if (error instanceof CommandError) {
        throw error;
      }
      throw new CommandError(
        "OBSERVATION_UNAVAILABLE",
        `github refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  let cache = undefined;
  if (taskAuthority === "github") {
    cache = readProjectionCache(workspaceRoot);
  }
  return projectCurrentView(events, {
    cache,
    now: options.now,
  });
}
