import { CommandError } from "../src/hufu/errors.js";
import {
  type GitLabTaskMutationProvider,
  type ManagedMutationKind,
  type MutationPlan,
  type MutationReceipt,
  type TaskMutationIntent,
} from "../src/hufu/gitlab-task-mutation-provider.js";
import {
  type NativeHostRuntimeProvider,
  type SessionBinding,
} from "../src/hufu/codex-native-host.js";
import { type ConnectResult } from "../src/hufu/connect.js";
import { type EventEnvelope } from "../src/hufu/envelope.js";

export const PILOT_HTTPS_ORIGIN = "https://gitlab.example.com";
export const PILOT_HTTP_IPV4_ORIGIN = "http://192.0.2.10:41101";
export const PILOT_HTTP_HOST_ORIGIN = "http://gitlab.example.com:41101";
export const PILOT_PROJECT = "example/parent";
export const PILOT_REVISION = "2026-08-23T10:00:00Z";
export const PILOT_CREDENTIAL = "glpat-EXAMPLE0001token";
export const PILOT_EXCEPTION_REF = "test-transport-exception-ref";

export const PILOT_PARENT = {
  iid: 1,
  key: "parent",
  title: "example parent",
} as const;

export const PILOT_CHILDREN = {
  parallelA: {
    dependsOn: undefined,
    iid: 2,
    key: "parallel-a",
    lane: "parallel",
    title: "example child parallel-a",
  },
  parallelB: {
    dependsOn: undefined,
    iid: 3,
    key: "parallel-b",
    lane: "parallel",
    title: "example child parallel-b",
  },
  serial: {
    dependsOn: "parallel-a",
    iid: 4,
    key: "serial",
    lane: "serial",
    title: "example child serial",
  },
  stopLine: {
    blockedOn: "user_decision",
    dependsOn: undefined,
    iid: 5,
    key: "stop-line",
    lane: "stop_line",
    title: "example child stop-line",
  },
} as const;

export type PilotLane = "parent" | "parallel" | "serial" | "stop_line";

export interface PilotIssueSpec {
  readonly blockedOn?: "user_decision";
  readonly dependsOn?: "parallel-a";
  readonly iid: number;
  readonly key: string;
  readonly lane?: PilotLane | "parallel" | "serial" | "stop_line";
  readonly title: string;
}

export interface PilotIssueState {
  readonly assignee?: string;
  readonly iid: number;
  readonly key: string;
  readonly labels: readonly string[];
  readonly lane: PilotLane;
  readonly notes: readonly string[];
  readonly state: string;
  readonly title: string;
  readonly updated_at: string;
  readonly web_url: string;
}

export interface AuthorizedMutationResult {
  readonly reason?: "user_decision" | "serial_predecessor";
  readonly receipt?: MutationReceipt;
  readonly status: "applied" | "blocked";
}

export interface PilotMissingFacts {
  readonly token_usage: "unavailable" | "data_insufficient";
  readonly wall_clock: "unavailable" | "data_insufficient";
}

export interface PublicSafePilotWorld {
  readonly connect: ConnectResult;
  readonly decision_ref: string;
  readonly envelope_ref: { readonly content_digest?: string; readonly envelope_id: string };
  readonly grant_id: string;
  readonly host: NativeHostRuntimeProvider;
  readonly issues: readonly PilotIssueSpec[];
  readonly origin: string;
  readonly project: string;
  readonly provider: GitLabTaskMutationProvider;
  readonly workspaceRoot: string;
  comments(iid: number): readonly string[];
  execute(
    kind: ManagedMutationKind,
    iid: number,
    extras?: Record<string, unknown>,
  ): Promise<MutationReceipt>;
  executeAuthorized(
    kind: ManagedMutationKind,
    iid: number,
    extras?: Record<string, unknown>,
  ): Promise<AuthorizedMutationResult>;
  intent(
    kind: ManagedMutationKind,
    iid: number,
    extras?: Record<string, unknown>,
  ): TaskMutationIntent;
  issue(iid: number): PilotIssueState;
  ledgerEvents(): readonly EventEnvelope[];
  ledgerTypes(): readonly string[];
  missingFacts(): PilotMissingFacts;
  preview(
    kind: ManagedMutationKind,
    iid: number,
    extras?: Record<string, unknown>,
  ): MutationPlan;
  publicDump(): string;
  runOrderedEffectChain(iid: number): Promise<readonly MutationReceipt[]>;
  startLeader(): Promise<SessionBinding>;
  writeCount(iid?: number): number;
}

export interface PilotWorldOptions {
  readonly disconnectAfterWrite?: boolean;
  readonly getIssueUnavailable?: number;
  readonly injectFetch?: boolean;
  readonly omitIssueState?: number;
  readonly origin?: string;
  readonly transportSecurityExceptionRef?: string | null;
}

export class PublicSafePilotNotWiredError extends CommandError {
  constructor() {
    super("DATA_INSUFFICIENT", "public-safe e2e pilot fixture is not wired");
  }
}

export function allPilotIssues(): readonly PilotIssueSpec[] {
  return [
    { ...PILOT_PARENT, lane: "parent" },
    PILOT_CHILDREN.parallelA,
    PILOT_CHILDREN.parallelB,
    PILOT_CHILDREN.serial,
    PILOT_CHILDREN.stopLine,
  ];
}

export async function withPublicSafePilot<T>(
  _fn: (world: PublicSafePilotWorld) => Promise<T>,
  _options?: PilotWorldOptions,
): Promise<T> {
  throw new PublicSafePilotNotWiredError();
}
