# Track B result — **tie → purge** (valid retest)

**Run:** [36823799781](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/36823799781)  
**Decision:** [`codegraph-beat-decision.json`](codegraph-beat-decision.json)  
**Void prior keep:** [`TRACK_B_VOID_RETEST.md`](TRACK_B_VOID_RETEST.md)

## Instrument check

| Gate | Result |
| ---- | ------ |
| Offline `smoke_grep_no_harm` | 6/6 gold paths |
| Live `A-grep` × no-harm | **6/6** (tools offered; `tool_trace` shows real `rg` hits) |

## Locked beat (paired 18×2)

| Metric | Value |
| ------ | ----- |
| Outcome | `tie_purge` → freeze `purge_codegraph_from_bundle` |
| Prove | grep **12/12**, treatment **12/12**, **W=0 L=0 Net=0** |
| No-harm | treatment **6/6** pass; used_codegraph 5/6 |
| Usage | treatment used_codegraph **12/12** prove |

Against a **working** grep control, CodeGraph adds no Net wins (both arms clear every prove key). Locked rule: Net ∈ [-4,+4] counts as purge — `codegraph_*` leaves the 8.0.0 bundle.

Memory baseline was not re-spent on this retest (paired arms only).
