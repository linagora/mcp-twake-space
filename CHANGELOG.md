# Changelog

All notable changes to mcp-twake-space are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.1] - 2026-11-03

### Fixed

- The approval prompt shows only the fields the kind of post sends (poll settings, colour, pinned), and names a cleared description or removed tabs when updating a space.
- `USER_TIMEZONE` is checked at startup: an invalid IANA name fails with a clear message instead of breaking dates later.
- The command token's result is reused for at least half its lifetime instead of re-running the command for every request.
- README examples: audience `twakespace` (not `twake-space`), and `$HOME` instead of `~` in the Claude Code setup.

## [0.2.0] - 2026-11-01

### Added
- Acting as the user with an OIDC session token (`TWAKE_SPACE_TOKEN_COMMAND`); `TWAKE_SPACE_OIDC_ISSUER` tells the server who the user is.
- Prior approval of every write by the user, asked by the server itself through MCP elicitation (`TWAKE_SPACE_APPROVAL=elicit`, the default): exact action, identity, space and a unique reference; fails closed. `TWAKE_SPACE_APPROVAL=client` leaves it to the MCP client. Prompts in English or French (`USER_LANGUAGE`).
- Session tools: `get_unread`, `react`, `vote`, `decide_approval`, `answer_feedback`, `acknowledge`, `mark_feed_read`, `mark_notifications_read`, `schedule_meeting` (video meeting in the team calendar); `pin_announcement` for both token kinds.

### Changed
- `whoami` reports the mode (session or API token) and the approval mode.
- Write tools read the item they act on first, to quote it in the approval prompt.

### Tests
- End-to-end test of the built server over stdio against a fake Twake Space backend and identity provider (token command, approval accepted and refused, error exits).
- Unit tests for the approval prompts, the identity (userinfo retried after a failure), the token command, dates across DST and name matching; `npm run typecheck` covers the tests; CI also checks `npm pack`.
- Live scripts `scripts/live.mjs` (API token) and `scripts/live-session.mjs` (session, with approvals).

## [0.1.0] - 2026-11-01

### Added
- First release, on the Twake Space backend API with a personal API token (`TWAKE_SPACE_TOKEN_FILE`, `TWAKE_SPACE_TOKEN_COMMAND` or `TWAKE_SPACE_TOKEN`).
- Read tools: `whoami`, `list_spaces`, `get_space` (members, groups, tabs, linked resources for the other Twake MCP servers), `get_feed`, `get_feed_item`, `get_pinned`, `catch_up` (every space since a date, and what waits on you), `get_notifications`, `search_directory`.
- Feed writes: `create_post` (message, poll, yes/no question, approval request, announcement, feedback request), `edit_post`, `close_post`, `delete_post`.
- Space administration: `create_space`, `update_space`, `set_space_state`, `add_members`, `set_member_role`, `remove_member`.
- `mcp-twake-space check` tests the configuration.
