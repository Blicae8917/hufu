export interface GitLabIssueProjection {
  readonly external_ref: string;
  readonly native_state: string;
  readonly original_url: string;
  readonly title: string;
  readonly observed_at: string;
  readonly source_revision?: string;
}

export interface GitLabProjectionListResult {
  readonly incomplete: boolean;
  readonly items: readonly GitLabIssueProjection[];
  readonly observed_at: string;
  readonly source_revision?: string;
}

export interface GitLabPort {
  listIssueProjections(project: string): Promise<GitLabProjectionListResult>;
}
