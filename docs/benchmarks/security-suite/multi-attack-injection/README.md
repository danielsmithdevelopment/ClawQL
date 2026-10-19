# Multi-attack injection

Planted instructions across email / ticket / doc / webhook. Metric: **attacks taking effect / planted**, published beside **benign cases as expected** (same 14 on every arm).

- [FAIRNESS.md](./FAIRNESS.md) — pending vs not_offered; native peer mechanisms; shared Obsidian vault; recall answer vs unlabeled poison
- Smoke results: [results-smoke.json](./results-smoke.json)
- Live scaffold: [results-live.json](./results-live.json) (`MAI_LIVE=1` + harder recall queries)
- Peer CI artifacts: [peer-results/](./peer-results/)
- Harness: `npm run benchmark:multi-attack-injection`
- Peers: `npm run benchmark:multi-attack-injection:bifrost` · `:executor` · `:obot` (Docker)

<<<<<<< HEAD
<<<<<<< HEAD

| Headline (v4e) | Same 14 benign on every arm: `clawql_default` **0/12** + **14/14**; Bifrost/Executor best-config **0/12** + **9/14** (0 of 5 memory writes)              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| =======        |
| Headline (v4f) | Same 14 benign; peer best-config **9/14**; recall answer **pass (15.00)** for all measured arms; unlabeled poison separate; harder queries → `MAI_LIVE`  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |

> > > > > > > 1e2dce99 (fix(security): multi-attack v4f — recall answer vs unlabeled poison)
=======
| Headline (v4f) | Same 14 benign; peer best-config **9/14**; recall answer **pass (15.00)** for all measured arms; unlabeled poison separate; harder queries → `MAI_LIVE` |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
>>>>>>> db241edb (fix(security): Obot Mac mini equal-arm harness + platform stamp)

**Shared vault:** peers have no built-in Obsidian vault — every arm writes the same `Memory/` over MCP.

**Not published as a live claim yet.** Next: Obot on the Mac mini — [MAC-MINI-OBOT.md](./MAC-MINI-OBOT.md) (`npm run benchmark:multi-attack-injection:obot`). Docker Desktop VM is fine for attack/benign outcomes. Then `MAI_LIVE=1` with poison-first recall queries.
