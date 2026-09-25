# Pre-registered readout — v0.3 routing-fresh dual-arm score

**Status:** locked before any v0.3 score numbers exist.  
**Suite:** `fast-decision-held-out-v0.3-routing-fresh`  
**Rule:** report exactly these fields after the dual-arm run. Do not add alternate framings after seeing results.

## Arms

| Arm | Condition |
| --- | --------- |
| A — ontology off | enrichment default / unset (`CLAWQL_FAST_DECISION_ONTOLOGY` unset or off) |
| B — ontology on | `CLAWQL_FAST_DECISION_ONTOLOGY=1` (hints overlay applied; same `ontologyDigest` for the whole run) |

Both arms run in one session against the same provisional fixture GT (`adjudicated=false`). Live frontier labels are out of scope for this readout.

## Metrics (full routing site)

For each arm, report:

1. **n** — case count (`search_provider_tool_routing`)
2. **accuracy** — fraction correct vs fixture `groundTruthCandidateId`
3. **MCE** — `meanCalibrationError` from held-out validation for that use site

Also report **accuracy delta** (B − A) and **MCE delta** (B − A).

## Subsets (defined by candidate IDs only — not by reading query text)

### Sibling-pair subset

A case is in this subset if its candidate set includes **both** members of any catalog sibling pair:

| Pair |
| ---- |
| `mcp.memory_recall_title_flag_a` + `mcp.memory_recall_title_flag_b` |
| `mcp.data_query_cohort_count` + `mcp.memory_recall_overbroad` |
| `mcp.cache` + `mcp.audit` |
| `mcp.skills_list` + `mcp.skills_get` |
| `mcp.notify` + `mcp.schedule` |
| `mcp.search` + `mcp.execute` |

Report for each arm: **n_sibling**, **accuracy_sibling**.

### Shell-bait subset

A case is in this subset if its candidates include `tool.bash_workspace_hunt` and/or `tool.generic_web_search`.

Report for each arm: **n_shell**, **accuracy_shell**.

## Flip matrix (full set)

Compare arm A vs arm B per case:

| Cell | Definition |
| ---- | ---------- |
| **gain** | incorrect on A, correct on B |
| **regression** | correct on A, incorrect on B |
| **unchanged_correct** | correct on both |
| **unchanged_incorrect** | incorrect on both |

Report counts for all four cells (not only net). List caseIds in gain and regression cells.

## Required metadata

- `ontologyDigest` used for arm B
- Suite freeze digest from `FREEZE-v0.3-routing-fresh.md`
- Scorer backend (`gliner2` required for a citable live readout; stub scores are wiring-only)

## Honesty

Provisional GT is not frontier-adjudicated. This readout measures enrichment A/B on the frozen fresh set under fixture GT. It is not `productionTrusted` and not a replacement for §7 live adjudication.
