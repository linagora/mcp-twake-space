import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { approvalMessage, ApprovalUnavailable, Approver, NotApproved } from '../src/approval.js';
import { makeIdentify } from '../src/identity.js';
import { SpaceClient } from '../src/space.js';
import { CommandTokenProvider } from '../src/token-command.js';

describe('approvalMessage', () => {
  it('lists the set fields only, puts multi-line text below its label, ends with the reference', () => {
    const fr = approvalMessage({ action: 'Voter', as: 'Alice MARTIN (votre compte)', space: 'Design', details: [['Choix', 'Mardi'], ['Commentaire', undefined], ['Texte', 'ligne 1\nligne 2']] }, 'fr', 'abc123');
    expect(fr.split('\n')).toEqual([
      'Twake Space : Voter',
      'En tant que : Alice MARTIN (votre compte)',
      'Espace : Design',
      'Choix : Mardi',
      'Texte : ',
      'ligne 1',
      'ligne 2',
      '',
      'Réf. abc123 · Acceptez pour le faire maintenant, refusez pour annuler.',
    ]);
    const en = approvalMessage({ action: 'Vote', as: 'Alice', details: [] }, 'en', 'ff00aa');
    expect(en).toBe('Twake Space: Vote\nAs: Alice\n\nRef. ff00aa · Accept to do it now, refuse to cancel.');
  });
});

async function pair(capabilities: Record<string, unknown>, handler?: () => Promise<unknown>) {
  const server = new McpServer({ name: 's', version: '0' });
  const client = new Client({ name: 'c', version: '0' }, { capabilities });
  if (handler) client.setRequestHandler(ElicitRequestSchema, handler as never);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  await client.connect(ct);
  return server;
}

describe('Approver', () => {
  const req = { action: 'Vote', as: 'Alice', details: [] as [string, string | undefined][] };

  it('resolves only on accept', async () => {
    const s = await pair({ elicitation: { form: {} } }, async () => ({ action: 'accept', content: {} }));
    await expect(new Approver(s.server, 'elicit', 'en', 1000).confirm(req)).resolves.toBeUndefined();
  });

  it('turns decline, cancel and client errors into NotApproved', async () => {
    for (const [answer, outcome] of [
      [async () => ({ action: 'decline' }), 'decline'],
      [async () => ({ action: 'cancel' }), 'cancel'],
      [async () => { throw new Error('boom'); }, 'cancel'],
    ] as const) {
      const s = await pair({ elicitation: { form: {} } }, answer);
      const e = await new Approver(s.server, 'elicit', 'en', 1000).confirm(req).catch((x) => x);
      expect(e).toBeInstanceOf(NotApproved);
      expect(e.outcome).toBe(outcome);
    }
  });

  it('gives up after the timeout', async () => {
    const s = await pair({ elicitation: { form: {} } }, () => new Promise(() => {}));
    const e = await new Approver(s.server, 'elicit', 'en', 50).confirm(req).catch((x) => x);
    expect(e).toBeInstanceOf(NotApproved);
  });

  it('accepts clients that declare elicitation without modes (older spec)', async () => {
    const s = await pair({ elicitation: {} }, async () => ({ action: 'accept', content: {} }));
    await expect(new Approver(s.server, 'elicit', 'en', 1000).confirm(req)).resolves.toBeUndefined();
  });

  it('refuses without elicitation, unless the client confirms itself', async () => {
    const s = await pair({});
    await expect(new Approver(s.server, 'elicit', 'en', 1000).confirm(req)).rejects.toBeInstanceOf(ApprovalUnavailable);
    await expect(new Approver(s.server, 'client', 'en', 1000).confirm(req)).resolves.toBeUndefined();
  });
});

describe('makeIdentify', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const setup = (tokens: string[], userinfo: () => Response) => {
    const calls: string[] = [];
    let i = 0;
    const current = () => tokens[Math.min(i, tokens.length - 1)];
    const fetchFn = (async (url: string) => {
      calls.push(new URL(url).pathname);
      if (url.endsWith('/.well-known/openid-configuration')) return json({ userinfo_endpoint: 'https://sso.example.com/userinfo' });
      if (url.endsWith('/userinfo')) return userinfo();
      if (url.endsWith('/tokens/self')) return json({ id: 't', name: 'Bot', owner: 'account', accountId: 'acc-1', organizationId: 'o', scopes: [], spaces: 'all', role: null, expiresAt: null });
      if (url.endsWith('/settings')) return json({ displayName: 'Alice MARTIN' });
      return json({}, 404);
    }) as unknown as typeof fetch;
    const api = new SpaceClient({ apiUrl: 'https://space.example.com/api', timeoutMs: 1000 }, { getToken: async () => current(), invalidate() {} }, fetchFn);
    return { calls, next: () => i++, identify: makeIdentify(api, { issuer: 'https://sso.example.com/', fetchFn }) };
  };
  afterEach(() => vi.useRealTimers());

  it('reads an API token from tokens/self and a session user from userinfo, once', async () => {
    const t = setup(['tws_abc', 'session'], () => json({ uuid: 'u-1', email: 'alice.martin@example.com' }));
    expect(await t.identify()).toMatchObject({ kind: 'token', id: 'acc-1' });
    t.next();
    expect(await t.identify()).toEqual({ kind: 'session', id: 'u-1', email: 'alice.martin@example.com', name: 'Alice MARTIN' });
    await t.identify();
    expect(t.calls.filter((c) => c === '/userinfo')).toHaveLength(1);
  });

  it('retries userinfo a minute after a failure instead of keeping a partial identity', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-11-01T10:00:00Z'), toFake: ['Date'] });
    let ok = false;
    const t = setup(['session'], () => (ok ? json({ uuid: 'u-1', email: 'a@example.com' }) : json({ error: 'x' }, 503)));
    expect((await t.identify()).id).toBeUndefined();
    ok = true;
    expect((await t.identify()).id).toBeUndefined();
    vi.setSystemTime(Date.parse('2026-11-01T10:01:01Z'));
    expect((await t.identify()).id).toBe('u-1');
  });
});

describe('CommandTokenProvider', () => {
  it('reads raw or JSON tokens, caches until expiry and reports failures without the output', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const json = new CommandTokenProvider(`printf '{"access_token":"abc","expires_at":${exp}}'`);
    expect(await json.getToken()).toBe('abc');
    expect(await new CommandTokenProvider('printf tws_raw').getToken()).toBe('tws_raw');
    await expect(new CommandTokenProvider("printf '{\"x\":1}'").getToken()).rejects.toThrow(/no access_token/);
    await expect(new CommandTokenProvider('exit 3').getToken()).rejects.toThrow(/token command failed/);
    await expect(new CommandTokenProvider('true').getToken()).rejects.toThrow(/printed nothing/);
  });

  it('runs the command again after invalidate', async () => {
    const p = new CommandTokenProvider('date +%s%N', { defaultTtlSeconds: 3600 });
    const a = await p.getToken();
    expect(await p.getToken()).toBe(a);
    p.invalidate();
    expect(await p.getToken()).not.toBe(a);
  });
});
