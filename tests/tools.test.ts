import { beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SpaceClient } from '../src/space.js';
import { registerTools } from '../src/tools.js';

// ---------------------------------------------------------------- fake Twake Space backend

const ME = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const S1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const S2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const members = [
  { id: ME, username: 'amartin', email: 'alice.martin@example.com', displayName: 'Alice MARTIN', role: 'admin', workplaceFqdn: null },
  { id: BOB, username: 'bdurand', email: 'bob.durand@example.com', displayName: 'Bob DURAND', role: 'editor', workplaceFqdn: null },
];

function freshState() {
  return {
    spaces: [
      { id: S1, name: 'Équipe Design', role: 'admin', color: '#46a2ff', description: 'Brand', pinnedAt: null, openedAt: null, manages: true, members },
      { id: S2, name: 'Projet Atlas', role: 'editor', color: null, description: '', pinnedAt: null, openedAt: null, manages: false, members },
    ],
    feed: {
      [S1]: [
        {
          id: 'f-approval', kind: 'post', category: 'messages', time: '2026-11-01T09:00:00.000Z', updatedAt: '2026-11-01T09:00:00.000Z', reactions: [{ key: '👍', userIds: [BOB] }],
          author: { type: 'user', id: BOB, name: 'Bob DURAND' }, body: 'Budget Q1 à valider', editedAt: null, poll: null,
          approval: { state: 'pending', approvers: [{ id: ME, name: 'Alice MARTIN', decision: null, comment: null, decidedAt: null }], closedAt: null }, announcement: null, feedback: null,
        },
        {
          id: 'f-card', kind: 'card', category: 'files', time: '2026-10-31T08:00:00.000Z', updatedAt: '2026-11-01T08:00:00.000Z', reactions: [],
          type: 'com.twake.drive.file.updated.v1', actor: { type: 'user', id: BOB, name: 'Bob DURAND' }, object: { type: 'file', id: 'file1', title: 'Roadmap.odt', container: null }, preview: 'First draft', state: {}, files: null,
        },
        {
          id: 'f-poll', kind: 'post', category: 'messages', time: '2026-10-20T08:00:00.000Z', updatedAt: '2026-10-20T08:00:00.000Z', reactions: [],
          author: { type: 'user', id: BOB, name: 'Bob DURAND' }, body: 'Date du séminaire ?', editedAt: null,
          poll: { kind: 'choice', multiple: false, anonymous: false, options: [{ label: 'Lundi', count: 1, userIds: [BOB] }, { label: 'Mardi', count: 0, userIds: [] }], closesAt: null, closedAt: null },
          approval: null, announcement: null, feedback: null,
        },
      ],
      [S2]: [],
    } as Record<string, Record<string, unknown>[]>,
    requests: [] as { method: string; path: string; body?: unknown }[],
  };
}

let state: ReturnType<typeof freshState>;

function json(status: number, body?: unknown) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const fakeFetch = (async (input: string, init: RequestInit) => {
  const url = new URL(input);
  const path = url.pathname.replace(/^\/api/, '');
  const method = init.method ?? 'GET';
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  state.requests.push({ method, path: path + url.search, body });
  let m: RegExpExecArray | null;
  if (method === 'GET' && path === '/tokens/self') return json(200, { id: 't1', name: 'Hermes', owner: 'account', accountId: ME, organizationId: 'org', scopes: ['space:read', 'feed:read', 'feed:write'], spaces: 'all', role: null, expiresAt: '2027-01-30T15:00:00.000Z' });
  if (method === 'GET' && path === '/spaces') {
    const st = url.searchParams.get('state');
    return json(200, { spaces: st ? [] : state.spaces });
  }
  if (method === 'POST' && path === '/spaces') return json(201, { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: body.name, role: 'admin' });
  if ((m = /^\/spaces\/([^/]+)$/.exec(path))) {
    const s = state.spaces.find((x) => x.id === m![1]);
    if (!s) return json(404, { error: 'not_found' });
    if (method === 'GET') return json(200, { ...s, createdAt: '2026-10-01T08:00:00.000Z', apps: ['chat', 'drive', 'calendar'], chat: true, mail: false, homeserverUrl: 'https://matrix.example.com', chatUrl: null, banner: null, groups: [], resources: [{ kind: 'matrix_space', id: '!space:example.com' }, { kind: 'calendar', id: 'cal-1' }, { kind: 'drive', id: null }] });
    if (method === 'PATCH') return json(204);
  }
  if ((m = /^\/spaces\/([^/]+)\/state$/.exec(path)) && method === 'PUT') return json(204);
  if ((m = /^\/spaces\/([^/]+)\/members$/.exec(path)) && method === 'POST') return json(204);
  if ((m = /^\/spaces\/([^/]+)\/members\/([^/]+)$/.exec(path))) return json(204);
  if ((m = /^\/spaces\/([^/]+)\/feed$/.exec(path)) && method === 'GET') {
    let items = state.feed[m[1]] ?? [];
    const since = url.searchParams.get('since');
    if (since) items = items.filter((i) => Date.parse(String(i.updatedAt)) >= Date.parse(since));
    return json(200, { items, next: null });
  }
  if ((m = /^\/spaces\/([^/]+)\/feed\/pinned$/.exec(path))) return json(200, { items: [] });
  if ((m = /^\/spaces\/([^/]+)\/feed\/items\/([^/]+)$/.exec(path))) {
    const it = (state.feed[m[1]] ?? []).find((i) => i.id === m![2]);
    return it ? json(200, it) : json(404, { error: 'not_found' });
  }
  if ((m = /^\/spaces\/([^/]+)\/feed\/posts$/.exec(path)) && method === 'POST') return json(201, { id: 'new-post', kind: 'post', category: 'messages', time: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z', reactions: [], author: { type: 'token', id: 't1', name: 'Hermes' }, body: body.body, editedAt: null, poll: null, approval: null, announcement: null, feedback: null });
  if ((m = /^\/spaces\/([^/]+)\/feed\/posts\/([^/]+)(\/close)?$/.exec(path))) {
    if (method === 'DELETE') return json(204);
    return json(200, { id: m[2], kind: 'post', category: 'messages', time: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:05:00.000Z', reactions: [], author: { type: 'token', id: 't1', name: 'Hermes' }, body: body?.body ?? 'x', editedAt: '2026-11-01T10:05:00.000Z', poll: null, approval: null, announcement: null, feedback: null });
  }
  if (path === '/notifications') return json(403, { error: 'insufficient_scope' });
  if (path === '/organization/members') return json(200, { members: [{ username: 'cpetit', email: 'c@example.com', displayName: 'Chloé PETIT' }], hasNextPage: false });
  return json(404, { error: 'not_found' });
}) as unknown as typeof fetch;

let client: Client;

beforeEach(async () => {
  state = freshState();
  const server = new McpServer({ name: 'test', version: '0' });
  const api = new SpaceClient({ apiUrl: 'https://space.example.com/api', timeoutMs: 1000 }, { getToken: async () => 'tws_x', invalidate() {} }, fakeFetch);
  registerTools(server, api, { appUrl: 'https://space.example.com', timeZone: 'Europe/Paris', approval: 'client' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  client = new Client({ name: 'c', version: '0' });
  await client.connect(ct);
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as { text: string }[])[0].text;
  return { isError: Boolean(r.isError), text, data: r.isError ? undefined : JSON.parse(text) };
}

const writes = () => state.requests.filter((r) => r.method !== 'GET');

// ---------------------------------------------------------------- tests

describe('catalog', () => {
  it('registers the read, feed write and admin tools with annotations', async () => {
    const tools = (await client.listTools()).tools;
    const by = Object.fromEntries(tools.map((t) => [t.name, t]));
    const READ = ['whoami', 'list_spaces', 'get_space', 'get_feed', 'get_feed_item', 'get_pinned', 'get_unread', 'catch_up', 'get_notifications', 'search_directory'];
    const WRITE = ['create_post', 'edit_post', 'close_post', 'pin_announcement', 'react', 'vote', 'decide_approval', 'answer_feedback', 'acknowledge', 'mark_feed_read', 'mark_notifications_read', 'schedule_meeting', 'create_space', 'update_space', 'add_members', 'set_member_role'];
    const DESTRUCTIVE = ['delete_post', 'set_space_state', 'remove_member'];
    expect(Object.keys(by).sort()).toEqual([...READ, ...WRITE, ...DESTRUCTIVE].sort());
    for (const n of READ) expect(by[n].annotations?.readOnlyHint).toBe(true);
    for (const n of [...WRITE, ...DESTRUCTIVE]) expect(by[n].annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true });
    for (const n of DESTRUCTIVE) expect(by[n].annotations?.destructiveHint).toBe(true);
    for (const n of ['get_feed', 'get_feed_item', 'catch_up']) expect(by[n].description).toMatch(/untrusted/i);
  });
});

describe('read tools', () => {
  it('whoami reports the token, its scopes and how long it lasts', async () => {
    const r = (await call('whoami')).data;
    expect(r).toMatchObject({ mode: 'token', approval: 'client', token: 'Hermes', owner: 'account', scopes: ['space:read', 'feed:read', 'feed:write'], spaces: 'all', expires: '2027-01-30 16:00' });
    expect(r.days_left).toBeGreaterThan(0);
    expect(r.account).toBe('Alice MARTIN');
  });

  it('lists spaces with links', async () => {
    const r = (await call('list_spaces')).data;
    expect(r.spaces[0]).toMatchObject({ space_id: S1, name: 'Équipe Design', role: 'admin', members: 2, url: `https://space.example.com/spaces/${S1}` });
    await call('list_spaces', { state: 'archived' });
    expect(state.requests.at(-1)!.path).toBe('/spaces?state=archived');
  });

  it('resolves a space by name, accents and case ignored, and explains ambiguity', async () => {
    const r = (await call('get_space', { space: 'equipe design' })).data;
    expect(r).toMatchObject({ space_id: S1, apps: ['chat', 'drive', 'calendar'] });
    expect(r.members).toContainEqual({ id: BOB, name: 'Bob DURAND', username: 'bdurand', email: 'bob.durand@example.com', role: 'editor' });
    expect(r.resources).toContainEqual({ kind: 'matrix_space', id: '!space:example.com', use_with: expect.stringMatching(/mcp-twake-chat/) });
    expect(r.resources).toContainEqual({ kind: 'drive', id: null, status: 'being prepared' });
    expect((await call('get_space', { space: 'nothing like this' })).isError).toBe(true);
    const amb = await call('get_space', { space: 'e' });
    expect(amb.isError).toBe(true);
    expect(amb.text).toMatch(/2 spaces match/);
  });

  it('reads the feed with filters and resolves names', async () => {
    const r = (await call('get_feed', { space: 'design', category: 'messages', query: 'budget', since: '2026-10-30', limit: 10 })).data;
    expect(state.requests.map((x) => x.path)).toContain(`/spaces/${S1}/feed?category=messages&q=budget&since=2026-10-29T23%3A00%3A00.000Z&limit=10`);
    const approval = r.items.find((i: { id: string }) => i.id === 'f-approval');
    expect(approval).toMatchObject({ author: 'Bob DURAND', text: 'Budget Q1 à valider', time: '2026-11-01 10:00', approval: { state: 'pending', waiting_on_me: true }, reactions: [{ emoji: '👍', count: 1, by: ['Bob DURAND'] }] });
    expect(r.items.find((i: { id: string }) => i.id === 'f-card')).toMatchObject({ kind: 'card', event: 'com.twake.drive.file.updated.v1', object: { title: 'Roadmap.odt' }, by: 'Bob DURAND' });
    expect(r.url).toBe(`https://space.example.com/spaces/${S1}/feed`);
  });

  it('catch_up lists what changed in every space and what waits on me', async () => {
    const r = (await call('catch_up', { since: '2026-10-15' })).data;
    const design = r.spaces.find((s: { name: string }) => s.name === 'Équipe Design');
    expect(design.counts).toEqual({ messages: 2, files: 1 });
    expect(design.waiting_on_me.map((w: { id: string; reason: string }) => [w.id, w.reason])).toEqual([
      ['f-approval', 'approval requested from you'],
      ['f-poll', 'poll you have not voted in'],
    ]);
    expect(r.spaces.find((s: { name: string }) => s.name === 'Projet Atlas')).toBeUndefined();
    expect(r.quiet_spaces).toEqual(['Projet Atlas']);
  });

  it('explains a missing scope', async () => {
    const r = await call('get_notifications');
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/notifications:read|not allowed/);
  });

  it('searches the organization directory', async () => {
    expect((await call('search_directory', { query: 'chloé' })).data.people[0]).toEqual({ username: 'cpetit', email: 'c@example.com', name: 'Chloé PETIT' });
    expect((await call('search_directory', { query: 'c' })).isError).toBe(true);
  });
});

describe('write tools', () => {
  it('creates a post with mentions resolved to member ids', async () => {
    const r = (await call('create_post', { space: 'design', text: 'Point budget demain', mention: ['bob'] })).data;
    expect(writes()[0]).toEqual({ method: 'POST', path: `/spaces/${S1}/feed/posts`, body: { body: 'Point budget demain', mentions: [BOB] } });
    expect(r).toMatchObject({ space: { space_id: S1, name: 'Équipe Design' }, post: { id: 'new-post', author: 'Hermes (API token)' } });
  });

  it('builds polls, yes/no questions, approvals and announcements', async () => {
    await call('create_post', { space: 'design', text: 'Quel jour ?', kind: 'poll', options: ['Lundi', 'Mardi'], multiple: true, closes_at: '2026-11-05T18:00' });
    await call('create_post', { space: 'design', text: 'On valide ?', kind: 'yes_no' });
    await call('create_post', { space: 'design', text: 'Devis', kind: 'approval', approvers: ['Bob DURAND'] });
    await call('create_post', { space: 'design', text: 'Fermé vendredi', kind: 'announcement', title: 'Fermeture', pinned: true });
    expect(writes().map((w) => w.body)).toEqual([
      { body: 'Quel jour ?', poll: { options: ['Lundi', 'Mardi'], multiple: true, anonymous: false, closesAt: '2026-11-05T17:00:00.000Z' } },
      { body: 'On valide ?', poll: { kind: 'yes_no' } },
      { body: 'Devis', approval: { approvers: [BOB] } },
      { body: 'Fermé vendredi', announcement: { title: 'Fermeture', pinned: true } },
    ]);
    expect((await call('create_post', { space: 'design', text: 'x', kind: 'poll', options: ['seul'] })).isError).toBe(true);
    expect((await call('create_post', { space: 'design', text: 'x', mention: ['inconnu'] })).isError).toBe(true);
  });

  it('edits, closes and deletes posts', async () => {
    await call('edit_post', { space: 'design', item_id: 'f-poll', text: 'corrigé' });
    await call('close_post', { space: 'design', item_id: 'f-poll' });
    await call('delete_post', { space: 'design', item_id: 'f-poll' });
    expect(writes().map((w) => [w.method, w.path, w.body])).toEqual([
      ['PATCH', `/spaces/${S1}/feed/posts/f-poll`, { body: 'corrigé' }],
      ['POST', `/spaces/${S1}/feed/posts/f-poll/close`, undefined],
      ['DELETE', `/spaces/${S1}/feed/posts/f-poll`, undefined],
    ]);
  });

  it('manages spaces and members', async () => {
    const c = (await call('create_space', { name: 'Nouveau', description: 'Test', apps: ['chat', 'drive'] })).data;
    expect(c).toMatchObject({ space_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', url: 'https://space.example.com/spaces/cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
    await call('update_space', { space: 'atlas', description: 'Nouvelle description' });
    await call('set_space_state', { space: 'atlas', state: 'archived' });
    await call('add_members', { space: 'design', usernames: ['cpetit'], role: 'viewer' });
    await call('set_member_role', { space: 'design', member: 'Bob', role: 'admin' });
    await call('remove_member', { space: 'design', member: 'bob.durand@example.com' });
    expect(writes().map((w) => [w.method, w.path, w.body])).toEqual([
      ['POST', '/spaces', { name: 'Nouveau', description: 'Test', apps: ['chat', 'drive'] }],
      ['PATCH', `/spaces/${S2}`, { description: 'Nouvelle description' }],
      ['PUT', `/spaces/${S2}/state`, { state: 'archived' }],
      ['POST', `/spaces/${S1}/members`, { usernames: ['cpetit'], role: 'viewer' }],
      ['PATCH', `/spaces/${S1}/members/${BOB}`, { role: 'admin' }],
      ['DELETE', `/spaces/${S1}/members/${BOB}`, undefined],
    ]);
    expect((await call('update_space', { space: 'atlas' })).isError).toBe(true);
  });
});
