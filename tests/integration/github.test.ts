import { RequestError } from 'octokit';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { createGitHubClient } from '../../src/github/client.js';
import { createGitHubService } from '../../src/github/service.js';
import type { GitHubService, RepositorySummary } from '../../src/github/types.js';

const hasToken =
  typeof process.env.GH_TOKEN === 'string' &&
  process.env.GH_TOKEN.trim().length > 0;

const describeIntegration = hasToken ? describe : describe.skip;

/**
 * Optional live checks. They are read-only and are skipped automatically when
 * GH_TOKEN is not set. Set GH_TEST_REPO=owner/repo to choose the repository
 * used for the issue and pull-request checks.
 */
describeIntegration('read-only GitHub integration', () => {
  let service!: GitHubService;
  let repositories: RepositorySummary[] = [];
  let testOwner = '';
  let testRepo = '';

  beforeAll(async () => {
    service = createGitHubService(createGitHubClient(loadConfig()));

    const result = await service.listRepositories({
      visibility: 'all',
      sort: 'updated',
      limit: 1,
    });
    repositories = result.repositories;

    const configuredRepository = process.env.GH_TEST_REPO;
    if (configuredRepository?.includes('/')) {
      const [owner, repo] = configuredRepository.split('/');
      if (owner && repo) {
        testOwner = owner;
        testRepo = repo;
      }
    }

    const firstRepository = repositories[0];
    if (testOwner === '' && firstRepository) {
      testOwner = firstRepository.owner;
      testRepo = firstRepository.name;
    }
  });

  it('returns the authenticated user', async () => {
    const user = await service.getAuthenticatedUser();

    expect(user.login).toMatch(/^[A-Za-z0-9-]+$/);
    expect(user.profileUrl).toBe(`https://github.com/${user.login}`);

    const expectedLogin = process.env.GH_EXPECTED_LOGIN;
    if (expectedLogin !== undefined && expectedLogin !== '') {
      expect(user.login).toBe(expectedLogin);
    }
  });

  it('lists at most one accessible repository', () => {
    expect(repositories.length).toBeLessThanOrEqual(1);
  });

  it('reads repository details', async (context) => {
    if (testOwner === '' || testRepo === '') {
      context.skip();
      return;
    }

    const repository = await service.getRepository(testOwner, testRepo);

    expect(repository.owner.toLowerCase()).toBe(testOwner.toLowerCase());
    expect(repository.name.toLowerCase()).toBe(testRepo.toLowerCase());
    expect(repository.url).toContain('github.com');
  });

  it('lists issues without pull requests', async (context) => {
    if (testOwner === '' || testRepo === '') {
      context.skip();
      return;
    }

    try {
      const issues = await service.listIssues({
        owner: testOwner,
        repo: testRepo,
        state: 'all',
        limit: 1,
      });

      expect(issues.length).toBeLessThanOrEqual(1);
      for (const issue of issues) {
        expect(issue.number).toBeGreaterThan(0);
      }
    } catch (error) {
      // GitHub returns 410 when a repository has issues disabled.
      if (error instanceof RequestError && error.status === 410) {
        context.skip();
        return;
      }
      throw error;
    }
  });

  it('lists pull requests', async (context) => {
    if (testOwner === '' || testRepo === '') {
      context.skip();
      return;
    }

    const pullRequests = await service.listPullRequests({
      owner: testOwner,
      repo: testRepo,
      state: 'all',
      limit: 1,
    });

    expect(pullRequests.length).toBeLessThanOrEqual(1);
    for (const pullRequest of pullRequests) {
      expect(pullRequest.number).toBeGreaterThan(0);
    }
  });
});
