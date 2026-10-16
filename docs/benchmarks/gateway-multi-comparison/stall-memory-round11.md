# Stall + Ready memory — round 11

Follow-up to [`stall-memory-round10.md`](./stall-memory-round10.md) (echo `stack_clean`).

## Board suspect map (auth / OTel / budget)

Equal-arm `clawql_http` forces `CLAWQL_AUTH_MODE=noAuth`, skips payments/network, and leaves OTel off. Startup banner + `/healthz` `http_layer`:

| Suspect | Board state | Mid-run slow events ≥20 ms |
| --- | --- | --- |
| Per-request auth cache / JWKS / KDF | `auth_mode=noAuth` | none |
| OTel batch span export | `otel=0` | none |
| Usage / budget flush | `skip_payments=1`, no VK path | none |

Those three remain the right first suspects **when apiKey/OIDC/OTel/budget are on** (managed Cloud). They do **not** explain the publish-board spikes.

## Killable HTTP-shell layers (binary bisect)

Runner: `scripts/benchmarks/http-only-layer-bisect.mjs`  
Kill switches: `CLAWQL_HTTP_SKIP_AUTH`, `CLAWQL_HTTP_SKIP_PRUNE`, `CLAWQL_HTTP_SKIP_REQUEST_CONTEXT`, `CLAWQL_AUDIT_TOOL_CALLS=0`.  
gw2core pin, n=2500 × 12 turns.

| Step | Layers on | flow p50 | flow p999 | n≥300 ms | mid spikes |
| --- | ---: | ---: | ---: | ---: | ---: |
| `all_kill` | none | 45.0 | **636** | **25** | **19** (max 685) |
| `board_default` | audit+prune+als+auth | 46.3 | 417 | 4 | 3 (max 512) |

Artifact: [`http-only-layer-bisect.json`](./http-only-layer-bisect.json).

**Verdict: `tool_x_http`.** Spikes remain (and were worse) with auth middleware, ALS request context, streamMapping prune, and audit ring all disabled. No `[clawql-http-layer]` slow auth/prune lines lined up with stalls.

## Tool-path cut (search vs known-op)

Same pin, n=2500:

| Arm | RPCs/turn | flow p50 | flow p999 | n≥300 ms |
| --- | ---: | ---: | ---: | ---: |
| `clawql_http` | 2 (search+execute) | 45.7 | 391 | 5 |
| `clawql_http_known` | 1 (execute only) | **27.7** | 306 | 3 |

Artifacts: [`http-tool-bisect-clawql_http.json`](./http-tool-bisect-clawql_http.json), [`http-tool-bisect-clawql_http_known.json`](./http-tool-bisect-clawql_http_known.json).

Execute-only still spikes → not “search discovery only.” Median improves (fewer RPCs); rare ~300–500 ms stalls remain on the execute×HTTP path.

## Instrumentation shipped

- `src/http/mcp-http-layer-diag.ts` — banner, slow event log, flag resolve (Effect)
- `/healthz` → `http_layer` object for harness capture
- Multiturn forwards `[clawql-http-layer]` stderr and records `http_layer` / `http_layer_banner` on the board row

## Next

1. **Inside execute×HTTP** — compare stdio execute stall rates on the same pin; instrument ClawQL→upstream fetch vs in-process gaps at spike timestamps (already have `CLAWQL_UPSTREAM_FETCH_DIAG` / mock logs).
2. **Lean `createMcpHttpApp` + empty catalog** only if needed to separate app shell from tool registration (shell kill already negative).
3. Demote auth-cache/OTel/budget for **this** board; keep SWR / key-id cache as product hardening when those modes are enabled.
4. Memory + fusion boards unchanged in priority behind this cut.
