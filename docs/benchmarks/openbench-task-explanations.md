# OpenBench task explanations — what each cell proves

**Audience:** investors, developers, GTM, future agents updating the ledger.  
**Companion:** [`openbench-results-ledger.md`](./openbench-results-ledger.md) (scores + run IDs) · [`openbench-stack-coverage.md`](./openbench-stack-coverage.md) (backlog).

Every live task below uses the same A/B pattern unless noted:

| Arm            | Wiring                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **clawql-on**  | OpenCode + ClawQL MCP + feature flags for the surface under test                                                                       |
| **clawql-off** | Same model / harness / inference; **no** ClawQL MCP                                                                                    |
| **Model**      | Cheap frugal default: `openrouter/deepseek/deepseek-chat`                                                                              |
| **Graders**    | Prefer **real** OpenCode `"part":{"tool":"clawql_*"}` tool_use — instruction text and `"tool":"invalid"` false positives must not pass |

If clawql-on scores higher (ideally **1.0 / 0.0**), the claim is about **agent behavior with ClawQL tools**, not “the model already knew the answer.”

---

## Gateway core

### `search-first-discovery`

|                             |                                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | Agents discover the right OpenAPI operation via `search` instead of stuffing specs or guessing from training data.                                                               |
| **Why it matters**          | Behavioral proof of efficiency Layer 1 (Code Mode / search-first). Without it, “token efficiency” is only architectural.                                                         |
| **How**                     | Task asks for the GitHub operation that lists _global_ security advisories. Workspace decoy names a wrong operationId. Graders require `"tool":"clawql_search"` on both arms.    |
| **What success looks like** | on uses search → writes correct `operationId`; off guesses / reads decoy → fails.                                                                                                |
| **Evidence**                | on **1.0** / off **0.0** — [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516) (after anti-guess fix; earlier cells tied when off guessed). |
| **Does _not_ prove**        | Full GraphQL projection savings; multi-provider search quality; n≥3 stability.                                                                                                   |
| **Failure modes learned**   | Instruction dumps mentioning `clawql_search` fooled naive greps — require JSON tool_use rows.                                                                                    |

### `execute-verify-loop`

|                             |                                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | Agents can `search` then `execute` with **dry_run**, leaving a verifiable trail — not invent a trail file.                                                                          |
| **Why it matters**          | Safe rollout story: discover → rehearsed invoke. Closes the “execute is just marketing” objection.                                                                                  |
| **How**                     | Require ≥2 `clawql_execute` tool_use calls with `"dry_run":true` in args, plus graded `trail.json`. Off inventing JSON without tools fails.                                         |
| **What success looks like** | on: search + dry_run executes + trail; off: no tools / invented trail → 0.0.                                                                                                        |
| **Evidence**                | on **1.0** / off **0.0** — [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516) (after log-merge fix so early search tool_use was not dropped). |
| **Does _not_ prove**        | Live (non-dry_run) side effects; full composed notify/ingest recipes.                                                                                                               |
| **Failure modes learned**   | Replacing combined agent logs with longer nudge dumps dropped earlier `clawql_search` rows.                                                                                         |

### `cache-scratch-handoff`

|                             |                                                                                                                                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | Ephemeral `cache` scratch state survives across turns so agents can assemble secrets without stuffing them into chat.                                                                                                        |
| **Why it matters**          | Core gateway tool (always on). Proves Layer-style working-memory offload, distinct from durable vault memory.                                                                                                                |
| **How**                     | Two sealed part files (`alpha42`, `zeta99`). Agent must `clawql_cache` set×2, get×2 (or ≥2 set + correct answer), write `answer.json` with `token=alpha42-zeta99` and `source~cache`. Decoy tempts filesystem-only assembly. |
| **What success looks like** | on: real cache tool_use + correct token; off: cannot call ClawQL cache → fail.                                                                                                                                               |
| **Evidence**                | on **1.0** (4 turns, ~33s) / off **0.0** — [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522). Tools: read×2, clawql_cache×4, write.                                                   |
| **Does _not_ prove**        | Cross-process / multi-replica cache; Redis-backed production cache.                                                                                                                                                          |
| **Failure modes learned**   | OpenCode names MCP tools `clawql_*`; calling bare `cache` becomes `"tool":"invalid"`.                                                                                                                                        |

### `audit-checkpoints`

|                             |                                                                                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | Agents can append/list an in-run **audit** trail and materialize it to a graded artifact.                                                                                                                                                                                                 |
| **Why it matters**          | Runtime evidence for “auditable agent steps” before WORM/Merkle compliance packaging.                                                                                                                                                                                                     |
| **How**                     | Require multiple `clawql_audit` appends + list, then write relative `trail.json`. Absolute paths (`/trail.json`) fail.                                                                                                                                                                    |
| **What success looks like** | on: audit×N + write trail; off: no audit tools → 0.0.                                                                                                                                                                                                                                     |
| **Evidence**                | on **1.0** / off **0.0** — [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522) (replication); earlier [30872437811](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872437811). Idle flake observed once mid-day — treat as n≥2 now. |
| **Does _not_ prove**        | WORM immutability, Merkle roots, or compliance export packages.                                                                                                                                                                                                                           |

---

## Memory

### `memory-dependent-continuation`

|                             |                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | Prior session decisions in the vault beat misleading workspace comments after the seed file is removed.                                                               |
| **Why it matters**          | Direct GTM vs routers with no memory: sessions do not start from zero.                                                                                                |
| **How**                     | Harness seeds vault (argon2id + 900s TTL), **deletes** the seed file, leaves bcrypt decoy in code. Agent must `memory_recall` then implement `src/auth.py` correctly. |
| **What success looks like** | on: recall → correct algo/TTL; off: follows bcrypt comment → partial/fail (often 0.333).                                                                              |
| **Evidence**                | on **1.0** / off **0.333** — [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516) (replicated across earlier healthy cells).      |
| **Does _not_ prove**        | R2/S3 sync; hybrid vector/pageindex sources; multi-tenant isolation.                                                                                                  |

### `memory-roundtrip-ingest-recall`

|                             |                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | Empty vault: agent can **ingest** then **recall** a marker it just wrote.                                                   |
| **Why it matters**          | Proves write path, not only reading a pre-seeded note.                                                                      |
| **How**                     | Marker only in `sealed/marker.txt`. Require both `memory_ingest` and `memory_recall` tool_use; filesystem copy alone fails. |
| **What success looks like** | on: ingest→recall→`answer.json`; off: no memory tools → 0.0.                                                                |
| **Evidence**                | on **1.0** / off **0.0** — [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516).        |
| **Does _not_ prove**        | Cross-session durability after process restart (same run roundtrip only).                                                   |

### `token-budget-constrained`

|                             |                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | Under a hard token budget, vault recall of a nested recipe beats exploration of decoy trees.                                      |
| **Why it matters**          | Supports the efficiency story under context pressure — memory still works when the window is constrained.                         |
| **How**                     | Nested YAML/recipe only in vault; workspace full of decoy nests. Caps force thrift. Score 1.0 only if correct parse under budget. |
| **What success looks like** | on: recall → correct artifact; off: explores decoys / overspends → 0.0 (occasional tie if off lucks out).                         |
| **Evidence**                | Best on **1.0** / off **0.0** — [30872437811](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872437811).         |
| **Does _not_ prove**        | All twelve efficiency layers; only the memory-under-pressure pairing.                                                             |

### `multi-provider-api-workflow`

|                             |                                                                                                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | Vault notes can drive a correct offline Worker/wrangler scaffold without dumping full provider specs.                                                                                                                                                   |
| **Why it matters**          | Multi-API agent workflow with memory-grounded structure — closer to real “build from prior decisions.”                                                                                                                                                  |
| **How**                     | Seeded vault recipe; grade `wrangler.toml` / worker files. Off can partially scaffold from priors (hence margin WINs).                                                                                                                                  |
| **What success looks like** | on ≥ off; prefer on 1.0 with recall tool_use.                                                                                                                                                                                                           |
| **Evidence**                | on **1.0** / off **0.75** — [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522); also early [30868287877](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30868287877). Mid-series cells were noisy. |
| **Does _not_ prove**        | Live Cloudflare/GitHub API calls; statistical dominance (margin + history of ties).                                                                                                                                                                     |

---

## Documents / PageIndex / hybrid

### `pageindex-section-qa`

|                             |                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Claim**                   | Hierarchical PageIndex (build_tree → synthesize/traverse) finds a buried fact without stuffing the whole long doc into chat.                                                                                       |
| **Why it matters**          | Document intelligence without context bloat; distinct from raw vault keyword recall.                                                                                                                               |
| **How**                     | Long `catalog.md` with filler sections; buried `CLAWQL_PAGEINDEX_CODE=orchid-77`. Decoy says `rose-12`. Require real `pageindex_build_tree` + synthesize/traverse tool_use; `CLAWQL_ENABLE_PAGEINDEX=1`.           |
| **What success looks like** | on: build→synthesize→`answer.json` code orchid-77; off: glob/guess → 0.0.                                                                                                                                          |
| **Evidence**                | on **1.0** (4 turns, ~38s) / off **0.0** — [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522). Tools: read, clawql_pageindex_build_tree, clawql_pageindex_synthesize, write. |
| **Does _not_ prove**        | Hybrid source pinning vs vault decoys; Onyx enterprise search; multi-doc corpora.                                                                                                                                  |

### `external-ingest-continue`

|                             |                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | Agents can bulk-import Markdown via `ingest_external_knowledge` (`dryRun:false`) then `memory_recall` the imported fact — not copy from disk.                                                                                                     |
| **Why it matters**          | Closes the documents skill gap: external packets become vault knowledge agents continue from. Distinct from `memory_ingest` (single note API).                                                                                                    |
| **How**                     | Empty vault. `incoming/briefing.md` holds `CLAWQL_EXTERNAL_TOKEN=cedar-88`. Decoy `maple-17`. Require `CLAWQL_ENABLE_DOCUMENTS=1` + `CLAWQL_EXTERNAL_INGEST=1` (OpenBench defaults documents off). Graders require real ingest + recall tool_use. |
| **What success looks like** | on: ingest write → recall → answer.json; off: no documents tools → 0.0.                                                                                                                                                                           |
| **Evidence**                | on **1.0** (5 turns, ~37s) / off **0.0** — [30887394038](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30887394038).                                                                                                              |
| **Does _not_ prove**        | URL fetch mode (`CLAWQL_EXTERNAL_INGEST_FETCH`); Presidio redaction on ingest; Merkle/cuckoo side effects.                                                                                                                                        |

### `hybrid-recall-source-pin`

|                             |                                                                                                                                                                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | Agents must retrieve a buried handbook fact **through PageIndex tools**, not by reading alone or by inventing a placeholder. Vault/decoy keyword (`rose-99`) is wrong.                                                                                                                                         |
| **Why it matters**          | Separates “PageIndex exists” (`pageindex-section-qa`) from “agents prefer the hierarchical path when decoys tempt shortcuts.” Supports hybrid recall / source-pin product narrative.                                                                                                                           |
| **How**                     | Compact-but-filled `handbook.md` (~catalog size so cheap models can re-emit markdown) buries `CLAWQL_HYBRID_CODE=fern-42` among rose-/lilac- decoys. Empty vault. Graders require real `clawql_pageindex_*` **and** either build markdown containing the marker **or** synthesize output containing `fern-42`. |
| **What success looks like** | on: read handbook → build_tree(full md) → synthesize → `answer.json` code fern-42; off: cannot produce real pageindex tool_use → 0.0.                                                                                                                                                                          |
| **Evidence**                | on **1.0** (5 turns, ~52s) / off **0.0** — [30888793063](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30888793063). Tools: read, clawql_pageindex_build_tree, clawql_pageindex_synthesize, write.                                                                                             |
| **Does _not_ prove**        | Full `memory_recall` multi-backend `sources=[pageindex,…]` pin; vector/Onyx hybrids.                                                                                                                                                                                                                           |
| **Failure modes learned**   | (1) Indexing instruction text / placeholders. (2) `"tool":"invalid"` false positives. (3) `build_tree` with `markdown:""` then guessing from a prior `read`. (4) Oversized handbook (~14KB) timed out on re-emit — keep catalog-scale fixtures for frugal models.                                              |

---

## Codegraph

### `codegraph-guided-edit`

|                             |                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | Structural `codegraph_index` + query/explain/neighbors finds a symbol (`SECRET_MARKER`) better than decoy file hints.                                                                     |
| **Why it matters**          | Proves `codegraph_*` agent value for architecture tracing without trusting misleading README/decoy grep targets.                                                                          |
| **How**                     | Fixture `repo/` with marker `cg-alpha-9` in `payments/ledger.py`; decoy claims `app.py`. `CLAWQL_ENABLE_CODEGRAPH=1`, empty vault. Require real index + query/explain/neighbors tool_use. |
| **What success looks like** | on: index → query → `answer.json` marker + file path; off: no codegraph tools → 0.0.                                                                                                      |
| **Evidence**                | on **1.0** (3 turns, ~53s) / off **0.0** — [30885341377](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30885341377).                                                      |
| **Does _not_ prove**        | Multi-language graphs; incremental re-index after edits; hybrid memory_recall `sources=[codegraph]`.                                                                                      |

### `codegraph-impact-edit` (B-3.1 lite)

|                             |                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Claim**                   | Agents using codegraph index/query/neighbors can rename a symbol across the full call graph (definition + callers + test) better than decoy impact lists.                                                    |
| **Why it matters**          | Extends guided-edit from “find marker” to “edit impact set” — closer to SWE-lite without full SWE-bench.                                                                                                     |
| **How**                     | Fixture `repo/` with `compute_total` → `compute_grand_total` across 7 files; `decoy/` lists the wrong set. Require real codegraph tool_use + root `impact.json` + clean rename (`compileall`).               |
| **What success looks like** | on: codegraph → rename all 7 → impact.json; off: no codegraph tools and/or bad schema → 0.0.                                                                                                                 |
| **Evidence**                | on **1.0** (4 turns, ~109s) / off **0.0** — [30969554941](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30969554941). Job later failed on durable R2 secrets; scores are the claim evidence. |
| **Does _not_ prove**        | Polyglot graphs; incremental re-index mid-edit; full SWE-bench difficulty.                                                                                                                                   |

---

## Automation

### `schedule-synthetic-dry-run`

|                             |                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | Agents can create a synthetic HTTP check and `trigger` it with `dry_run=true` to a pass verdict.                                               |
| **Why it matters**          | First live proof of optional `schedule` automation without live cron — supports “synthetic monitors as agent tools.”                           |
| **How**                     | Allowlisted `https://example.com/`; `CLAWQL_ENABLE_SCHEDULE=1`. ≥2 real schedule tool_use + graded `schedule.json` (`dry_run`, `status=pass`). |
| **What success looks like** | on: create → dry_run trigger → schedule.json; off: no schedule tool → 0.0.                                                                     |
| **Evidence**                | on **1.0** (3 turns, ~32s) / off **0.0** — [30885341377](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30885341377).           |
| **Does _not_ prove**        | Live cron workers; Slack notify on failure; non-allowlisted URLs.                                                                              |

### `notify-mock-slack`

|                             |                                                                                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | Agents post a completion milestone via `notify` / `clawql_notify` (Slack `chat.postMessage`) and record a graded artifact — inventing `notify.json` without tool_use fails.                                                                                                               |
| **Why it matters**          | First live proof of optional automation notify without a real Slack workspace — closes the “milestones are docs-only” gap.                                                                                                                                                                |
| **How**                     | `CLAWQL_ENABLE_NOTIFY=1`, stub token, `CLAWQL_TEST_SLACK_FETCH_STUB=1` + fixed stub body, minimal Slack OpenAPI fixture (`openbench/fixtures/minimal-slack-chat-postmessage.json`). Marker `CLAWQL_NOTIFY_MARKER=nebula-55` must appear in real notify tool input. Channel `C-OPENBENCH`. |
| **What success looks like** | on: clawql_notify → `notify.json` ok/channel/marker; off: no notify tool → 0.0.                                                                                                                                                                                                           |
| **Evidence**                | on **1.0** (2 turns, ~21s) / off **0.0** — [30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305). Tools: clawql_notify, write.                                                                                                                         |
| **Does _not_ prove**        | Live Slack GraphQL Mesh path; Block Kit; thread replies; real workspace auth.                                                                                                                                                                                                             |
| **Failure modes learned**   | Offline `validate_tasks.py` requires `marker` in `solution/notify.json` (30890720126).                                                                                                                                                                                                    |

---

## Sandbox

### `sandbox-trusted-compute`

|                             |                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Claim**                   | Agents obtain a trusted token only via `sandbox_exec` / `clawql_sandbox_exec`; host/decoy bash (`host-leak-99`) fails.                                                                           |
| **Why it matters**          | Proves isolated snippet eval as an agent tool — host filesystem shortcuts must not count.                                                                                                        |
| **How**                     | `CLAWQL_ENABLE_SANDBOX=1`, backend `docker`, image `python:3.12-alpine` (CI pre-pulls). Python must print `CLAWQL_SANDBOX_TOKEN=sand-77`. Graders require real sandbox tool_use + `answer.json`. |
| **What success looks like** | on: sandbox_exec → answer token sand-77; off: no sandbox tool → 0.0.                                                                                                                             |
| **Evidence**                | on **1.0** (3 turns, ~30s) / off **0.0** — [30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305). Tools: clawql_sandbox_exec, write.                          |
| **Does _not_ prove**        | Kata / Seatbelt / Cloudflare bridge backends; multi-language matrices; network-isolated workloads.                                                                                               |

---

## Composed recipes

### `composed-safe-rollout`

|                             |                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Claim**                   | Agents can run a **multi-tool safe rollout**: search → ≥2 dry_run execute → audit checkpoint → memory_ingest, then write `rollout.json`.                                                                                 |
| **Why it matters**          | Grades the composed skill narrative end-to-end (sequence evidence), not only a single tool or a final file invent.                                                                                                       |
| **How**                     | Empty vault + GitHub provider. Require real tool_use for search, execute (dry_run×2), audit, memory_ingest. Artifact asserts `dryRunOnly` + composed.                                                                    |
| **What success looks like** | on: full sequence + rollout.json; off: missing ClawQL tools → 0.0.                                                                                                                                                       |
| **Evidence**                | on **1.0** (5 turns, ~79s) / off **0.0** — [30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305). Tools: clawql_search, clawql_execute×2+, clawql_audit, clawql_memory_ingest, write. |
| **Does _not_ prove**        | Live (non-dry_run) side effects; notify/Onyx/Argo in the same cell.                                                                                                                                                      |

---

## Security / policy

### `policy-deny-execute`

|                             |                                                                                                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | Panguard **fail-closed** blocks `execute` at the tool boundary and surfaces a policy reason agents can record.                                                                     |
| **Why it matters**          | Runtime proof of defense-in-depth claims — not prompt filtering alone.                                                                                                             |
| **How**                     | `CLAWQL_PANGUARD_IN_PROCESS=1` + `CLAWQL_PANGUARD_BLOCK_TOOLS=execute`. Agent must attempt execute, observe block, write evidence. Graders require tool evidence of the deny path. |
| **What success looks like** | on: blocked execute + evidence trail; off: cannot exercise ClawQL policy surface → 0.0.                                                                                            |
| **Evidence**                | on **1.0** / off **0.0** — [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516) (after `mcp-tool-wrap` surfaced `isError` + reason text).      |
| **Does _not_ prove**        | Full JWT ATR proxy mesh; multi-tenant Panguard HA.                                                                                                                                 |

---

## Ouroboros

### `ouroboros-oscillation-escape`

|                             |                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | Ouroboros evolutionary loop stops **strategy thrash** (flip-flopping decoy approaches), not merely identical-tool spam.                                                                                                                                                                                                                                                                                 |
| **Why it matters**          | Latency/cost: on converged ~78s / 5 turns vs off thrashing ~167s. Concrete orchestration value.                                                                                                                                                                                                                                                                                                         |
| **How**                     | Arms: **ouroboros-on** vs **ouroboros-off** (both have ClawQL; only on gets `ouroboros_*` + seed appendix). Memory disabled (vault one-shot was a confound). Caps ≤50 turns / 180s / 8000 tokens. Cells with OpenCode `doom_loop=allow` (thrash visible) and `deny` (production guard).                                                                                                                 |
| **What success looks like** | on: create_seed → run_evolutionary_loop → correct write; off: decoy flip-flop → selftest fail.                                                                                                                                                                                                                                                                                                          |
| **Evidence**                | allow **1.0/0.0** — [30863572642](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30863572642); deny **1.0/0.0** — [30866904277](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30866904277); replicated [30872913519](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913519). Detail: [`ouroboros-value-evidence.md`](./ouroboros-value-evidence.md). |
| **Does _not_ prove**        | Multi-gen reflect recovery after forced gen1 fail; full ontology drift product; Wilson CIs (still small n).                                                                                                                                                                                                                                                                                             |

---

## Infra confounds (read before distrusting a claim)

| Signal                                  | Meaning                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Timeout, turns=null, no `"tool":`       | Often OpenRouter **402/429** or OpenCode hang — not a claim regression. See ledger.                    |
| Both arms 1.0 early ouroboros           | Vault one-shot confound — memory disabled for thrash study.                                            |
| Search/execute ties                     | Fixed by requiring tool_use JSON evidence.                                                             |
| PageIndex/hybrid off=1.0 with no ClawQL | Often `"tool":"invalid"` embedding `clawql_pageindex_*` in input — use `require-real-clawql-tools.py`. |
| Hybrid placeholder `<value after…>`     | Agent indexed instruction text; require read of handbook.md first.                                     |

Shared grader helper: [`openbench/scripts/require-real-clawql-tools.py`](../../openbench/scripts/require-real-clawql-tools.py).

---

### `onyx-mock-cite`

|                             |                                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Claim**                   | Agents ground answers in enterprise evidence via `knowledge_search_onyx` / `clawql_knowledge_search_onyx` — inventing citations without tool_use fails.                                                |
| **Why it matters**          | First live proof of optional Onyx knowledge tool without a live Onyx cluster — closes the “semantic search is docs-only” gap.                                                                          |
| **How**                     | `CLAWQL_ENABLE_ONYX=1` + `CLAWQL_ENABLE_DOCUMENTS=1`, stub token/URL, `CLAWQL_TEST_ONYX_FETCH_STUB=1` body embeds `CLAWQL_ONYX_CODE=quartz-21`. Graders require real onyx tool_use + `citations.json`. |
| **What success looks like** | on: knowledge_search_onyx → citations code quartz-21; off: no tool → 0.0.                                                                                                                              |
| **Evidence**                | on **1.0** (3 turns, ~17s) / off **0.0** — [30893132189](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30893132189). Tools: clawql_knowledge_search_onyx, write.                       |
| **Does _not_ prove**        | Live Onyx ACL / connectors; streaming; hybrid `memory_recall(sources=[onyx])`.                                                                                                                         |

### `memory-wikilink-hop`

|                             |                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Claim**                   | Vault `memory_recall` follows Obsidian `[[wikilinks]]` (`maxDepth≥1`) so a hub hit can surface a fact only present in a linked note.                                     |
| **Why it matters**          | Proves graph-hop memory (not keyword-only) — decoy unlinked notes must not win.                                                                                          |
| **How**                     | Multi-file vault seed (`.openbench/memory-seed/`): Alpha Hub → [[Beta Fact]] holds `opal-33`; Decoy Noise has `zinc-00`. Query matches Alpha Hub.                        |
| **What success looks like** | on: recall with depth → token opal-33; off: no memory tools → 0.0.                                                                                                       |
| **Evidence**                | on **1.0** (3 turns, ~56s) / off **0.0** — [30893132189](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30893132189). Tools: clawql_memory_recall, write. |
| **Does _not_ prove**        | Vector/hybrid backends; deep multi-hop graphs; R2 sync.                                                                                                                  |

### `memory-conflict-pricing` (B-4.1)

|                             |                                                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claim**                   | When vault notes conflict on the same SKU price, agents **surface both values and flag the conflict** instead of synthesizing a single answer.                                                            |
| **Why it matters**          | Silent confabulation on stale data is a compliance failure mode. First adversarial-memory OpenBench cell.                                                                                                 |
| **How**                     | Multi-file seed: Jan note `CLAWQL_PRICE_USD=42`, Jun note `=55`, decoy `=99`. Require real `clawql_memory_recall` + `conflict.json` with both 42 and 55 and `conflict:true`. Reject single-price or `48`. |
| **What success looks like** | on: recall both → conflict.json; off: no memory tools → 0.0.                                                                                                                                              |
| **Evidence**                | on **1.0** (3 turns, ~29s) / off **0.0** — [30930194746](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30930194746).                                                                      |
| **Does _not_ prove**        | Automatic resolution policy; Presidio; Panguard blocking hostile ingest (B-4.3).                                                                                                                          |

## Next cells (backlog)

1. ~~**notify / sandbox / composed**~~ — verified WINs on [30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305); retired.
2. ~~**Onyx mock cite** + **memory wikilink hop**~~ — verified on [30893132189](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30893132189); retired.
3. ~~**`memory-conflict-pricing` (B-4.1)**~~ — verified on [30930194746](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30930194746); retired.
4. ~~**`codegraph-impact-edit` (B-3.1 lite)**~~ — verified on [30969554941](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30969554941); retired. Next: B-4.2/B-4.3 spikes or P0 n≥3. Full plan: [`openbench-advanced-suites.md`](./openbench-advanced-suites.md).
5. **n≥3 trials** on headline WINs (Phase 0 / dispatch).
6. **Trace collection** from GHA is live — [`openbench-trace-collection.md`](./openbench-trace-collection.md).
7. Later: B-1 flywheel (blocked on FT), B-2 stubbed IDP pipeline, B-6 domain compliance (not closed-book HLE).

Append new run IDs to the [ledger](./openbench-results-ledger.md).
