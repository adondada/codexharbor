# Contributing to CodexHarbor

Thanks for improving the project.

## Before opening a pull request

1. Search existing issues and pull requests.
2. Keep the change focused on one problem.
3. Do not introduce a hosted relay, telemetry, or a publicly exposed App Server listener.
4. Do not commit credentials, private keys, access tokens, VPS addresses, or user data.
5. Run:

   ```bash
   npm install
   npm run check
   ```

## Development

```bash
npm install
npm run dev
```

The application has three trust zones:

- `src/renderer`: untrusted UI surface with no Node.js access
- `src/preload`: narrow typed IPC bridge
- `src/main`: SSH, credential storage, and Codex protocol transport

Keep privileged operations out of the renderer. Add a narrowly scoped IPC method instead of exposing generic filesystem, shell, or Electron APIs.

## Pull requests

Include:

- the problem being solved,
- the approach taken,
- security implications,
- manual test steps,
- screenshots for visible UI changes.

Use conventional-style commit subjects when practical, for example:

```text
feat: add jump-host support
fix: reject mismatched SSH fingerprints
chore: update Electron
```

## Reporting security problems

Do not open a public issue for a vulnerability. Follow [SECURITY.md](SECURITY.md).
