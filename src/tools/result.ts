import type { CallToolResult } from '@modelcontextprotocol/server';

/** Returns a readable JSON payload as the only MCP content block. */
export function jsonResult(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}
