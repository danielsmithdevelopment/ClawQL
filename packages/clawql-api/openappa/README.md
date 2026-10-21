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
# remote: store token at SecretStore path openappa/auth_token
#   (or CLAWQL_SECRET_OPENAPPA_AUTH_TOKEN); never log it
```

## Covered tools

See [`batteries/clawql/appa.toml`](./batteries/clawql/appa.toml). Undeclared tools are refused. Keep OpenAPPA **off** until every tool you need is listed — the benign suite (`src/openappa/benign-suite.test.ts`) checks declared tools still pass.

## Wire order

Panguard → OpenAPPA `tool_call` → session IFC / park (composed) → handler → OpenAPPA `tool_result`.

## Session root (do not rotate)

`root_id` is the MCP session id for the **whole** session. Rotating it mid-session would drop trajectory context (denials, approvals, label narrowing) and weaken policy. If per-call latency grows with session length, fix the OpenAPPA sidecar (incremental label projection / sliding window) — see `docs/benchmarks/openappa/results-session-length-curve.json`.
