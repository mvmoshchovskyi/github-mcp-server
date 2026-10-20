import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { ConfigError, loadConfig } from './config.js';
import { createGitHubClient } from './github/client.js';
import { createGitHubService } from './github/service.js';
import { buildServer, SERVER_NAME, SERVER_VERSION } from './server.js';
import { formatDiagnostic } from './utils/errors.js';

async function runCheck(): Promise<void> {
  const config = loadConfig();
  const client = createGitHubClient(config);
  const service = createGitHubService(client);
  const user = await service.getAuthenticatedUser();

  process.stdout.write(`${JSON.stringify(user, null, 2)}\n`);
}

function main(): void {
  if (process.argv.includes('--check')) {
    void runCheck().catch((error: unknown) => {
      if (error instanceof ConfigError) {
        console.error(`${SERVER_NAME}: ${error.message}`);
      } else {
        console.error(`${SERVER_NAME}: ${formatDiagnostic(error)}`);
      }
      process.exitCode = 1;
    });
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    const message =
      error instanceof ConfigError
        ? error.message
        : formatDiagnostic(error);
    console.error(`${SERVER_NAME}: ${message}`);
    process.exitCode = 1;
    return;
  }

  const client = createGitHubClient(config);
  const service = createGitHubService(client);
  const handle = serveStdio(() => buildServer(service));

  console.error(`${SERVER_NAME} ${SERVER_VERSION} listening on stdio`);

  const shutdown = (): void => {
    void handle.close();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main();
