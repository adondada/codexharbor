# Security Policy

## Supported versions

Only the latest tagged release receives security fixes during the preview phase.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting feature:

`https://github.com/adondada/codexharbor/security/advisories/new`

Include reproduction steps, affected versions, likely impact, and any proposed mitigation. Do not include real credentials or production private keys.

Please do not file a public issue until a fix is available.

## Scope

Security-sensitive areas include:

- SSH host verification and authentication
- encrypted credential storage
- Electron IPC boundaries
- renderer isolation
- JSON-RPC request handling
- approval decisions
- command and filesystem permission boundaries
- accidental exposure of Codex App Server
