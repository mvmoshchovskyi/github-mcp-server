import type { Octokit } from 'octokit';
import { describe, expect, it, vi } from 'vitest';
import { createGitHubService } from '../../src/github/service.js';

describe('GitHubService.getAuthenticatedUser', () => {
  it('maps the authenticated user response', async () => {
    const getAuthenticated = vi.fn().mockResolvedValue({
      data: {
        login: 'mvmoshchovskyi',
        name: 'Example User',
        html_url: 'https://github.com/mvmoshchovskyi',
      },
    });

    const client = {
      rest: { users: { getAuthenticated } },
    } as unknown as Octokit;

    const service = createGitHubService(client);

    await expect(service.getAuthenticatedUser()).resolves.toEqual({
      login: 'mvmoshchovskyi',
      name: 'Example User',
      profileUrl: 'https://github.com/mvmoshchovskyi',
    });
    expect(getAuthenticated).toHaveBeenCalledOnce();
  });

  it('returns null when the display name is not set', async () => {
    const client = {
      rest: {
        users: {
          getAuthenticated: vi.fn().mockResolvedValue({
            data: {
              login: 'octocat',
              name: null,
              html_url: 'https://github.com/octocat',
            },
          }),
        },
      },
    } as unknown as Octokit;

    const service = createGitHubService(client);

    await expect(service.getAuthenticatedUser()).resolves.toEqual({
      login: 'octocat',
      name: null,
      profileUrl: 'https://github.com/octocat',
    });
  });
});
