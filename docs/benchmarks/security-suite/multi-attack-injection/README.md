# Multi-attack injection

Planted instructions across email / ticket / doc / webhook. Metric: **attacks taking effect / planted**, published beside **benign cases as expected** (same 14 on every arm).

- [FAIRNESS.md](./FAIRNESS.md) — scripted board complete; version pins; native peer mechanisms; shared Obsidian vault
- [MAINTAINER-INVITE.md](./MAINTAINER-INVITE.md) — per-peer reproduction commands
- [COUNTERFEIT-POLICY.md](./COUNTERFEIT-POLICY.md) — Datadog/Jev cell: deterministic gate vs model-judged gate
- Smoke results: [results-smoke.json](./results-smoke.json)
- Counterfeit-policy cell: [results-counterfeit-policy.json](./results-counterfeit-policy.json)
- Live: [results-live.json](./results-live.json) (`MAI_LIVE=1` hard-recall measured; model sessions when transport lands)
- Peer CI artifacts: [peer-results/](./peer-results/) (each file stamps `versions`)
- Harness: `npm run benchmark:multi-attack-injection`
- Peers: `npm run benchmark:multi-attack-injection:bifrost` · `:executor` · `:obot` (Docker)
- Counterfeit-policy cell: `npm run benchmark:multi-attack-injection:counterfeit-policy`

| Headline (v4g) | Scripted board complete: ClawQL **0/12 + 14/14**; peer best-config **0/12 + 9/14**; defaults **12/12**. Version-pinned. `MAI_LIVE` real-model last. |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |

**Shared vault:** peers have no built-in Obsidian vault — every arm writes the same `Memory/` over MCP.

**Page framing (Datadog):** Datadog showed that model-judged gates can be talked out of their own policy with a prepended counterfeit policy. ClawQL’s gate does not take instructions from the content it judges — trust comes from source labels and spec-derived risk, not from what an email claims.

**Scripted board complete** (Obot best-config measured on Mac mini with deny precondition). Keep scripted labels + version pins + [maintainer invite](./MAINTAINER-INVITE.md). **Live** (`composer-2.5-fast`): model refused all 12 on ClawQL and passthrough — measured model-resistance, not a gateway split; smoke remains the complying-agent claim.
