# OpenAPPA Layer 5 — information-flow beside Panguard

ClawQL’s security stack diagram places **OpenAPPA** at **Layer 5 (information-flow policy)**, immediately after **Panguard / ATR (Layer 4, tool-call gate)**. This page documents the shipped opt-in wire.

| Layer | Engine | Question answered |
| --- | --- | --- |
| 4 | Panguard + Agent Threat Rules | May this *tool* run for this principal / ATR scope? |
| 5 | OpenAPPA | May *this labeled data* flow to *that* sink? |

Session IFC (`mayFlow` in `clawql-api`) is the **in-gateway stand-in** when OpenAPPA is off. OpenAPPA does **not** replace Panguard; both can run. Order is fixed:

```text
wrapRegisteredMcpToolHandler
  → Panguard / mcp-proxy pre-execute (Layer 4)
  → OpenAPPA POST /hook tool_call (Layer 5)
  → session IFC + park destructive
  → handler
  → OpenAPPA POST /hook tool_result (Layer 5)
```

Paper: [arXiv:2607.24625](https://arxiv.org/abs/2607.24625). Upstream: [archestra-ai/OpenAPPA](https://github.com/archestra-ai/OpenAPPA).

## Opt-in env

| Variable | Default | Meaning |
| --- | --- | --- |
| `CLAWQL_ENABLE_OPENAPPA` | off | `1` / `true` / `yes` enables the client |
| `CLAWQL_OPENAPPA_URL` | `http://127.0.0.1:8789` | Sidecar base URL (`POST /hook`) |
| `CLAWQL_OPENAPPA_ADAPTER` | `opencode` | Wire adapter (`mcp__clawql__*` spelling) |
| `CLAWQL_OPENAPPA_MCP_SERVER` | `clawql` | Namespace segment in wire tool names |
| `CLAWQL_OPENAPPA_FAILURE_POLICY` | `block` | `warn` = fail-open on transport errors |
| `CLAWQL_OPENAPPA_TIMEOUT_MS` | `5000` | Hook HTTP timeout |

## Policy battery

Ship path: [`packages/clawql-api/openappa/`](../../packages/clawql-api/openappa/).

```bash
appa runtime --adapter opencode --listen 127.0.0.1:8789 \
  --config packages/clawql-api/openappa/appa.toml \
  --db /tmp/clawql-appa.db
```

- Declared tools use canonical ids `mcp/clawql/<tool>`.
- Undeclared tools → wire `refuse` / `undeclared_tool` → MCP error (`mechanism: openappa_layer5`).
- `requires.attention = ["human-approval"]` → ClawQL `mandate_required`.
- `deny_call` with remedy `offers` → blocked MCP error carrying `openappaOfferIds` (remedy execution is a follow-up).

## Client API

Effect service: `OpenAppaService` (`packages/clawql-api/src/openappa/`). Forced MCP host edge stays in `src/mcp/mcp-tool-wrap.ts` via `Effect.runPromise`.

## Related

- ADR 0013 (gdp-ts is Layer 1; engines decide, proofs deliver): [`docs/adr/0013-gdp-ts-compile-time-auth-proofs.md`](../adr/0013-gdp-ts-compile-time-auth-proofs.md)
- Marketing stack tags: `apps/www/src/lib/security-stack.ts`
- Session IFC (in-gateway stand-in): `packages/clawql-api/src/ifc/session-ifc-enforce.ts`
