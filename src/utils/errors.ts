import type { CallToolResult } from '@modelcontextprotocol/server';
import { RequestError } from 'octokit';

export interface ToolErrorOptions {
  /** Human-readable name of the requested resource, used in 404 messages. */
  readonly resource?: string;
}

function readHeader(
  headers: Record<string, string | number | undefined> | undefined,
  name: string,
): string | undefined {
  const value = headers?.[name];
  return value === undefined ? undefined : String(value);
}

function formatRateLimitReset(reset: string | undefined): string {
  if (reset === undefined) {
    return '';
  }

  const seconds = Number(reset);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }

  return ` Try again after ${new Date(seconds * 1000).toISOString()}.`;
}

/**
 * Converts any failure into an MCP tool error that is safe to show to a model.
 *
 * Raw GitHub messages, stack traces, request headers, and tokens are never
 * included. Only stable status-based descriptions are returned.
 */
export function toToolError(
  error: unknown,
  options: ToolErrorOptions = {},
): CallToolResult {
  const resource = options.resource ?? 'The requested GitHub resource';
  let message: string;

  if (error instanceof RequestError) {
    const status = error.status;
    const headers = error.response?.headers;

    if (status === 401) {
      message =
        'GitHub authentication failed. Check that GH_TOKEN is valid and has not expired.';
    } else if (status === 403 || status === 429) {
      const remaining = readHeader(headers, 'x-ratelimit-remaining');
      const retryAfter = readHeader(headers, 'retry-after');
      const reset = readHeader(headers, 'x-ratelimit-reset');

      if (remaining === '0') {
        message = `GitHub API rate limit exceeded.${formatRateLimitReset(reset)}`;
      } else if (retryAfter !== undefined) {
        message = `GitHub API rate limit exceeded. Try again in ${retryAfter} seconds.`;
      } else if (status === 429) {
        message = 'GitHub API rate limit exceeded. Try again later.';
      } else {
        message =
          'GitHub denied access. The token may lack the required read permission.';
      }
    } else if (status === 404) {
      message = `${resource} was not found or is not accessible with the configured token.`;
    } else if (status === 422) {
      message = 'GitHub rejected the request as invalid.';
    } else if (status >= 500) {
      message = `GitHub API is temporarily unavailable (HTTP ${status}). Try again later.`;
    } else {
      message = `GitHub request failed (HTTP ${status}).`;
    }
  } else if (error instanceof TypeError) {
    message =
      'Could not reach the GitHub API. Check the network connection and try again.';
  } else {
    message = 'Unexpected error while calling the GitHub API.';
  }

  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

/**
 * Formats an error for stderr diagnostics while redacting the token if it
 * ever appears in a library message.
 */
export function formatDiagnostic(error: unknown, secret?: string): string {
  const text =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  return secret === undefined ? text : text.split(secret).join('[REDACTED]');
}
