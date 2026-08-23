import { CommandError } from "./errors.js";
import {
  parseGitLabInstanceIdentity,
  parseGitLabInstanceOrigin,
  type GitLabInstanceIdentity,
} from "./gitlab-instance-ref.js";
import {
  GITLAB_INSTANCE_CREDENTIAL_NAME,
  isCredentialAvailable,
  type SecretProvider,
} from "./secret-provider.js";

export { GITLAB_INSTANCE_CREDENTIAL_NAME };

export const WRITE_BACK_CONSTITUTION_AMENDED: boolean = false;
export const DEFAULT_WRITE_BACK_ENABLED = false;

export type GitLabAuthorityIdentitySource =
  | "explicit"
  | "git_remote"
  | "issue_body"
  | "model";

export interface DeclareGitLabAuthorityInput {
  readonly instanceKind: string;
  readonly instanceOrigin: string;
  readonly projectPath: string;
  readonly allowedInstanceOrigins?: readonly string[];
  readonly identitySource?: GitLabAuthorityIdentitySource;
  readonly secretProvider?: SecretProvider;
  readonly writeBackEnabled?: boolean;
  readonly writeBackCapability?: string;
  readonly constitutionAmended?: boolean;
}

export interface GitLabAuthorityDeclaration {
  readonly instance_kind: "self_hosted";
  readonly instance_origin: string;
  readonly project_path: string;
  readonly task_authority: "gitlab";
  readonly capability: "read_projection";
  readonly write_back_enabled: false;
}

export function declareSelfHostedGitLabAuthority(
  input: DeclareGitLabAuthorityInput,
): GitLabAuthorityDeclaration {
  assertExplicitIdentitySource(input.identitySource);
  const identity = parseGitLabInstanceIdentity({
    instanceKind: input.instanceKind,
    instanceOrigin: input.instanceOrigin,
    projectPath: input.projectPath,
  });
  assertCommanderAllowlist(identity.instance_origin, input.allowedInstanceOrigins);
  if (!isCredentialAvailable(input.secretProvider)) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "self-hosted GitLab requires a host-injected credential",
    );
  }
  assertWriteBackGrant({
    capability: input.writeBackCapability,
    constitutionAmended: input.constitutionAmended,
    writeBackEnabled: input.writeBackEnabled,
  });
  return {
    instance_kind: "self_hosted",
    instance_origin: identity.instance_origin,
    project_path: identity.project_path,
    task_authority: "gitlab",
    capability: "read_projection",
    write_back_enabled: false,
  };
}

export function assertCommanderAllowlist(
  origin: string,
  allowlist: readonly string[] | undefined,
): void {
  if (allowlist === undefined || allowlist.length === 0) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "self-hosted GitLab requires a commander-authorized instance allowlist",
    );
  }
  const canonical = parseGitLabInstanceOrigin(origin);
  const allowed = allowlist.map((item) => parseGitLabInstanceOrigin(item));
  if (!allowed.includes(canonical)) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "instance_origin is not in the commander-authorized allowlist",
    );
  }
}

export function assertWriteBackGrant(input: {
  readonly capability?: string;
  readonly constitutionAmended?: boolean;
  readonly writeBackEnabled?: boolean;
}): void {
  const wantsWrite =
    input.writeBackEnabled === true || input.capability === "write_back";
  if (!wantsWrite) {
    return;
  }
  if (
    WRITE_BACK_CONSTITUTION_AMENDED !== true ||
    input.constitutionAmended !== true
  ) {
    throw new CommandError(
      "CONTRACT_INVALID",
      "write-back grant is invalid until the Constitution is amended",
    );
  }
}

export function assertExplicitIdentitySource(
  source: GitLabAuthorityIdentitySource | undefined,
): void {
  if (source === undefined || source === "explicit") {
    return;
  }
  throw new CommandError(
    "CONTRACT_INVALID",
    "self-hosted identity must be explicit; it cannot be inferred",
  );
}

export function connectedInstanceIdentity(payload: Record<string, unknown>):
  | GitLabInstanceIdentity
  | undefined {
  if (payload["instance_kind"] !== "self_hosted") {
    return undefined;
  }
  return parseGitLabInstanceIdentity({
    instanceKind: "self_hosted",
    instanceOrigin: String(payload["instance_origin"] ?? ""),
    projectPath: String(payload["repository"] ?? ""),
  });
}
