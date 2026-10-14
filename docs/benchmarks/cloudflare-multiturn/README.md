# Cloudflare multi-turn gateway benchmark

Spec: [`SPEC.md`](./SPEC.md) · Curated ops (frozen): [`curated-subset.json`](./curated-subset.json) · Fixture hashes: [`MANIFEST.json`](./MANIFEST.json) · Arms: [`arms-wiring.md`](./arms-wiring.md)

## Status

| Piece | State |
| --- | --- |
| Spec + fairness rules | Done |
| Curated ~60-op subset | **Frozen** 2026-10-14 |
| Synthetic fixture + replay mock | Done (label: real schemas, synthetic content) |
| 12-step scripted success checks | Done |
| Direct baseline smoke | Done (`run-zone-audit.mjs`) |
| Live read-only recorder + sanitize | Done (needs token to produce live fixture) |
| ClawQL / Executor / MJ / AG / CF code-mode arms | **Wired** (`run-board.mjs`) |
| Interleaved board (N=100 / N=1000) | **Done** — see results below; 3×10k still open |
| Real-model 50-session validation | **Next** |

## Quick start (no Cloudflare credentials)

```bash
# Fixture + direct smoke
npm run benchmark:cloudflare-multiturn:smoke
npm run benchmark:cloudflare-multiturn:test

# Multi-arm interleaved board (Streamable HTTP)
export EXECUTOR_V2_API_KEY="$(cat /tmp/executor-v2-data/api_key.txt)"   # if measuring executor_v2
export MCPJUNGLE_BIN=/tmp/gw-bins/mcpjungle
export AGENTGATEWAY_BIN=/tmp/gw-bins/agentgateway
CF_MT_ITERS=100 CF_MT_REPS=1 npm run benchmark:cloudflare-multiturn:board
```

## Board results (synthetic fixture, zero injected latency)

Measured 2026-10-14 · N=1000 · 1 rep · tokenizer `js-tiktoken cl100k_base` · [`board-summary-n1000-r1.json`](./board-summary-n1000-r1.json) (N=100 companion: [`board-summary-n100-r1.json`](./board-summary-n100-r1.json))

| Arm | Task success | Def tok | Discovery mean | Result mean | Code mean | Session p50 / p999 (ms) | RSS / anon median (MB) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `direct` | 100% | — | 0 | 47361 | 0 | 37 / 71 | — |
| `clawql_default` | 100% | 308 | 16012 | 7030 | 0 | 61 / 128 | 648 / 579 |
| `clawql_known_op` | 100% | 308 | 0 | 7030 | 0 | 28 / 71 | 660 / 591 |
| `executor_v2` | 100% | 181 | 0 | 625 | 40419 | 104 / 449 | — (remote serve) |
| `mcpjungle` | 100% | 7760 | 0 | 47361 | 0 | 50 / 252 | 171 / 102 |
| `agentgateway` | 100% | 7344 | 0 | 47361 | 0 | 48 / 84 | 232 / 115 |
| `cloudflare_codemode` | 100%* | 19† | 0 | 0* | 518 | —* | — |

\* Tokens-only arm (no self-hosted CF code-mode server this run).  
† Stub search/execute defs for Layer-1 placeholder.  
`executor_v2` uses **static_upstream0**: QuickJS has no `fetch`; compact fixture slices are inlined in published scripts (`executorV2ScriptsFromWorld`). Code tokens are dominated by the DNS list × steps 4–6. Pin: `executor@2.0.0-beta.15`.

ClawQL result shrinkage (~47k → ~7k) comes from `where` projections + `CLAWQL_EXECUTE_RESULT_MAX_CHARS`. Known-op drops discovery to zero vs default search-per-step.

## Live recording (once)

```bash
# Read-only token: zones, DNS, Workers scripts, R2 buckets, firewall — no writes
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… AUDIT_ZONE_NAME=example.com \
  node scripts/benchmarks/cloudflare-multiturn/record/record-cloudflare-reads.mjs
# Inspect fixtures/recording.live.sanitized.json → update MANIFEST → FIXTURE=… for runs
```

## Layout

| Path | Role |
| --- | --- |
| `scripts/benchmarks/cloudflare-multiturn/mock/` | Isolated HTTP replay mock |
| `scripts/benchmarks/cloudflare-multiturn/fixtures/` | Recording + curated subset + MANIFEST |
| `scripts/benchmarks/cloudflare-multiturn/code-mode/` | Published JS for CF code-mode / Executor v2 |
| `scripts/benchmarks/cloudflare-multiturn/lib/` | Sanitize, scale, success checks, REST→MCP |
| `scripts/benchmarks/cloudflare-multiturn/run-board.mjs` | Interleaved multi-arm board |
| `scripts/benchmarks/cloudflare-multiturn/record/` | One-time read-only recorder |

## Board claims (when complete)

Only: tokens (rebuildable), task success, latency (zero vs recorded), memory (RSS+anon), full-spec feasibility. No live API performance claims; no writes beyond gated proposals.

## Open questions

[`open-questions.md`](./open-questions.md)
