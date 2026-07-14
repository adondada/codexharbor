# Changelog

All notable changes are documented here.

## [0.1.3] - 2026-07-14

### Fixed

- Normalized historical Codex thread, turn, and item schemas before rendering
- Prevented structured protocol objects from being passed directly to React as children
- Added render-safe handling for old messages, commands, file changes, approvals, models, diagnostics, and account fields
- Added a top-level error boundary so one malformed thread cannot blank the entire application
- Added a legacy-schema demo fixture for regression testing

## [0.1.2] - 2026-07-14

### Fixed

- Built renderer assets with relative `./assets/` URLs so packaged Electron apps can load them over `file://`
- Added a production-build verification step that rejects root-relative renderer asset paths

## [0.1.1] - 2026-07-13

### Fixed

- Added the Debian package maintainer email required by Electron Builder
- Added Linux desktop metadata so AppImage and `.deb` windows associate correctly
- Reworked bootstrap so model, account, rate-limit, and thread requests fail independently
- Added persistent bootstrap errors, retry controls, and useful connection diagnostics
- Requested all Codex model providers and documented thread source kinds, with an older-server fallback
- Added an explicit server-default model option and project-directory setup warning
- Corrected the account label when OpenAI authentication is not required

### Changed

- Moved source builds and GitHub Actions to Node.js 24
- Updated direct dependencies and TypeScript definitions
- Updated GitHub Actions to Node 24-era major versions
- Made the VPS default project directory required for newly saved hosts

## [0.1.0] - 2026-07-13

### Added

- Electron desktop client for remote Codex App Server sessions over SSH
- Encrypted host profiles with private-key, password, and SSH-agent authentication
- Optional SHA-256 SSH host-key pinning
- Thread creation, listing, search, history loading, resumption, interruption, and archiving
- Streaming assistant output, plans, reasoning summaries, command output, file changes, and tool activity
- Command, file-change, permission, user-input, and MCP elicitation approval surfaces
- Device-code ChatGPT authentication for the remote Codex CLI
- Windows NSIS and portable builds plus Linux AppImage and Debian builds
- GitHub Actions validation and release workflows
