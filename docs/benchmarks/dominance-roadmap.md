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

| Competitor                                | Why it matters (published strengths)                                                                                                          | Key criteria to beat                                                                                          | How to prove (equal-arm)                                                                                                   | ClawQL status                                                                                                                                                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bifrost (Maxim)**                       | Code Mode: 58–92.8% input-token reduction at 96–508 tools; 11 µs overhead @ 5k RPS; virtual-key tool scoping + audit logs                     | Multi-turn weighted tokens (incl. model-written), p99 concurrency under SLO, governance depth on same fixture | Interleaved multi-step OpenAPI/pets vs their Code Mode; publish harness + raw results; invite maintainer config fixes      | **Tokens measured** — Code Mode 2.25× / classic 3.95× @N=12. Governance board **harness ready** (`BIFROST_MCP_URL`); peer row skipped until wired                                                                       |
| **TrueFoundry**                           | Enterprise governance (HITL, per-user delegation, RBAC); ~3–4 ms latency; 350 RPS/core; strong observability                                  | Token savings + concurrency vs their gateway, policy-bound writes, audit completeness                         | Same multi-turn board with their MCP proxy; weighted tokens + p99 clients before SLO break; approval binding + trail       | Not on board — **credentials / SaaS gateway plane**                                                                                                                                                                     |
| **Cloudflare Code Mode**                  | Entire ~2.5k-endpoint API in ~1k tokens via code execution                                                                                    | Known-ops / filtered path tokens on zone-audit style workflow; real-model turns                               | Replay identical Cloudflare fixture; weighted tokens + turns; ClawQL known-ops or program still lower                      | **Partial** — fan-out/join + plan.c; finish blind dual-model                                                                                                                                                            |
| **Uber MCP Gateway**                      | 800+ servers / 5k tools; tool search + GraphQL-style projection + Code Mode default                                                           | Result projection + search efficiency on multi-turn; scale-out concurrency                                    | Adapt published techniques to shared fixture; projection savings vs ClawQL JMESPath + known-ops                            | Not on board — **not OSS**; technique bake-off only                                                                                                                                                                     |
| **agentgateway (Solo.io / LF)**           | MCP + A2A federation; CEL policies; OpenTelemetry; already in prior boards                                                                    | Token efficiency and concurrency on equal-arm board; policy expressiveness                                    | Re-run pets/Cloudflare boards with latest version; A2A multi-agent turn if relevant                                        | **Measured** — re-pin latest binary                                                                                                                                                                                     |
| **IBM ContextForge**                      | Multi-protocol federation; 40+ plugins; already measured (higher latency)                                                                     | Latency + token overhead vs nested setups; governance plugins                                                 | Direct equal-arm (no nesting); gateway-cost p50/p999 + RSS under same SLO                                                  | **Partial** — nested adapter off by default                                                                                                                                                                             |
| **Obot**                                  | OSS enterprise registry + per-tool policy; curated catalogs; K8s-native                                                                       | Token surface of curated tools; policy enforcement overhead                                                   | Definitions + discovery with their catalog model; audit/policy on same workflow                                            | **Tokens + governance measured** — classic 3.95× @N=12; policy-depth CI [39181888666](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/39181888666): ClawQL **5/5** vs Obot **2/5** (default allow-ingest) |
| **Executor (v1/v2)**                      | Closest prior peer; sandbox code execution; **per-tool approvals** + MCP proxy (Gmail wrappers)                                               | Token lead + governance: risky-write / untrusted-read / model-resume                                          | Tokens: re-pin latest. Governance: `ci-executor-peer.sh` on [governance-policy-depth](./governance-policy-depth/README.md) | **Tokens + cells** — pause cells tie **5/5**; **resume_auto_approve** ClawQL **5/5** vs Executor **2/5** (model resume accept contaminates)                                                                             |
| **celld program journal (ProgramCellDO)** | Journaled program resume ([durability STATUS](./durability-proof/STATUS.md); [golem honesty](../gtm/golem-overlap-and-durability-honesty.md)) | Lab isolate SIGKILL + kill-mid-write CI + fleet peer kill on conforming bucket                                | Dual-column comparison; named Pi/Golem boards after invite                                                                 | **Lab Yes · fleet Yes (R2)** — A/B/C/D measured; peers pending invite; hot-path A/B 10k PASS (+2.7% p50)                                                                                                                |

## Priority order (next proofs)

1. **Security suite (beyond block lists)** — [security-suite/ROADMAP.md](./security-suite/ROADMAP.md): multi-attack injection → approval integrity → allowed-tool exfil → secret visibility → kill-mid-write. Peers without a capability = `not_offered`.
2. **Governance v2 follow-through** — peer best-config CI rows; ClawQL product defaults (destructive park + untrusted taint) so `clawql_default` can reach 5/5 without `BLOCK_TOOLS`.
3. **Bifrost / Obot tokens + p99** — governance defaults already tied; concurrency still open for category claim.
4. **Cloudflare Code Mode** — finish blind small/dual fan-out under frozen rules.
5. **celld program journal (durability ladder)** — [durability-proof/STATUS.md](./durability-proof/STATUS.md); then Executor re-pin / Uber·ContextForge·TrueFoundry.

## Related boards

- Pets multiturn + latency: [gateway-multi-comparison](./gateway-multi-comparison/README.md)
- Peer install recipes: [dominance-peers-wiring](./dominance-peers-wiring.md)
- celld env vs Core hot path: [celld-hotpath-ab](./celld-hotpath-ab/README.md)
- Cloudflare zone-audit + fan-out: [cloudflare-multiturn](./cloudflare-multiturn/README.md)
- Marketing surface: `apps/www/src/lib/dominance-roadmap.ts`
- Celld pin + injection drills: `clawql security celld` / `clawql security inject`
- Governance / policy-depth equal-arm: [governance-policy-depth](./governance-policy-depth/README.md) (`npm run benchmark:governance-policy-depth`)
