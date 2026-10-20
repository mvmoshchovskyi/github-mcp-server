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
} from './schemas.js';

export function registerRepositoryTools(
  server: McpServer,
  service: GitHubService,
): void {
  server.registerTool(
    'github_list_my_repositories',
    {
      title: 'List my GitHub repositories',
      description:
        'List repositories accessible to the authenticated GitHub account. The relationship field distinguishes repositories owned by the authenticated user from organization repositories and repositories owned by other users.',
      inputSchema: z.object({
        visibility: z
          .enum(['all', 'public', 'private'])
          .default('all')
          .describe('Filter repositories by visibility.'),
        sort: z
          .enum(['updated', 'created', 'pushed'])
          .default('updated')
          .describe('Property used to sort repositories.'),
        limit: limitSchema(
          'Maximum number of repositories to return (1-50).',
        ),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ visibility, sort, limit }) => {
      try {
        const result = await service.listRepositories({
          visibility,
          sort,
          limit,
        });

        return jsonResult({
          account: result.account,
          count: result.repositories.length,
          repositories: result.repositories,
        });
      } catch (error) {
        return toToolError(error, { resource: 'The repository list' });
      }
    },
  );

  server.registerTool(
    'github_get_repository',
    {
      title: 'Get a GitHub repository',
      description:
        'Return basic metadata and the URL for a specific GitHub repository. The owner is not assumed to be the authenticated user.',
      inputSchema: z.object({
        owner: ownerSchema.describe(
          'GitHub user or organization that owns the repository.',
        ),
        repo: repoSchema.describe('Repository name without the .git suffix.'),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ owner, repo }) => {
      try {
        const repository = await service.getRepository(owner, repo);
        return jsonResult(repository);
      } catch (error) {
        return toToolError(error, {
          resource: `Repository "${owner}/${repo}"`,
        });
      }
    },
  );
}
