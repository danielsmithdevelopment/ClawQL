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

```bash
CLAWQL_OPENAPPA_URL=http://127.0.0.1:8790 \
  node scripts/benchmarks/openappa/measure-hook-latency.mjs
# default n=10000 (real p999); for smaller n report p99 — p999≈max when n=200
```

Results: [`docs/benchmarks/openappa/results-latency.json`](../benchmarks/openappa/results-latency.json) (`metric: openappa_hook_overhead_ms`).

Measured (keep-alive, root rotation every 50, `n=10000`, loopback): **p50 ≈ 1.9 ms**, **p99 ≈ 3.6 ms**, **p999 ≈ 6.4 ms** — report as OpenAPPA overhead only; ClawQL gateway baseline remains ~1.3 ms p50. With `n=200`, prefer **p99** (p999 is essentially the max).

Mitigations shipped:

- **Persistent keep-alive** undici `Agent` per sidecar URL (not a new connection per call).
- **Brief allow-cache** for identical requests (`CLAWQL_OPENAPPA_ALLOW_CACHE_MS` default `250`). Cleared when `CLAWQL_OPENAPPA_POLICY_EPOCH` changes, on circuit open, or on non-allow decisions.

## 4. Covered tools (battery)

Declared in [`packages/clawql-api/openappa/batteries/clawql/appa.toml`](../../packages/clawql-api/openappa/batteries/clawql/appa.toml). Benign suite: `packages/clawql-api/src/openappa/benign-suite.test.ts`.

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
