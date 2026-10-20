import { RequestError } from 'octokit';
import { describe, expect, it } from 'vitest';
import { formatDiagnostic, toToolError } from '../../src/utils/errors.js';

function requestError(
  status: number,
  headers: Record<string, string> = {},
  message = 'raw GitHub message',
): RequestError {
  return new RequestError(message, status, {
    request: {
      method: 'GET',
      url: 'https://api.github.com/user',
      headers: {},
    },
    response: {
      status,
      url: 'https://api.github.com/user',
      headers,
      data: {},
    },
  });
}

function textOf(result: ReturnType<typeof toToolError>): string {
  const block = result.content[0];
  if (block?.type !== 'text') {
    throw new Error('Expected a text content block');
  }
  return block.text;
}

describe('toToolError', () => {
  it('maps authentication failures without leaking raw details', () => {
    const result = toToolError(requestError(401));
    const text = textOf(result);

    expect(result.isError).toBe(true);
    expect(text).toMatch(/authentication failed/);
    expect(text).not.toContain('raw GitHub message');
  });

  it('maps primary rate limits and includes the reset time', () => {
    const result = toToolError(
      requestError(403, {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '1700000000',
      }),
    );

    expect(textOf(result)).toMatch(/rate limit exceeded/);
    expect(textOf(result)).toContain('2023-11-14T22:13:20.000Z');
  });

  it('maps secondary rate limits with retry-after', () => {
    const result = toToolError(
      requestError(403, { 'retry-after': '30' }),
    );

    expect(textOf(result)).toMatch(/Try again in 30 seconds/);
  });

  it('maps permission failures', () => {
    expect(textOf(toToolError(requestError(403)))).toMatch(/denied access/);
  });

  it('maps missing resources with the supplied resource name', () => {
    const result = toToolError(requestError(404), {
      resource: 'Repository "owner/repo"',
    });

    expect(textOf(result)).toContain('Repository "owner/repo" was not found');
  });

  it('maps server failures', () => {
    expect(textOf(toToolError(requestError(503)))).toMatch(
      /temporarily unavailable \(HTTP 503\)/,
    );
  });

  it('maps network failures', () => {
    expect(textOf(toToolError(new TypeError('fetch failed')))).toMatch(
      /Could not reach the GitHub API/,
    );
  });

  it('uses a generic message for unknown failures', () => {
    expect(textOf(toToolError(new Error('secret internals')))).toBe(
      'Unexpected error while calling the GitHub API.',
    );
  });
});

describe('formatDiagnostic', () => {
  it('redacts the configured token', () => {
    const text = formatDiagnostic(
      new Error('request failed for github_pat_example'),
      'github_pat_example',
    );

    expect(text).not.toContain('github_pat_example');
    expect(text).toContain('[REDACTED]');
  });
});
