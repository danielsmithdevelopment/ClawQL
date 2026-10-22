# HTTP multiturn p999 remasure — post `_streamMapping` prune (2026-10-22)

**Question:** were ClawQL’s rare 300–700 ms HTTP flow stalls caused by orphan `_streamMapping` growth under sessionful JSON POSTs?

**Answer: no.** On the prune-fixed tip, the old board still shows the same class of stalls (and more of them).

## Board

- Harness: `scripts/benchmarks/gateway-multi-multiturn.mjs`
- Config: `MT_TURNS=12` `MT_ITERS=10000` `CATALOG_TOOL_COUNT=40` `MT_ARMS=clawql_http,clawql_http_bun` `MT_PIN_CORES=1`
- Artifact: [`gateway-multi-multiturn-clawql-http-p999-post-prune-10k.json`](../../benchmarks/gateway-multi-comparison/gateway-multi-multiturn-clawql-http-p999-post-prune-10k.json)

## Flow e2e (10k flows / arm)

| Arm | Pre-prune p999 / n≥300 / max | Post-prune p999 / n≥300 / max |
| --- | ---: | ---: |
| `clawql_http` (Node) | 329 ms / 11 / 543 ms | **513 ms / 21 / 5512 ms** |
| `clawql_http_bun` | 233 ms / 7 / 609 ms | **565 ms / 17 / 635 ms** |

Medians stayed healthy (Node ~52 ms, Bun ~42 ms flow p50). The tail is still a rare-stall story, not a median regression.

## Implication

Closing the JSON `_streamMapping` climb does **not** close the HTTP p999 caveat. Do not update published boards to claim the 300–700 ms stalls are gone. Next hypothesis should look outside map growth (event-loop blocking, GC pauses under equal-arm load, mock/client core contention, session/transport reset paths).

Related: climb fix evidence in [WEEK1-POST-PRUNE.md](./WEEK1-POST-PRUNE.md); lean floor is a separate open item ([memory-plateau.md](../../benchmarks/cloudflare-multiturn/memory-plateau.md)).
