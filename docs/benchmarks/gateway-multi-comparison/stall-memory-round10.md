# Stall + Ready memory — round 10

Follow-up to [`stall-memory-round9.md`](./stall-memory-round9.md).

## Inference correction: host noise is unlikely

Peers run **HTTP** on the same 4-CPU machine; their flow p999 roughly halved with a second gateway core. ClawQL **stdio** also improved. Only ClawQL **HTTP** did not. General host noise would hit peers too — so the remaining spike is almost certainly **ClawQL HTTP-path specific**. A larger host is a costly way to re-ask the same question.

## Decisive experiment: echo through ClawQL-shaped HTTP stack

Do-nothing `echo` tool via Express + MCP `StreamableHTTPServerTransport` (sessionful, `enableJsonResponse`, standalone GET SSE → 405) — same shape as the ClawQL bench client settings. Isolated `gateway_2core` pin. Runner: `scripts/benchmarks/http-stack-echo-bisect.mjs`.

| Board | flow p50 | flow p999 | n≥300 ms | vs ClawQL HTTP p999 (gw2core) |
| --- | ---: | ---: | ---: | ---: |
| Echo Node n=10 000 | **11.3** | **105** | **1** | ClawQL Node **669** (18× ≥300 ms) |
| Echo Node n=3 000 | 11.7 | 89 | 0 | — |
| Echo Bun n=3 000 | *(see artifact)* | | | ClawQL Bun **759** |

Artifacts: [`http-stack-echo-bisect-10k.json`](./http-stack-echo-bisect-10k.json), [`http-stack-echo-bisect-3k.json`](./http-stack-echo-bisect-3k.json), [`http-stack-echo-bisect-bun-3k.json`](./http-stack-echo-bisect-bun-3k.json).

**Verdict: `stack_clean`.** Rare ~500–700 ms spikes are **not** explained by Express + Streamable HTTP + session/JSON settings alone. Stop hunting the bare stack; stop planning Express→raw-http swaps as the first move.

## Next (layer add-back)

Add ClawQL surface back until spikes return:

1. **Full `createMcpHttpApp` with empty/minimal catalog** (skipSpecPreload / lean provider) — same search+execute HTTP client recipe, no fat upstream work.
2. **Search-only vs execute-only** arms (already have split boards) under gw2core pin.
3. **Known-op (execute-only)** vs first-session (search+execute) — if only first-session spikes, discovery path.
4. Only if a layer that is *not* domain logic still spikes: then strip that layer’s middleware.

## Priorities (unchanged order, bisect slotted)

1. ~~Host noise / bigger machine~~ — demoted (this round).
2. **HTTP layer add-back** (time-boxed) — still worth it for managed Cloud (HTTP).
3. **Memory** — SQLite catalog + anon/PSS reporting.
4. **Fusion board** — multi-lookup tasks; model turns.

Buyer story still leads with tokens + realistic upstream (~740–780 ms session band).
