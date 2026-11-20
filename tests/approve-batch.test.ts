import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { SpaceClient } from '../src/space.js';
import { registerTools } from '../src/tools.js';
import { makeIdentify } from '../src/identity.js';

// approve_batch: the user approves a list of actions once; each matching call with the batchId then runs
// without another question, and anything else asks as usual.

const ME = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const S1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM = '33333333-3333-4333-8333-333333333333';
const members = [
  { id: ME, username: 'amartin', email: 'alice.martin@example.com', displayName: 'Alice MARTIN', role: 'admin' },
  { id: BOB, username: 'bdurand', email: 'bob.durand@example.com', displayName: 'Bob DURAND', role: 'editor' },
];
const space = { id: S1, name: 'Équipe Design', role: 'admin', color: null, description: '', pinnedAt: null, openedAt: null, manages: true, members };
const poll = {
  id: ITEM, kind: 'post', category: 'messages', time: '2026-11-01T09:00:00.000Z', updatedAt: '2026-11-01T09:00:00.000Z', reactions: [],
  author: { type: 'user', id: BOB, name: 'Bob DURAND' }, body: 'Quel jour pour le séminaire ?', editedAt: null,
  poll: { kind: 'choice', multiple: false, anonymous: false, options: [{ label: 'Lundi', count: 0, userIds: [] }, { label: 'Mardi', count: 0, userIds: [] }], closesAt: null, closedAt: null },
  approval: null, announcement: null, feedback: null,
};

function setup(opts: { answers?: ('accept' | 'decline')[]; elicitation?: boolean; approval?: 'elicit' | 'client'; token?: string } = {}) {
  const requests: { method: string; path: string; body?: unknown }[] = [];
  const prompts: string[] = [];
  const json = (status: number, body?: unknown) => new Response(status === 204 || status === 202 && body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchFn = (async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    if (url.hostname === 'sso.example.com') {
      if (url.pathname === '/.well-known/openid-configuration') return json(200, { issuer: 'https://sso.example.com/', userinfo_endpoint: 'https://sso.example.com/oauth2/userinfo' });
      if (url.pathname === '/oauth2/userinfo') return json(200, { sub: 'amartin', uuid: ME, email: 'alice.martin@example.com', sid: 's', org_id: 'o' });
    }
    const path = url.pathname.replace(/^\/api/, '');
    requests.push({ method, path: path + url.search, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (path === '/spaces' && method === 'GET') return json(200, { spaces: [space] });
    if (path === `/spaces/${S1}`) return json(200, { ...space, resources: [] });
    if (path === `/spaces/${S1}/feed/items/${ITEM}`) return json(200, poll);
    if (path === '/feed/unread') return json(200, { spaces: [{ spaceId: S1, items: 4, mentions: 1 }] });
    if (path === '/settings') return json(200, { language: 'fr', timezone: 'Europe/Paris', theme: null, avatar: null, displayName: null });
    if (path === `/spaces/${S1}/meetings`) return json(202, { uid: (JSON.parse(String(init.body)) as { uid: string }).uid });
    if (path === `/spaces/${S1}/feed/posts` && method === 'POST') return json(201, { ...poll, id: 'new', author: { type: 'user', id: ME, name: 'Alice MARTIN' }, body: 'Bonjour', poll: null });
    if (path.startsWith(`/spaces/${S1}/feed/posts/${ITEM}/pin`)) return json(200, poll);
    if (method !== 'GET') return json(204);
    return json(404, { error: 'not_found' });
  }) as unknown as typeof fetch;
  const token = opts.token ?? 'eyJ.session.token';
  const api = new SpaceClient({ apiUrl: 'https://space.example.com/api', timeoutMs: 1000 }, { getToken: async () => token, invalidate() {} }, fetchFn);
  const server = new McpServer({ name: 'test', version: '0' });
  registerTools(server, api, {
    appUrl: 'https://space.example.com',
    timeZone: 'Europe/Paris',
    approval: opts.approval ?? 'elicit',
    language: 'fr',
    identify: makeIdentify(api, { issuer: 'https://sso.example.com/', fetchFn }),
  });
  const client = new Client({ name: 'c', version: '0' }, { capabilities: opts.elicitation === false ? {} : { elicitation: { form: {} } } });
  if (opts.elicitation !== false) {
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      prompts.push(req.params.message);
      const action = opts.answers?.shift() ?? 'decline';
      return action === 'accept' ? { action, content: {} } : { action };
    });
  }
  const ready = (async () => {
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    await client.connect(ct);
  })();
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    await ready;
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as { text: string }[]).map((c) => c.text).join('\n');
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
    return { isError: Boolean(r.isError), text, data: data as Record<string, any> };
  };
  const writes = () => requests.filter((r) => r.method !== 'GET');
  const batchOf = async (actions: { tool: string; arguments: Record<string, unknown> }[]) => {
    const r = await call('approve_batch', { actions });
    return { ...r, batchId: /"batchId":"([0-9a-f]{32})"/.exec(r.text)?.[1] };
  };
  return { call, batchOf, prompts, writes, requests, client: async () => (await ready, client) };
}

/** One call per family of write tools: feed posts, reactions and answers, marks, meetings, space settings, members. */
const WRITES: [string, Record<string, unknown>][] = [
  ['create_post', { space: 'design', text: 'Bonjour à tous', mention: ['bob'] }],
  ['react', { space: 'design', item_id: ITEM, emoji: '👍' }],
  ['vote', { space: 'design', item_id: ITEM, choice: 'mardi' }],
  ['acknowledge', { space: 'design', item_id: ITEM }],
  ['mark_feed_read', { space: 'design' }],
  ['schedule_meeting', { space: 'design', title: 'Point budget', start: '2026-11-05T14:00', end: '2026-11-05T15:00' }],
  ['update_space', { space: 'design', description: 'Nouvelle description' }],
  ['set_member_role', { space: 'design', member: 'bob', role: 'viewer' }],
];
const post = { space: 'design', text: 'Bonjour' };
const post2 = { space: 'design', text: 'Bonjour encore' };

describe('approve_batch', () => {
  it('lists the tools that ask as WRITE_TOOLS', async () => {
    const { WRITE_TOOLS } = await import('../src/tools.js');
    const t = setup();
    const tools = (await (await t.client()).listTools()).tools;
    const writers = tools.filter((x) => !x.annotations?.readOnlyHint && x.name !== 'approve_batch').map((x) => x.name);
    expect([...WRITE_TOOLS].sort()).toEqual(writers.sort());
  });

  it('publishes two posts after one approval of the batch', async () => {
    const t = setup({ answers: ['accept'] });
    const b = await t.batchOf([
      { tool: 'create_post', arguments: post },
      { tool: 'create_post', arguments: post2 },
    ]);
    expect(b.batchId, b.text).toBeDefined();
    expect(t.prompts).toHaveLength(1);
    expect(t.prompts[0]).toContain('2 actions');
    expect(t.prompts[0]).toMatch(/\[1\/2\] Twake Space : Publier dans le fil/);
    expect(t.prompts[0]).toContain('Bonjour encore');
    expect(t.writes()).toEqual([]);
    expect((await t.call('create_post', { ...post, batchId: b.batchId })).isError).toBe(false);
    expect((await t.call('create_post', { ...post2, batchId: b.batchId })).isError).toBe(false);
    expect(t.prompts).toHaveLength(1);
    expect(t.writes()).toHaveLength(2);
  });

  it('asks again for a create_post whose arguments are not in the batch', async () => {
    const t = setup({ answers: ['accept', 'accept'] });
    const b = await t.batchOf([{ tool: 'create_post', arguments: post }]);
    const r = await t.call('create_post', { ...post, text: 'Autre chose', batchId: b.batchId });
    expect(t.prompts).toHaveLength(2);
    expect(t.prompts[1]).toContain('Autre chose');
    expect(r.text).toContain('lot non utilisé');
    expect(t.writes()).toHaveLength(1);
  });

  it('writes nothing while preparing the batch', async () => {
    const t = setup({ answers: ['decline'] });
    const b = await t.batchOf(WRITES.map(([tool, args]) => ({ tool, arguments: args })));
    expect(b.batchId, b.text).toBeUndefined();
    expect(b.text).toContain('Lot non approuvé');
    expect(t.prompts).toHaveLength(1);
    expect(t.prompts[0]).toContain(`${WRITES.length} actions`);
    expect(t.writes()).toEqual([]);
  });

  it('refuses a batch with a read tool', async () => {
    const t = setup({ answers: ['accept'] });
    const b = await t.batchOf([
      { tool: 'create_post', arguments: post },
      { tool: 'get_feed', arguments: { space: 'design' } },
    ]);
    expect(b.isError).toBe(true);
    expect(b.text).toContain('action 2.');
    expect(t.prompts).toEqual([]);
  });

  it.each(WRITES)('%s runs once approved in a batch, without another question', async (tool, args) => {
    const t = setup({ answers: ['accept'] });
    const b = await t.batchOf([{ tool, arguments: args }]);
    expect(b.batchId, b.text).toBeDefined();
    expect(t.writes()).toEqual([]);
    const r = await t.call(tool, { ...args, batchId: b.batchId });
    expect(r.isError, r.text).toBe(false);
    expect(r.text).not.toContain('lot non utilisé');
    expect(t.prompts).toHaveLength(1);
    expect(t.writes().length).toBeGreaterThan(0);
  });

  it('creates no batch with TWAKE_SPACE_APPROVAL=client', async () => {
    const t = setup({ approval: 'client' });
    const b = await t.batchOf([{ tool: 'create_post', arguments: post }]);
    expect(b.batchId).toBeUndefined();
    expect(b.text).toContain('client');
  });
});
