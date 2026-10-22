# HTTP multiturn p999 — post-prune + Rust stall-control (2026-10-22)

**Question 1:** were ClawQL’s rare 300–700 ms HTTP flow stalls caused by orphan `_streamMapping` growth under sessionful JSON POSTs?

**Answer: no.** On the prune-fixed tip, the board still shows the same class of stalls (and more of them). Three remasures confirm the counts are stable, not run-to-run noise.

**Question 2:** if Rust over the same harness / client / mock shows zero ≥300 ms sessions while Bun and Node keep showing them, are the stalls in the TypeScript server path or its runtime?

**Answer: not proven.** Rust also shows ≥300 ms flows on every rep (fewer than TS; much healthier p999). Shared path (harness, client, mock, host) remains in the suspect set.

## Board

- Harness: `scripts/benchmarks/gateway-multi-multiturn.mjs`
- Config: `MT_TURNS=12` `MT_ITERS=10000` `CATALOG_TOOL_COUNT=40` `MT_PIN_CORES=1`
- Arms: `clawql_http`, `clawql_http_bun`, `clawql_dataplane` (Rust execute-only; same catalog mock + MCP client)
- Artifacts: `stall-control-rep{1,2,3}-10k.json` under [`gateway-multi-comparison/`](../../benchmarks/gateway-multi-comparison/)

## Flow e2e — 3×10k (n≥300 ms)

| Arm | Rep1 n≥300 / p999 / max | Rep2 | Rep3 |
| --- | ---: | ---: | ---: |
| `clawql_http` (Node) | **19** / 517 ms / 561 ms | **19** / 532 ms / 573 ms | **18** / 513 ms / 571 ms |
| `clawql_http_bun` | **17** / 560 ms / 622 ms | **17** / 619 ms / 683 ms | **17** / 591 ms / 663 ms |
| `clawql_dataplane` (Rust) | **7** / 81 ms / 797 ms | **8** / 58 ms / 850 ms | **7** / 100 ms / 817 ms |

Pre-prune single board (for reference): Node 11 / Bun 7 ≥300 ms. Post-prune single board: Node 21 / Bun 17. The 3× series matches the post-prune band — treat the jump as **real and stable**, not variance from one noisy run.

Medians stay healthy (Node ~49 ms, Bun ~40 ms, Rust ~19 ms flow p50). Rust’s p999 is an order of magnitude cleaner; its rare stalls are still all on the execute path (no search) and often land in the 700–850 ms bucket.

## Implication

1. Closing `_streamMapping` does **not** close the HTTP p999 caveat.
2. Rust-as-control **does not** clear harness/client/mock/host — those remain live hypotheses.
3. TS arms still show ~2× the stall count of Rust on this board; amplification in the TS server path/runtime is still plausible, but not exclusive.

Next: localize shared-path stalls (client event-loop / mock / pin layout / fat-body execute) with the same 3× recipe; keep publishing medians, not stall-free headlines.

Related: climb fix [WEEK1-POST-PRUNE.md](./WEEK1-POST-PRUNE.md); lean floor restore [LEAN-BISECT.md](./LEAN-BISECT.md) / [memory-plateau.md](../../benchmarks/cloudflare-multiturn/memory-plateau.md).
