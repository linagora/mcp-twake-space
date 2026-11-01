// Live test of the session mode (acting as the user) with approval prompts, ONLY in a space where
// the user is the only member. The script answers the prompts itself: first a refusal (nothing must
// happen), then accepts for reversible actions that it undoes. Prints ids, counts and the prompts
// (which only quote the test posts).
//   LIVE_SPACE=<space> TWAKE_SPACE_URL=… TWAKE_SPACE_TOKEN_COMMAND=… TWAKE_SPACE_OIDC_ISSUER=… node scripts/live-session.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const space = process.env.LIVE_SPACE;
if (!space) throw new Error('set LIVE_SPACE to a space where you are the only member');
const answers = [];
const prompts = [];
const client = new Client({ name: 'live-session', version: '0' }, { capabilities: { elicitation: { form: {} } } });
client.setRequestHandler(ElicitRequestSchema, async (req) => {
  prompts.push(req.params.message);
  const action = answers.shift() ?? 'decline';
  return action === 'accept' ? { action, content: {} } : { action };
});
await client.connect(new StdioClientTransport({ command: process.execPath, args: [new URL('../build/index.js', import.meta.url).pathname], env: process.env, stderr: 'inherit' }));
const call = async (name, args = {}, answer) => {
  if (answer) answers.push(answer);
  const r = await client.callTool({ name, arguments: args });
  const text = r.content[0].text;
  if (r.isError) throw new Error(`${name}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
};
const ok = (c, s) => console.log(`${c ? 'ok  ' : 'FAIL'} ${s}`);

const who = await call('whoami');
ok(who.mode === 'session' && who.approval === 'elicit', `whoami: ${who.mode}, approval ${who.approval}, user ${who.user_id ? 'known' : 'unknown'}`);
const detail = await call('get_space', { space });
if (detail.members.length !== 1) throw new Error(`refusing: ${detail.members.length} members in ${detail.name}`);
const sid = detail.space_id;
const stamp = new Date().toISOString().slice(11, 19);

// 1. refusal: nothing is posted
const refused = await call('create_post', { space: sid, text: `Test MCP ${stamp} : ne doit pas être publié` }, 'decline');
ok(typeof refused === 'string' && /refused/.test(refused), 'create_post refused: tool says not done');
const none = await call('get_feed', { space: sid, query: `Test MCP ${stamp}` });
ok(none.items.length === 0, 'refused post absent from the feed');
console.log('--- prompt shown for the refused post ---\n' + prompts[0] + '\n---');

// 2. accepted: poll as the user, vote, react, mark read, then undo everything
const poll = await call('create_post', { space: sid, text: `Test MCP ${stamp} : sondage`, kind: 'poll', options: ['Oui', 'Non'] }, 'accept');
ok(!/API token/.test(poll.post.author), `create_post accepted: signed by the user (${poll.post.author ? 'name set' : 'no name'})`);
await call('vote', { space: sid, item_id: poll.post.id, choice: 'non' }, 'accept');
let it = (await call('get_feed_item', { space: sid, item_id: poll.post.id })).item;
ok(it.poll.my_vote?.[0] === 'Non', 'vote: my vote is Non');
await call('react', { space: sid, item_id: poll.post.id, emoji: '👍' }, 'accept');
it = (await call('get_feed_item', { space: sid, item_id: poll.post.id })).item;
ok(it.reactions?.[0]?.emoji === '👍', 'react: 👍 present');
const unread = await call('get_unread');
ok(Array.isArray(unread.spaces), `get_unread: ${unread.spaces.length} space(s) with news`);
await call('mark_feed_read', { space: sid }, 'accept');
const after = await call('get_unread');
ok(!after.spaces.some((s) => s.space_id === sid && s.new_items > 0), 'mark_feed_read: no new items left in the test space');
const notifs = await call('get_notifications', { limit: 5 });
ok(typeof notifs.unread === 'number', `get_notifications: ${notifs.unread} unread`);

await call('react', { space: sid, item_id: poll.post.id, emoji: '👍', remove: true }, 'accept');
await call('vote', { space: sid, item_id: poll.post.id, remove: true }, 'accept');
it = (await call('get_feed_item', { space: sid, item_id: poll.post.id })).item;
ok(!it.reactions && !(it.poll.my_vote ?? []).length, 'reaction and vote taken back');
await call('delete_post', { space: sid, item_id: poll.post.id }, 'accept');
ok((await call('get_feed', { space: sid, query: `Test MCP ${stamp}` })).items.length === 0, 'delete_post: test poll gone');
ok(prompts.length === 8 && new Set(prompts.map((p) => p.match(/(Ref\.|Réf\.) (\w+)/)?.[2])).size === 8, `${prompts.length} prompts, each with its own reference`);
await client.close();
