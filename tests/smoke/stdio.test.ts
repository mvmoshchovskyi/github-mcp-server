import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { describe, expect, it } from 'vitest';

const entryPoint = resolve(process.cwd(), 'dist/index.js');

describe.skipIf(!existsSync(entryPoint))('stdio server', () => {
  it('starts and advertises its tools over stdio', async () => {
    const client = new Client({ name: 'stdio-smoke-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entryPoint],
      env: { GH_TOKEN: 'github_pat_smoke_test' },
      stderr: 'pipe',
    });

    await client.connect(transport);

    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([
        'github_get_authenticated_user',
        'github_list_my_repositories',
        'github_get_repository',
        'github_list_issues',
        'github_list_pull_requests',
      ]);
    } finally {
      await client.close();
    }
  });
});
