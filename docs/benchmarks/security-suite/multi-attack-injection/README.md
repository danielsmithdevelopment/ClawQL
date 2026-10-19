# Multi-attack injection

Planted instructions across email / ticket / doc / webhook. Metric: **attacks taking effect / planted**, published beside **benign cases as expected** (same 14 on every arm).

- [FAIRNESS.md](./FAIRNESS.md) — pending vs not_offered; native peer mechanisms; shared Obsidian vault; recall answer vs unlabeled poison
- [COUNTERFEIT-POLICY.md](./COUNTERFEIT-POLICY.md) — Datadog/Jev cell: deterministic gate vs model-judged gate
- Smoke results: [results-smoke.json](./results-smoke.json)
- Counterfeit-policy cell: [results-counterfeit-policy.json](./results-counterfeit-policy.json)
- Live scaffold: [results-live.json](./results-live.json) (`MAI_LIVE=1` + harder recall queries)
- Peer CI artifacts: [peer-results/](./peer-results/)
- Harness: `npm run benchmark:multi-attack-injection`
- Peers: `npm run benchmark:multi-attack-injection:bifrost` · `:executor` · `:obot` (Docker)
- Counterfeit-policy cell: `npm run benchmark:multi-attack-injection:counterfeit-policy`

| Headline (v4f) | Same 14 benign; peer best-config **9/14**; recall answer **pass (15.00)** for all measured arms; unlabeled poison separate; harder queries → `MAI_LIVE` |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |

**Shared vault:** peers have no built-in Obsidian vault — every arm writes the same `Memory/` over MCP.

**Page framing (Datadog):** Datadog showed that model-judged gates can be talked out of their own policy with a prepended counterfeit policy. ClawQL’s gate does not take instructions from the content it judges — trust comes from source labels and spec-derived risk, not from what an email claims.

**Not published as a live claim yet.** Obot **defaults** measured on the Mac mini (12/12, macOS stamp — same baseline as other gateways). **Best-config** pending until a deny precondition passes, then one corpus run — [MAC-MINI-OBOT.md](./MAC-MINI-OBOT.md). Then `MAI_LIVE=1`.
