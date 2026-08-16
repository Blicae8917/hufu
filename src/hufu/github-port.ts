export interface GitHubIssueProjection {
  readonly external_ref: string;
  readonly native_state: string;
  readonly original_url: string;
  readonly title: string;
  readonly observed_at: string;
  readonly source_revision?: string;
}

export interface ProjectionListResult {
  readonly incomplete: boolean;
  readonly items: readonly GitHubIssueProjection[];
  readonly observed_at: string;
  readonly source_revision?: string;
}

export interface GitHubPort {
  listIssueProjections(): Promise<ProjectionListResult>;
}
