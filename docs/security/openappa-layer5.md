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

**Design rule:** session IFC owns “where may this data go”. OpenAPPA owns “may this caller do this at all”. Both feed **one outcome**, with **most restrictive wins**, and **one approval request** (never two), with both reasons shown.

## Wire order

```text
wrapRegisteredMcpToolHandler
  → Panguard / mcp-proxy pre-execute (Layer 4)
  → OpenAPPA POST /hook tool_call (Layer 5)  [keep-alive + circuit + audited]
  → session IFC + park destructive           [composed: most restrictive wins]
  → handler
  → OpenAPPA POST /hook tool_result (Layer 5)
```

## 1. Sidecar down / timeout — fail closed

| Kind | Default | Override |
| --- | --- | --- |
| **Writes** / destructive / execute-path | Always **fail closed** (`class: sidecar_unavailable`) | None — `warn` is ignored |
| **Reads** | **Fail closed** | `CLAWQL_OPENAPPA_READ_FAILURE_POLICY=warn` (fail-open for reads only) |

**Timeout budget: `CLAWQL_OPENAPPA_TIMEOUT_MS` default `250` (low hundreds of ms).** A 2s wait makes a stalled sidecar look like a ClawQL outage.

**Circuit breaker:** after `CLAWQL_OPENAPPA_CIRCUIT_FAILURES` consecutive transport failures (default `3`), fail closed **immediately** for `CLAWQL_OPENAPPA_CIRCUIT_COOLDOWN_MS` (default `2000`), then one half-open probe. No per-call wait while open.

## 2. Most restrictive wins

Severity: `blocked` > `mandate_required` > `allow`. Dual mandates → one `composed_mandate` with both reasons.

## 3. Latency (report separately)

OpenAPPA adds a network hop. **Publish its overhead as its own metric** — do not fold it into existing ClawQL per-call figures (~1.3 ms p50 baseline).

### Production shape: one root per session

ClawQL maps `root_id` to the MCP session id for the **entire** session. **Do not rotate roots mid-session** as a latency trick — a new root drops trajectory context (earlier denials, approvals, and label narrowing) and weakens policy.

Measure cost against session length (single root, paired `tool_call` + `tool_result`):

```bash
CLAWQL_OPENAPPA_URL=http://127.0.0.1:8790 \
  node scripts/benchmarks/openappa/measure-session-length-curve.mjs
# milestones: call 10, 100, 1000, 5000
```

Results: [`docs/benchmarks/openappa/results-session-length-curve.json`](../benchmarks/openappa/results-session-length-curve.json).

Measured (keep-alive, **one root**, paired `tool_call`+`tool_result`, OpenAPPA 0.37.0, loopback):

| Call index (one root) | tool_call p50 | call+result p50 |
| --- | ---: | ---: |
| 10 | **1.8 ms** | 4.5 ms |
| 100 | **5.3 ms** | 11.6 ms |
| 1,000 | **36 ms** | 83 ms |
| 5,000 | **179 ms** | 415 ms |

Growth ratio (p50 at 5k / p50 at 10) ≈ **98×**. Cost is roughly linear in session length. OpenAPPA 0.35+ caches label folds in-process, but the HTTP sidecar path still slows as the per-root event log grows.

### Supported session length (until growth is fixed)

**OpenAPPA is supported for sessions up to `OPENAPPA_SUPPORTED_SESSION_CALLS` = 2,000** OpenAPPA-gated tool calls per MCP session.

| | Value | Basis |
| --- | --- | --- |
| Documented support | **2,000 calls** | ~2.5× margin under the 250ms per-hook budget on the measured curve |
| Budget cliff (approx.) | ~5,000–7,000 calls | tool_call p50 → 180ms at 5k; tool_result component nears 250ms |
| Timeout | `CLAWQL_OPENAPPA_TIMEOUT_MS` = 250 | Fail closed + circuit |

Beyond 2,000 calls the deployment stays **secure** (fail closed) but a long-running agent may simply stop working. Prefer a new MCP session for a new task rather than rotating `root_id` inside one session (rotation drops denials/approvals/labels).

### Fail-closed is visible

When a hook hits the latency budget, operators see a clear alert — not a silent refuse:

```text
[clawql-openappa] ALERT: policy latency exceeded budget at call N (OpenAPPA /hook timed out after 250ms; …)
```

The MCP error carries `class: "policy_latency_budget"` and the same reason string. Crossing the 2,000-call support line also emits a one-shot `ALERT: session exceeded supported OpenAPPA call count`.

### Upstream fix (constant-time decisions)

OpenAPPA is upstream ([archestra-ai/OpenAPPA](https://github.com/archestra-ai/OpenAPPA)). The durable fix is making each decision **O(1) in session length**:

1. **Incremental policy state** — update compact current state (labels, denials, approvals) on each event; decide from that state, not a full history replay.
2. **Periodic snapshots** — recovery replays only from the last snapshot.
3. **Acceptance test** — re-run `measure-session-length-curve.mjs`; done when call 5,000 costs about what call 10 does.

Attach [`results-session-length-curve.json`](../benchmarks/openappa/results-session-length-curve.json) as the bug report. **Do not fix this by rotating `root_id` in ClawQL.**

### Bounded data-flow vs history-based policy (fair contrast)

These layers answer different questions. Present the curves that way — not as a dig at OpenAPPA:

| | ClawQL session IFC | OpenAPPA Layer 5 |
| --- | --- | --- |
| **Question** | Where may this data go? | May this caller do this call at all? |
| **State** | Deliberately **bounded** label set | Full trajectory / policy history (more expressive) |
| **Cost shape** | Flat when state stays bounded | Grows with history unless incrementalized |

```bash
node scripts/benchmarks/openappa/measure-session-ifc-curve.mjs
```

Results: [`docs/benchmarks/openappa/results-session-ifc-curve.json`](../benchmarks/openappa/results-session-ifc-curve.json).

| Arm | Call 10 p50 | Call 5,000 p50 | Ratio |
| --- | ---: | ---: | ---: |
| OpenAPPA `/hook` tool_call | 1.8 **ms** | 179 **ms** | ~98× (history) |
| ClawQL IFC capped (≤32 sources) | ~120 **µs** | ~11 **µs** | flat |
| ClawQL IFC unique/call (safe-merge) | ~10 **µs** | ~12 **µs** | flat (cardinality bounded) |

**Bounded data-flow state stays flat; history-based policy evaluation grows unless incrementalized.**

#### Session IFC label cap (safe merge)

`CLAWQL_SESSION_IFC_MAX_FINE_LABELS` (default **32**) bounds the session label set:

1. Under the cap — keep every fine-grained `source:*` label.
2. Over the cap — collapse to **category** buckets (`source:github-pr-99` → `source:github`; any `*untrusted*` → `source:untrusted`).
3. Still over — keep `public` if present and merge **everything else** into `source:untrusted`.

**Unsafe (not done):** drop the oldest labels. A session that read a poisoned email first, then touched 32 other sources, would lose the untrusted mark and could exfiltrate. **Safe (shipped):** merge overflow toward broader / untrusted — accuracy may drop, nothing is wrongly trusted. Test: 40 sources with untrusted first still blocks unrelated writes.

### Short-session amortized (synthetic only)

Optional root rotation in the latency script is a **benchmark amortization** for short sessions, not a product setting:

```bash
CLAWQL_OPENAPPA_URL=http://127.0.0.1:8790 \
  node scripts/benchmarks/openappa/measure-hook-latency.mjs
# default n=10000 (real p999); for smaller n report p99 — p999≈max when n=200
```

Results: [`docs/benchmarks/openappa/results-latency.json`](../benchmarks/openappa/results-latency.json) (`metric: openappa_hook_overhead_ms`).

Measured short-session amortized (keep-alive, root rotation every 50, `n=10000`, loopback): **p50 ≈ 1.9 ms**, **p99 ≈ 3.6 ms**, **p999 ≈ 6.4 ms**. Always publish the session-length curve beside these numbers — the amortized figure understates long-session cost.

Mitigations shipped:

- **Persistent keep-alive** undici `Agent` per sidecar URL (not a new connection per call).
- **Brief allow-cache** for identical requests (`CLAWQL_OPENAPPA_ALLOW_CACHE_MS` default `250`). Key includes **policy epoch + session + caller + session data-flow labels + tool + args**. Cleared when `CLAWQL_OPENAPPA_POLICY_EPOCH` changes, on circuit open, or on non-allow decisions. A cached allow for one caller/session/label set never applies to another.

## 4. Covered tools (battery)

Declared in [`packages/clawql-api/openappa/batteries/clawql/appa.toml`](../../packages/clawql-api/openappa/batteries/clawql/appa.toml). Benign suite: `packages/clawql-api/src/openappa/benign-suite.test.ts` (asserts **draft-exit** `REQUIRED_OPERATOR_TOOLS`).

**Declared (operator + common opt-ins):** Core (`search` / `execute` / `resume` / `cache` / `audit` / skills), memory (`memory_*` / `read_around`), sources + settings/ChatGPT surfaces, ADR aliases (`console_link` / `docs_search` / `proxy_call` / `execute_program` / `submit_program_proposals`), automation (`notify` / `schedule`), sandbox, Onyx/documents ingest, Ouroboros.

**Still undeclared (refuse while OpenAPPA is on):** niche plugin surfaces in `NATIVE_TOOL_POLICY` that are not in the battery — e.g. documents IDP (`run_idp_pipeline`, `inspect_pdf`, …), data (`data_query`, `clawql_sql`, …), web browse (`web_search` / `web_fetch` / …), ontology matters, observability_*, network_*, webmcp_*, `workflow` / `argocd` / `hitl_enqueue_label_studio`, `clawql_think`. Add a `[[policy.tool]]` row before enabling those plugins with OpenAPPA.

**Draft hold closed:** required operator set is in the battery; remaining gaps are intentional refuse-by-default for rare plugins. Upstream trajectory-growth brief: [`docs/benchmarks/openappa/UPSTREAM-TRAJECTORY-GROWTH.md`](../benchmarks/openappa/UPSTREAM-TRAJECTORY-GROWTH.md).

## 5. Audit chain

`OPENAPPA_ALLOW` / `OPENAPPA_DENY` / `OPENAPPA_MANDATE` + `LAYER_COMPOSE` with `metadata.layer`. Tokens never appear in audit or error text.

## 6. Authenticate off-loopback (secrets store)

Loopback may run without a token. Any other URL **requires** a token from the **SecretStore**:

| Secret path | Env store mapping | Role |
| --- | --- | --- |
| `openappa/auth_token` | `CLAWQL_SECRET_OPENAPPA_AUTH_TOKEN` | Current token |
| `openappa/auth_token_previous` | `CLAWQL_SECRET_OPENAPPA_AUTH_TOKEN_PREVIOUS` | Rotation overlap |

Legacy `CLAWQL_OPENAPPA_AUTH_TOKEN` is still accepted as a last-resort fallback and is **never logged**.

### Rotation without downtime

1. Put the **old** token at `openappa/auth_token_previous`.
2. Put the **new** token at `openappa/auth_token`.
3. Configure the OpenAPPA sidecar to accept **both** during a short overlap (or rely on ClawQL’s client retry: on HTTP 401 it retries once with the previous token).
4. After all clients and the sidecar use only the new token, delete `openappa/auth_token_previous`.

Prefer **mutual TLS** for remote deployment; a bearer alone is the minimum bar.

## Opt-in env

| Variable | Default | Meaning |
| --- | --- | --- |
| `CLAWQL_ENABLE_OPENAPPA` | off | Enable client |
| `CLAWQL_OPENAPPA_URL` | `http://127.0.0.1:8789` | Sidecar base |
| `CLAWQL_OPENAPPA_TIMEOUT_MS` | `250` | Hard timeout budget |
| *(constant)* `OPENAPPA_SUPPORTED_SESSION_CALLS` | `2000` | Documented max gated calls/session until upstream O(1) |
| `CLAWQL_OPENAPPA_CIRCUIT_FAILURES` | `3` | Consecutive failures before open |
| `CLAWQL_OPENAPPA_CIRCUIT_COOLDOWN_MS` | `2000` | Fail-closed cooldown |
| `CLAWQL_OPENAPPA_ALLOW_CACHE_MS` | `250` | Brief allow-cache (`0` disables) |
| `CLAWQL_OPENAPPA_POLICY_EPOCH` | `default` | Bump to invalidate allow-cache on policy deploy |
| `CLAWQL_OPENAPPA_READ_FAILURE_POLICY` | `block` | `warn` = fail-open **reads only** |
| `CLAWQL_SECRET_OPENAPPA_AUTH_TOKEN` | — | Preferred secret (or SecretStore path) |
| `CLAWQL_SECRET_OPENAPPA_AUTH_TOKEN_PREVIOUS` | — | Rotation overlap |

## Sidecar

```bash
appa runtime --adapter opencode --listen 127.0.0.1:8789 \
  --config packages/clawql-api/openappa/appa.toml \
  --db /tmp/clawql-appa.db
```

## Related

- ADR 0013: [`docs/adr/0013-gdp-ts-compile-time-auth-proofs.md`](../adr/0013-gdp-ts-compile-time-auth-proofs.md)
- Session IFC: `packages/clawql-api/src/ifc/session-ifc-enforce.ts`
- Battery README: [`packages/clawql-api/openappa/README.md`](../../packages/clawql-api/openappa/README.md)
