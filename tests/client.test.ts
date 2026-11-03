import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { SpaceClient, SpaceError, fileTokenSource } from '../src/space.js';

const dir = () => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'space-'));

describe('loadConfig', () => {
  it('needs a URL and one token source, and derives the API URL', () => {
    expect(() => loadConfig({})).toThrow(/TWAKE_SPACE_URL/);
    expect(() => loadConfig({ TWAKE_SPACE_URL: 'https://space.example.com' })).toThrow(/TWAKE_SPACE_TOKEN/);
    const c = loadConfig({ TWAKE_SPACE_URL: 'https://space.example.com/', TWAKE_SPACE_TOKEN_FILE: '/run/t' });
    expect(c).toMatchObject({ appUrl: 'https://space.example.com', apiUrl: 'https://space.example.com/api', auth: { kind: 'file', file: '/run/t' }, timeZone: expect.any(String) });
    expect(loadConfig({ TWAKE_SPACE_URL: 'https://s.example.com', TWAKE_SPACE_API_URL: 'https://api.example.com/v1/', TWAKE_SPACE_TOKEN_COMMAND: 'broker space', USER_TIMEZONE: 'Europe/Paris' })).toMatchObject({
      apiUrl: 'https://api.example.com/v1',
      auth: { kind: 'command', command: 'broker space' },
      timeZone: 'Europe/Paris',
    });
  });

  it('refuses plain HTTP except on localhost', () => {
    expect(() => loadConfig({ TWAKE_SPACE_URL: 'http://space.example.com', TWAKE_SPACE_TOKEN: 'tws_x' })).toThrow(/HTTPS/);
    expect(loadConfig({ TWAKE_SPACE_URL: 'http://localhost:3000', TWAKE_SPACE_TOKEN: 'tws_x' }).apiUrl).toBe('http://localhost:3000/api');
  });

  it('asks for approval by default, in the chosen language', () => {
    const base = { TWAKE_SPACE_URL: 'https://s.example.com', TWAKE_SPACE_TOKEN_COMMAND: 'broker' };
    expect(loadConfig(base)).toMatchObject({ approval: 'elicit', approvalTimeoutMs: 600000, language: 'en', oidcIssuer: undefined });
    expect(loadConfig({ ...base, TWAKE_SPACE_APPROVAL: 'client', USER_LANGUAGE: 'fr_FR', TWAKE_SPACE_OIDC_ISSUER: 'https://sso.example.com/' })).toMatchObject({
      approval: 'client',
      language: 'fr',
      oidcIssuer: 'https://sso.example.com/',
    });
    expect(() => loadConfig({ ...base, TWAKE_SPACE_APPROVAL: 'none' })).toThrow(/TWAKE_SPACE_APPROVAL/);
  });

  it('refuses a time zone that is not an IANA name', () => {
    expect(() => loadConfig({ TWAKE_SPACE_URL: 'https://s.example.com', TWAKE_SPACE_TOKEN: 'tws_x', USER_TIMEZONE: 'Paris' })).toThrow(/USER_TIMEZONE.*"Paris"/);
  });
});

describe('fileTokenSource', () => {
  it('reads and trims the token file and refuses files readable by others', async () => {
    const d = dir();
    const f = join(d, 'token');
    writeFileSync(f, 'tws_abc\n', { mode: 0o600 });
    expect(await fileTokenSource(f).getToken()).toBe('tws_abc');
    chmodSync(f, 0o644);
    await expect(fileTokenSource(f).getToken()).rejects.toThrow(/0600/);
  });
});

describe('SpaceClient', () => {
  const tokens = { getToken: async () => 'tws_secret', invalidate: vi.fn() };
  const mk = (handler: (url: string, init: RequestInit) => Response | Promise<Response>) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return handler(url, init);
    }) as unknown as typeof fetch;
    return { calls, client: new SpaceClient({ apiUrl: 'https://s.example.com/api', timeoutMs: 1000 }, tokens, fetchFn) };
  };
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

  it('sends the bearer token, the query and a JSON body', async () => {
    const { calls, client } = mk(() => json(200, { ok: 1 }));
    expect(await client.request('POST', '/spaces/a/feed/posts', { query: { limit: 5, q: undefined, since: '2026-11-01T00:00:00+01:00' }, body: { body: 'hi' } })).toEqual({ ok: 1 });
    expect(calls[0].url).toBe('https://s.example.com/api/spaces/a/feed/posts?limit=5&since=2026-11-01T00%3A00%3A00%2B01%3A00');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer tws_secret');
    expect(calls[0].init.body).toBe('{"body":"hi"}');
  });

  it('returns undefined on 204', async () => {
    const { client } = mk(() => json(204, null));
    expect(await client.request('DELETE', '/x')).toBeUndefined();
  });

  it('turns API errors into SpaceError with code and a hint, never echoing the token', async () => {
    const { client } = mk(() => json(403, { error: 'insufficient_scope' }, { 'www-authenticate': 'Bearer error="insufficient_scope", scope="notifications:read"' }));
    const e = (await client.request('GET', '/notifications').catch((x) => x)) as SpaceError;
    expect(e).toBeInstanceOf(SpaceError);
    expect(e.status).toBe(403);
    expect(e.code).toBe('insufficient_scope');
    expect(e.hint).toMatch(/notifications:read/);
    expect(e.message).not.toContain('tws_secret');
  });

  it('explains session-only routes and rate limits', async () => {
    let r = mk(() => json(403, { error: 'insufficient_scope' }, { 'www-authenticate': 'Bearer error="insufficient_scope"' }));
    expect(((await r.client.request('GET', '/feed/unread').catch((x) => x)) as SpaceError).hint).toMatch(/signed-in session/);
    r = mk(() => json(429, { error: 'rate_limited' }, { 'retry-after': '42' }));
    expect(((await r.client.request('POST', '/x').catch((x) => x)) as SpaceError).hint).toMatch(/42 s/);
  });

  it('invalidates the token and retries once on 401', async () => {
    let n = 0;
    const { calls, client } = mk(() => (++n === 1 ? json(401, { error: 'unauthorized' }) : json(200, { spaces: [] })));
    expect(await client.request('GET', '/spaces')).toEqual({ spaces: [] });
    expect(calls).toHaveLength(2);
    expect(tokens.invalidate).toHaveBeenCalled();
  });
});
