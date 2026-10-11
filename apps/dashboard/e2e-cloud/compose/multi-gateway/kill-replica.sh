#!/usr/bin/env bash
# Kill one gateway replica in the multi-gateway Compose stack (RES-01 / RES-06 arrange).
set -euo pipefail

REPLICA="${1:-gateway-a}"
COMPOSE_FILE="$(cd "$(dirname "$0")" && pwd)/docker-compose.yml"

case "$REPLICA" in
  gateway-a|gateway-b) ;;
  *)
    echo "usage: $0 gateway-a|gateway-b" >&2
    exit 2
    ;;
esac

docker compose -f "$COMPOSE_FILE" kill "$REPLICA"
echo "killed $REPLICA — remaining replica + NATS should still serve; Pass-when via /gateway/restart + /audit + session continuity"
