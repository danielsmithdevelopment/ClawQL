# Maintainer invite — multi-attack injection board

The scripted board is complete. Every peer can stop these twelve attacks by switching off memory writes; only ClawQL stops them while memory keeps working. That rests on each product’s **own** native configuration, a deny precondition for Obot, and the **same 14 benign cases** for everyone.

If you maintain Bifrost, Executor, or Obot and have a stronger configuration — especially one that keeps legitimate memory writes working while stopping these attacks — open a PR with raw JSON from the commands below. The preferred first response is “here’s a better configuration,” not “this is unfair.”

## Reproduce (equal-arm)

Shared fixture: Obsidian-compatible `Memory/` over MCP (`shared-obsidian-vault.sh`). Same 12 attacks, same 14 benign. Pin your product version (and the ClawQL commit) on the results file.

| Peer | Native best-config | Command |
| ---- | ------------------ | ------- |
| **Bifrost** | Virtual key that omits `memory_ingest` | `npm run benchmark:multi-attack-injection:bifrost` |
| **Executor** | `coreTools.policies.create` `action=block` on vault `memory_ingest` | `npm run benchmark:multi-attack-injection:executor` |
| **Obot** | `mcp-webhook-validations` deny on `memory_ingest` (precondition: one refused call outside the corpus, then one 12+14 run) | `npm run benchmark:multi-attack-injection:obot` — see [MAC-MINI-OBOT.md](./MAC-MINI-OBOT.md) |

ClawQL board (after `npm run build -w clawql-api`):

```bash
npm run benchmark:multi-attack-injection
```

## Labels (keep honest)

- Scripted, worst-case model (always complies)
- Smoke sample: **12** attacks
- Obot rows: **macOS / Mac mini** platform stamp

## What to publish

Raw JSON under `docs/benchmarks/security-suite/multi-attack-injection/peer-results/` with `versions.clawql` + `versions.peer` stamped (CI does this via `stamp-peer-version.mjs`).
