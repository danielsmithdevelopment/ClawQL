# ClawQL Desktop (macOS · Windows · Linux)

Native desktop app wrapping the ClawQL dashboard: **Provider secrets** (local `~/.ClawQL/vault/providers.json`) and **Agent Chat** (OpenClaw bridge).

> **No code-signing or store accounts needed for local work.**  
> See **[LOCAL.md](LOCAL.md)** — `npm run dev` / `make desktop-dev`.  
> Signing is only for publishing installers later.

| Platform | Artifact | Script |
| -------- | -------- | ------ |
| macOS 13+ | `.dmg` | `npm run dist:mac` |
| Windows 10+ | NSIS `.exe` installer | `npm run dist:win` |
| Linux | `.AppImage` + `.deb` | `npm run dist:linux` |
| All (cross-host where supported) | combined | `npm run dist:all` |

## Prerequisites

- **Node.js 22+**
- **OpenClaw** on `PATH` for Agent Chat (`openclaw` CLI + model auth)
- Platform toolchain for the target you build (Apple signing for distribution DMGs; Windows can be built on Win or via electron-builder from CI/Linux with caveats)

## Development

From repo root (with dashboard deps installed):

```bash
cd apps/dashboard && npm install && cd ../desktop && npm install
npm run dev
```

This starts:

1. OpenClaw chat bridge on `127.0.0.1:8787`
2. Dashboard on `127.0.0.1:3040` with `CLAWQL_DESKTOP_MODE=1`
3. Electron window loading the dashboard

Or from repo root: `make desktop-dev`.

## Packaged builds

```bash
cd apps/desktop
npm install
npm test                 # paths + packaging metadata
npm run dist:mac         # → dist/ClawQL-*.dmg
npm run dist:win         # → dist/ClawQL-Setup-*.exe
npm run dist:linux       # → dist/ClawQL-*.AppImage + .deb
```

Each `dist:*` script runs `prepare:standalone` (dashboard production build → `standalone/dashboard/`) then **electron-builder**.

## Code signing

| Platform | Notes |
| -------- | ----- |
| macOS | Developer ID Application + notarization (`CSC_LINK`, `CSC_KEY_PASSWORD`, `notarytool`) — see [clawql-desktop.md](../../docs/design/clawql-desktop.md) |
| Windows | Optional Authenticode (`CSC_LINK` / Azure Trusted Signing) for SmartScreen |
| Linux | AppImage/deb unsigned is fine for clawql.com downloads; optional GPG for apt later |

CI runs packaging **metadata** checks on every PR that touches `apps/desktop`. Full signed store/site artifacts remain a human release step.

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLAWQL_OBSIDIAN_VAULT_PATH` | `~/.ClawQL` | Vault root (chats + provider secrets) |
| `CLAWQL_OPENCLAW_AGENT_ID` | `main` | OpenClaw agent id |
| `OPENCLAW_CHAT_BRIDGE_PORT` | `8787` | Bridge listen port |

## vs Kubernetes dashboard

| Feature | Desktop | Helm dashboard |
|---------|---------|----------------|
| Provider secrets | `~/.ClawQL/vault/providers.json` | Vault KV → K8s Secret |
| Agent Chat | Local OpenClaw bridge | Sidecar / external URL |
| kubectl | Not required | Required for secret sync |
