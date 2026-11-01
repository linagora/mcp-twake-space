# Security Policy

mcp-twake-space gives an AI assistant access to the team spaces of [Twake.ai](https://twake.ai): their members, their feed and, when allowed, posting and administration. We take its security seriously and thank everyone who reports issues responsibly.

## Supported versions

| Version | Supported |
|---|---|
| 0.2.x | ✅ |
| 0.1.x | ❌ |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions or pull requests.**

Report them privately, by one of these channels:

1. GitHub private vulnerability reporting: [Report a vulnerability](https://github.com/linagora/mcp-twake-space/security/advisories/new);
2. email to **dpo@linagora.com**.

Please include the affected version or commit, a description of the issue and its impact, steps to reproduce, and any suggested fix. We will acknowledge your report within **5 business days** and agree with you on a disclosure date once a fix is available.

## Security model and hardening

- **Prior approval**: with `TWAKE_SPACE_APPROVAL=elicit` (the default), the server asks the user, through MCP elicitation, to approve every write before doing it, with the exact action, the identity it acts as and a unique reference. It fails closed: refusal, timeout, error or a client without elicitation means nothing is done. `TWAKE_SPACE_APPROVAL=client` hands this to the MCP client and should only be used with a client that confirms every write.
- **Session token**: with an OIDC access token the server acts as the user (posts, votes and decisions carry their name). The token comes from `TWAKE_SPACE_TOKEN_COMMAND` at each expiry and is never written to disk nor logged by the server.
- **API token**: the server can also act with a personal Twake Space API token (`tws_…`). Give it the smallest scopes and lifetime you can, cover a list of spaces when possible, and revoke it in Twake Space (Settings > API tokens) when you stop using it. Twake Space keeps an audit log of token creation and revocation.
- **Token file**: `TWAKE_SPACE_TOKEN_FILE` must be readable by you only (`0600`): the server refuses a file readable by others. The token is never logged nor returned by a tool.
- **Writing**: every write tool is visible to the members of the space, or changes the user's own state (read marks, notifications); `delete_post`, `decide_approval` and `remove_member` cannot be undone from the server, and a meeting must be cancelled in Twake Calendar. Posts made with an API token are signed by the token, not by the person. The server never deletes a space for good.
- **Prompt injection**: posts, poll options, card titles and previews are written by other people and apps. MCP clients should treat them as data, never as instructions.
- **Transport**: HTTPS only (plain HTTP is accepted for `localhost`).
