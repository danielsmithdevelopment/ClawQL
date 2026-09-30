# CodeGraph prove keys (Track B)

**Status:** machine-drafted **2026-09-29** — **human pass required** before OpenRouter spend.  
**Decision lock (read first):** [`codegraph-prove-decision.lock.json`](codegraph-prove-decision.lock.json)  
**Harness:** [`agent-loop-freeze.md`](agent-loop-freeze.md)  
**Oracle assist:** [`codegraph-prove-keys.oracle.json`](codegraph-prove-keys.oracle.json) (graph n=10498 / e=22816)  
**No-harm cohort:** [`codegraph-no-harm-keys.json`](codegraph-no-harm-keys.json) (6 grep-solvable; not in Net)  
**Default if unsigned by 2026-10-15:** `codegraph_*` leaves the 8.0.0 bundle.

## Locked beat (same shape as Vectify)

| Outcome | Condition | Freeze action |
| ------- | --------- | ------------- |
| **CodeGraph beats** | Net \(\ge 5\) on these 12 **and** no-harm \(\ge 5/6\) | Keep opt-in candidate |
| **Tie** | Net \(\in [-4,+4]\) **or** no-harm fail | **Purge** (leave bundle) |
| **Grep beats** | Net \(\le -5\) | Purge |

Arms every spend: `A-no-tools` (memory baseline — public repo), `A-grep`, `A-codegraph` (no grep on the treatment arm).

**Caveat:** n=12 on one TypeScript monorepo is home turf. The margin + no-harm + no-tools exist so a thin home-turf win cannot keep the tools.

## Requirements

| Rule | Detail |
| ---- | ------ |
| Repo | ClawQL monorepo packages (`clawql-codegraph`, `clawql-memory`, `clawql-core`, `clawql-api`) |
| Job | Callers-of / impact-of-change / explore neighborhood |
| Grep control | Answer **not** recoverable by one unique-string `grep` |
| Gold | Human verifies oracle sample; cite symbol ids / files |
| n prove | **12** (Net uses these only) |
| n no-harm | **6** ([`codegraph-no-harm-keys.json`](codegraph-no-harm-keys.json)) |

## Rejected as prove material

- Tiny-repo “What file exports X?” (grep-soluble) — those belong in **no-harm**, not prove.
- Spent RFC deep-miss set ([`unsolved-8-key-review.md`](unsolved-8-key-review.md)).

## Keys (review all 12 — confirm single grep fails)

| id | job | question | gold (oracle sample) | why grep fails |
| -- | --- | -------- | -------------------- | -------------- |
| `cg-prove-01` | impact | Using the code graph (not grep), list the TypeScript symbols within depth 2 that depend on… | impacted (sample): makeCodeGraphServiceLive, graph/explore.ts, exploreGraph, … | String grep finds the definition and imports, but does not rank inbound blast radius… |
| `cg-prove-02` | impact | What is the upstream blast radius (depth ≤2) of renaming `fireHook`? List distinct package… | impacted (sample): plugin/hook-runtime.ts, fireHooksForEvent, execute-batch/index.ts, … | `fireHook` appears in many packages; grep dumps every string hit… |
| `cg-prove-03` | impact | List depth-≤2 dependents of `createMemoryPlugin` (who wires or calls the memory plugin fac… | impacted (sample): makeMemoryLayer, plugin/memory-plugin.test.ts, … | Inbound callers across packages need the reverse edge walk… |
| `cg-prove-04` | impact | What is the depth-≤2 blast radius of `queryGraph`? Name dependents in explore/service/reca… | impacted (sample): dogfood/…, makeCodeGraphServiceLive, impactAnalysis, … | Grep cannot separate live call edges from prose… |
| `cg-prove-05` | impact | Who depends on `splitMarkdownSections` (depth ≤2)? List impacted symbol names and files. | impacted (sample): recall/read-around.test.ts, readAroundFromMarkdown, … | Misses re-exports / Effect wrappers… |
| `cg-prove-06` | explore | Using one-shot explore, summarize `indexRepository`: primary file, notable neighbors… | primary=indexRepository file=indexer/index-repo.ts | Explore aggregates explain + neighbors + impact… |
| `cg-prove-07` | impact | List depth-≤2 dependents of `reciprocalRankFusion`… | impacted (sample): rerankNormalizedHitsRrf, effect/memory-recall-effect.ts, … | Inbound edges across hybrid recall… |
| `cg-prove-08` | impact | List depth-≤2 dependents of `defineProviderPlugin` across provider packages. | impacted (sample): plugin/dynamic-loader.test.ts, plugin/providers/panguard, … | Prove job is the dependency set on signature change… |
| `cg-prove-09` | impact | What symbols/files sit in the depth-2 blast radius of `linkTypeScriptCrossFile`? | impacted (sample): indexRepository, indexer/index-repo.ts, … | Multi-hop indexer pipeline… |
| `cg-prove-10` | impact | List depth-≤2 dependents of `grantsWithinAtr` across packages. | impacted (sample): fireHook, execute-batch/index.ts, … | Re-exports vs design text… |
| `cg-prove-11` | explore | Explore `codegraphImpact` (MCP handler): which service method does it call… | primary=codegraphImpact file=mcp/handlers.ts | Handler → service → impactAnalysis chain… |
| `cg-prove-12` | impact | List depth-≤2 dependents of `bm25Score`… | impacted (sample): scoreWithVaultRanker, effect/…, … | Inbound blast radius for a safe rename… |

Full oracle golds: [`codegraph-prove-keys.oracle.json`](codegraph-prove-keys.oracle.json).

## Human checklist

- [ ] Read the [decision lock](codegraph-prove-decision.lock.json) (Net≥5 / tie=purge / no-harm / no-tools).
- [ ] For **each** of the 12: attempt one unique-string `grep` (+ read if needed). Reject any key that falls.
- [ ] Spot-check oracle `impacted_names` / explore primary (or `npm run test:dogfood -w clawql-codegraph`).
- [ ] Confirm no-harm keys stay intentionally grep-easy ([`codegraph-no-harm-keys.json`](codegraph-no-harm-keys.json)).
- [ ] Sign [`HUMAN_PASS_ONE_SITTING.md`](HUMAN_PASS_ONE_SITTING.md) CodeGraph row.
- [ ] Only then schedule `run_agent_loop_freeze.mjs` with arms `A-no-tools,A-grep,A-codegraph`.

## Signer

| Role | Name | Date |
| ---- | ---- | ---- |
| Human pass (Track B prove) | | |
