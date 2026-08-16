import { CommandError } from "./errors.js";
import { createHttpGitHubPort } from "./github-http.js";
import { type GitHubPort } from "./github-port.js";
import { CANONICAL_REPOSITORY } from "./github-ref.js";
import {
  readGitLabProjectionCache,
  writeGitLabProjectionCache,
} from "./gitlab-cache.js";
import { createHttpGitLabPort } from "./gitlab-http.js";
import { type GitLabPort } from "./gitlab-port.js";
import { parseGitLabProject } from "./gitlab-ref.js";
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
  readonly gitlabPort?: GitLabPort;
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
    if (taskAuthority === "github") {
      await refreshGithub(workspaceRoot, options.githubPort);
    } else if (taskAuthority === "gitlab") {
      await refreshGitlab(
        workspaceRoot,
        String(connected?.payload["repository"] ?? ""),
        options.gitlabPort,
      );
    } else {
      throw new CommandError(
        "CONTRACT_INVALID",
        "explicit refresh is not available for this task_authority",
      );
    }
  }
  return projectCurrentView(events, {
    cache: taskAuthority === "github" ? readProjectionCache(workspaceRoot) : undefined,
    gitlabCache:
      taskAuthority === "gitlab"
        ? readGitLabProjectionCache(workspaceRoot)
        : undefined,
    now: options.now,
  });
}

async function refreshGithub(
  workspaceRoot: string,
  githubPort: GitHubPort | undefined,
): Promise<void> {
  const port = githubPort ?? createHttpGitHubPort();
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

async function refreshGitlab(
  workspaceRoot: string,
  repositoryInput: string,
  gitlabPort: GitLabPort | undefined,
): Promise<void> {
  const repository = parseGitLabProject(repositoryInput);
  const port = gitlabPort ?? createHttpGitLabPort();
  try {
    const listed = await port.listIssueProjections(repository);
    writeGitLabProjectionCache(workspaceRoot, {
      cache_schema_version: 1,
      incomplete: listed.incomplete,
      items: listed.items,
      observed_at: listed.observed_at,
      repository,
      task_authority: "gitlab",
    });
  } catch (error) {
    if (error instanceof CommandError) {
      throw error;
    }
    throw new CommandError(
      "OBSERVATION_UNAVAILABLE",
      `gitlab refresh failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
