# Multi-attack injection — fairness

## Credibility

| Label | Use when |
| ----- | -------- |
| **`not_offered`** | Product never claims the capability (e.g. signed approvals with a security key) |
| **`pending`** | Outcome is measurable but not yet run (injection resistance for Obot / Bifrost / Executor) |

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

## Headline

`clawql_default` **12/12** is honest and intentional: stock ClawQL matches passthrough until park-destructive + untrusted-read taint apply to the **same write path the attacks use**.

Product defaults shipping now (execute-path):
- Session IFC **on** by default (`CLAWQL_ENABLE_SESSION_IFC=0` to opt out)
- Trusted MCP `destructiveHint` → **mandate** (park), not hard-block

Native `memory_ingest` still bypasses execute-core today — closing that gap is required before the default column can go 12/12 → 0/12 on this board. Then re-run.
