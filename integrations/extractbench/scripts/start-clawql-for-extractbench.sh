#!/usr/bin/env bash
# Start clawql-mcp-http with ExtractBench IDP tools enabled.
# Usage: ./start-clawql-for-extractbench.sh [port]
set -euo pipefail

PORT="${1:-8080}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VAULT="${CLAWQL_OBSIDIAN_VAULT_PATH:-/tmp/clawql-extractbench-vault}"
mkdir -p "$VAULT/Memory"

export CLAWQL_ENABLE_DOCUMENTS="${CLAWQL_ENABLE_DOCUMENTS:-1}"
export CLAWQL_ENABLE_PDF_INSPECTOR="${CLAWQL_ENABLE_PDF_INSPECTOR:-1}"
export CLAWQL_ENABLE_IDP_PIPELINE="${CLAWQL_ENABLE_IDP_PIPELINE:-1}"
# LangExtract optional — ExtractBench schema map uses Qwen/vLLM by default.
export CLAWQL_ENABLE_LANGEXTRACT="${CLAWQL_ENABLE_LANGEXTRACT:-0}"
export CLAWQL_OBSIDIAN_VAULT_PATH="$VAULT"
# Optional: scaffold → ontology.db → memory_recall after each EXTRACT (T1 completeness telemetry)
export CLAWQL_EXTRACTBENCH_ONTOLOGY_SYNC="${CLAWQL_EXTRACTBENCH_ONTOLOGY_SYNC:-0}"
# Allow inspect_pdf / anydoc to read ExtractBench dataset paths.
export CLAWQL_PDF_INSPECTOR_FILE_ROOTS="${CLAWQL_PDF_INSPECTOR_FILE_ROOTS:-/:/tmp:$HOME:$ROOT}"
export CLAWQL_ANYDOC_FILE_ROOTS="${CLAWQL_ANYDOC_FILE_ROOTS:-$CLAWQL_PDF_INSPECTOR_FILE_ROOTS}"

# Docling Serve (required for Scanned/Mixed / force_docling arm).
export DOCLING_BASE_URL="${DOCLING_BASE_URL:-http://127.0.0.1:5001}"

echo "Starting ClawQL MCP for ExtractBench on :$PORT"
echo "  vault=$VAULT"
echo "  DOCLING_BASE_URL=$DOCLING_BASE_URL"
echo "  CLAWQL_MCP_URL=http://127.0.0.1:${PORT}/mcp"

cd "$ROOT"
export PORT
# Prefer repo CLI entry (reads PORT / argv via dist/server-http.js).
if [[ -f "$ROOT/bin/clawql-mcp-http.mjs" && -f "$ROOT/dist/server-http.js" ]]; then
  exec node "$ROOT/bin/clawql-mcp-http.mjs"
fi

if [[ -x "$ROOT/node_modules/.bin/clawql-mcp-http" ]]; then
  exec "$ROOT/node_modules/.bin/clawql-mcp-http"
fi

if command -v npx >/dev/null 2>&1; then
  exec npx --yes clawql-mcp-http
fi

echo "ERROR: could not find clawql-mcp-http / dist/server-http.js. Build ClawQL first." >&2
exit 1
