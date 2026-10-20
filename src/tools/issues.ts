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

export function registerIssueTools(
  server: McpServer,
  service: GitHubService,
): void {
  server.registerTool(
    'github_list_issues',
    {
      title: 'List GitHub issues',
      description:
        'List issues in a GitHub repository. Pull requests returned by the GitHub issues endpoint are excluded.',
      inputSchema: z.object({
        owner: ownerSchema.describe(
          'GitHub user or organization that owns the repository.',
        ),
        repo: repoSchema.describe('Repository name without the .git suffix.'),
        state: stateSchema('Filter issues by state.'),
        limit: limitSchema('Maximum number of issues to return (1-50).'),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ owner, repo, state, limit }) => {
      try {
        const issues = await service.listIssues({ owner, repo, state, limit });

        return jsonResult({
          repository: `${owner}/${repo}`,
          count: issues.length,
          issues,
        });
      } catch (error) {
        return toToolError(error, {
          resource: `The issue list for "${owner}/${repo}"`,
        });
      }
    },
  );
}
