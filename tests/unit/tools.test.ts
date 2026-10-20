import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import type { McpServer } from '@modelcontextprotocol/server';
import { RequestError } from 'octokit';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  GitHubService,
  IssueSummary,
  ListIssuesInput,
  ListPullRequestsInput,
  ListRepositoriesInput,
  PullRequestSummary,
  RepositorySummary,
} from '../../src/github/types.js';
import { buildServer } from '../../src/server.js';

const openConnections: Array<{ client: Client; server: McpServer }> = [];

const defaultRepository: RepositorySummary = {
  name: 'example',
  fullName: 'mvmoshchovskyi/example',
  description: 'Example repository',
  visibility: 'public',
  defaultBranch: 'main',
  language: 'TypeScript',
  stars: 1,
  forks: 0,
  url: 'https://github.com/mvmoshchovskyi/example',
  owner: 'mvmoshchovskyi',
  relationship: 'owned_by_me',
};

const defaultIssue: IssueSummary = {
  number: 1,
  title: 'Example issue',
  state: 'open',
  author: 'mvmoshchovskyi',
  url: 'https://github.com/mvmoshchovskyi/example/issues/1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

const defaultPullRequest: PullRequestSummary = {
  number: 2,
  title: 'Example pull request',
  state: 'open',
  author: 'mvmoshchovskyi',
  url: 'https://github.com/mvmoshchovskyi/example/pull/2',
  createdAt: '2026-01-03T00:00:00Z',
};

function createService(overrides: Partial<GitHubService> = {}): GitHubService {
  return {
    async getAuthenticatedUser() {
      return {
        login: 'mvmoshchovskyi',
        name: 'Example User',
        profileUrl: 'https://github.com/mvmoshchovskyi',
      };
    },
    async listRepositories() {
      return {
        account: 'mvmoshchovskyi',
        repositories: [defaultRepository],
      };
    },
    async getRepository() {
      return defaultRepository;
    },
    async listIssues() {
      return [defaultIssue];
    },
    async listPullRequests() {
      return [defaultPullRequest];
    },
    ...overrides,
  };
}

async function connect(service: GitHubService): Promise<{
  client: Client;
  server: McpServer;
}> {
  const server = buildServer(service);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);

  const connection = { client, server };
  openConnections.push(connection);

  return connection;
}

function readText(result: Awaited<ReturnType<Client['callTool']>>): string {
  const block = result.content[0];
  if (block?.type !== 'text') {
    throw new Error('Expected a text content block');
  }
  return block.text;
}

afterEach(async () => {
  while (openConnections.length > 0) {
    const connection = openConnections.pop();
    await connection?.client.close();
    await connection?.server.close();
  }
});

describe('MCP tool registration', () => {
  it('advertises all implemented tools', async () => {
    const { client } = await connect(createService());
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      'github_get_authenticated_user',
      'github_list_my_repositories',
      'github_get_repository',
      'github_list_issues',
      'github_list_pull_requests',
    ]);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(
      true,
    );
  });

  it('returns the authenticated user as JSON', async () => {
    const { client } = await connect(createService());
    const result = await client.callTool({
      name: 'github_get_authenticated_user',
      arguments: {},
    });

    expect(result.isError).not.toBe(true);
    expect(JSON.parse(readText(result))).toEqual({
      login: 'mvmoshchovskyi',
      name: 'Example User',
      profileUrl: 'https://github.com/mvmoshchovskyi',
    });
  });

  it('returns a safe tool error for authentication failures', async () => {
    const error = new RequestError('Bad credentials', 401, {
      request: {
        method: 'GET',
        url: 'https://api.github.com/user',
        headers: {},
      },
    });

    const { client } = await connect(
      createService({
        async getAuthenticatedUser() {
          throw error;
        },
      }),
    );

    const result = await client.callTool({
      name: 'github_get_authenticated_user',
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(readText(result)).toMatch(/authentication failed/);
    expect(readText(result)).not.toContain('Bad credentials');
  });

  it('applies repository defaults before calling the service', async () => {
    const calls: ListRepositoriesInput[] = [];
    const { client } = await connect(
      createService({
        async listRepositories(input) {
          calls.push(input);
          return { account: 'mvmoshchovskyi', repositories: [] };
        },
      }),
    );

    const result = await client.callTool({
      name: 'github_list_my_repositories',
      arguments: {},
    });

    expect(result.isError).not.toBe(true);
    expect(calls).toEqual([
      { visibility: 'all', sort: 'updated', limit: 10 },
    ]);
  });

  it('rejects repository limits outside the allowed range', async () => {
    const { client } = await connect(createService());

    for (const limit of [0, 51, 1.5]) {
      const result = await client.callTool({
        name: 'github_list_my_repositories',
        arguments: { limit },
      });

      expect(result.isError).toBe(true);
      expect(readText(result)).toMatch(/Input validation error/);
    }
  });

  it('passes owner and repository to get_repository', async () => {
    const calls: Array<[string, string]> = [];
    const { client } = await connect(
      createService({
        async getRepository(owner, repo) {
          calls.push([owner, repo]);
          return defaultRepository;
        },
      }),
    );

    const result = await client.callTool({
      name: 'github_get_repository',
      arguments: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(result.isError).not.toBe(true);
    expect(calls).toEqual([['octocat', 'Hello-World']]);
  });

  it('returns a safe not-found message for repositories', async () => {
    const error = new RequestError('Not Found', 404, {
      request: {
        method: 'GET',
        url: 'https://api.github.com/repos/octocat/missing',
        headers: {},
      },
    });

    const { client } = await connect(
      createService({
        async getRepository() {
          throw error;
        },
      }),
    );

    const result = await client.callTool({
      name: 'github_get_repository',
      arguments: { owner: 'octocat', repo: 'missing' },
    });

    expect(result.isError).toBe(true);
    expect(readText(result)).toContain(
      'Repository "octocat/missing" was not found',
    );
    expect(readText(result)).not.toContain('Not Found');
  });

  it('applies issue defaults and returns the repository envelope', async () => {
    const calls: ListIssuesInput[] = [];
    const { client } = await connect(
      createService({
        async listIssues(input) {
          calls.push(input);
          return [defaultIssue];
        },
      }),
    );

    const result = await client.callTool({
      name: 'github_list_issues',
      arguments: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(result.isError).not.toBe(true);
    expect(calls).toEqual([
      {
        owner: 'octocat',
        repo: 'Hello-World',
        state: 'open',
        limit: 10,
      },
    ]);
    expect(JSON.parse(readText(result))).toEqual({
      repository: 'octocat/Hello-World',
      count: 1,
      issues: [defaultIssue],
    });
  });

  it('applies pull request defaults and returns the repository envelope', async () => {
    const calls: ListPullRequestsInput[] = [];
    const { client } = await connect(
      createService({
        async listPullRequests(input) {
          calls.push(input);
          return [defaultPullRequest];
        },
      }),
    );

    const result = await client.callTool({
      name: 'github_list_pull_requests',
      arguments: { owner: 'octocat', repo: 'Hello-World' },
    });

    expect(result.isError).not.toBe(true);
    expect(calls).toEqual([
      {
        owner: 'octocat',
        repo: 'Hello-World',
        state: 'open',
        limit: 10,
      },
    ]);
    expect(JSON.parse(readText(result))).toEqual({
      repository: 'octocat/Hello-World',
      count: 1,
      pullRequests: [defaultPullRequest],
    });
  });

  it('rejects issue and pull request limits outside the allowed range', async () => {
    const { client } = await connect(createService());

    for (const name of [
      'github_list_issues',
      'github_list_pull_requests',
    ] as const) {
      for (const limit of [0, 51, 1.5]) {
        const result = await client.callTool({
          name,
          arguments: { owner: 'octocat', repo: 'Hello-World', limit },
        });

        expect(result.isError).toBe(true);
        expect(readText(result)).toMatch(/Input validation error/);
      }
    }
  });

  it('rejects invalid repository coordinates before calling GitHub', async () => {
    const calls: ListIssuesInput[] = [];
    const { client } = await connect(
      createService({
        async listIssues(input) {
          calls.push(input);
          return [];
        },
      }),
    );

    for (const args of [
      { owner: '', repo: 'example' },
      { owner: 'bad owner', repo: 'example' },
      { owner: 'octocat', repo: '' },
      { owner: 'octocat', repo: 'bad repo' },
    ]) {
      const result = await client.callTool({
        name: 'github_list_issues',
        arguments: args,
      });

      expect(result.isError).toBe(true);
      expect(readText(result)).toMatch(/Input validation error/);
    }

    expect(calls).toEqual([]);
  });

  it('returns a safe not-found message for issues', async () => {
    const error = new RequestError('Not Found', 404, {
      request: {
        method: 'GET',
        url: 'https://api.github.com/repos/octocat/missing/issues',
        headers: {},
      },
    });

    const { client } = await connect(
      createService({
        async listIssues() {
          throw error;
        },
      }),
    );

    const result = await client.callTool({
      name: 'github_list_issues',
      arguments: { owner: 'octocat', repo: 'missing' },
    });

    expect(result.isError).toBe(true);
    expect(readText(result)).toContain(
      'The issue list for "octocat/missing" was not found',
    );
    expect(readText(result)).not.toContain('Not Found');
  });
});
