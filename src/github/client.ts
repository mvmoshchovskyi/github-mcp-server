import { Octokit } from 'octokit';
import type { Config } from '../config.js';
import { formatDiagnostic } from '../utils/errors.js';

const noop = (): void => {};

/**
 * Creates the single Octokit instance used by all tools.
 *
 * Throttling and retries are disabled so that rate-limit failures are
 * reported to the model immediately instead of blocking a tool call. The
 * custom logger keeps all diagnostics on stderr because stdout is reserved
 * for MCP protocol messages, and redacts the token from library messages.
 */
export function createGitHubClient(config: Config): Octokit {
  const log = (message: string): void => {
    console.error(formatDiagnostic(message, config.ghToken));
  };

  return new Octokit({
    auth: config.ghToken,
    userAgent: 'github-mcp-server/0.1.0',
    request: {
      timeout: 15_000,
    },
    throttle: {
      enabled: false,
    },
    retry: {
      enabled: false,
    },
    log: {
      debug: noop,
      info: noop,
      warn: log,
      error: log,
    },
  });
}
