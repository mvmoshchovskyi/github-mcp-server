import { McpServer } from '@modelcontextprotocol/server';
import type { GitHubService } from './github/types.js';
import { registerIssueTools } from './tools/issues.js';
import { registerPullRequestTools } from './tools/pull-requests.js';
import { registerRepositoryTools } from './tools/repositories.js';
import { registerUserTools } from './tools/user.js';

export const SERVER_NAME = 'github-mcp-server';
export const SERVER_VERSION = '0.1.0';

export function buildServer(service: GitHubService): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'Read-only access to GitHub for the authenticated account. All tools are safe to call repeatedly and never modify GitHub data.',
    },
  );

  registerUserTools(server, service);
  registerRepositoryTools(server, service);
  registerIssueTools(server, service);
  registerPullRequestTools(server, service);

  return server;
}
