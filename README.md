# mcp-twake-space

[![npm version](https://img.shields.io/npm/v/mcp-twake-space.svg)](https://www.npmjs.com/package/mcp-twake-space) [![CI](https://github.com/linagora/mcp-twake-space/actions/workflows/ci.yml/badge.svg)](https://github.com/linagora/mcp-twake-space/actions/workflows/ci.yml) [![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE) [![Node.js >= 22](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)

**Give your AI assistant secure access to Twake Space, the team spaces of the [Twake.ai](https://twake.ai) Digital Workplace: spaces, members, feed and the resources each space gathers.**

## What is it?

`mcp-twake-space` is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. MCP is the open standard that lets AI assistants (Claude Desktop, Claude Code, Hermes Agent, Cursor, VS Code and many others) use external tools. This server exposes your Twake Space to the assistant as **29 tools**: spaces, members, feed (posts, polls, sign-off requests, announcements, activity cards), unread counts and notifications, and actions as you: post, vote, react, decide, acknowledge, schedule a meeting, administer a space.

Twake Space gives each team one place for its chat, tasks, drive, mail and calendar. The server talks to the Twake Space backend API, either as **you** (an OIDC session token from your identity provider) or with a **personal API token** you can revoke at any time.

**Nothing is done without your prior approval.** Before every write, the server itself shows you the exact action (who acts, in which space, with which text) through MCP elicitation, and acts only on your explicit OK. A refusal, a timeout or a client that cannot ask means nothing is done.

## Part of Twake.ai

[Twake.ai](https://twake.ai) is the truly open source and sovereign Digital Workplace developed by [LINAGORA](https://linagora.com): Twake Mail, Twake Calendar, Twake Drive, Twake Chat, Twake Space and Twake Visio with a single account, hosted in France or on your own infrastructure.

Open source MCP servers connect AI assistants to the whole workplace:

| MCP server | Twake.ai service | Protocol |
|---|---|---|
| [mcp-twake-mail](https://github.com/linagora/mcp-twake-mail) | Twake Mail | JMAP |
| [mcp-twake-dav](https://github.com/linagora/mcp-twake-dav) | Twake Calendar and contacts | CalDAV / CardDAV |
| [mcp-twake-drive](https://github.com/linagora/mcp-twake-drive) | Twake Drive | cozy-stack API |
| [mcp-twake-chat](https://github.com/linagora/mcp-twake-chat) | Twake Chat | Matrix (end-to-end encrypted) |
| **mcp-twake-space** (this project) | Twake Space | Twake Space API |

`get_space` returns the ids of a space's Matrix space, team calendar, team mailbox and shared drive: with the other servers, one assistant can catch up on a whole team, from its feed to its conversation and its agenda.

## What it brings

- **Catch up**: "What happened in my spaces since Friday? What is waiting for me?" (approvals asked of you, polls you have not answered, announcements you have not acknowledged).
- **Read a team**: "Who is in the Design space, and what are its latest posts?"
- **Find**: "Find the posts about the budget in the Atlas space since September."
- **Act for you, with your OK each time**: "Vote Tuesday in the seminar poll", "Approve Bob's quote request with the comment OK", "Schedule a one-hour video meeting tomorrow at 2 pm in the Design space".
- **Prepare**: post a message, a poll, a yes/no question, a sign-off request or an announcement.
- **Organise**: create a space, rename it, change its tabs, add members, archive it.
- **Sovereignty**: the server runs next to your assistant and talks directly to your Twake Space.

## Features

### 29 MCP tools

| Category | Tools |
|---|---|
| Account | `whoami` (who the server acts as, approval mode) |
| Spaces | `list_spaces` (active, archived, in the Bin), `get_space` (members, groups, tabs, linked resources) |
| Feed | `get_feed` (category, text, since, pagination), `get_feed_item`, `get_pinned`, `get_unread` ¹, `catch_up` (every space since a date, what waits on you) |
| Notifications | `get_notifications`, `mark_notifications_read` ¹ ⚠️ |
| Directory | `search_directory` (people and groups of the organization) |
| Feed writes ⚠️ | `create_post` (message, poll, yes/no, sign-off request, announcement, feedback request), `edit_post`, `close_post`, `pin_announcement` |
| As you ¹ ⚠️ | `react`, `vote`, `decide_approval`, `answer_feedback`, `acknowledge`, `mark_feed_read`, `schedule_meeting` (video meeting in the team calendar) |
| Administration ⚠️ | `create_space`, `update_space`, `add_members`, `set_member_role` |
| Destructive ⚠️ | `delete_post`, `set_space_state` (archive, Bin, restore), `remove_member` |

⚠️ = asks for your approval first. ¹ = session token only: Twake Space keeps these for a signed-in person and refuses them to API tokens. Read tools carry `readOnlyHint`; write tools carry `openWorldHint`, and destructive ones `destructiveHint`. The server never deletes a space for good.

### Highlights

- **Names, not ids**: spaces and members are found by name, username or email, accents and case ignored; an ambiguous name lists the candidates.
- **Links back to the app**: results carry the URL of the space or its feed.
- **Clear errors**: a missing scope says which one to add; an action Twake Space keeps for signed-in sessions says so.
- **Informed approval**: the prompt quotes the post you vote on, react to or decide on, names the people notified, and carries a unique reference.

## Requirements

- **Node.js** >= 22
- A **Twake Space** account, and either an **OIDC access token** accepted by Twake Space (audience of its backend) or an **API token** (`tws_…`)
- For writes, an MCP client that supports **elicitation** (Hermes Agent, Claude Code, VS Code…), or `TWAKE_SPACE_APPROVAL=client`
- An **MCP client**: Claude Desktop, Claude Code, Hermes Agent, Cursor, VS Code, or any MCP-compatible assistant

## Installation

```bash
npm install -g mcp-twake-space   # or run it on demand with npx -y mcp-twake-space
```

From source:

```bash
git clone https://github.com/linagora/mcp-twake-space.git
cd mcp-twake-space
npm install
npm run build          # then run: node build/index.js
```

## Configuration

### Acting as you (session token)

Twake Space accepts the OIDC access tokens of your identity provider when they carry its audience (the backend's `OIDC_AUDIENCE`, for instance `twake-space`) and the `uuid`, `email`, `sid` and `org_id` claims in userinfo. Ask your identity provider administrator to add that audience and those claims to the OIDC client of your assistant, then give the server a command that prints a fresh access token:

```bash
TWAKE_SPACE_TOKEN_COMMAND="my-token-broker --json"   # prints {"access_token": "...", "expires_at": <epoch s>}
TWAKE_SPACE_OIDC_ISSUER=https://sso.example.com/     # to know who you are (userinfo)
```

Everything is then done as you: posts, votes and decisions carry your name. Every one of them is approved by you first (below).

### Getting an API token

In Twake Space, open **Settings > API tokens** and create a **personal** token. Posts made with it are signed by the token, not by you, and it cannot vote, react, decide, mark as read or schedule meetings. Give it only what the assistant needs:

| Need | Scopes |
|---|---|
| Read spaces, feed and notifications | `space:read`, `feed:read`, `notifications:read` |
| Post in feeds | add `feed:write` |
| Administer spaces and members, search the directory | add `space:write`, `members:write` |

Pick a lifetime (7 to 365 days), copy the token once, and store it in a file only you can read, for instance:

```bash
umask 077; read -rsp "Token: " T; echo; printf %s "$T" > ~/.config/mcp-twake-space/token
```

### Prior approval

With `TWAKE_SPACE_APPROVAL=elicit` (the default), every write tool sends the client an [elicitation](https://modelcontextprotocol.io/specification/draft/client/elicitation) request before it acts, for instance:

```
Twake Space: Vote
As: Alice MARTIN (your account)
Space: Design team
On: Bob DURAND, 2026-11-03 10:00: « Which day for the seminar? »
Choice: Tuesday

Ref. 3f9a1c · Accept to do it now, refuse to cancel.
```

The server acts only on *accept*. On a refusal, a dismissal or a timeout (`TWAKE_SPACE_APPROVAL_TIMEOUT_MS`, 10 minutes by default) it does nothing and tells the assistant not to retry. A client without elicitation support gets an error and nothing is done. Set `TWAKE_SPACE_APPROVAL=client` only when your MCP client asks you to confirm every write tool itself. `USER_LANGUAGE=fr` writes the prompts in French.

### Environment

| Variable | Description | Default |
|---|---|---|
| `TWAKE_SPACE_URL` | Twake Space web app, e.g. `https://space.example.com` | required |
| `TWAKE_SPACE_TOKEN_COMMAND` | Command printing an access token (raw or JSON `{access_token, expires_at}`): OIDC session token or API token | |
| `TWAKE_SPACE_TOKEN_FILE` | File holding the API token (must be `0600`), read at each call | |
| `TWAKE_SPACE_TOKEN` | The token itself (development only) | |
| `TWAKE_SPACE_API_URL` | Backend API when not served under `<TWAKE_SPACE_URL>/api` | `<TWAKE_SPACE_URL>/api` |
| `TWAKE_SPACE_OIDC_ISSUER` | OIDC issuer, to know who you are with a session token | |
| `TWAKE_SPACE_APPROVAL` | `elicit`: the server asks you before every write; `client`: your MCP client does | `elicit` |
| `TWAKE_SPACE_APPROVAL_TIMEOUT_MS` | How long a prompt waits for your answer | `600000` |
| `USER_LANGUAGE` | Language of the prompts, `en` or `fr` | `en` |
| `USER_TIMEZONE` | IANA time zone for dates, e.g. `Europe/Paris` | system time zone |
| `TWAKE_SPACE_TIMEOUT_MS` | HTTP timeout | `30000` |

One of the three token variables is required. `mcp-twake-space check` tests the configuration.

## Use it with your assistant

### Claude Desktop

```json
{
  "mcpServers": {
    "twake-space": {
      "command": "npx",
      "args": ["-y", "mcp-twake-space"],
      "env": {
        "TWAKE_SPACE_URL": "https://space.example.com",
        "TWAKE_SPACE_TOKEN_FILE": "/home/alice/.config/mcp-twake-space/token",
        "USER_TIMEZONE": "Europe/Paris"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add twake-space --scope user \
  -e TWAKE_SPACE_URL=https://space.example.com \
  -e TWAKE_SPACE_TOKEN_FILE=~/.config/mcp-twake-space/token \
  -- npx -y mcp-twake-space
```

### Hermes Agent

Hermes shows the approval prompts in the desktop app, the terminal or on your messaging platform, and declines them where nobody can answer (cron jobs, one-shot queries).

```yaml
mcp_servers:
  twake_space:
    command: npx
    args: ["-y", "mcp-twake-space"]
    env:
      TWAKE_SPACE_URL: https://space.example.com
      TWAKE_SPACE_TOKEN_COMMAND: my-token-broker --json
      TWAKE_SPACE_OIDC_ISSUER: https://sso.example.com/
      TWAKE_SPACE_APPROVAL_TIMEOUT_MS: "330000"
      USER_LANGUAGE: fr
      USER_TIMEZONE: Europe/Paris
    timeout: 420            # longer than the approval wait
    elicitation:
      enabled: true
      timeout: 300
```

## Recommended safe configuration

- Give the token only the scopes you need (read only to start), and the shortest lifetime you can live with.
- Keep `TWAKE_SPACE_APPROVAL=elicit`: every write waits for your explicit OK, whatever the assistant decides. For a read-only assistant, also exclude the write tools in your MCP client.
- Read each prompt: it says who acts (you, or the token), where, and exactly what.
- Feed posts, card titles and previews are written by other people and apps (prompt injection): see [SECURITY.md](SECURITY.md).

## Limits

- With an API token, Twake Space refuses the unread counts, marking as read, reactions, votes, decisions, feedback answers, acknowledgements and meetings: use a session token for them. `catch_up` works with both.
- `schedule_meeting` asks the team calendar to create the meeting; Twake Space has no API to cancel it: cancel it in Twake Calendar.

## Usage examples

- "What happened in my spaces since Friday, and what is waiting for me?"
- "Summarise the Design space feed for this week."
- "Which approvals are pending in the Atlas space?"
- "Who are the members of the Sales space, and what is its Matrix space id?"
- "Approve Bob's sign-off request on the quote, with the comment: OK for me."
- "Schedule a one-hour video meeting tomorrow at 2 pm in the Design space."
- "Create a space Onboarding with chat, drive and calendar, and add Bob as editor."

## Troubleshooting

| Symptom | Fix |
|---|---|
| `TWAKE_SPACE_URL is required` | Set the web app URL. |
| `HTTP 401 unauthorized` | The token is invalid, expired or revoked: create a new one. A session token must carry the Twake Space audience. |
| `HTTP 403 forbidden` with a session token | Userinfo lacks `org_id`: ask your identity provider administrator. |
| `cannot ask the user for approval` | Your MCP client does not support elicitation: use one that does, or `TWAKE_SPACE_APPROVAL=client` if it confirms writes itself. |
| `insufficient_scope` | The error names the missing scope: create a token with it. |
| `must not be readable by other users` | `chmod 600` the token file. |
| A space is not found | `list_spaces` shows what the token reaches; a token can cover a list of spaces only. |

## Development

```bash
npm install
npm run build
npm test                 # Vitest, with a fake Twake Space backend
LIVE_SPACE='<space where you are alone>' TWAKE_SPACE_URL=… TWAKE_SPACE_TOKEN_FILE=… node scripts/live.mjs          # API token
LIVE_SPACE='<space where you are alone>' TWAKE_SPACE_URL=… TWAKE_SPACE_TOKEN_COMMAND=… node scripts/live-session.mjs  # as you, with prompts
```

## Contributing

Contributions are welcome: read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md). Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Release notes are in [CHANGELOG.md](CHANGELOG.md).

## License

Licensed under the **GNU Affero General Public License v3.0** ([AGPL-3.0](LICENSE)).

Copyright © 2026 [LINAGORA](https://linagora.com)

## About

`mcp-twake-space` is developed by [LINAGORA](https://linagora.com), French open source software publisher, as part of [Twake.ai](https://twake.ai). For support, hosting or integration of Twake.ai and its AI connectors, contact LINAGORA at [https://linagora.com](https://linagora.com).
