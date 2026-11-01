# mcp-twake-space

[![npm version](https://img.shields.io/npm/v/mcp-twake-space.svg)](https://www.npmjs.com/package/mcp-twake-space) [![CI](https://github.com/linagora/mcp-twake-space/actions/workflows/ci.yml/badge.svg)](https://github.com/linagora/mcp-twake-space/actions/workflows/ci.yml) [![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE) [![Node.js >= 22](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)

**Give your AI assistant secure access to Twake Space, the team spaces of the [Twake.ai](https://twake.ai) Digital Workplace: spaces, members, feed and the resources each space gathers.**

## What is it?

`mcp-twake-space` is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. MCP is the open standard that lets AI assistants (Claude Desktop, Claude Code, Hermes Agent, Cursor, VS Code and many others) use external tools. This server exposes your Twake Space to the assistant as **19 tools**: spaces, members, feed (posts, polls, approvals, announcements, activity cards), notifications and, when you allow it, posting and space administration.

Twake Space gives each team one place for its chat, tasks, drive, mail and calendar. The server talks to the Twake Space backend API, with a personal API token you create and can revoke at any time.

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
- **Prepare**: post a message, a poll, a yes/no question, an approval request or an announcement, once you allow it. Posts made with an API token are signed by the token, not by you.
- **Organise**: create a space, rename it, change its tabs, add members, archive it.
- **Sovereignty**: the server runs next to your assistant and talks directly to your Twake Space.

## Features

### 19 MCP tools

| Category | Tools |
|---|---|
| Account | `whoami` (token, scopes, expiry) |
| Spaces | `list_spaces` (active, archived, in the Bin), `get_space` (members, groups, tabs, linked resources) |
| Feed | `get_feed` (category, text, since, pagination), `get_feed_item`, `get_pinned`, `catch_up` (every space since a date, what waits on you) |
| Notifications | `get_notifications` |
| Directory | `search_directory` (people and groups of the organization) |
| Feed writes ⚠️ | `create_post` (message, poll, yes/no, approval, announcement, feedback), `edit_post`, `close_post` |
| Administration ⚠️ | `create_space`, `update_space`, `add_members`, `set_member_role` |
| Destructive ⚠️ | `delete_post`, `set_space_state` (archive, Bin, restore), `remove_member` |

⚠️ = visible to the members of the space. Read tools carry `readOnlyHint`; write tools carry `openWorldHint`, and destructive ones `destructiveHint`, so clients can ask for confirmation. The server never deletes a space for good.

### Highlights

- **Names, not ids**: spaces and members are found by name, username or email, accents and case ignored; an ambiguous name lists the candidates.
- **Links back to the app**: results carry the URL of the space or its feed.
- **Clear errors**: a missing scope says which one to add; an action Twake Space keeps for signed-in sessions says so.

## Requirements

- **Node.js** >= 22
- A **Twake Space** account and an **API token** (`tws_…`)
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

### Getting an API token

In Twake Space, open **Settings > API tokens** and create a **personal** token. Give it only what the assistant needs:

| Need | Scopes |
|---|---|
| Read spaces, feed and notifications | `space:read`, `feed:read`, `notifications:read` |
| Post in feeds | add `feed:write` |
| Administer spaces and members, search the directory | add `space:write`, `members:write` |

Pick a lifetime (7 to 365 days), copy the token once, and store it in a file only you can read, for instance:

```bash
umask 077; read -rsp "Token: " T; echo; printf %s "$T" > ~/.config/mcp-twake-space/token
```

### Environment

| Variable | Description | Default |
|---|---|---|
| `TWAKE_SPACE_URL` | Twake Space web app, e.g. `https://space.example.com` | required |
| `TWAKE_SPACE_TOKEN_FILE` | File holding the API token (must be `0600`), read at each call | |
| `TWAKE_SPACE_TOKEN_COMMAND` | Command printing an access token (raw or JSON `{access_token, expires_at}`) | |
| `TWAKE_SPACE_TOKEN` | The token itself (development only) | |
| `TWAKE_SPACE_API_URL` | Backend API when not served under `<TWAKE_SPACE_URL>/api` | `<TWAKE_SPACE_URL>/api` |
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

```yaml
mcp_servers:
  twake_space:
    command: npx
    args: ["-y", "mcp-twake-space"]
    env:
      TWAKE_SPACE_URL: https://space.example.com
      TWAKE_SPACE_TOKEN_FILE: /home/alice/.config/mcp-twake-space/token
      USER_TIMEZONE: Europe/Paris
    tools:
      exclude: [create_post, edit_post, close_post, delete_post, create_space, update_space, set_space_state, add_members, set_member_role, remove_member]   # read only
```

## Recommended safe configuration

- Give the token only the scopes you need (read only to start), and the shortest lifetime you can live with.
- For an assistant that acts on its own, keep it read only: exclude the write tools in your MCP client (example above). Otherwise, ask it to show the space and the exact post or change and to wait for your OK.
- Feed posts, card titles and previews are written by other people and apps (prompt injection): see [SECURITY.md](SECURITY.md).

## Limits

Twake Space keeps some actions for signed-in sessions, and refuses them to every API token: the unread count per space, marking as read, reactions, votes, approval decisions, feedback answers, acknowledgements and scheduling a meeting. `catch_up` computes what waits on you from the feed instead. These tools will come once the server can use a session token (`TWAKE_SPACE_TOKEN_COMMAND` with an OIDC broker whose tokens carry the Space audience).

## Usage examples

- "What happened in my spaces since Friday, and what is waiting for me?"
- "Summarise the Design space feed for this week."
- "Which approvals are pending in the Atlas space?"
- "Who are the members of the Sales space, and what is its Matrix space id?"
- "Create a space Onboarding with chat, drive and calendar, and add Bob as editor."

## Troubleshooting

| Symptom | Fix |
|---|---|
| `TWAKE_SPACE_URL is required` | Set the web app URL. |
| `HTTP 401 unauthorized` | The token is invalid, expired or revoked: create a new one. |
| `insufficient_scope` | The error names the missing scope: create a token with it. |
| `must not be readable by other users` | `chmod 600` the token file. |
| A space is not found | `list_spaces` shows what the token reaches; a token can cover a list of spaces only. |

## Development

```bash
npm install
npm run build
npm test                 # Vitest, with a fake Twake Space backend
LIVE_SPACE='<space where you are alone>' TWAKE_SPACE_URL=… TWAKE_SPACE_TOKEN_FILE=… node scripts/live.mjs
```

## Contributing

Contributions are welcome: read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md). Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Release notes are in [CHANGELOG.md](CHANGELOG.md).

## License

Licensed under the **GNU Affero General Public License v3.0** ([AGPL-3.0](LICENSE)).

Copyright © 2026 [LINAGORA](https://linagora.com)

## About

`mcp-twake-space` is developed by [LINAGORA](https://linagora.com), French open source software publisher, as part of [Twake.ai](https://twake.ai). For support, hosting or integration of Twake.ai and its AI connectors, contact LINAGORA at [https://linagora.com](https://linagora.com).
