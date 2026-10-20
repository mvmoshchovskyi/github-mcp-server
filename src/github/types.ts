export interface AuthenticatedUser {
  readonly login: string;
  readonly name: string | null;
  readonly profileUrl: string;
}

export type RepositoryVisibility = 'all' | 'public' | 'private';
export type RepositorySort = 'updated' | 'created' | 'pushed';
export type RepositoryRelationship =
  | 'owned_by_me'
  | 'organization'
  | 'other_user';

export interface ListRepositoriesInput {
  readonly visibility: RepositoryVisibility;
  readonly sort: RepositorySort;
  readonly limit: number;
}

export interface RepositorySummary {
  readonly name: string;
  readonly fullName: string;
  readonly description: string | null;
  readonly visibility: string;
  readonly defaultBranch: string;
  readonly language: string | null;
  readonly stars: number;
  readonly forks: number;
  readonly url: string;
  readonly owner: string;
  readonly relationship: RepositoryRelationship;
}

export interface RepositoryListResult {
  readonly account: string;
  readonly repositories: RepositorySummary[];
}

export type IssueState = 'open' | 'closed' | 'all';

export interface ListIssuesInput {
  readonly owner: string;
  readonly repo: string;
  readonly state: IssueState;
  readonly limit: number;
}

export interface IssueSummary {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly author: string | null;
  readonly url: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListPullRequestsInput {
  readonly owner: string;
  readonly repo: string;
  readonly state: IssueState;
  readonly limit: number;
}

export interface PullRequestSummary {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly author: string | null;
  readonly url: string;
  readonly createdAt: string;
}

/**
 * Read-only GitHub operations exposed to the MCP tool layer.
 *
 * Keeping this interface independent from Octokit makes the tool handlers
 * testable without network access.
 */
export interface GitHubService {
  getAuthenticatedUser(): Promise<AuthenticatedUser>;
  listRepositories(
    input: ListRepositoriesInput,
  ): Promise<RepositoryListResult>;
  getRepository(owner: string, repo: string): Promise<RepositorySummary>;
  listIssues(input: ListIssuesInput): Promise<IssueSummary[]>;
  listPullRequests(
    input: ListPullRequestsInput,
  ): Promise<PullRequestSummary[]>;
}
