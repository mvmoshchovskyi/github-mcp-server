export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface Config {
  readonly ghToken: string;
}

/**
 * Reads and validates the environment required by the server.
 *
 * The token is never logged. The placeholder check catches the common case
 * where the MCP client did not expand `{env:GH_TOKEN}`.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw = env.GH_TOKEN;

  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new ConfigError(
      'GH_TOKEN is not set. Provide a fine-grained GitHub personal access token with read-only permissions through the GH_TOKEN environment variable.',
    );
  }

  const ghToken = raw.trim();

  if (ghToken.startsWith('{env:') || ghToken.startsWith('${')) {
    throw new ConfigError(
      'GH_TOKEN was not expanded by the MCP client. Export GH_TOKEN before starting OpenCode, then restart the OpenCode service.',
    );
  }

  return { ghToken };
}
