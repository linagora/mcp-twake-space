#!/usr/bin/env node
/**
 * mcp-twake-space: MCP server (stdio) for Twake Space.
 *
 * Env: TWAKE_SPACE_URL, and TWAKE_SPACE_TOKEN_FILE (recommended: a 0600 file holding an API
 * token tws_…), TWAKE_SPACE_TOKEN_COMMAND or TWAKE_SPACE_TOKEN; optional TWAKE_SPACE_API_URL,
 * USER_TIMEZONE, TWAKE_SPACE_TIMEOUT_MS. `mcp-twake-space check` tests the configuration.
 * Logs go to stderr only: stdout carries JSON-RPC.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, type Config } from './config.js';
import { SpaceClient, fileTokenSource, type TokenSource } from './space.js';
import { CommandTokenProvider } from './token-command.js';
import { registerTools } from './tools.js';
import { VERSION } from './version.js';

function tokenSource(auth: Config['auth']): TokenSource {
  if (auth.kind === 'file') return fileTokenSource(auth.file);
  if (auth.kind === 'command') return new CommandTokenProvider(auth.command);
  return { getToken: async () => auth.token, invalidate() {} };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const api = new SpaceClient(config, tokenSource(config.auth));

  // Fail fast with an actionable message rather than exposing broken tools.
  let spaces: { spaces: { name: string }[] };
  try {
    spaces = await api.request('GET', '/spaces');
  } catch (e) {
    const err = e as Error & { hint?: string };
    process.stderr.write(`mcp-twake-space: cannot use ${config.apiUrl}: ${err.message}${err.hint ? `\n${err.hint}` : ''}\n`);
    process.exit(1);
  }

  if (process.argv[2] === 'check') {
    const self = await api.request<{ name: string; scopes: string[]; expiresAt: string | null }>('GET', '/tokens/self').catch(() => undefined);
    process.stdout.write(
      `mcp-twake-space ${VERSION}: OK, ${spaces.spaces.length} space(s) at ${config.appUrl}` +
        (self ? `\ntoken "${self.name}", scopes ${self.scopes.join(' ')}, expires ${self.expiresAt ?? 'never'}` : '') +
        '\n',
    );
    return;
  }

  const server = new McpServer({ name: 'mcp-twake-space', version: VERSION });
  registerTools(server, api, { appUrl: config.appUrl, timeZone: config.timeZone });
  await server.connect(new StdioServerTransport());
  process.stderr.write(`mcp-twake-space ${VERSION} connected to ${config.appUrl}\n`);
}

main().catch((e) => {
  process.stderr.write(`mcp-twake-space: ${(e as Error).message}\n`);
  process.exit(1);
});
