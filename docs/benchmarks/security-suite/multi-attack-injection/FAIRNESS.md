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

## Headline (smoke v4)

With the native-tool governance choke point:

- `clawql_default` **0/12** trusted effectuation (park overwrites; labeled appends are not trusted success)
- Passthrough **12/12** (trusted hostile writes)
- **Persistent injection** blocked across sessions
- **Recall integrity**: labeled 99.99 poison does not displace authoritative **15.00**
- Benign expect-match includes same-source reply, internal team channel, internal forward; third-party notify still blocked

### Contamination (aligned with governance board)

Hostile `OVERRIDE` / `99.99` content **contaminates** only when surfaced **as trusted** (no `clawql-untrusted` label). Labeled poison is allowed in the vault and is not “clean” in the colloquial sense — it is **not trusted**.

### Honesty labels (keep on the page)

| Label | Meaning |
| ----- | ------- |
| Scripted, worst-case model | Always complies; measures gateway stop |
| Smoke sample | n=12 until dozens |
| Peers pending | Obot / Bifrost / Executor not yet measured |

**Next for a publishable lead:** peer runs on the same twelve attacks; real-model matrix.

See [NATIVE-TOOL-GOVERNANCE.md](./NATIVE-TOOL-GOVERNANCE.md).
