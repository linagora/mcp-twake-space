// Live test against a real Twake Space, ONLY in a space where you are the only member.
//   LIVE_SPACE=<space id or name> TWAKE_SPACE_URL=… TWAKE_SPACE_TOKEN_FILE=… node scripts/live.mjs
// Reads the space and its feed, posts a message, a poll and an announcement, edits and closes
// them, changes the description and restores it, then deletes every test post. Prints ids and
// counts, never other people's content.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const space = process.env.LIVE_SPACE;
if (!space) throw new Error('set LIVE_SPACE to a space where you are the only member');
const client = new Client({ name: 'live', version: '0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [new URL('../build/index.js', import.meta.url).pathname], env: process.env, stderr: 'inherit' }));
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  return JSON.parse(r.content[0].text);
};
const ok = (c, s) => console.log(`${c ? 'ok  ' : 'FAIL'} ${s}`);

const who = await call('whoami');
ok(Boolean(who.token), `whoami: token "${who.token}", ${who.scopes.length} scopes, ${who.days_left} days left`);
const detail = await call('get_space', { space });
if (detail.members.length !== 1) throw new Error(`refusing: ${detail.members.length} members in ${detail.name}`);
ok(true, `get_space: ${detail.name}, 1 member, resources ${detail.resources.map((r) => r.kind + (r.id ? '' : '(pending)')).join(', ')}`);
const list = await call('list_spaces');
ok(list.spaces.some((s) => s.space_id === detail.space_id), `list_spaces: ${list.spaces.length} space(s)`);

const stamp = new Date().toISOString().slice(11, 19);
const created = [];
const msg = await call('create_post', { space: detail.space_id, text: `Test MCP ${stamp} : message` });
created.push(msg.post.id);
ok(msg.post.author.includes('API token'), `create_post message: ${msg.post.id}, signed "${msg.post.author}"`);
const poll = await call('create_post', { space: detail.space_id, text: `Test MCP ${stamp} : sondage`, kind: 'poll', options: ['Oui', 'Non', 'Peut-être'] });
created.push(poll.post.id);
ok(poll.post.poll?.options.length === 3, 'create_post poll: 3 options');
const ann = await call('create_post', { space: detail.space_id, text: `Test MCP ${stamp} : annonce`, kind: 'announcement', title: 'Annonce de test', pinned: true });
created.push(ann.post.id);
ok(ann.post.announcement?.pinned === true, 'create_post announcement: pinned');
const pinned = await call('get_pinned', { space: detail.space_id });
ok(pinned.items.some((i) => i.id === ann.post.id), 'get_pinned: announcement listed');

const edited = await call('edit_post', { space: detail.space_id, item_id: msg.post.id, text: `Test MCP ${stamp} : message modifié` });
ok(Boolean(edited.post.edited), 'edit_post: marked edited');
const closed = await call('close_post', { space: detail.space_id, item_id: poll.post.id });
ok(Boolean(closed.post.poll?.closed), 'close_post: poll closed');

const feed = await call('get_feed', { space: detail.space_id, query: `Test MCP ${stamp}`, limit: 10 });
ok(created.every((id) => feed.items.some((i) => i.id === id)), `get_feed with query: ${feed.items.length} items`);
const item = await call('get_feed_item', { space: detail.space_id, item_id: msg.post.id });
ok(item.item.text.endsWith('modifié'), 'get_feed_item: edited text');
const catchUp = await call('catch_up', { space: detail.space_id, since: new Date(Date.now() - 3600000).toISOString() });
ok(catchUp.spaces[0]?.posts.length >= 3, `catch_up: ${catchUp.spaces[0]?.posts.length} posts in the last hour`);

const before = detail.description ?? '';
await call('update_space', { space: detail.space_id, description: `${before} [test ${stamp}]`.trim() });
ok((await call('get_space', { space: detail.space_id })).description?.includes(`[test ${stamp}]`), 'update_space: description changed');
await call('update_space', { space: detail.space_id, description: before });
ok(((await call('get_space', { space: detail.space_id })).description ?? '') === before, 'update_space: description restored');

for (const id of created) await call('delete_post', { space: detail.space_id, item_id: id });
const after = await call('get_feed', { space: detail.space_id, query: `Test MCP ${stamp}` });
ok(after.items.length === 0, 'delete_post: test posts gone');
await client.close();
