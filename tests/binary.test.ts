// End-to-end test of the built server (build/index.js) over stdio, against a fake Twake Space backend
// and identity provider served on 127.0.0.1. Run `npm run build` first (CI does).
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const BIN = fileURLToPath(new URL('../build/index.js', import.meta.url));
const TOKEN = 'session-token-e2e';
const ME = '11111111-1111-4111-8111-111111111111';
const S1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const space = {
  id: S1, name: 'Équipe Design', role: 'admin', color: null, description: '', pinnedAt: null, openedAt: null, manages: true,
  members: [{ id: ME, username: 'amartin', email: 'alice.martin@example.com', displayName: 'Alice MARTIN', role: 'admin' }],
};

let server: Server;
let base = '';
let reject401 = false;
const seen: { method: string; path: string; auth?: string; body?: unknown }[] = [];

const body = (req: IncomingMessage) =>
  new Promise<unknown>((resolve) => {
    let s = '';
    req.on('data', (c) => (s += c)).on('end', () => resolve(s ? JSON.parse(s) : undefined));
  });

beforeAll(async () => {
  if (!existsSync(BIN)) throw new Error('build/index.js is missing: run npm run build first');
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, base);
    const b = await body(req);
    seen.push({ method: req.method!, path: url.pathname, auth: req.headers.authorization, body: b });
    const send = (status: number, data?: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(data === undefined ? undefined : JSON.stringify(data));
    };
    if (url.pathname === '/sso/.well-known/openid-configuration') return send(200, { issuer: `${base}/sso/`, userinfo_endpoint: `${base}/sso/userinfo` });
    if (url.pathname === '/sso/userinfo') return send(200, { sub: 'amartin', uuid: ME, email: 'alice.martin@example.com', sid: 's' });
    if (req.headers.authorization !== `Bearer ${TOKEN}` || reject401) {
      res.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Bearer error="invalid_token"' });
      return res.end(JSON.stringify({ error: 'unauthorized' }));
    }
    if (url.pathname === '/api/spaces') return send(200, { spaces: [space] });
    if (url.pathname === `/api/spaces/${S1}`) return send(200, { ...space, resources: [] });
    if (url.pathname === '/api/settings') return send(200, { displayName: null });
    if (url.pathname === '/api/feed/unread') return send(200, { spaces: [{ spaceId: S1, items: 2, mentions: 0 }] });
    if (url.pathname === `/api/spaces/${S1}/feed/posts` && req.method === 'POST')
      return send(201, {
        id: 'p1', kind: 'post', category: 'messages', time: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z', reactions: [],
        author: { type: 'user', id: ME, name: 'Alice MARTIN' }, body: (b as { body: string }).body, editedAt: null, poll: null, approval: null, announcement: null, feedback: null,
      });
    send(404, { error: 'not_found' });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const env = () => ({
  PATH: process.env.PATH ?? '',
  TWAKE_SPACE_URL: base,
  TWAKE_SPACE_TOKEN_COMMAND: `printf '{"access_token":"${TOKEN}","expires_at":${Math.floor(Date.now() / 1000) + 3600}}'`,
  TWAKE_SPACE_OIDC_ISSUER: `${base}/sso/`,
  USER_TIMEZONE: 'Europe/Paris',
  USER_LANGUAGE: 'fr',
});

const run = (args: string[], e: Record<string, string>) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(process.execPath, [BIN, ...args], { env: e, timeout: 20000 }, (err, stdout, stderr) =>
      resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }),
    );
  });

describe('built server', () => {
  it('check reports the session user and the approval mode, never the token', async () => {
    const r = await run(['check'], env());
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/OK, 1 space\(s\)/);
    expect(r.stdout).toMatch(/session token, user known; approval: elicit/);
    expect(r.stdout + r.stderr).not.toContain(TOKEN);
  });

  it('exits with an actionable message on a bad configuration or a refused token', async () => {
    const missing = await run([], { PATH: process.env.PATH ?? '' });
    expect(missing.code).toBe(1);
    expect(missing.stderr).toMatch(/TWAKE_SPACE_URL is required/);
    reject401 = true;
    const refused = await run(['check'], env());
    reject401 = false;
    expect(refused.code).toBe(1);
    expect(refused.stderr).toMatch(/401[\s\S]*invalid, expired or revoked/);
    expect(refused.stderr).not.toContain(TOKEN);
  });

  it('serves the 29 tools over stdio and acts only after the user accepts', async () => {
    const answers: string[] = ['decline', 'accept'];
    const prompts: string[] = [];
    const client = new Client({ name: 'e2e', version: '0' }, { capabilities: { elicitation: { form: {} } } });
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      prompts.push(req.params.message);
      const action = answers.shift() ?? 'decline';
      return action === 'accept' ? { action: 'accept', content: {} } : { action: 'decline' };
    });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [BIN], env: env(), stderr: 'ignore' }));
    try {
      expect((await client.listTools()).tools).toHaveLength(29);
      const who = JSON.parse(((await client.callTool({ name: 'whoami', arguments: {} })).content as { text: string }[])[0].text);
      expect(who).toMatchObject({ mode: 'session', acts_as: 'Alice MARTIN', approval: 'elicit' });
      const unread = JSON.parse(((await client.callTool({ name: 'get_unread', arguments: {} })).content as { text: string }[])[0].text);
      expect(unread.spaces[0]).toMatchObject({ name: 'Équipe Design', new_items: 2 });

      const posts = () => seen.filter((s) => s.method === 'POST' && s.path.endsWith('/feed/posts'));
      const refused = await client.callTool({ name: 'create_post', arguments: { space: 'design', text: 'Bonjour' } });
      expect((refused.content as { text: string }[])[0].text).toMatch(/refused/);
      expect(posts()).toHaveLength(0);
      const done = await client.callTool({ name: 'create_post', arguments: { space: 'design', text: 'Bonjour' } });
      expect(done.isError).toBeFalsy();
      expect(posts()).toEqual([{ method: 'POST', path: `/api/spaces/${S1}/feed/posts`, auth: `Bearer ${TOKEN}`, body: { body: 'Bonjour' } }]);
      expect(prompts).toHaveLength(2);
      expect(prompts[1]).toMatch(/^Twake Space : Publier dans le fil\nEn tant que : Alice MARTIN \(votre compte\)\nEspace : Équipe Design\nTexte : Bonjour/);
    } finally {
      await client.close();
    }
  });
});
