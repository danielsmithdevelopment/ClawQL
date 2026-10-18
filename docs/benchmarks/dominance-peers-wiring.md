# Dominance peer wiring (equal-arm)

How to put the remaining [dominance roadmap](./dominance-roadmap.md) peers on a shared fixture. Marketing stays bound to measured boards.

## Status snapshot (2026-10-17)

| Peer | Ship form | Equal-arm path | Blocker |
| --- | --- | --- | --- |
| **Bifrost** | OSS binary (`npx @maximhq/bifrost`) | `MT_ARMS=…,bifrost,bifrost_codemode` on pets multiturn | Tokens **measured** (Code Mode 2.25× / classic 3.95×). Still need p99 concurrency + governance depth. |
| **Obot** | OSS Docker / Helm ([obot-platform/obot](https://github.com/obot-platform/obot)) | Equal-arm catalog Streamable HTTP → catalog entry → `OBOT_MCP_URL=/mcp-connect/…` | **On board** — classic **3.95×** vs ClawQL (same fat aggregator path as agentgateway); PASS task_success. |
| **TrueFoundry** | Enterprise / private Helm (`tfy-llm-gateway`) | Needs tenant + `TFY_API_KEY` gateway plane | **SaaS/credentials** — cannot smoke without a TF org. Document governance bake-off once credentials exist. |
| **Uber MCP Gateway** | Internal only (blog design) | Technique bake-off: Omni discovery + response projection vs ClawQL search/`where`/`fields` | **Not OSS** — implement a *technique peer* harness (projection field trim), not their binary. |
| **ContextForge** | Prior nested boards | Direct `/pets` virtualization (no MCPJungle nest) | Nested adapter still inflates; direct arm next. |
| **agentgateway / Executor** | Already measured | Re-pin latest binaries after compact JSON | Version rot. |

## Obot local recipe (measured OSS peer)

```bash
# 1) Equal-arm catalog over Streamable HTTP (host must be reachable from the Obot container)
CATALOG_TOOL_COUNT=40 node scripts/benchmarks/lib/equal-arm-catalog-mcp.mjs --http --port 18770

# 2) Bootstrap Obot (auth on; allow private/host MCP URLs)
docker run -d --name obot -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e OBOT_SERVER_ENABLE_AUTHENTICATION=true \
  -e OBOT_BOOTSTRAP_TOKEN=clawql-bench-token \
  -e OBOT_SERVER_HOSTNAME=http://127.0.0.1:8080 \
  -e OBOT_SERVER_DISALLOW_LOCALHOST_MCP=false \
  -e OBOT_SERVER_DISALLOW_PRIVATE_IPMCP=false \
  ghcr.io/obot-platform/obot:latest

# 3) Register a multi-user remote catalog entry (v0.26+: POST /api/mcp-servers is gone;
#    create an entry; Obot materializes ms* + connectURL). Docker bridge → host: 172.17.0.1
curl -sS -X POST http://127.0.0.1:8080/api/mcp-catalogs/default/entries \
  -H "Authorization: Bearer clawql-bench-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "equal-arm-catalog",
    "shortDescription": "Equal-arm fat catalog",
    "description": "Synthetic fat MCP catalog for dominance peer board.",
    "runtime": "remote",
    "remoteConfig": { "fixedURL": "http://172.17.0.1:18770/mcp" }
  }'
# Response includes connectURL; server id is also under GET /api/mcp-servers (ms…).

export OBOT_MCP_URL=http://127.0.0.1:8080/mcp-connect/<ms-or-entry-id>
export OBOT_MCP_TOKEN=clawql-bench-token

MT_ARMS=clawql,obot MT_OUT=gateway-multi-multiturn-obot.json \
  npm run benchmark:gateway-multi-multiturn
```

Harness: `scripts/benchmarks/gateway-multi-multiturn.mjs` skips the `obot` arm unless `OBOT_MCP_URL` is set (honest skip, not a fabricated peer). Publish board merges the Obot row from `gateway-multi-multiturn-obot.json` (see `honesty` / `obot_followup` on `gateway-multi-multiturn.json`).

## Uber technique bake-off (no binary)

Uber’s published Omni tools (`discover_server` → `discover_tools` → `get_tool_schema` → `invoke_tool`) + GraphQL-style response projection are **ideas**, not a downloadable gateway. Equal-arm proof:

1. Keep pets fixture.
2. Peer A: ClawQL `search` + `execute` with `where`/`fields`.
3. Peer B: harness-emulated Omni (four meta-tools) + path-trim projection on fat results.
4. Compare Layer1 + Layer2 + weighted model-written — same task_success.

Do not claim “vs Uber MCP Gateway” until they publish a runnable peer or accept maintainer config on a shared fixture.

## TrueFoundry

Enterprise MCP Gateway (control plane hosted). When a tenant + gateway token are available:

1. Deploy `tfy-llm-gateway` plane (or use SaaS endpoint).
2. Register equal-arm OpenAPI/MCP catalog.
3. Point `TRUEFOUNDRY_MCP_URL` (+ auth headers) at the multiturn harness (same skip-if-unset pattern as Obot).
4. Score tokens + policy-bound write audit completeness.

Until then status stays **Not on board** with an explicit credentials blocker.

## Celld + injection (earned claims, parallel track)

**What “builds on celld” means today**

| Surface | Relationship to celld | Claimable now? |
| --- | --- | --- |
| **ClawQL Streams** | Self-hosted Durable Objects on pinned **celld v0.4.0** (LTX → your bucket) | **Yes** — install/dev/deploy docs + Labs |
| **Durable programs** | celld-shaped file (JSONL) journal stand-in; pin/readiness CLI | **Yes** as stand-in — not isolate crash survival |
| **Core search/execute** (pets publish boards) | Never loads celld / `execute_program` | Hot path **independent** of celld |

**CLI**

```bash
CELLD_VERSION=v0.4.0 curl -fsSL https://celld.dev/install.sh | CELLD_VERSION=v0.4.0 sh
export PATH="$HOME/.local/bin:$PATH"

# Pin readiness (isolateReady when CELLD_VERSION + CLAWQL_PROGRAM_CELLD_ISOLATE=1 + binary match)
CELLD_VERSION=v0.4.0 CLAWQL_PROGRAM_CELLD_ISOLATE=1 \
  clawql security celld --json

# Same pin surface in onboarding doctor (stand-in ok; warn if isolate half-configured)
clawql doctor

clawql security inject --mode direct|indirect|multistep [--json]
```

- `clawql security celld` — pin readiness / kill-node *eligibility* (does not spawn celld).
- `clawql doctor` — surfaces celld pin stand-in vs `isolateReady` (warns on incomplete pin).
- `clawql security inject` — in-process Panguard drills (§24).
- Live MCP: openbench `memory-injection-attempt`.
- Crash claim: only after `pin.isolateReady` **and** three-arm celld kill-node demo (ADR 0015).

### Hot-path A/B — celld env does not hurt publish boards

Publish-grade artifact: [`celld-hotpath-ab/celld-hotpath-ab-10k.json`](./celld-hotpath-ab/celld-hotpath-ab-10k.json) (2026-10-18, **n=10000**). Smoke: [`celld-hotpath-ab.json`](./celld-hotpath-ab/celld-hotpath-ab.json) (n=2000).

Same equal-arm OpenAPI `execute` → `listPets` as the gateway-multi publish board (n=10k):

| Variant | e2e p50 / p99 (ms) | gateway_cost p50 / p99 | vs baseline gateway p50 |
| --- | ---: | ---: | ---: |
| **A** baseline (publish shape) | 0.73 / 1.98 | **0.60 / 1.68** | — |
| **B** + `CLAWQL_ENABLE_DURABLE_PROGRAMS=1` | 0.73 / 2.05 | 0.61 / 1.78 | **+2.7%** |
| **C** + celld pin + `CLAWQL_PROGRAM_CELLD_ISOLATE=1` | 0.73 / 1.91 | 0.61 / 1.69 | **+2.7%** |

Gate (≤15% p50 / ≤25% p99 gateway regress): **PASS**. Enabling durable programs and the celld pin/isolate env on the Core process does **not** move publish latency outside noise — the pets board never calls celld.

```bash
MULTI_ITERS=10000 CLAWQL_CELLD_BIN=$HOME/.local/bin/celld \
  CELLD_AB_OUT=celld-hotpath-ab-10k.json \
  npm run benchmark:celld-hotpath-ab
```
