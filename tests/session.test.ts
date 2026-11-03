import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { SpaceClient } from '../src/space.js';
import { registerTools } from '../src/tools.js';
import { makeIdentify } from '../src/identity.js';

// Session (OIDC) caller acting as the user, every write behind an approval prompt.

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

function setup(opts: { answer?: 'accept' | 'decline' | 'cancel'; elicitation?: boolean; approval?: 'elicit' | 'client'; token?: string } = {}) {
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
      const action = opts.answer ?? 'accept';
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
    const text = (r.content as { text: string }[])[0].text;
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
    return { isError: Boolean(r.isError), text, data: data as Record<string, any> };
  };
  const writes = () => requests.filter((r) => r.method !== 'GET');
  return { call, prompts, writes, requests, client: async () => (await ready, client) };
}

describe('identity', () => {
  it('whoami reports the session user and the approval mode', async () => {
    const t = setup();
    const r = (await t.call('whoami')).data;
    expect(r).toMatchObject({ mode: 'session', acts_as: 'Alice MARTIN', email: 'alice.martin@example.com', user_id: ME, approval: 'elicit' });
  });
});

describe('approval before acting', () => {
  it('asks with the exact action, the identity, the space and a unique reference, then acts', async () => {
    const t = setup();
    const r = await t.call('create_post', { space: 'design', text: 'Bonjour à tous', mention: ['bob'] });
    expect(r.isError).toBe(false);
    expect(t.prompts).toHaveLength(1);
    expect(t.prompts[0]).toMatch(/Publier dans le fil/);
    expect(t.prompts[0]).toMatch(/En tant que : Alice MARTIN/);
    expect(t.prompts[0]).toMatch(/Espace : Équipe Design/);
    expect(t.prompts[0]).toMatch(/Bonjour à tous/);
    expect(t.prompts[0]).toMatch(/Bob DURAND/);
    expect(t.prompts[0]).toMatch(/Réf\. [0-9a-f]{6}/);
    expect(t.writes()).toHaveLength(1);
    await t.call('create_post', { space: 'design', text: 'Bonjour à tous' });
    expect(t.prompts[1].match(/Réf\. (\w+)/)![1]).not.toBe(t.prompts[0].match(/Réf\. (\w+)/)![1]);
  });

  it('shows only the fields the kind of post sends, with the poll settings', async () => {
    const t = setup();
    await t.call('create_post', { space: 'design', text: 'Quel jour ?', kind: 'poll', options: ['Lundi', 'Mardi'], title: 'ignoré', pinned: true });
    expect(t.prompts[0]).toMatch(/Choix multiples : non/);
    expect(t.prompts[0]).toMatch(/Anonyme : non/);
    expect(t.prompts[0]).not.toMatch(/Titre|Épinglée|ignoré/);
    expect(t.writes()[0].body).toEqual({ body: 'Quel jour ?', poll: { options: ['Lundi', 'Mardi'], multiple: false, anonymous: false } });
    await t.call('create_post', { space: 'design', text: 'Fermé', kind: 'announcement', color: '#ff0000', pinned: false });
    expect(t.prompts[1]).toMatch(/Couleur : #ff0000/);
    expect(t.prompts[1]).toMatch(/Épinglée : non/);
  });

  it('shows a cleared description and removed tabs when updating a space', async () => {
    const t = setup();
    await t.call('update_space', { space: 'design', description: '', apps: [] });
    expect(t.prompts[0]).toMatch(/Description : \(effacée\)/);
    expect(t.prompts[0]).toMatch(/Onglets : aucun \(tous les onglets retirés\)/);
  });

  it('does nothing when the user declines or does not answer, and says not to retry', async () => {
    for (const answer of ['decline', 'cancel'] as const) {
      const t = setup({ answer });
      const r = await t.call('react', { space: 'design', item_id: ITEM, emoji: '👍' });
      expect(r.isError).toBe(false);
      expect(r.text).toMatch(answer === 'decline' ? /refused/i : /no answer/i);
      expect(r.text).toMatch(/nothing was changed/i);
      expect(t.writes()).toHaveLength(0);
    }
  });

  it('fails closed when the client cannot ask for approval', async () => {
    const t = setup({ elicitation: false });
    const r = await t.call('acknowledge', { space: 'design', item_id: ITEM });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/cannot ask .*approval/i);
    expect(t.writes()).toHaveLength(0);
  });

  it('leaves confirmation to the client in client mode', async () => {
    const t = setup({ elicitation: false, approval: 'client' });
    expect((await t.call('acknowledge', { space: 'design', item_id: ITEM })).isError).toBe(false);
    expect(t.writes()).toHaveLength(1);
  });

  it('never asks for read tools', async () => {
    const t = setup();
    await t.call('get_unread');
    await t.call('get_feed', { space: 'design' });
    expect(t.prompts).toHaveLength(0);
  });

  it('marks every write tool so and every read tool read-only', async () => {
    const t = setup();
    const tools = (await (await t.client()).listTools()).tools;
    for (const tool of tools) {
      const write = !tool.annotations?.readOnlyHint;
      expect(tool.description!.includes('approval'), tool.name).toBe(write);
    }
  });
});

describe('session actions', () => {
  it('get_unread names the spaces', async () => {
    const r = (await setup().call('get_unread')).data;
    expect(r.spaces).toEqual([{ space_id: S1, name: 'Équipe Design', new_items: 4, mentions: 1, url: `https://space.example.com/spaces/${S1}/feed` }]);
  });

  it('votes by option label and shows the question in the prompt', async () => {
    const t = setup();
    await t.call('vote', { space: 'design', item_id: ITEM, choice: 'mardi' });
    expect(t.prompts[0]).toMatch(/Quel jour pour le séminaire/);
    expect(t.prompts[0]).toMatch(/Mardi/);
    expect(t.writes()).toEqual([{ method: 'PUT', path: `/spaces/${S1}/feed/posts/${ITEM}/vote`, body: { option: 1 } }]);
    const bad = await t.call('vote', { space: 'design', item_id: ITEM, choice: 'jeudi' });
    expect(bad.isError).toBe(true);
    expect(bad.text).toMatch(/Lundi, Mardi/);
    await t.call('vote', { space: 'design', item_id: ITEM, remove: true });
    expect(t.writes().at(-1)).toEqual({ method: 'DELETE', path: `/spaces/${S1}/feed/posts/${ITEM}/vote`, body: undefined });
  });

  it('reacts, decides, answers, acknowledges, pins and marks as read', async () => {
    const t = setup();
    await t.call('react', { space: 'design', item_id: ITEM, emoji: '🎉' });
    await t.call('react', { space: 'design', item_id: ITEM, emoji: '🎉', remove: true });
    await t.call('decide_approval', { space: 'design', item_id: ITEM, decision: 'approved', comment: 'OK pour moi' });
    await t.call('answer_feedback', { space: 'design', item_id: ITEM, rating: 4, text: 'Bien' });
    await t.call('acknowledge', { space: 'design', item_id: ITEM });
    await t.call('pin_announcement', { space: 'design', item_id: ITEM, pinned: false });
    await t.call('mark_feed_read', { space: 'design' });
    await t.call('mark_notifications_read', {});
    await t.call('mark_notifications_read', { notification_id: '44444444-4444-4444-8444-444444444444' });
    const w = t.writes();
    expect(w.map((x) => [x.method, x.path])).toEqual([
      ['PUT', `/spaces/${S1}/feed/items/${ITEM}/reactions/%F0%9F%8E%89`],
      ['DELETE', `/spaces/${S1}/feed/items/${ITEM}/reactions/%F0%9F%8E%89`],
      ['PUT', `/spaces/${S1}/feed/posts/${ITEM}/decision`],
      ['PUT', `/spaces/${S1}/feed/posts/${ITEM}/answer`],
      ['PUT', `/spaces/${S1}/feed/posts/${ITEM}/acknowledgement`],
      ['DELETE', `/spaces/${S1}/feed/posts/${ITEM}/pin`],
      ['PUT', `/spaces/${S1}/feed/read`],
      ['POST', '/notifications/read'],
      ['POST', '/notifications/44444444-4444-4444-8444-444444444444/read'],
    ]);
    expect(w[2].body).toEqual({ decision: 'approved', comment: 'OK pour moi' });
    expect(w[3].body).toEqual({ rating: 4, text: 'Bien' });
    expect(Date.parse((w[6].body as { readAt: string }).readAt)).toBeGreaterThan(Date.now() - 60000);
    expect(t.prompts).toHaveLength(9);
    expect(t.prompts[2]).toMatch(/Approuver/);
    expect((await t.call('answer_feedback', { space: 'design', item_id: ITEM })).isError).toBe(true);
  });

  it('schedules a meeting in local time with a stable uid', async () => {
    const t = setup();
    const r = (await t.call('schedule_meeting', { space: 'design', title: 'Point budget', start: '2026-11-05T14:00', end: '2026-11-05T15:00', description: 'Ordre du jour' })).data;
    expect(t.prompts[0]).toMatch(/Point budget/);
    expect(t.prompts[0]).toMatch(/2026-11-05 14:00 → 15:00 \(Europe\/Paris\)/);
    const w = t.writes()[0];
    expect(w.path).toBe(`/spaces/${S1}/meetings`);
    expect(w.body).toMatchObject({ title: 'Point budget', start: '2026-11-05T13:00:00.000Z', end: '2026-11-05T14:00:00.000Z', timezone: 'Europe/Paris', description: 'Ordre du jour' });
    expect(r.uid).toBe((w.body as { uid: string }).uid);
    expect((await t.call('schedule_meeting', { space: 'design', title: 'x', start: '2026-11-05T15:00', end: '2026-11-05T14:00' })).isError).toBe(true);
  });
});
