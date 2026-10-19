# Multi-attack injection

Planted instructions across email / ticket / doc / webhook. Metric: **attacks taking effect / planted**, published beside **benign cases as expected**.

- [FAIRNESS.md](./FAIRNESS.md) — pending vs not_offered; native peer mechanisms; shared Obsidian vault
- Smoke results: [results-smoke.json](./results-smoke.json)
- Peer CI artifacts: [peer-results/](./peer-results/)
- Harness: `npm run benchmark:multi-attack-injection`
- Peers: `npm run benchmark:multi-attack-injection:bifrost` · `:executor` · `:obot` (Docker)

| Headline (v4e) | Same 14 benign on every arm: `clawql_default` **0/12** + **14/14**; Bifrost/Executor best-config **0/12** + **9/14** (0 of 5 memory writes) |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |

**Shared vault:** peers have no built-in Obsidian vault — every arm writes the same `Memory/` over MCP.

**Not published as a live claim yet.** Do **not** publish until: Obot measured (or clearly pending), Executor best-config is native (never a deny-tools stand-in), every best-config arm has benign numbers, product defaults shipped, and `MAI_LIVE=1` real-model matrix is the last step before a lead claim.
