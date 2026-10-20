import type { Octokit } from 'octokit';
import type {
  AuthenticatedUser,
  GitHubService,
  IssueSummary,
  ListIssuesInput,
  ListPullRequestsInput,
  ListRepositoriesInput,
  PullRequestSummary,
  RepositoryListResult,
  RepositoryRelationship,
  RepositorySummary,
} from './types.js';

const MAX_PAGES = 10;
const PER_PAGE = 100;

/**
 * The fields used by the tools. Both the single-repository and paginated
 * repository responses are structurally compatible with this shape.
 */
interface RepositoryData {
  readonly name: string;
  readonly full_name: string;
  readonly description: string | null;
  readonly visibility?: string | undefined;
  readonly private: boolean;
  readonly default_branch: string;
  readonly language: string | null;
  readonly stargazers_count: number;
  readonly forks_count: number;
  readonly html_url: string;
  readonly owner: {
    readonly login: string;
    readonly type: string;
  };
}

interface IssueData {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly user: { readonly login: string } | null;
  readonly html_url: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly pull_request?: unknown;
}

interface PullRequestData {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly user: { readonly login: string } | null;
  readonly html_url: string;
  readonly created_at: string;
}

/**
 * Consumes paginated GitHub responses until `limit` accepted items have been
 * collected or the page safety cap is reached.
 */
async function collectPages<T>(
  iterator: AsyncIterable<{ data: T[] }>,
  limit: number,
  accept: (item: T) => boolean = () => true,
): Promise<T[]> {
  const items: T[] = [];
  let pages = 0;

  for await (const page of iterator) {
    for (const item of page.data) {
      if (!accept(item)) {
        continue;
      }

      items.push(item);
      if (items.length >= limit) {
        return items;
      }
    }

    pages += 1;
    if (pages >= MAX_PAGES) {
      break;
    }
  }

  return items;
}

function classifyRepository(
  repo: RepositoryData,
  authenticatedLogin: string,
): RepositoryRelationship {
  if (repo.owner.login.toLowerCase() === authenticatedLogin.toLowerCase()) {
    return 'owned_by_me';
  }

  return repo.owner.type === 'Organization' ? 'organization' : 'other_user';
}

function toRepositorySummary(
  repo: RepositoryData,
  authenticatedLogin: string,
): RepositorySummary {
  return {
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description ?? null,
    visibility: repo.visibility ?? (repo.private ? 'private' : 'public'),
    defaultBranch: repo.default_branch,
    language: repo.language ?? null,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    url: repo.html_url,
    owner: repo.owner.login,
    relationship: classifyRepository(repo, authenticatedLogin),
  };
}

function toIssueSummary(issue: IssueData): IssueSummary {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    author: issue.user?.login ?? null,
    url: issue.html_url,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
  };
}

function toPullRequestSummary(
  pullRequest: PullRequestData,
): PullRequestSummary {
  return {
    number: pullRequest.number,
    title: pullRequest.title,
    state: pullRequest.state,
    author: pullRequest.user?.login ?? null,
    url: pullRequest.html_url,
    createdAt: pullRequest.created_at,
  };
}

export function createGitHubService(client: Octokit): GitHubService {
  let loginPromise: Promise<string> | undefined;

  const getLogin = async (): Promise<string> => {
    loginPromise ??= client.rest.users
      .getAuthenticated()
      .then(({ data }) => data.login)
      .catch((error: unknown) => {
        // Do not cache a transient authentication or network failure.
        loginPromise = undefined;
        throw error;
      });
    return loginPromise;
  };

  return {
    async getAuthenticatedUser(): Promise<AuthenticatedUser> {
      const { data } = await client.rest.users.getAuthenticated();

      return {
        login: data.login,
        name: data.name ?? null,
        profileUrl: data.html_url,
      };
    },

    async listRepositories(
      input: ListRepositoriesInput,
    ): Promise<RepositoryListResult> {
      const login = await getLogin();

      const iterator = client.paginate.iterator(
        client.rest.repos.listForAuthenticatedUser,
        {
          visibility: input.visibility,
          sort: input.sort,
          direction: 'desc',
          per_page: PER_PAGE,
        },
      );

      const repositories = await collectPages(iterator, input.limit);

      return {
        account: login,
        repositories: repositories.map((repo) =>
          toRepositorySummary(repo, login),
        ),
      };
    },

    async getRepository(
      owner: string,
      repo: string,
    ): Promise<RepositorySummary> {
      const [{ data }, login] = await Promise.all([
        client.rest.repos.get({ owner, repo }),
        getLogin(),
      ]);

      return toRepositorySummary(data, login);
    },

    async listIssues(input: ListIssuesInput): Promise<IssueSummary[]> {
      const iterator = client.paginate.iterator(client.rest.issues.listForRepo, {
        owner: input.owner,
        repo: input.repo,
        state: input.state,
        per_page: PER_PAGE,
      });

      const issues = await collectPages(
        iterator,
        input.limit,
        (issue) =>
          issue.pull_request === undefined || issue.pull_request === null,
      );

      return issues.map(toIssueSummary);
    },

    async listPullRequests(
      input: ListPullRequestsInput,
    ): Promise<PullRequestSummary[]> {
      const iterator = client.paginate.iterator(client.rest.pulls.list, {
        owner: input.owner,
        repo: input.repo,
        state: input.state,
        per_page: PER_PAGE,
      });

      const pullRequests = await collectPages(iterator, input.limit);

      return pullRequests.map(toPullRequestSummary);
    },
  };
}
