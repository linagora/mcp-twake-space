# Security Policy

mcp-twake-space gives an AI assistant access to the team spaces of [Twake.ai](https://twake.ai): their members, their feed and, when allowed, posting and administration. We take its security seriously and thank everyone who reports issues responsibly.

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | ✅ |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions or pull requests.**

Report them privately, by one of these channels:

1. GitHub private vulnerability reporting: [Report a vulnerability](https://github.com/linagora/mcp-twake-space/security/advisories/new);
2. email to **dpo@linagora.com**.

Please include the affected version or commit, a description of the issue and its impact, steps to reproduce, and any suggested fix. We will acknowledge your report within **5 business days** and agree with you on a disclosure date once a fix is available.

## Security model and hardening

- **API token**: the server acts with a personal Twake Space API token (`tws_…`). Give it the smallest scopes and lifetime you can, cover a list of spaces when possible, and revoke it in Twake Space (Settings > API tokens) when you stop using it. Twake Space keeps an audit log of token creation and revocation.
- **Token file**: `TWAKE_SPACE_TOKEN_FILE` must be readable by you only (`0600`): the server refuses a file readable by others. The token is never logged nor returned by a tool.
- **Writing**: `create_post`, `edit_post`, `close_post`, `delete_post`, `create_space`, `update_space`, `set_space_state`, `add_members`, `set_member_role` and `remove_member` are visible to the members of the space; `delete_post` and `remove_member` cannot be undone from the server. Exclude them in your MCP client for an unattended assistant, or require a confirmation. Posts made with an API token are signed by the token, not by the person. The server never deletes a space for good.
- **Prompt injection**: posts, poll options, card titles and previews are written by other people and apps. MCP clients should treat them as data, never as instructions.
- **Transport**: HTTPS only (plain HTTP is accepted for `localhost`).
