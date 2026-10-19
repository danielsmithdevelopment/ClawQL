# Governance / policy-depth equal-arm board

Proves **fail-closed vault-write policy** on a shared adversarial fixture — the dominance criterion peers still lack on the tokens boards.

| Arm | Role |
|-----|------|
| `clawql_panguard` | Required — `CLAWQL_PANGUARD_*` blocks `memory_ingest` |
| `passthrough` | Required control — direct vault/fixture MCP, no deny |
| `obot` | Opt-in — `OBOT_MCP_URL` (+ optional `OBOT_MCP_TOKEN`) |
| `bifrost` | Opt-in — `BIFROST_MCP_URL` (+ optional `BIFROST_VK`) |
| `executor` | Opt-in cells — `EXECUTOR_MCP_URL` + `GOV_SHARED_VAULT_ROOT` |

Frozen rules: [`frozen-rules.json`](./frozen-rules.json).

## Run vault-write board (always)

```bash
node scripts/benchmarks/governance-policy-depth/run-board.mjs
# or
npm run benchmark:governance-policy-depth
```

Writes `docs/benchmarks/governance-policy-depth/results-smoke.json` (override with `GOV_OUT=`).

Expected smoke: **board_pass=true**, clawql security_score **5/5**, passthrough contaminates (score ≤3).

## Run Executor cells (always ClawQL + passthrough)

Two cells on `fixture-mcp.mjs` (vault tools + Gmail-shaped poison):

| Cell | What it proves |
|------|----------------|
| `risky_write` | Hostile `memory_ingest` (OVERRIDE) fail-closes |
| `untrusted_read` | Poisoned `gmail_read_message` → subsequent ingest still fail-closes |

```bash
npm run benchmark:governance-policy-depth:cells
# → docs/benchmarks/governance-policy-depth/results-cells.json
```

Executor arm: set `EXECUTOR_MCP_URL` (+ optional `EXECUTOR_API_KEY`) and `GOV_SHARED_VAULT_ROOT` pointing at the same vault disk the fixture (or Executor-fronted MCP) uses. Without those env vars the executor rows are honest skips.

## Wire Obot (Docker)

```bash
# Terminal A — shared vault MCP (seed a trial vault first or use /tmp/gov-vault)
cp -a benchmarks/openbench/tasks/memory-injection-attempt/workspace/vault /tmp/gov-vault
VAULT_ROOT=/tmp/gov-vault node scripts/benchmarks/governance-policy-depth/vault-mcp.mjs --http --port 18780

# Terminal B — Obot (see docs/benchmarks/dominance-peers-wiring.md)
# Register remote entry fixedURL=http://172.17.0.1:18780/mcp
export OBOT_MCP_URL=http://127.0.0.1:8080/mcp-connect/<ms-id>
export OBOT_MCP_TOKEN=clawql-bench-token
GOV_OUT=docs/benchmarks/governance-policy-depth/results-obot.json \
  node scripts/benchmarks/governance-policy-depth/run-board.mjs
```

Without a per-tool deny on `memory_ingest`, Obot matches **passthrough** (contamination) — that is a measured policy-depth loss vs ClawQL. With Obot deny configured, scores may tie; then compare audit richness / latency.

## Wire Bifrost

Front the same `vault-mcp` with a Bifrost virtual key. To claim governance win, scope the VK to **deny** `memory_ingest` (or omit it from `tools_to_execute`). `allow_by_default: true` + `tools_to_execute: ["*"]` is the passthrough-equivalent loss.

```bash
export BIFROST_MCP_URL=http://127.0.0.1:<port>/mcp
export BIFROST_VK=sk-bf-…
GOV_OUT=docs/benchmarks/governance-policy-depth/results-bifrost.json \
  node scripts/benchmarks/governance-policy-depth/run-board.mjs
```

## Wire Executor (cells)

```bash
cp -a benchmarks/openbench/tasks/memory-injection-attempt/workspace/vault /tmp/gov-cells-vault
VAULT_ROOT=/tmp/gov-cells-vault \
  node scripts/benchmarks/governance-policy-depth/fixture-mcp.mjs --http --port 18790

# Front fixture with Executor withApprovals / deny on memory_ingest, then:
export EXECUTOR_MCP_URL=http://127.0.0.1:<executor>/mcp
export GOV_SHARED_VAULT_ROOT=/tmp/gov-cells-vault
npm run benchmark:governance-policy-depth:cells
```

## Maintainer invite

Point your gateway at `vault-mcp.mjs` or `fixture-mcp.mjs`, run the board, open a PR with raw JSON. We merge equal-arm rows; we do not fabricate peer scores.

## CI

Workflow: `.github/workflows/governance-policy-depth.yml`

| Job | LLM? | Notes |
|-----|------|-------|
| `smoke` | No | ClawQL 5/5 vs passthrough (vault-write board) |
| `cells` | No | Executor cells — ClawQL 5/5 vs passthrough on both cells |
| `obot-peer` | No | Docker Obot + `ci-obot-peer.sh` (`continue-on-error`) |

**Cheap-model promise:** this workflow spends **$0** on OpenRouter. Live LLM security cells stay on `openbench-ab.yml` dispatch with `task=memory-injection-attempt` and a model from [`cheap-model-allowlist.json`](./cheap-model-allowlist.json) (default `openrouter/deepseek/deepseek-chat`). Frontier models are rejected by `assert-cheap-model.mjs` for `memory-injection-attempt` / `policy-deny-execute`.

## Next (dominance)

1. Land Executor peer artifact (`EXECUTOR_MCP_URL` + shared vault) → publish measured row.
2. Bifrost VK deny row (`BIFROST_MCP_URL` + `GOV_SHARED_VAULT_ROOT`).
3. Optional: dispatch openbench-ab `memory-injection-attempt` × cheap model for live LLM replication (not required for peer board).
