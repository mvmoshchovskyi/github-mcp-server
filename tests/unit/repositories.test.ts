import type { Octokit } from 'octokit';
import { describe, expect, it, vi } from 'vitest';
import { createGitHubService } from '../../src/github/service.js';

interface RepositoryOverrides {
  readonly name?: string;
  readonly fullName?: string;
  readonly ownerLogin?: string;
  readonly ownerType?: 'User' | 'Organization';
  readonly visibility?: string;
  readonly private?: boolean;
}

function repository(overrides: RepositoryOverrides = {}): Record<string, unknown> {
  const name = overrides.name ?? 'repo';
  const ownerLogin = overrides.ownerLogin ?? 'mvmoshchovskyi';

  return {
    name,
    full_name: overrides.fullName ?? `${ownerLogin}/${name}`,
    description: 'Example repository',
    visibility: overrides.visibility ?? 'public',
    private: overrides.private ?? false,
    default_branch: 'main',
    language: 'TypeScript',
    stargazers_count: 7,
    forks_count: 2,
    html_url: `https://github.com/${ownerLogin}/${name}`,
    owner: {
      login: ownerLogin,
      type: overrides.ownerType ?? 'User',
    },
  };
}

function fakeClient(options: {
  readonly login?: string;
  readonly pages?: unknown[][];
  readonly repository?: unknown;
}): {
  client: Octokit;
  iterator: ReturnType<typeof vi.fn>;
  getRepository: ReturnType<typeof vi.fn>;
  getAuthenticated: ReturnType<typeof vi.fn>;
} {
  const login = options.login ?? 'mvmoshchovskyi';
  const pages = options.pages ?? [];

  const iterator = vi.fn(() =>
    (async function* () {
      for (const data of pages) {
        yield { data };
      }
    })(),
  );

  const getAuthenticated = vi
    .fn()
    .mockResolvedValue({ data: { login } });

  const getRepository = vi
    .fn()
    .mockResolvedValue({ data: options.repository ?? repository() });

  const client = {
    rest: {
      users: {
        getAuthenticated,
      },
      repos: {
        listForAuthenticatedUser: vi.fn(),
        get: getRepository,
      },
    },
    paginate: { iterator },
  } as unknown as Octokit;

  return { client, iterator, getRepository, getAuthenticated };
}

describe('GitHubService.listRepositories', () => {
  it('passes filters to GitHub and stops at the requested limit', async () => {
    const { client, iterator } = fakeClient({
      pages: [
        [repository({ name: 'one' }), repository({ name: 'two' })],
        [repository({ name: 'three' })],
      ],
    });

    const service = createGitHubService(client);
    const result = await service.listRepositories({
      visibility: 'private',
      sort: 'pushed',
      limit: 2,
    });

    expect(result.account).toBe('mvmoshchovskyi');
    expect(result.repositories.map((repo) => repo.name)).toEqual([
      'one',
      'two',
    ]);
    expect(iterator).toHaveBeenCalledOnce();
    expect(iterator.mock.calls[0]?.[1]).toMatchObject({
      visibility: 'private',
      sort: 'pushed',
      direction: 'desc',
      per_page: 100,
    });
  });

  it('classifies owned, organization, and other-user repositories', async () => {
    const { client } = fakeClient({
      pages: [
        [
          repository({ name: 'mine', ownerLogin: 'mvmoshchovskyi' }),
          repository({
            name: 'org-repo',
            ownerLogin: 'example-org',
            ownerType: 'Organization',
          }),
          repository({ name: 'their-repo', ownerLogin: 'octocat' }),
        ],
      ],
    });

    const service = createGitHubService(client);
    const result = await service.listRepositories({
      visibility: 'all',
      sort: 'updated',
      limit: 10,
    });

    expect(
      result.repositories.map((repo) => [repo.name, repo.relationship]),
    ).toEqual([
      ['mine', 'owned_by_me'],
      ['org-repo', 'organization'],
      ['their-repo', 'other_user'],
    ]);
  });

  it('maps repository metadata into a compact summary', async () => {
    const { client } = fakeClient({
      pages: [[repository({ name: 'example' })]],
    });

    const service = createGitHubService(client);
    const result = await service.listRepositories({
      visibility: 'all',
      sort: 'updated',
      limit: 1,
    });

    expect(result.repositories[0]).toEqual({
      name: 'example',
      fullName: 'mvmoshchovskyi/example',
      description: 'Example repository',
      visibility: 'public',
      defaultBranch: 'main',
      language: 'TypeScript',
      stars: 7,
      forks: 2,
      url: 'https://github.com/mvmoshchovskyi/example',
      owner: 'mvmoshchovskyi',
      relationship: 'owned_by_me',
    });
  });

  it('does not cache a failed authenticated-user lookup', async () => {
    const { client, getAuthenticated } = fakeClient({
      pages: [[repository({ name: 'recovered' })]],
    });
    getAuthenticated.mockRejectedValueOnce(new Error('temporary failure'));

    const service = createGitHubService(client);
    const input = {
      visibility: 'all' as const,
      sort: 'updated' as const,
      limit: 1,
    };

    await expect(service.listRepositories(input)).rejects.toThrow(
      'temporary failure',
    );
    await expect(service.listRepositories(input)).resolves.toMatchObject({
      account: 'mvmoshchovskyi',
    });
  });
});

describe('GitHubService.getRepository', () => {
  it('requests the supplied owner and repository', async () => {
    const { client, getRepository } = fakeClient({
      repository: repository({
        name: 'Hello-World',
        ownerLogin: 'octocat',
      }),
    });

    const service = createGitHubService(client);
    const result = await service.getRepository('octocat', 'Hello-World');

    expect(getRepository).toHaveBeenCalledWith({
      owner: 'octocat',
      repo: 'Hello-World',
    });
    expect(result).toMatchObject({
      fullName: 'octocat/Hello-World',
      owner: 'octocat',
      relationship: 'other_user',
    });
  });

  it('falls back to the private flag when visibility is absent', async () => {
    const repo = repository({ name: 'private-repo', private: true });
    delete repo.visibility;

    const { client } = fakeClient({ repository: repo });
    const service = createGitHubService(client);

    await expect(
      service.getRepository('mvmoshchovskyi', 'private-repo'),
    ).resolves.toMatchObject({ visibility: 'private' });
  });

  it('propagates GitHub errors to the caller', async () => {
    const { client, getRepository } = fakeClient({});
    getRepository.mockRejectedValueOnce(new Error('not found'));

    const service = createGitHubService(client);

    await expect(
      service.getRepository('octocat', 'missing'),
    ).rejects.toThrow('not found');
  });
});
