# Changelog

All notable changes to mcp-twake-space are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-01

### Added
- First release, on the Twake Space backend API with a personal API token (`TWAKE_SPACE_TOKEN_FILE`, `TWAKE_SPACE_TOKEN_COMMAND` or `TWAKE_SPACE_TOKEN`).
- Read tools: `whoami`, `list_spaces`, `get_space` (members, groups, tabs, linked resources for the other Twake MCP servers), `get_feed`, `get_feed_item`, `get_pinned`, `catch_up` (every space since a date, and what waits on you), `get_notifications`, `search_directory`.
- Feed writes: `create_post` (message, poll, yes/no question, approval request, announcement, feedback request), `edit_post`, `close_post`, `delete_post`.
- Space administration: `create_space`, `update_space`, `set_space_state`, `add_members`, `set_member_role`, `remove_member`.
- `mcp-twake-space check` tests the configuration.
