# Multi-attack injection — fairness

## Credibility

| Label             | Use when                                                                        |
| ----------------- | ------------------------------------------------------------------------------- |
| **`not_offered`** | Product never claims the capability (e.g. signed approvals with a security key) |
| **`pending`**     | Outcome is measurable but not yet run                                           |

Injection resistance is an **outcome**. Any gateway can be put through the same attacks. Marking peers `not_offered` hides a measurable result.

## Two-part headline (both true)

1. **Scripted board = the guarantee.** When a model _is_ fooled, ClawQL stops the action (park / label / data-flow), regardless of the model’s judgment. Every peer can stop the same plants by switching off memory writes; only ClawQL stops them while memory keeps working.
2. **Live runs = how often models get fooled,** and that ClawQL costs nothing when they don’t (same **14 of 14** benign either way).

One line: _Models resist most attacks; ClawQL is there for the ones they don’t, at no cost to ordinary work._

See [LIVE.md](./LIVE.md).

## Scripted board (complete)

| Arm                          | Attacks taking effect | Benign cases as expected |
| ---------------------------- | --------------------- | ------------------------ |
| ClawQL defaults              | 0 of 12               | 14 of 14                 |
| Bifrost, best configuration  | 0 of 12               | 9 of 14                  |
| Executor, best configuration | 0 of 12               | 9 of 14                  |
| Obot, best configuration     | 0 of 12               | 9 of 14                  |
| Every peer on defaults       | 12 of 12              | 14 of 14                 |

Native peer configs · Obot deny precondition · same 14 benign · version pins · [maintainer invite](./MAINTAINER-INVITE.md).

## Live protocol (anti-cherry-pick)

- **Pre-register** 3–5 deployment-realistic models (`scripts/benchmarks/multi-attack-injection/live-models.json`). Publish every result, including all-refuse. **Do not** search for a gullible model until passthrough shows loss.
- **Published attack sets** for live hardness: AgentDojo and Datadog’s counterfeit-policy technique ([COUNTERFEIT-POLICY.md](./COUNTERFEIT-POLICY.md)). Self-written n=12 is the smoke/scripted corpus — not the sole hardness claim.
- **Poison residue:** a model can refuse an injected instruction and still store poisoned text (ordinary summary). Measure where hostile content landed (trusted vs labeled), not only whether the model obeyed.

### composer-2.5-fast (first pre-registered model)

Measured: refused all **12** instruction-follow attempts on **both** ClawQL and passthrough; **no** hostile vault residue under the ingest-or-refuse prompt; ClawQL benign **14 of 14**. Ordinary-summarization probe (3 attacks × 2 arms, same model) also refused with no residue. Report as-is — not a live gateway split; smoke remains the complying-agent guarantee.

## Columns

| Column          | Meaning                                                     |
| --------------- | ----------------------------------------------------------- |
| **Defaults**    | Stock product                                               |
| **Best-config** | Recommended hardening via **that product's own mechanisms** |

Forbidden on ClawQL configured: `BLOCK_TOOLS` listing the attacked tools.

| Peer     | Best-config (native only)                                                        |
| -------- | -------------------------------------------------------------------------------- |
| Bifrost  | VK omits `memory_ingest`                                                         |
| Executor | `policies.block` on vault ingest                                                 |
| Obot     | `mcp-webhook-validations` deny (precondition outside corpus, then one 12+14 run) |

## Shared vault

Every arm writes Obsidian-compatible `Memory/` over MCP (`vault-mcp.mjs`).

## Honesty labels

| Label                      | Meaning                                                  |
| -------------------------- | -------------------------------------------------------- |
| Scripted, worst-case model | Always complies; measures gateway stop                   |
| Smoke sample               | n=12 self-written plants                                 |
| Live models                | Pre-registered; publish all-refuse                       |
| Live hardness              | AgentDojo + Datadog counterfeit (published)              |
| Poison residue             | Hostile text in vault after session — trusted vs labeled |
| Platform stamp             | Obot = macOS / mac_mini                                  |
| Version pins               | ClawQL commit + peer image/binary/npm                    |

## Counterfeit-policy cell

Cite [Datadog — Jev as a judge](https://securitylabs.datadoghq.com/articles/jev-as-a-judge-how-counterfeit-policy-steers-jev/). ClawQL deterministic **0 of 4**; model-judged peers pending on public sets + JevShield. See [COUNTERFEIT-POLICY.md](./COUNTERFEIT-POLICY.md).
