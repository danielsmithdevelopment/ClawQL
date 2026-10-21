# OpenAPPA Layer 5 — beside Panguard, beside session IFC

ClawQL wires [OpenAPPA](https://github.com/archestra-ai/OpenAPPA) as an **opt-in Layer 5** hook after **Panguard (Layer 4)** at `wrapRegisteredMcpToolHandler`. Paper: [arXiv:2607.24625](https://arxiv.org/abs/2607.24625).

**Keep it opt-in until tool coverage is complete.** Undeclared tools are refused; enabling OpenAPPA without declaring optional tools blocks legitimate work.

## Ownership split (complements, not alternatives)

| | OpenAPPA (Layer 5) | Session data-flow labels (IFC) |
| --- | --- | --- |
| **The question** | May this caller do this call at all? | Given what this session has read, may this data go there? |
| **Looks at** | Tool identity, arguments, declared contracts, attention | Data history / taint across the session (and into memory) |
| **Stops** | Undeclared tools, least-privilege denials, approval-gated calls | Untrusted content reaching external / privileged sinks |
| **Misses** | Allowed tool used to exfiltrate poisoned-session data | Dangerous but permitted action in a clean session |

**Design rule:** session IFC owns “where may this data go” (confidentiality / injection; Lean target). OpenAPPA owns “may this caller do this at all” (declared tools, least privilege, which calls need approval). Both feed **one outcome**, with **most restrictive wins**, and **one approval request** (never two), with both reasons shown.

If OpenAPPA ever needs session labels, pass them as **read-only input**; do not move the flow decision into OpenAPPA.

The marketing stack diagram tags Layer 5 “information-flow policy” with OpenAPPA — the **shipped authority for data-flow** remains session IFC; OpenAPPA is the authorization / declared-tool engine beside it.

## Wire order

```text
wrapRegisteredMcpToolHandler
  → Panguard / mcp-proxy pre-execute (Layer 4)
  → OpenAPPA POST /hook tool_call (Layer 5)  [audited]
  → session IFC + park destructive           [composed: most restrictive wins]
  → handler
  → OpenAPPA POST /hook tool_result (Layer 5)
```

## 1. Sidecar down / timeout — fail closed

| Kind | Default | Override |
| --- | --- | --- |
| **Writes** / destructive / execute-path | Always **fail closed** (`class: sidecar_unavailable`) | None — `warn` is ignored |
| **Reads** | **Fail closed** | `CLAWQL_OPENAPPA_READ_FAILURE_POLICY=warn` (fail-open for reads only) |

Timeout budget: `CLAWQL_OPENAPPA_TIMEOUT_MS` (**default 2000**). Exceeded → same as sidecar down.

A policy layer that fails open on outage creates false confidence; writes must never be allowed when OpenAPPA is unreachable.

## 2. Most restrictive wins

Severity: `blocked` > `mandate_required` > `allow`.

- OpenAPPA `allow_call` **never** overrides a later IFC block or park.
- A deny from any layer stops the call.
- When OpenAPPA asks for approval **and** ClawQL would park the same call → **one** `mandate_required` (`mechanism: composed_mandate`) with **both** reasons and the park `executionId` when present.

## 3. Latency

Measure with:

```bash
CLAWQL_OPENAPPA_URL=http://127.0.0.1:8790 \
  node scripts/benchmarks/openappa/measure-hook-latency.mjs
```

Results: [`docs/benchmarks/openappa/results-latency.json`](../benchmarks/openappa/results-latency.json).

Optional brief allow-cache: `CLAWQL_OPENAPPA_ALLOW_CACHE_MS` (default `0` = off; max 5000).

## 4. Covered tools (battery)

Declared in [`packages/clawql-api/openappa/batteries/clawql/appa.toml`](../../packages/clawql-api/openappa/batteries/clawql/appa.toml):

| Tool | Contract posture |
| --- | --- |
| `search`, `cache`, `audit`, `skills_*`, `clawql_settings_read`, `clawql_evidence`, `clawql_console`, `clawql_mentions_search`, `read_around` | Declared; empty delta (benign allow) |
| `memory_recall` | Declared; `trust = suspicious` on result |
| `memory_ingest`, `memory_sync`, `execute`, `resume`, `clawql_open_file` | Declared; require `trusted` |
| `notify`, `sources_propose`, `clawql_settings_update` | Declared; `attention = human-approval` → mandate |
| *anything else* | **Refused** (`undeclared_tool`) |

Benign suite (CI): `packages/clawql-api/src/openappa/benign-suite.test.ts` — every declared tool’s normal path must pass (allow or expected mandate).

## 5. Audit chain

Every OpenAPPA decision appends WORM (when enabled): `OPENAPPA_ALLOW` / `OPENAPPA_DENY` / `OPENAPPA_MANDATE` with `metadata.layer = openappa_layer5`. Composed outcomes append `LAYER_COMPOSE` with per-layer reasons. MCP error bodies also include `layers[]` + `mechanism`.

## 6. Authenticate off-loopback

Loopback (`127.0.0.1` / `localhost` / `::1`) may run without a token.

Any other `CLAWQL_OPENAPPA_URL` **requires** `CLAWQL_OPENAPPA_AUTH_TOKEN` (sent as `Authorization: Bearer`). For remote deployment, prefer **mutual TLS** between ClawQL and OpenAPPA; a spoofable policy channel is not a policy. Enabling without a token fails closed at config load.

## Opt-in env

| Variable | Default | Meaning |
| --- | --- | --- |
| `CLAWQL_ENABLE_OPENAPPA` | off | Enable client |
| `CLAWQL_OPENAPPA_URL` | `http://127.0.0.1:8789` | Sidecar base |
| `CLAWQL_OPENAPPA_ADAPTER` | `opencode` | Wire adapter |
| `CLAWQL_OPENAPPA_MCP_SERVER` | `clawql` | Namespace in `mcp__…__…` |
| `CLAWQL_OPENAPPA_TIMEOUT_MS` | `2000` | Hard timeout budget |
| `CLAWQL_OPENAPPA_READ_FAILURE_POLICY` | `block` | `warn` = fail-open **reads only** |
| `CLAWQL_OPENAPPA_FAILURE_POLICY` | — | Alias for read policy (writes still closed) |
| `CLAWQL_OPENAPPA_ALLOW_CACHE_MS` | `0` | Brief allow-cache TTL |
| `CLAWQL_OPENAPPA_AUTH_TOKEN` | — | Required off-loopback |

## Sidecar

```bash
appa runtime --adapter opencode --listen 127.0.0.1:8789 \
  --config packages/clawql-api/openappa/appa.toml \
  --db /tmp/clawql-appa.db
```

## Security suite

When coverage + fail-closed + audit are green, OpenAPPA can join the governance board as a **configured arm**. Its declared-tool allowlist is a general mechanism (not a list of attacked tools), so attribution should record **which layer** blocked each call on AgentDojo / equal-arm runs.

## Related

- ADR 0013: [`docs/adr/0013-gdp-ts-compile-time-auth-proofs.md`](../adr/0013-gdp-ts-compile-time-auth-proofs.md)
- Session IFC: `packages/clawql-api/src/ifc/session-ifc-enforce.ts`
- Battery README: [`packages/clawql-api/openappa/README.md`](../../packages/clawql-api/openappa/README.md)
