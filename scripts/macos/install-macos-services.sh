#!/usr/bin/env bash
# Install/refresh the ClawQL macOS LaunchAgents (per-user, no sudo):
#   com.clawql.mcp-http           — the clawql-mcp-http node server (auth on via .env)
#   com.clawql.cloudflare-tunnel  — cloudflared (named tunnel if configured, quick tunnel otherwise)
#
# Usage:
#   ./install-macos-services.sh            # install or refresh both, then (re)start
#   ./install-macos-services.sh --stop     # load nothing, stop + unload both
#   ./install-macos-services.sh --status   # print status of both labels
#
# Templates live in this directory (committed to the repo). Rendered copies go
# to ~/Library/LaunchAgents/. No secrets are written anywhere: the MCP server
# reads .env from the repo root at runtime (CLAWQL_AUTH_MODE=apikey /
# CLAWQL_API_KEY); cloudflared reads ~/.cloudflared/.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
HOME_DIR="${HOME}"
LOG_DIR="${CLAWQL_LOG_DIR:-$HOME_DIR/Library/Logs/clawql}"
MCP_PLIST="$HOME_DIR/Library/LaunchAgents/com.clawql.mcp-http.plist"
TUN_PLIST="$HOME_DIR/Library/LaunchAgents/com.clawql.cloudflare-tunnel.plist"
MCP_LABEL="com.clawql.mcp-http"
TUN_LABEL="com.clawql.cloudflare-tunnel"
UID_NUM="$(id -u)"

render() { # render <template> <dest>
  cp "$1" "$2"
  sed -i '' \
    -e "s|__CLAWQL_HOME__|$REPO|g" \
    -e "s|__RUN_MCP__|$DIR/run-mcp.sh|g" \
    -e "s|__RUN_TUNNEL__|$DIR/run-tunnel.sh|g" \
    -e "s|__LOG_DIR__|$LOG_DIR|g" \
    -e "s|__HOME__|$HOME_DIR|g" \
    "$2"
  chmod 0644 "$2"
}

render_mcp()      { render "$DIR/com.clawql.mcp-http.plist.template" "$MCP_PLIST"; }
render_tunnel()   { render "$DIR/com.clawql.cloudflare-tunnel.plist.template" "$TUN_PLIST"; }

load_service() { # load_service <label> <plist>
  local label="$1" plist="$2"
  launchctl bootout "gui/$UID_NUM/$label" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$UID_NUM" "$plist"
  launchctl kickstart -k "gui/$UID_NUM/$label"
  echo "loaded $label"
}

stop_service() {
  local label="$1"
  launchctl bootout "gui/$UID_NUM/$label" >/dev/null 2>&1 || true
  rm -f "$HOME_DIR/Library/LaunchAgents/$label.plist"
  echo "stopped $label"
}

status_service() {
  local label="$1"
  if launchctl print "gui/$UID_NUM/$label" >/dev/null 2>&1; then
    echo "$label: LOADED (pid=$(launchctl list "$label" 2>/dev/null | awk '/pid/{print $3}'))"
  else
    echo "$label: not loaded"
  fi
}

case "${1:-}" in
  --stop)
    stop_service "$MCP_LABEL"
    stop_service "$TUN_LABEL"
    exit 0
    ;;
  --status)
    status_service "$MCP_LABEL"
    status_service "$TUN_LABEL"
    exit 0
    ;;
esac

# default: install/refresh + (re)start
mkdir -p "$LOG_DIR"
chmod +x "$DIR/run-mcp.sh" "$DIR/run-tunnel.sh"
render_mcp
render_tunnel
load_service "$MCP_LABEL" "$MCP_PLIST"
load_service "$TUN_LABEL" "$TUN_PLIST"

echo
echo "Installed:"
ls -l "$MCP_PLIST" "$TUN_PLIST"
echo
echo "Verify:  curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8080/mcp \\"
echo "               -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \\"
echo "               -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-03-26\",\"clientInfo\":{\"name\":\"x\",\"version\":\"0\"},\"capabilities\":{}}}'"
echo "Expect 401 (auth enforced). With 'Authorization: Bearer <CLAWQL_API_KEY>' expect 200."
echo "Tunnel log (current public URL when in quick-tunnel mode): tail -f $LOG_DIR/tunnel.out.log"
