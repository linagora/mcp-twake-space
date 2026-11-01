# Changelog

All notable changes to mcp-twake-space are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-01

### Added
- Acting as the user with an OIDC session token (`TWAKE_SPACE_TOKEN_COMMAND`); `TWAKE_SPACE_OIDC_ISSUER` tells the server who the user is.
- Prior approval of every write by the user, asked by the server itself through MCP elicitation (`TWAKE_SPACE_APPROVAL=elicit`, the default): exact action, identity, space and a unique reference; fails closed. `TWAKE_SPACE_APPROVAL=client` leaves it to the MCP client. Prompts in English or French (`USER_LANGUAGE`).
- Session tools: `get_unread`, `react`, `vote`, `decide_approval`, `answer_feedback`, `acknowledge`, `mark_feed_read`, `mark_notifications_read`, `schedule_meeting` (video meeting in the team calendar); `pin_announcement` for both token kinds.

### Changed
- `whoami` reports the mode (session or API token) and the approval mode.
- Write tools read the item they act on first, to quote it in the approval prompt.

## [0.1.0] - 2026-11-01

### Added
- First release, on the Twake Space backend API with a personal API token (`TWAKE_SPACE_TOKEN_FILE`, `TWAKE_SPACE_TOKEN_COMMAND` or `TWAKE_SPACE_TOKEN`).
- Read tools: `whoami`, `list_spaces`, `get_space` (members, groups, tabs, linked resources for the other Twake MCP servers), `get_feed`, `get_feed_item`, `get_pinned`, `catch_up` (every space since a date, and what waits on you), `get_notifications`, `search_directory`.
- Feed writes: `create_post` (message, poll, yes/no question, approval request, announcement, feedback request), `edit_post`, `close_post`, `delete_post`.
- Space administration: `create_space`, `update_space`, `set_space_state`, `add_members`, `set_member_role`, `remove_member`.
- `mcp-twake-space check` tests the configuration.
