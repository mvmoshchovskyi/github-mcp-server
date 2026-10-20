import type { McpServer } from '@modelcontextprotocol/server';
import type { GitHubService } from '../github/types.js';
import { toToolError } from '../utils/errors.js';
import { jsonResult } from './result.js';
import { readOnlyAnnotations } from './schemas.js';

export function registerUserTools(
  server: McpServer,
  service: GitHubService,
): void {
  server.registerTool(
    'github_get_authenticated_user',
    {
      title: 'Get authenticated GitHub user',
      description:
        'Return the GitHub login, public display name, and profile URL of the account that owns the configured token.',
      annotations: readOnlyAnnotations,
    },
    async () => {
      try {
        const user = await service.getAuthenticatedUser();
        return jsonResult(user);
      } catch (error) {
        return toToolError(error, { resource: 'The authenticated GitHub user' });
      }
    },
  );
}
