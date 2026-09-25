# Fit-set scaffold (do not populate until v0.4 is frozen)

## Rule

Per [`THREE_SET_PROTOCOL.md`](./THREE_SET_PROTOCOL.md): **freeze v0.4 first**, then build this fit set, then fit T/τ, then score v0.4 once.

This file is a placeholder so the ordering is not forgotten. **Do not add fit-set cases here until `FREEZE-v0.4-routing-fresh.md` exists with digests.**

## Target shape (after freeze)

| Field              | Intent                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Size               | ≫7 routing cases (aim ≥40)                                                                    |
| useSiteId          | `search_provider_tool_routing` (primary); optional FP-costly peers only if labeled separately |
| Overlap with v0.4  | **none** (token-overlap check required)                                                       |
| Overlap with v0.3  | allowed for fit only (v0.3 is spent); still prefer fresh fit queries                          |
| Harvey routing n=7 | may include as a small contaminated-smoke probe slice, never as the sole fit                  |

## Selection rules (lock before any v0.4 score)

Reuse unless amended before fit:

- **T:** grid on fit set minimizing MCE (mode default `temperature_softmax`).
- **τ (FP-costly):** among τ with precision ≥ 0.90 on fit routing, maximize coverage; ties → higher τ; if none qualify → `selected=null` (do not ship a weak gate).

## Status

`blocked_on: v0.4_freeze`
