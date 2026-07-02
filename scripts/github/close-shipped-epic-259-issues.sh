#!/usr/bin/env bash
# Close GitHub issues that are shipped on main but still open on the tracker.
# Requires: gh CLI authenticated with issue write access (not available to cloud agents).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not found" >&2
  exit 1
fi

close_one() {
  local num="$1"
  local body="$2"
  if gh issue view "${num}" --json state --jq .state 2>/dev/null | grep -q '^CLOSED$'; then
    echo "==> #${num} already closed — skip"
    return 0
  fi
  echo "==> Closing #${num}"
  gh issue close "${num}" --comment "${body}"
}

close_one 242 "Shipped in PR #465 — dashboard **Provider secrets** panel (\`secret/clawql/providers\` read/write, K8s Secret sync, rollout restart). Docs: \`docs/deployment/vault-provider-secrets.md\`."

close_one 244 "Shipped in PR #459 (6.4.0) — MCP \`argocd\` tool (\`CLAWQL_ENABLE_ARGO_CD=1\`), Helm RBAC values, \`docs/mcp/argocd-tool.md\`."

close_one 253 "Shipped in PR #460 — \`deployment/samples/lending-w2/\` (WorkflowTemplate, Label Studio config, OpenClaw prompt, synthetic W-2 fixture)."

close_one 254 "Shipped — Argo suspend/resume + HITL webhook auto-resume (PR #458), NATS JetStream publish/consumer for HITL resume (PR #461)."

close_one 257 "Shipped in PR #463 — \`nats.worker\` Deployment, \`nats.keda\` ScaledObject, bootstrap Job, standalone worker CLI. Docs: \`docs/deployment/nats-keda-worker.md\`."

echo ""
echo "==> Refresh epic #259 body from scripts/github/epic-259-issue-body.md:"
echo "    gh issue edit 259 --body-file scripts/github/epic-259-issue-body.md"
echo ""
echo "Done."
