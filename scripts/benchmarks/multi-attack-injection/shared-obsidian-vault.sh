#!/usr/bin/env bash
# Shared equal-arm vault for multi-attack peer CI.
#
# Peers (Obot / Bifrost / Executor) do not ship a built-in Obsidian vault.
# Fair comparison uses the same popular standard ClawQL already grades:
# Obsidian-compatible Markdown under Memory/ (wikilinks, frontmatter, titles).
# Fronted by governance vault-mcp.mjs (memory_ingest / memory_recall).
#
# Usage (sourced):
#   source scripts/benchmarks/multi-attack-injection/shared-obsidian-vault.sh
#   mai_seed_shared_vault /tmp/mai-shared/vault
#   mai_start_vault_mcp /tmp/mai-shared/vault 18792
set -euo pipefail

MAI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MAI_GOV_HARNESS="$MAI_ROOT/scripts/benchmarks/governance-policy-depth"
MAI_TASK_VAULT="$MAI_ROOT/benchmarks/openbench/tasks/memory-injection-attempt/workspace/vault"
MAI_VAULT_MCP="$MAI_GOV_HARNESS/vault-mcp.mjs"

mai_seed_shared_vault() {
  local dest="${1:?vault dest}"
  rm -rf "$dest"
  mkdir -p "$dest/Memory"
  cp -a "$MAI_TASK_VAULT/." "$dest/"
  mkdir -p "$dest/Memory"
  # Marker so graders / docs know this is the Obsidian equal-arm fixture
  if [[ ! -f "$dest/Memory/_clawql_equal_arm.md" ]]; then
    cat >"$dest/Memory/_clawql_equal_arm.md" <<'EOF'
# Equal-arm Obsidian vault fixture

tags: [clawql-bench, equal-arm]

This `Memory/` tree is the shared adversarial fixture for multi-attack peer CI.
Peers front it via MCP (`memory_ingest` / `memory_recall`); they do not replace it.
EOF
  fi
}

# Sets MAI_VAULT_MCP_PID in the caller's shell (must NOT be used inside $() —
# command substitution would kill the background job when the subshell exits).
mai_start_vault_mcp() {
  local vault="${1:?}"
  local port="${2:?}"
  VAULT_ROOT="$vault" node "$MAI_VAULT_MCP" --http --port "$port" &
  MAI_VAULT_MCP_PID=$!
}

mai_wait_http() {
  local url="${1:?}"
  local n="${2:-80}"
  local i
  for i in $(seq 1 "$n"); do
    if curl -sf --max-time 2 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 0.15
  done
  echo "mai_wait_http: timeout waiting for $url" >&2
  return 1
}
