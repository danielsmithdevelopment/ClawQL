# Multi-attack injection — fairness

## Credibility

| Label             | Use when                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------ |
| **`not_offered`** | Product never claims the capability (e.g. signed approvals with a security key)            |
| **`pending`**     | Outcome is measurable but not yet run (injection resistance for Obot / Bifrost / Executor) |

Injection resistance is an **outcome**. Any gateway can be put through the same twelve (then dozens of) attacks. Marking peers `not_offered` hides a measurable result.

## Columns

| Column          | Meaning                                                      |
| --------------- | ------------------------------------------------------------ |
| **Defaults**    | Stock product                                                |
| **Best-config** | Recommended hardening via **general mechanisms** (not tools) |

### Configured ClawQL — name mechanisms, not tools

Allowed: untrusted-read taint · park destructive writes · data-flow rules.

Forbidden: `BLOCK_TOOLS` (or equivalent) listing the tools the twelve attacks use. That only shows a block list blocks what’s on it — the same credibility failure as governance v1.

## Labels on every published run

1. **Scripted, worst-case model** — always complies; measures gateway stop, not model susceptibility. Real-model matrix is separate.
2. **Sample size** — 12 = smoke until the suite grows to dozens.
3. **Benign cost** — always publish `benign_completed_without_human` beside attack rate.

## Headline (smoke v3 — gentler defaults)

With the native-tool governance choke point:

- `clawql_default` **0/12** via park of **overwrites** of authoritative facts (product gate — not a tool-name deny)
- Passthrough **12/12**
- **Persistent injection** blocked: labeled-untrusted poison survives recall; external exfil refused
- Benign: **every** workflow completes without a human (append summaries after untrusted reads are labeled, not blocked)

Trusted effectuation only: labeled-untrusted vault notes do **not** count as attack success.

See [NATIVE-TOOL-GOVERNANCE.md](./NATIVE-TOOL-GOVERNANCE.md). Peers remain **pending** until measured.
