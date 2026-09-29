# CodeGraph prove keys (Track B)

**Status:** machine-drafted **2026-09-29** — **human pass required** before OpenRouter spend.  
**Harness:** [`agent-loop-freeze.md`](agent-loop-freeze.md)  
**Oracle assist:** [`codegraph-prove-keys.oracle.json`](codegraph-prove-keys.oracle.json) (graph n=10498 / e=22816)  
**Default if unsigned by 2026-10-15:** `codegraph_*` leaves the 8.0.0 bundle.

## Requirements

| Rule | Detail |
| ---- | ------ |
| Repo | Real multi-file tree — ClawQL monorepo packages (`clawql-codegraph`, `clawql-memory`, `clawql-core`, `clawql-api`) |
| Job | Callers-of / impact-of-change / explore neighborhood |
| Grep control | Answer **not** recoverable by one unique-string `grep` |
| Gold | Human verifies oracle sample; cite symbol ids / files |
| n | **12** drafted (prefer Net≥5 CodeGraph-correct / grep-wrong) |

## Rejected as prove material

- Tiny-repo “What file exports X?” (grep-soluble).
- Spent RFC deep-miss set ([`unsolved-8-key-review.md`](unsolved-8-key-review.md)).

## Keys (draft — sign in one sitting with doc keys)

| id | job | question | gold (oracle sample) | why grep fails |
| -- | --- | -------- | -------------------- | -------------- |
| `cg-prove-01` | impact | Using the code graph (not grep), list the TypeScript symbols within depth 2 that depend on… | impacted (sample): makeCodeGraphServiceLive, graph/explore.ts, exploreGraph, indexer/extract-typescr… | String grep finds the definition and imports, but does not rank inbound blast ra… |
| `cg-prove-02` | impact | What is the upstream blast radius (depth ≤2) of renaming `fireHook`? List distinct package… | impacted (sample): plugin/hook-runtime.ts, fireHooksForEvent, execute-batch/index.ts, plugin/hook-re… | `fireHook` appears in many packages; grep dumps every string hit including tests… |
| `cg-prove-03` | impact | List depth-≤2 dependents of `createMemoryPlugin` (who wires or calls the memory plugin fac… | impacted (sample): makeMemoryLayer, plugin/memory-plugin.test.ts, plugin/memory-plugin.ts, plugin/me… | The name appears in plugin docs and tests; inbound callers across packages need … |
| `cg-prove-04` | impact | What is the depth-≤2 blast radius of `queryGraph`? Name dependents in explore/service/reca… | impacted (sample): dogfood/codegraph-dogfood.integration.test.ts, makeCodeGraphServiceLive, impactAn… | `queryGraph` is a common-looking name; grep cannot separate live call edges from… |
| `cg-prove-05` | impact | Who depends on `splitMarkdownSections` (depth ≤2)? List impacted symbol names and files. | impacted (sample): recall/read-around.test.ts, recall/read-around.ts, readAroundFromMarkdown, effect… | Grep finds the export and direct imports, but misses re-exports / Effect wrapper… |
| `cg-prove-06` | explore | Using one-shot explore, summarize `indexRepository`: primary file, notable neighbors (impo… | primary=indexRepository file=indexer/index-repo.ts; neighbors sample: makeCodeGraphServiceLive, inde… | Explore aggregates explain + neighbors + impact; a single grep cannot assemble t… |
| `cg-prove-07` | impact | List depth-≤2 dependents of `reciprocalRankFusion` (who would break if its signature chang… | impacted (sample): recall/hybrid-rerank.test.ts, recall/hybrid-rerank.ts, rerankNormalizedHitsRrf, e… | Need inbound edges across hybrid recall; string search confuses with RRF prose i… |
| `cg-prove-08` | impact | List depth-≤2 dependents of `defineProviderPlugin` across provider packages. | impacted (sample): plugin/dynamic-loader.test.ts, plugin/plugin-installer.ts, plugin/providers/pangu… | Dozens of providers call the helper; the prove job is the dependency set / files… |
| `cg-prove-09` | impact | What symbols/files sit in the depth-2 blast radius of `linkTypeScriptCrossFile`? | impacted (sample): indexer/extract-typescript.test.ts, indexRepository, indexer/link-typescript.ts, … | Indexer pipeline wiring is multi-hop; grep of the name understates callers throu… |
| `cg-prove-10` | impact | List depth-≤2 dependents of `grantsWithinAtr` across packages. | impacted (sample): plugin/hook-runtime.ts, fireHook, execute-batch/index.ts, plugin/hook-registry.ts… | ATR helpers are re-exported and called from visibility/hook paths; grep cannot s… |
| `cg-prove-11` | explore | Explore `codegraphImpact` (MCP handler): which service method does it call, and which file… | primary=codegraphImpact file=mcp/handlers.ts; neighbors sample: mcp/handlers.ts, mcp/handlers.ts, pa… | Handler → Effect service → impactAnalysis is a cross-file chain; grep of the han… |
| `cg-prove-12` | impact | List depth-≤2 dependents of `bm25Score` (ranker wrappers / Effect layers that would break … | impacted (sample): recall/vault-ranker.test.ts, recall/vault-ranker.ts, scoreWithVaultRanker, effect… | Grep finds the function and nearby helpers; the prove job is the inbound blast r… |

## Human checklist

- [ ] Confirm each `why_grep_fails` by attempting a naive unique-string grep (+ read) — reject any key that falls.
- [ ] Spot-check oracle `impacted_names` / explore primary against the live graph (or `npm run test:dogfood -w clawql-codegraph`).
- [ ] Drop or rewrite any key whose gold is thin (impact n&lt;3) or grep-soluble.
- [ ] Sign [`HUMAN_PASS_ONE_SITTING.md`](HUMAN_PASS_ONE_SITTING.md) Track B section.
- [ ] Only then schedule `run_agent_loop_freeze.mjs` with arms `A-grep,A-codegraph`.

## Signer

| Role | Name | Date |
| ---- | ---- | ---- |
| Human pass (Track B) | | |
