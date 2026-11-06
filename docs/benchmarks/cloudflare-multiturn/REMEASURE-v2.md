# Executor v2 remasure runbook

**Status:** harness restored · invite drafted · **HTTP concurrency REPS=3 on β.37 measured (provisional)** · tip binary = `executor@beta` (`2.0.0-beta.37`) · npm `latest` still **1.6.11**.

**Publish rule:** keep the β.15 HTTP concurrency cells on `/benchmarks` labeled **under review** until (1) maintainer invite is answered or the Nov 19 deadline passes and (2) you consciously promote a tip/stable board in [`remeasure-beta37/`](./remeasure-beta37/). Do not flip raw cells to β.37 while under review.

### Provisional concurrency result (β.37, invite pending)

See [`remeasure-beta37/README.md`](./remeasure-beta37/README.md). Median clients @100 ms p99 = **1** (range 1–2) vs prior publish **2**; peak RPS ~**71** vs **73**; anon still **GB-class**. Tip does not clear the β.15 unflattering cells.

## Why the harness was missing on `main`

Publish artifacts lived under `docs/benchmarks/cloudflare-multiturn/`, but the runnable scripts stayed on tip branches (`cursor/cf-mt-executor-gaps-a621` and related). They are restored onto the remasure branch so concurrency can be re-run without archaeology.

## Install Executor 2 (beta channel)

Verified on this agent host (2026-11-05 PT): `executor@beta` → **2.0.0-beta.37**, `executor service start` with `EXECUTOR_KEY_STORAGE=file` binds `http://127.0.0.1:4312` and serves the dashboard (HTTP 200).

```bash
mkdir -p /tmp/executor-v2 /tmp/executor-v2-data
cd /tmp/executor-v2
npm i executor@beta
export PATH="/tmp/executor-v2/node_modules/.bin:$PATH"
executor --version   # expect 2.0.0-beta.N

# Headless / no Secret Service: file-backed keys for first start.
# Do NOT combine EXECUTOR_KEY_STORAGE=file with pre-supplied EXECUTOR_API_KEY /
# EXECUTOR_ENCRYPTION_KEY — Executor refuses that mix.
export EXECUTOR_DATA_DIR=/tmp/executor-v2-data
export EXECUTOR_KEY_STORAGE=file
export EXECUTOR_PORT=4312
unset EXECUTOR_API_KEY EXECUTOR_ENCRYPTION_KEY

executor service start   # prints http://127.0.0.1:4312
# Keys land in $EXECUTOR_DATA_DIR/keys.json (mode 0600). For the harness:
python3 -c 'import json,pathlib; k=json.load(open("/tmp/executor-v2-data/keys.json")); pathlib.Path("/tmp/executor-v2-data/api_key.txt").write_text(k["apiKey"])'
```

Harness env (matches `arms-wiring.md`):

```bash
export EXECUTOR_BIN=/tmp/executor-v2/node_modules/.bin/executor
export EXECUTOR_HOST=http://127.0.0.1:4312
export EXECUTOR_DATA_DIR=/tmp/executor-v2-data
export EXECUTOR_V2_API_KEY="$(cat /tmp/executor-v2-data/api_key.txt)"
export EXECUTOR_API_KEY="$EXECUTOR_V2_API_KEY"
```

## Priority remasure order

| #   | Board                      | Command sketch                                                                                                                                                                       | Why first                                           |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| 1   | HTTP concurrency + memory  | `CURVE=1 THRESHOLDS=100,250,500 REPS=3 ARMS=executor_v2 OUT=docs/benchmarks/cloudflare-multiturn/http-concurrency-with-executor-β37.json npm run benchmark:http-concurrency-heap-ab` | Most unflattering β.15 cells (~2 clients / ~2.1 GB) |
| 2   | CF zone-audit smoke        | `CF_MT_ITERS=20 CF_MT_ARMS=executor_v2 npm run benchmark:cloudflare-multiturn:board`                                                                                                 | Sanity before 10k                                   |
| 3   | CF zone-audit publish      | `CF_MT_ITERS=10000 CF_MT_REPS=3 CF_MT_ARMS=…,executor_v2 npm run benchmark:cloudflare-multiturn:board`                                                                               | Tokens + session p50                                |
| 4   | Pets multiturn             | `MT_ARMS=…,executor npm run benchmark:gateway-multi-multiturn`                                                                                                                       | Headline 3.38×                                      |
| 5   | Interleaved + chaos        | `npm run benchmark:gateway-multi-comparison`                                                                                                                                         | Latency / Topology A                                |
| 6   | Governance cells           | Update `ci-executor-peer.sh` for v2 CLI, then `npm run benchmark:governance-policy-depth:executor`                                                                                   | Pause / resume probe                                |
| 7   | Multi-attack + best-config | Never measured — fresh on stable/tip                                                                                                                                                 | Pending peer runner                                 |

## Before publishing new cells on /benchmarks

1. Send [outreach-rhys-executor-draft.md](./outreach-rhys-executor-draft.md) (or adjusted).
2. Record exact version in every artifact JSON (`executorVersion`, `measuredAt`).
3. Flip www provenance from `pending_stable_remeasure` → `current` only after review.
4. Keep v1.6.10 rows labeled **historical**.

## Smoke verified (this agent host, 2026-11-05 PT)

| Check                                                 | Result                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm i executor@beta`                                 | **2.0.0-beta.37**                                                                                    |
| `executor service start` + `KEY_STORAGE=file`         | listens `127.0.0.1:4312`, dashboard HTTP 200                                                         |
| MCP `initialize` with Bearer `keys.json.apiKey`       | HTTP 200, `executor-build: 2.0.0-beta.37`                                                            |
| `ensureExecutorOpenapiApp` → curated OAS → local mock | deploy OK after fixing `defineApp({ accounts: {} })` → `defineApp({}, …)` (β.37 scoped requirements) |

Artifacts: `/opt/cursor/artifacts/executor-beta37-service-start.log`, `executor-beta37-mcp-probe.log`, `executor-beta37-openapi-ensure-smoke.log`, `cf-mt-harness-unit-tests.log`.

## Known gaps

- `ci-executor-peer.sh` still installs `executor@latest` (v1.6.x) and uses `executor daemon` — must be ported to v2 (`executor service` / HTTP `:4312`) before governance remasure.
- Full ClawQL + peer concurrency ladder needs `MCPJUNGLE_BIN` / `AGENTGATEWAY_BIN` and a dedicated bench host; Executor-only arm can land first.
- Do **not** publish new concurrency/token cells until the Rhys invite is sent (same rule as Obot/Bifrost).
