# ClawQL Desktop (macOS)

Native macOS app wrapping the ClawQL dashboard: **Provider secrets** (local `~/.ClawQL/vault/providers.json`) and **Agent Chat** (OpenClaw bridge).

## Prerequisites

- **Node.js 22+**
- **OpenClaw** on `PATH` for Agent Chat (`openclaw` CLI + model auth)
- macOS 13+ (Apple Silicon or Intel)

## Development

From repo root (with dashboard deps installed):

```bash
cd dashboard && npm install && cd ../desktop && npm install
npm run dev
```

This starts:

1. OpenClaw chat bridge on `127.0.0.1:8787`
2. Dashboard on `127.0.0.1:3040` with `CLAWQL_DESKTOP_MODE=1`
3. Electron window loading the dashboard

## Build `.dmg` (local)

```bash
cd desktop
npm install
npm run dist:mac
```

Output: `desktop/dist/ClawQL-<version>.dmg`

The build script runs `dashboard` production build, copies Next.js **standalone** output into `desktop/standalone/`, and packages it via **electron-builder**.

## Code signing / notarization

CI does not sign macOS builds yet. For distribution from clawql.com:

1. Apple Developer ID Application certificate
2. `CSC_LINK` / `CSC_KEY_PASSWORD` for electron-builder
3. `notarytool` notarization + staple

See [clawql-desktop-macos.md](../docs/design/clawql-desktop-macos.md).

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
