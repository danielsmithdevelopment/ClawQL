# ClawQL on macOS — Tunnels, Launchd, and Auth (Runbook)

Make **`clawql-mcp-http`** survive restarts, auto-restart on crash, and be
reachable from cloud agents (Grok Build Connectors, Cursor, remote IDEs) over a
stable HTTPS URL — on a Mac, **no k8s / no sudo / no docker**.

The two moving parts:

| Part                           | What it does                                                                                | Supervisor                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `com.clawql.mcp-http`          | runs `node bin/clawql-mcp-http.mjs` with gateway **auth on**, auto-restarts                 | launchd `KeepAlive`                           |
| `com.clawql.cloudflare-tunnel` | publishes `127.0.0.1:8080` to the internet (durable named tunnel, or quick tunnel fallback) | launchd `KeepAlive`, depends on tunnel + auth |

Auth is the hard requirement: **never** put a tunnel in front of `noAuth`. Both
launchd plists source the repo `.env` (`CLAWQL_AUTH_MODE=*** + `CLAWQL_API_KEY`)
at runtime; the secret lives only in `.env`(gitignored) and — for tunnel
credentials — in`~/.cloudflared/` (600).

---

## 1. One-time prerequisites

```bash
brew install node                    # /opt/homebrew/bin/node (in LaunchAgent PATH)
brew install cloudflared             # tunnel runner
node --version                       # v24+
```

Make sure the repo `.env` has the auth pair (values are local-only):

```bash
# in ClawQL/.env (gitignored)
CLAWQL_AUTH_MODE=***
CLAWQL_API_KEY=clawql_…strong
```

Generate a strong key: `node -p "require('crypto').randomBytes(36).toString('base64url')" | sed 's/^/clawql_/'`

## 2. Install the services (renders + loads launchd agents)

```bash
cd ClawQL
scripts/macos/install-macos-services.sh
```

What it does:

- Renders `scripts/macos/*.template` into `~/Library/LaunchAgents/com.clawql.*.plist`
  (placeholders `__CLAWQL_HOME__`, `__RUN_MCP__` etc. are substituted)
- Bootstraps both into `gui/$UID` (per-user, no `sudo`)
- `launchctl kickstart -k` starts both

Logs: `~/Library/Logs/clawql/mcp-http.out.log`, `tunnel.out.log`.

Operate on the services:

```bash
scripts/macos/install-macos-services.sh --status   # are both LOADED?
scripts/macos/install-macos-services.sh --stop     # + remove plists
# single-service restart (no need to re-render):
launchctl kickstart -k "gui/$(id -u)/com.clawql.mcp-http"
```

## 3. Verify

**Local — 401 without key, 200 with key:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8080/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","clientInfo":{"name":"x","version":"0"},"capabilities":{}}}'
# → 401

curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8080/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H "Authorization: Bearer $CLAWQL_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","clientInfo":{"name":"x","version":"0"},"capabilities":{}}}'
# → 200
```

**Remote (through the tunnel):** same two curl requests against the public host
(`https://mcp.clawql.com/mcp` for the named tunnel, or the `trycloudflare.com`
host shown in `~/Library/Logs/clawql/tunnel.out.log` for the quick fallback).

## 4. Cloudflare tunnel — pick one track

### Track A — Durable named tunnel (stable URL, recommended for connectors)

```bash
cloudflared tunnel login            # browser → account auth (saves to ~/.cloudflared/credentials.json)
cloudflared tunnel create clawql-mcp
cloudflared tunnel route dns clawql-mcp mcp.clawql.com
# then restart the supervisor to adopt the named tunnel:
launchctl kickstart -k "gui/$(id -u)/com.clawql.cloudflare-tunnel"
```

After that, `https://mcp.clawql.com/mcp` is the stable URL.

### Track B — Quick tunnel (ephemeral, zero-config)

The supervisor already falls back to this automatically when no named tunnel is
configured. The **URL is logged** and changes every restart — fine for one-off
tests, not for a connector that caches the endpoint:

```bash
grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' ~/Library/Logs/clawql/tunnel.out.log | tail -1
```

### Track C — Tailscale (private: tailnet only)

Best for _your own_ devices (laptop, phone, homelab VMs) that don't need
public internet egress. Not an option for cloud agents that can't reach your
tailnet.

```bash
# needs the tailscaled system service (sudo, run interactively in a real terminal):
sudo /opt/homebrew/opt/tailscale/bin/tailscaled --state=/var/lib/tailscale/tailscaled.state \
  --socket=/var/run/tailscale/tailscaled.sock &
# in a real browser: tailscale login  (QR)
tailscale serve --bg --https 8080   # publishes https://<host>.<tailnet>.ts.net
```

## 5. Wire clients to the auth-required endpoint

MCP clients that speak HTTP need the header on every request.

**Hermes** (`ClawQL/.local-hermes/config.yaml` — `mcp_servers` entries support `headers`):

```yaml
mcp_servers:
  clawql:
    url: "http://127.0.0.1:8080/mcp" # or https://mcp.clawql.com/mcp
    headers:
      Authorization: "Bearer clawql_…"
    skip_preflight: true
    connect_timeout: 30
    timeout: 180
```

**Cursor** (`~/.cursor/mcp.json` or project-level `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "clawql": {
      "url": "https://mcp.clawql.com/mcp",
      "headers": {
        "Authorization": "***"
      }
    }
  }
}
```

**Any MCP SDK / `Grok Build Connector`** — attach `Authorization: Bearer <key>`
(or `x-api-key: <key>`) to every request. `ClawQL` accepts either; **the
`Authorization: Bearer` path is what `clawql-auth`'s gateway prefers.**

## 6. Rotate the key

1. Regenerate `CLAWQL_API_KEY` in `.env`.
2. Update every client config (`Hermes config set`, `~/.cursor/mcp.json`,
   any connector env vars).
3. `launchctl kickstart -k "gui/$(id -u)/com.clawql.mcp-http"` (the tunnel
   doesn't need a restart — it's stateless).

**If a key leaks:** same steps, but assume the compromised value is dead on the
server and rotate the live one first, then patch clients.

## 7. Troubleshooting

| Symptom                                                                 | Check                                                                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `401` from cloud agent on the public URL                                | Key in the connector doesn't match `CLAWQL_API_KEY`. Compare (length + first 8 chars) on both sides.                              |
| Public URL works, `mcp.clawql.com` doesn't (or returns Cloudflare 1xxx) | Named tunnel not configured, or route DNS missing. `cloudflared tunnel list` + `cloudflared tunnel info clawql-mcp`.              |
| Local MCP dead and tunnel is 502-ing                                    | `launchctl kickstart -k "gui/$(id -u)/com.clawql.mcp-http"`; then `tail -n 50 ~/Library/Logs/clawql/mcp-http.err.log`.            |
| `dist/server-http.js` missing (module resolution error)                 | `cd ClawQL && npm run build`; the runner script does this automatically when missing.                                             |
| launchd says "5" (SIGKILL) on mcp-http                                  | Memory pressure or `sudo`-only path. Look at `~/Library/Logs/clawql/mcp-http.err.log`.                                            |
| Both plists in `launchctl list` are `-` (no pid)                        | `launchctl print "gui/$(id -u)/com.clawql.mcp-http"` for last exit status; rerun `install-macos-services.sh` to re-render plists. |

## 8. Uninstall

```bash
scripts/macos/install-macos-services.sh --stop
# plists removed from ~/Library/LaunchAgents/, processes killed.
# To keep local data intact, do nothing else.
# To fully reset: rm -rf ~/Library/Logs/clawql
```

## 9. Repo layout (this feature)

```
scripts/macos/
  com.clawql.mcp-http.plist.template        # template; rendered to ~/Library/LaunchAgents by installer
  com.clawql.cloudflare-tunnel.plist.template
  install-macos-services.sh                 # template renderer + launchctl bootstrap/kickstart
  run-mcp.sh                                # sources .env and execs node bin/clawql-mcp-http.mjs
  run-tunnel.sh                             # prefers named tunnel, falls back to quick tunnel
.env.example                                # CLAWQL_AUTH_MODE=*** + CLAWQL_API_KEY=***
.gitignore                                  # guards .env, .local-hermes/, .local-clawql/
```

## Related

- `docs/deployment/tailscale-and-headscale-for-clawql.md` — private-tailnet option
- `docs/deployment/cloud-agent-r2-tailscale-runbook.md` — Cloud Agents + Tailscale
- `docs/deployment/vault-provider-secrets.md` — Vault-backed secrets (for the managed k8s flavor)
- `packages/clawql-auth/src/gateway.ts` — gateway auth implementation
