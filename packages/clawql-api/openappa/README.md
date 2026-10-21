# OpenAPPA Layer 5 (ClawQL battery)

Opt-in OpenAPPA beside Panguard. See [`docs/security/openappa-layer5.md`](../../../docs/security/openappa-layer5.md) for fail-closed rules, most-restrictive-wins, ownership vs session IFC, latency, audit, and remote auth.

## Quick start

```bash
appa runtime --adapter opencode --listen 127.0.0.1:8789 \
  --config packages/clawql-api/openappa/appa.toml \
  --db /tmp/clawql-appa.db

export CLAWQL_ENABLE_OPENAPPA=1
export CLAWQL_OPENAPPA_URL=http://127.0.0.1:8789
# timeout default 250ms + circuit breaker; writes always fail closed
# supported: ≤2000 OpenAPPA-gated tool calls per MCP session (see docs)
# remote: store token at SecretStore path openappa/auth_token
#   (or CLAWQL_SECRET_OPENAPPA_AUTH_TOKEN); never log it
```

## Supported session length

Until OpenAPPA decisions are constant-time in session length, ClawQL documents support for **≤ 2,000** OpenAPPA-gated tool calls per MCP session (~2.5× margin under the 250ms budget on the published curve). Past that, fail-closed stays correct but long agents may stop; alerts say `policy latency exceeded budget at call N`. Details: [`docs/security/openappa-layer5.md`](../../../docs/security/openappa-layer5.md).

## Covered tools

See [`batteries/clawql/appa.toml`](./batteries/clawql/appa.toml). Undeclared tools are refused.

The battery covers **Core**, common ADR opt-ins (`console_link`, `docs_search`, `proxy_call`, `execute_program`, …), memory, automation (`schedule` / `notify`), sandbox, documents/Onyx, and Ouroboros. The benign suite asserts a required operator set is declared (`draft-exit coverage`). Niche plugins (IDP documents, data SQL, web browse, ontology, observability, network, webmcp, …) stay **undeclared** → refuse until you add a `[[policy.tool]]` row. Upstream O(1) latency ask: [`docs/benchmarks/openappa/UPSTREAM-TRAJECTORY-GROWTH.md`](../../../docs/benchmarks/openappa/UPSTREAM-TRAJECTORY-GROWTH.md).

## Wire order

Panguard → OpenAPPA `tool_call` → session IFC / park (composed) → handler → OpenAPPA `tool_result`.

## Session root (do not rotate)

`root_id` is the MCP session id for the **whole** session. Rotating it mid-session would drop trajectory context (denials, approvals, label narrowing) and weaken policy. If per-call latency grows with session length, fix the OpenAPPA sidecar (incremental policy state + snapshots) — see `docs/benchmarks/openappa/results-session-length-curve.json`.
