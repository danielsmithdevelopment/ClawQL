#!/usr/bin/env bash
# Cloudflare tunnel runner for launchd.
#
# If ~/.cloudflared/credentials.json + clawql-mcp.json exist (set up via
# `cloudflared tunnel login` + `cloudflared tunnel create clawql-mcp`) it runs
# the durable named tunnel — the stable https://mcp.clawql.com/mcp URL.
#
# If no named tunnel is configured yet (credentials.json missing) it falls back
# to a Cloudflare quick tunnel (https://<random>.trycloudflare.com/mcp).  The
# URL changes every restart; print/log it so it can be pasted into the connector.
#
# Setup (one-time, needs browser):
#   cloudflared tunnel login
#   cloudflared tunnel create clawql-mcp
#   cloudflared tunnel route dns clawql-mcp mcp.clawql.com
#
# Logs: ~/Library/Logs/clawql/tunnel.out.log / tunnel.err.log
set -uo pipefail

CF_BIN="${CLOUDFLARE_BIN:-/opt/homebrew/bin/cloudflared}"
CF_HOME="$HOME/.cloudflared"
TUNNEL_NAME="${CLAWQL_TUNNEL_NAME:-clawql-mcp}"
BACKEND_URL="${CLAWQL_TUNNEL_TARGET:-http://127.0.0.1:8080}"

log() { echo "[clawql-tunnel] $*" >&2; }

named_ready() {
  [ -f "$CF_HOME/credentials.json" ] && [ -f "$CF_HOME/${TUNNEL_NAME}.json" ]
}

if named_ready; then
  log "Running durable named tunnel '$TUNNEL_NAME' → $BACKEND_URL"
  exec "$CF_BIN" tunnel --no-autoupdate --loglevel info run "$TUNNEL_NAME"
else
  log "WARNING: no named tunnel '$TUNNEL_NAME' configured."
  log "Falling back to QUICK tunnel (URL changes every restart — stable one needs browser login)."
  log "  Once, in a real terminal: cloudflared tunnel login; cloudflared tunnel create $TUNNEL_NAME"
  exec "$CF_BIN" tunnel --no-autoupdate --url "$BACKEND_URL"
fi
