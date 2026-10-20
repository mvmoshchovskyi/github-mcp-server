# github-mcp-server

A small, read-only GitHub MCP server written in TypeScript. It exposes five
GitHub operations over the stdio transport and is designed to be used from
OpenCode or any MCP-compatible client.

The server uses the official MCP TypeScript SDK and Octokit, keeps all logic in
a few focused modules, and never exposes write operations.

## Tools

| Tool | Inputs | Returns |
| --- | --- | --- |
| `github_get_authenticated_user` | none | GitHub login, public display name, and profile URL of the token owner. |
| `github_list_my_repositories` | `visibility`: `all` \| `public` \| `private` (default `all`); `sort`: `updated` \| `created` \| `pushed` (default `updated`); `limit`: 1-50 (default 10) | Account login, count, and compact repository summaries. Each summary identifies whether the repository is `owned_by_me`, an `organization` repository, or owned by `other_user`. |
| `github_get_repository` | `owner`, `repo` | Metadata and URL for one repository. |
| `github_list_issues` | `owner`, `repo`; `state`: `open` \| `closed` \| `all` (default `open`); `limit`: 1-50 (default 10) | Repository name, count, and issue summaries. Pull requests returned by the GitHub issues endpoint are excluded. |
| `github_list_pull_requests` | `owner`, `repo`; `state`: `open` \| `closed` \| `all` (default `open`); `limit`: 1-50 (default 10) | Repository name, count, and pull-request summaries. |

Results are returned as readable JSON in a single MCP text content block.

In OpenCode Code Mode, tool names may be exposed as
`tools.github.github_get_authenticated_user`, and so on. Direct MCP clients see
the names exactly as listed above.

## Read-only guarantees

- Only `GET` endpoints are used:
  - `/user`
  - `/user/repos`
  - `/repos/{owner}/{repo}`
  - `/repos/{owner}/{repo}/issues`
  - `/repos/{owner}/{repo}/pulls`
- There are no repository, issue, or pull-request write operations.
- There are no settings, workflow, secret, or organization-management tools.
- There is no arbitrary shell execution.
- The token is read from `GH_TOKEN`; it is never embedded in source code,
  written to configuration, printed, or included in tool errors.
- All diagnostics go to stderr. stdout is reserved for MCP protocol messages.
- Tool inputs are validated with Zod through the MCP SDK before any GitHub
  request is made.

## Requirements

- Node.js 22.12 or newer
- npm
- A GitHub account and a fine-grained personal access token
- OpenCode 2.x for the registration steps below

The project was built and tested with Node.js 24.22.0, npm 11.19.1, and
OpenCode 2.0.29.

## Install and verify

```bash
cd /home/mykhailo/projects/mcp-server-connect/github-mcp-server
npm ci
npm run verify
```

`npm run verify` runs type checking, unit tests, the production build, and the
stdio smoke test.

## Create a fine-grained token

Create the token at <https://github.com/settings/personal-access-tokens/new>.

Recommended minimum permissions:

- **Repository access**: public repositories (read-only), or only the specific
  repositories you intend to inspect.
- **Permissions**:
  - Metadata: read
  - Issues: read
  - Pull requests: read

Do not grant contents write, administration, workflow, secrets, or organization
access unless you explicitly need it. A fine-grained token cannot read
organization repositories unless the organization has approved the token.

Store the token in a local file that is not part of the repository. The
repository includes `env.example` as a starting point.

```bash
install -d -m 700 "$HOME/.config/github-mcp-server"
umask 077
cat > "$HOME/.config/github-mcp-server/env" <<'EOF'
export GH_TOKEN="github_pat_replace_me"
EOF
chmod 600 "$HOME/.config/github-mcp-server/env"
```

Then make interactive shells load it. Add this block to `~/.bashrc` if it is
not already present:

```bash
# github-mcp-server token (read-only, mode 600)
if [ -f "$HOME/.config/github-mcp-server/env" ]; then
  . "$HOME/.config/github-mcp-server/env"
fi
```

The setup performed in this workspace already includes the block. Open a new
shell, or source the file in the current one:

```bash
. "$HOME/.config/github-mcp-server/env"
```

Never commit the token, paste it into chat, or include it in logs.

Verify the token without starting the MCP server:

```bash
npm run check
```

This prints only the authenticated login, display name, and profile URL. It
does not print the token.

## Register with OpenCode

The server is registered in the global OpenCode configuration:

```bash
opencode mcp add --global \
  --env 'GH_TOKEN={env:GH_TOKEN}' \
  github -- node /home/mykhailo/projects/mcp-server-connect/github-mcp-server/dist/index.js
```

Replace the absolute path if the project is moved.

The resulting `~/.config/opencode/opencode.json` contains:

```json
{
  "mcp": {
    "servers": {
      "github": {
        "type": "local",
        "command": [
          "node",
          "/home/mykhailo/projects/mcp-server-connect/github-mcp-server/dist/index.js"
        ],
        "environment": {
          "GH_TOKEN": "{env:GH_TOKEN}"
        }
      }
    }
  }
}
```

`{env:GH_TOKEN}` is resolved from the environment of the OpenCode service, not
from the MCP server process. After adding or changing the token, fully exit and
restart OpenCode from a shell where `GH_TOKEN` is exported. `opencode reload`
reloads configuration, but it does not add a new environment variable to an
already-running service.

Check the connection:

```bash
opencode reload
opencode mcp list
```

A healthy entry looks like a connected `github` server. If the token is missing,
the server exits with:

```text
github-mcp-server: GH_TOKEN is not set. Provide a fine-grained GitHub personal
access token with read-only permissions through the GH_TOKEN environment
variable.
```

That message is intentional and contains no secret material.

## Development

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Type-check source and tests with TypeScript strict mode. |
| `npm test` | Run unit tests. GitHub API calls are mocked; no token is required. |
| `npm run build` | Compile `src/` to `dist/`. |
| `npm run test:smoke` | Spawn the built server over stdio and verify tool discovery. |
| `npm run test:integration` | Run optional live read-only checks; skipped without `GH_TOKEN`. |
| `npm run verify` | Typecheck, unit tests, build, and smoke test. |
| `npm run start` | Start the server on stdio with the current environment. |
| `npm run check` | Call `GET /user` and print the authenticated identity. |

### Integration tests

Integration tests are read-only and never modify GitHub data. They are skipped
unless `GH_TOKEN` is set:

```bash
. "$HOME/.config/github-mcp-server/env"
GH_EXPECTED_LOGIN=mvmoshchovskyi npm run test:integration
```

By default, the first accessible repository is used for repository, issue, and
pull-request checks. Set `GH_TEST_REPO=owner/repo` to choose a specific
repository. If a repository has issues disabled, the issue check is skipped.

## Project structure

```text
src/
  index.ts                 Entry point: environment check, stdio serving, --check
  server.ts                MCP server construction and tool registration
  config.ts                GH_TOKEN loading and startup validation
  github/
    client.ts              Single Octokit client, stderr logging, no retries
    service.ts             Read-only GitHub operations and response mapping
    types.ts               Service interfaces and tool result types
  tools/
    user.ts                github_get_authenticated_user
    repositories.ts        github_list_my_repositories, github_get_repository
    issues.ts              github_list_issues
    pull-requests.ts       github_list_pull_requests
    schemas.ts             Shared Zod input schemas and annotations
    result.ts              JSON text result helper
  utils/
    errors.ts              Safe error mapping and token redaction
tests/
  unit/                    Mocked service and in-memory MCP tests
  smoke/                   Built-server stdio test
  integration/             Optional live read-only tests
```

## Pagination and limits

The list tools request 100 items per page and stop as soon as `limit` accepted
items have been collected. A safety cap of 10 pages prevents unbounded requests.
Because the GitHub issues endpoint includes pull requests, those entries are
filtered out before the issue limit is applied.

The tools accept at most 50 results per call. They do not expose arbitrary
GitHub search, sorting by stars, labels, assignees, or full-text filtering.

## Error handling

Tool failures are returned as MCP tool errors with stable, non-sensitive
messages:

- `401`: invalid or expired token
- `403` / `429`: rate limit or insufficient permission
- `404`: resource missing or not visible to the token
- `422`: invalid request
- `5xx`: temporary GitHub failure
- network failure: GitHub could not be reached

Raw GitHub error messages, request headers, stack traces, and the token are not
returned to the model. Octokit throttling and retries are disabled so rate-limit
failures surface immediately instead of blocking a tool call.

## Limitations

- The server is intentionally read-only and cannot create, edit, or close
  repositories, issues, or pull requests.
- It does not manage labels, comments, reviews, workflows, releases, or
  organization settings.
- Repository listing is limited to what the token can access; organization
  repositories require organization approval.
- The tools return summaries, not full issue or pull-request bodies.
- There is no OAuth or device flow. The token must be provisioned locally.
- The OpenCode service must be restarted after the token becomes available.

## License

Private project. No license is granted.
