# Category dominance roadmap

Equal-arm only. Published competitor strengths explain _why_ a peer matters; they are not a substitute for a shared fixture. Marketing claims on clawql.com/benchmarks stay bound to measured boards; this page names who else must clear the minimum set before a **category-wide** claim.

Live table: [clawql.com/benchmarks#dominance](https://clawql.com/benchmarks/#dominance).

## Minimum set for a conclusive claim

1. Equal-arm multi-turn workflow (same OpenAPI / pets fixture)
2. Interleaved runs (n ≥ 10 000 for tails)
3. Weighted tokens (definitions + discovery + results + **5×** model-written)
4. Real models with rules frozen beforehand
5. Full process-tree RSS
6. p99 concurrency under an explicit SLO
7. Governance surfaces exercised (audit entries + policy-bound writes)
8. Published harness, fixtures, and raw artifacts
9. Maintainer invitation for config fixes

## Competitors

| Competitor                      | Why it matters (published strengths)                                                                                      | Key criteria to beat                                                                                          | How to prove (equal-arm)                                                                                              | ClawQL status                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Bifrost (Maxim)**             | Code Mode: 58–92.8% input-token reduction at 96–508 tools; 11 µs overhead @ 5k RPS; virtual-key tool scoping + audit logs | Multi-turn weighted tokens (incl. model-written), p99 concurrency under SLO, governance depth on same fixture | Interleaved multi-step OpenAPI/pets vs their Code Mode; publish harness + raw results; invite maintainer config fixes | **Tokens measured** — Code Mode 2.25× / classic 3.95× vs ClawQL; still need p99 + governance depth |
| **TrueFoundry**                 | Enterprise governance (HITL, per-user delegation, RBAC); ~3–4 ms latency; 350 RPS/core; strong observability              | Token savings + concurrency vs their gateway, policy-bound writes, audit completeness                         | Same multi-turn board with their MCP proxy; weighted tokens + p99 clients before SLO break; approval binding + trail  | Not on board                                                 |
| **Cloudflare Code Mode**        | Entire ~2.5k-endpoint API in ~1k tokens via code execution                                                                | Known-ops / filtered path tokens on zone-audit style workflow; real-model turns                               | Replay identical Cloudflare fixture; weighted tokens + turns; ClawQL known-ops or program still lower                 | **Partial** — fan-out/join + plan.c; finish blind dual-model |
| **Uber MCP Gateway**            | 800+ servers / 5k tools; tool search + GraphQL-style projection + Code Mode default                                       | Result projection + search efficiency on multi-turn; scale-out concurrency                                    | Adapt published techniques to shared fixture; projection savings vs ClawQL JMESPath + known-ops                       | Not on board                                                 |
| **agentgateway (Solo.io / LF)** | MCP + A2A federation; CEL policies; OpenTelemetry; already in prior boards                                                | Token efficiency and concurrency on equal-arm board; policy expressiveness                                    | Re-run pets/Cloudflare boards with latest version; A2A multi-agent turn if relevant                                   | **Measured** — remasured 2026-10-17 (3.95× tokens; chaos 63/64) |
| **IBM ContextForge**            | Multi-protocol federation; 40+ plugins; already measured (higher latency)                                                 | Latency + token overhead vs nested setups; governance plugins                                                 | Direct equal-arm (no nesting); gateway-cost p50/p999 + RSS under same SLO                                             | **Partial** — nested adapter off by default                  |
| **Obot**                        | OSS enterprise registry + per-tool policy; curated catalogs; K8s-native                                                   | Token surface of curated tools; policy enforcement overhead                                                   | Definitions + discovery with their catalog model; audit/policy on same workflow                                       | **Tokens measured** — mcp-connect catalog 3.95× vs ClawQL; policy overhead still open |
| **Executor (v1/v2)**            | Closest prior peer; sandbox code execution; already on published boards                                                   | Confirm leads after their updates; multi-turn + concurrency                                                   | Re-run full board with latest versions; real-model validation under pre-committed rules                               | **Measured** — v1 remasured 2026-10-17 (6.06×); v2 β + chaos HTTP pending |

## Priority order (next proofs)

1. **Bifrost** — tokens on board (Code Mode 2.25×); still need p99 concurrency + governance depth for a category claim.
2. **Cloudflare Code Mode** — finish blind small/dual fan-out under frozen rules; compact-execute remeasure of zone-audit cells.
3. **TrueFoundry / Uber** — next unmeasured peers (governance + projection technique).
4. **Executor / agentgateway / Obot** — keep version-scoped claims current; Executor HTTP chaos + Obot policy overhead.
5. **ContextForge (direct)** — non-nested equal-arm when bandwidth allows.

## Related boards

- Pets multiturn + latency: [gateway-multi-comparison](./gateway-multi-comparison/README.md)
- Cloudflare zone-audit + fan-out: [cloudflare-multiturn](./cloudflare-multiturn/README.md)
- Marketing surface: `apps/www/src/lib/dominance-roadmap.ts`
