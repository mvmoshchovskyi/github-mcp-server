import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { GitHubService } from '../github/types.js';
import { toToolError } from '../utils/errors.js';
import { jsonResult } from './result.js';
import {
  limitSchema,
  ownerSchema,
  readOnlyAnnotations,
  repoSchema,
  stateSchema,
} from './schemas.js';

export function registerPullRequestTools(
  server: McpServer,
  service: GitHubService,
): void {
  server.registerTool(
    'github_list_pull_requests',
    {
      title: 'List GitHub pull requests',
      description:
        'List pull requests in a GitHub repository with their number, title, state, author, URL, and creation date.',
      inputSchema: z.object({
        owner: ownerSchema.describe(
          'GitHub user or organization that owns the repository.',
        ),
        repo: repoSchema.describe('Repository name without the .git suffix.'),
        state: stateSchema('Filter pull requests by state.'),
        limit: limitSchema(
          'Maximum number of pull requests to return (1-50).',
        ),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ owner, repo, state, limit }) => {
      try {
        const pullRequests = await service.listPullRequests({
          owner,
          repo,
          state,
          limit,
        });

        return jsonResult({
          repository: `${owner}/${repo}`,
          count: pullRequests.length,
          pullRequests,
        });
      } catch (error) {
        return toToolError(error, {
          resource: `The pull request list for "${owner}/${repo}"`,
        });
      }
    },
  );
}
