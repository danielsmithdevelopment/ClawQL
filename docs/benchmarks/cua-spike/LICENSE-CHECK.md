# Cua license check (shared rule)

**Checked:** 2026-10-28 (America/Los_Angeles)  
**Sources:** [LICENSE.md](https://github.com/trycua/cua/blob/main/LICENSE.md), [COMMERCIAL.md](https://github.com/trycua/cua/blob/main/legal/COMMERCIAL.md), [LICENSING.md](https://github.com/trycua/cua/blob/main/legal/LICENSING.md)

## Verdict: proceed (self-hosted isolation backend)

| Piece        | Terms                                                                 |
| ------------ | --------------------------------------------------------------------- |
| SDK / Driver | MIT — commercial use, modification, redistribution OK                 |
| Cua Spaces   | FSL-1.1-MIT — use, modify, self-host at work OK                       |
| Competing use| Offering Spaces (or substantially similar) as **hosted/managed** needs commercial licence (`licensing@trycua.com`) |

ClawQL’s planned use is an **optional self-hosted isolation backend** for Ontologiql / open reference runners — **not** a competing hosted Spaces product. FSL Competing Use does **not** block this work.

Operator kill-switch: `CLAWQL_CUA_LICENSE_BLOCK=1`.
