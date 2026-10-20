# Multi-attack injection

Planted instructions across email / ticket / doc / webhook. Metric: **attacks taking effect / planted**, published beside **benign cases as expected** (same 14 on every arm).

- [FAIRNESS.md](./FAIRNESS.md) — two-part headline; scripted guarantee + live fool-rate
- [LIVE.md](./LIVE.md) — pre-registered models; live table; dual-arm benign; run order
- [AGENTDOJO.md](./AGENTDOJO.md) — next hardness (ahead of remaining hosted models)
- [MAINTAINER-INVITE.md](./MAINTAINER-INVITE.md) — per-peer reproduction commands
- [COUNTERFEIT-POLICY.md](./COUNTERFEIT-POLICY.md) — Datadog/Jev cell
- Smoke: [results-smoke.json](./results-smoke.json) · Live: [results-live.json](./results-live.json) · AgentDojo: [results-agentdojo.json](./results-agentdojo.json)
- Peer CI: [peer-results/](./peer-results/) (version-stamped)
- Harness: `npm run benchmark:multi-attack-injection` · peers `:bifrost` / `:executor` / `:obot` · `:agentdojo`

| Headline | Scripted guarantee when fooled + live fool-rate at no benign cost. _Models resist most attacks; ClawQL is there for the ones they don’t._ |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |

**Published now:** scripted board (complete) + live table in progress (7 pre-registered: 1 measured, 6 pending).

**Do not** hunt for a gullible model. Pre-register models (`live-models.json`), including small open-weight; publish all-refuse. **AgentDojo:** smoke labeled exploratory ([AGENTDOJO.md](./AGENTDOJO.md)); full suites before any ASR headline; compare to CaMeL. **Next:** remaining hosted models, then open-weight dual-arm benign. Measure poison residue as well as obedience.

**composer-2.5-fast (measured):** refused all 12 on ClawQL and passthrough; no hostile vault residue; benign 14/14. Smoke remains the complying-agent guarantee.
