import type { Octokit } from 'octokit';
import { describe, expect, it, vi } from 'vitest';
import { createGitHubService } from '../../src/github/service.js';

function issue(
  number: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    number,
    title: `Issue ${number}`,
    state: 'open',
    user: { login: 'octocat' },
    html_url: `https://github.com/octocat/Hello-World/issues/${number}`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

function pullRequest(
  number: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    number,
    title: `Pull request ${number}`,
    state: 'open',
    user: { login: 'mvmoshchovskyi' },
    html_url: `https://github.com/octocat/Hello-World/pull/${number}`,
    created_at: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

function fakeClient(pages: unknown[][]): {
  client: Octokit;
  iterator: ReturnType<typeof vi.fn>;
} {
  const iterator = vi.fn(() =>
    (async function* () {
      for (const data of pages) {
        yield { data };
      }
    })(),
  );

  const client = {
    rest: {
      issues: { listForRepo: vi.fn() },
      pulls: { list: vi.fn() },
    },
    paginate: { iterator },
  } as unknown as Octokit;

  return { client, iterator };
}

describe('GitHubService.listIssues', () => {
  it('excludes pull requests and stops at the requested limit', async () => {
    const { client, iterator } = fakeClient([
      [
        issue(1),
        issue(2, { pull_request: { url: 'https://example.test/pr/2' } }),
        issue(3),
        issue(4),
      ],
    ]);

    const service = createGitHubService(client);
    const result = await service.listIssues({
      owner: 'octocat',
      repo: 'Hello-World',
      state: 'open',
      limit: 2,
    });

    expect(result.map((item) => item.number)).toEqual([1, 3]);
    expect(iterator.mock.calls[0]?.[1]).toMatchObject({
      owner: 'octocat',
      repo: 'Hello-World',
      state: 'open',
      per_page: 100,
    });
  });

  it('maps issue fields and handles a deleted author', async () => {
    const { client } = fakeClient([[issue(7, { user: null })]]);

    const service = createGitHubService(client);
    const result = await service.listIssues({
      owner: 'octocat',
      repo: 'Hello-World',
      state: 'closed',
      limit: 10,
    });

    expect(result).toEqual([
      {
        number: 7,
        title: 'Issue 7',
        state: 'open',
        author: null,
        url: 'https://github.com/octocat/Hello-World/issues/7',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-02T00:00:00Z',
      },
    ]);
  });

  it('continues through pages until the limit is met', async () => {
    const { client } = fakeClient([
      [issue(1), issue(2, { pull_request: {} })],
      [issue(3), issue(4)],
    ]);

    const service = createGitHubService(client);
    const result = await service.listIssues({
      owner: 'octocat',
      repo: 'Hello-World',
      state: 'all',
      limit: 3,
    });

    expect(result.map((item) => item.number)).toEqual([1, 3, 4]);
  });
});

describe('GitHubService.listPullRequests', () => {
  it('passes filters to GitHub and maps pull request fields', async () => {
    const { client, iterator } = fakeClient([
      [pullRequest(11), pullRequest(12, { user: null })],
    ]);

    const service = createGitHubService(client);
    const result = await service.listPullRequests({
      owner: 'octocat',
      repo: 'Hello-World',
      state: 'closed',
      limit: 10,
    });

    expect(iterator.mock.calls[0]?.[1]).toMatchObject({
      owner: 'octocat',
      repo: 'Hello-World',
      state: 'closed',
      per_page: 100,
    });
    expect(result).toEqual([
      {
        number: 11,
        title: 'Pull request 11',
        state: 'open',
        author: 'mvmoshchovskyi',
        url: 'https://github.com/octocat/Hello-World/pull/11',
        createdAt: '2026-02-01T00:00:00Z',
      },
      {
        number: 12,
        title: 'Pull request 12',
        state: 'open',
        author: null,
        url: 'https://github.com/octocat/Hello-World/pull/12',
        createdAt: '2026-02-01T00:00:00Z',
      },
    ]);
  });

  it('stops at the requested limit', async () => {
    const { client } = fakeClient([
      [pullRequest(1), pullRequest(2), pullRequest(3)],
    ]);

    const service = createGitHubService(client);
    const result = await service.listPullRequests({
      owner: 'octocat',
      repo: 'Hello-World',
      state: 'open',
      limit: 1,
    });

    expect(result.map((item) => item.number)).toEqual([1]);
  });
});
