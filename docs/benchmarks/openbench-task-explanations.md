# OpenBench task explanations — what each cell proves

**Audience:** investors, developers, GTM, future agents updating the ledger.  
**Companion:** [`openbench-results-ledger.md`](./openbench-results-ledger.md) (scores + run IDs) · [`openbench-stack-coverage.md`](./openbench-stack-coverage.md) (backlog).

Every live task below uses the same A/B pattern unless noted:

| Arm | Wiring |
| --- | ------ |
| **clawql-on** | OpenCode + ClawQL MCP + feature flags for the surface under test |
| **clawql-off** | Same model / harness / inference; **no** ClawQL MCP |
| **Model** | Cheap frugal default: `openrouter/deepseek/deepseek-chat` |
| **Graders** | Prefer real `"tool":"clawql_*"` tool_use evidence — instruction text alone must not pass |

If clawql-on scores higher (ideally **1.0 / 0.0**), the claim is about **agent behavior with ClawQL tools**, not “the model already knew the answer.”

---

## Gateway core

### `search-first-discovery`

| | |
| --- | --- |
| **Claim** | Agents discover the right OpenAPI operation via `search` instead of stuffing specs or guessing from training data. |
| **Why it matters** | This is the behavioral proof of efficiency Layer 1 (Code Mode / search-first). Without it, “token efficiency” is only architectural. |
| **How** | Task asks for the GitHub operation that lists *global* security advisories. Workspace decoy names a wrong operationId. Graders require `"tool":"clawql_search"` on both arms. |
| **What success looks like** | on uses search → writes correct `operationId`; off guesses / reads decoy → fails. |
| **Evidence** | on **1.0** / off **0.0** — [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516) (after anti-guess fix; earlier cells tied when off guessed). |
| **Does *not* prove** | Full GraphQL projection savings; multi-provider search quality; n≥3 stability. |

### `execute-verify-loop`

| | |
| --- | --- |
| **Claim** | Agents can `search` then `execute` with **dry_run**, leaving a verifiable trail — not invent a trail file. |
| **Why it matters** | Safe rollout story: discover → rehearsed invoke. Closes the “execute is just marketing” objection. |
| **How** | Require ≥2 `clawql_execute` tool_use calls with `"dry_run":true` in args, plus graded `trail.json`. Off arm inventing JSON without tools fails. |
| **What success looks like** | on: search + dry_run executes + trail; off: no tools / invented trail → 0.0. |
| **Evidence** | on **1.0** / off **0.0** — [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516) (after log-merge fix so early search tool_use was not dropped). |
| **Does *not* prove** | Live (non-dry_run) side effects; full composed notify/ingest recipes. |

### `cache-scratch-handoff`

| | |
| --- | --- |
| **Claim** | Ephemeral `cache` scratch state survives across turns so agents can assemble secrets without stuffing them into chat. |
| **Why it matters** | Core gateway tool (always on). Proves Layer-style working-memory offload, distinct from durable vault memory. |
| **How** | Two sealed part files (`alpha42`, `zeta99`). Agent must `clawql_cache` set×2, get×2 (or ≥2 set + correct answer), write `answer.json` with `token=alpha42-zeta99` and `source~cache`. Decoy tempts filesystem-only assembly. |
| **What success looks like** | on: real cache tool_use + correct token; off: cannot call ClawQL cache → fail. |
| **Evidence** | on **1.0** (4 turns, ~33s) / off **0.0** — [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522). Tools: read×2, clawql_cache×4, write. |
| **Does *not* prove** | Cross-process / multi-replica cache; Redis-backed production cache. |

### `audit-checkpoints`

| | |
| --- | --- |
| **Claim** | Agents can append/list an in-run **audit** trail and materialize it to a graded artifact. |
| **Why it matters** | Runtime evidence for “auditable agent steps” before WORM/Merkle compliance packaging. |
| **How** | Require multiple `clawql_audit` appends + list, then write relative `trail.json`. Absolute paths (`/trail.json`) fail. |
| **What success looks like** | on: audit×N + write trail; off: no audit tools → 0.0. |
| **Evidence** | on **1.0** / off **0.0** — [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522) (replication); earlier [30872437811](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872437811). Idle flake observed once mid-day — treat as n≥2 now. |
| **Does *not* prove** | WORM immutability, Merkle roots, or compliance export packages. |

---

## Memory

### `memory-dependent-continuation`

| | |
| --- | --- |
| **Claim** | Prior session decisions in the vault beat misleading workspace comments after the seed file is removed. |
| **Why it matters** | Direct GTM vs routers with no memory: sessions do not start from zero. |
| **How** | Harness seeds vault (argon2id + 900s TTL), **deletes** the seed file, leaves bcrypt decoy in code. Agent must `memory_recall` then implement `src/auth.py` correctly. |
| **What success looks like** | on: recall → correct algo/TTL; off: follows bcrypt comment → partial/fail (often 0.333). |
| **Evidence** | on **1.0** / off **0.333** — [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516) (replicated across earlier healthy cells). |
| **Does *not* prove** | R2/S3 sync; hybrid vector/pageindex sources; multi-tenant isolation. |

### `memory-roundtrip-ingest-recall`

| | |
| --- | --- |
| **Claim** | Empty vault: agent can **ingest** then **recall** a marker it just wrote. |
| **Why it matters** | Proves write path, not only reading a pre-seeded note. |
| **How** | Marker only in `sealed/marker.txt`. Require both `memory_ingest` and `memory_recall` tool_use; filesystem copy alone fails. |
| **What success looks like** | on: ingest→recall→`answer.json`; off: no memory tools → 0.0. |
| **Evidence** | on **1.0** / off **0.0** — [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516). |
| **Does *not* prove** | Cross-session durability after process restart (same run roundtrip only). |

### `token-budget-constrained`

| | |
| --- | --- |
| **Claim** | Under a hard token budget, vault recall of a nested recipe beats exploration of decoy trees. |
| **Why it matters** | Supports the efficiency story under context pressure — memory still works when the window is constrained. |
| **How** | Nested YAML/recipe only in vault; workspace full of decoy nests. Caps force thrift. Score 1.0 only if correct parse under budget. |
| **What success looks like** | on: recall → correct artifact; off: explores decoys / overspends → 0.0 (occasional tie if off lucks out). |
| **Evidence** | Best on **1.0** / off **0.0** — [30872437811](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872437811). |
| **Does *not* prove** | All twelve efficiency layers; only the memory-under-pressure pairing. |

### `multi-provider-api-workflow`

| | |
| --- | --- |
| **Claim** | Vault notes can drive a correct offline Worker/wrangler scaffold without dumping full provider specs. |
| **Why it matters** | Multi-API agent workflow with memory-grounded structure — closer to real “build from prior decisions.” |
| **How** | Seeded vault recipe; grade `wrangler.toml` / worker files. Off can partially scaffold from priors (hence margin WINs). |
| **What success looks like** | on ≥ off; prefer on 1.0 with recall tool_use. |
| **Evidence** | on **1.0** / off **0.75** — [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522); also early [30868287877](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30868287877). Mid-series cells were noisy. |
| **Does *not* prove** | Live Cloudflare/GitHub API calls; statistical dominance (margin + history of ties). |

---

## Documents / PageIndex

### `pageindex-section-qa`

| | |
| --- | --- |
| **Claim** | Hierarchical PageIndex (build_tree → synthesize/traverse) finds a buried fact without stuffing the whole long doc into chat. |
| **Why it matters** | Document intelligence without context bloat; distinct from raw vault keyword recall. |
| **How** | Long `catalog.md` with filler sections; buried `CLAWQL_PAGEINDEX_CODE=orchid-77`. Decoy says `rose-12`. Require `pageindex_build_tree` + synthesize/traverse tool_use; `CLAWQL_ENABLE_PAGEINDEX=1`. |
| **What success looks like** | on: build→synthesize→`answer.json` code orchid-77; off: glob/guess → 0.0. |
| **Evidence** | on **1.0** (4 turns, ~38s) / off **0.0** — [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522). Tools: read, clawql_pageindex_build_tree, clawql_pageindex_synthesize, write. |
| **Does *not* prove** | Hybrid `memory_recall` source pinning; Onyx enterprise search; multi-doc corpora. |

---

## Security / policy

### `policy-deny-execute`

| | |
| --- | --- |
| **Claim** | Panguard **fail-closed** blocks `execute` at the tool boundary and surfaces a policy reason agents can record. |
| **Why it matters** | Runtime proof of defense-in-depth claims — not prompt filtering alone. |
| **How** | `CLAWQL_PANGUARD_IN_PROCESS=1` + `CLAWQL_PANGUARD_BLOCK_TOOLS=execute`. Agent must attempt execute, observe block, write evidence. Graders require tool evidence of the deny path. |
| **What success looks like** | on: blocked execute + evidence trail; off: cannot exercise ClawQL policy surface → 0.0. |
| **Evidence** | on **1.0** / off **0.0** — [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516) (after `mcp-tool-wrap` surfaced `isError` + reason text). |
| **Does *not* prove** | Full JWT ATR proxy mesh; multi-tenant Panguard HA. |

---

## Ouroboros

### `ouroboros-oscillation-escape`

| | |
| --- | --- |
| **Claim** | Ouroboros evolutionary loop stops **strategy thrash** (flip-flopping decoy approaches), not merely identical-tool spam. |
| **Why it matters** | Latency/cost: on converged ~78s / 5 turns vs off thrashing ~167s. Concrete orchestration value. |
| **How** | Arms: **ouroboros-on** vs **ouroboros-off** (both have ClawQL; only on gets `ouroboros_*` + seed appendix). Memory disabled (vault one-shot was a confound). Caps ≤50 turns / 180s / 8000 tokens. Cells with OpenCode `doom_loop=allow` (thrash visible) and `deny` (production guard). |
| **What success looks like** | on: create_seed → run_evolutionary_loop → correct write; off: decoy flip-flop → selftest fail. |
| **Evidence** | allow **1.0/0.0** — [30863572642](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30863572642); deny **1.0/0.0** — [30866904277](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30866904277); replicated [30872913519](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913519). Detail: [`ouroboros-value-evidence.md`](./ouroboros-value-evidence.md). |
| **Does *not* prove** | Multi-gen reflect recovery after forced gen1 fail; full ontology drift product; Wilson CIs (still small n). |

---

## Infra confounds (read before distrusting a claim)

| Signal | Meaning |
| ------ | ------- |
| Timeout, turns=null, no `"tool":` | Often OpenRouter **402/429** or OpenCode hang — not a claim regression. See ledger. |
| Both arms 1.0 early ouroboros | Vault one-shot confound — memory disabled for thrash study. |
| Search/execute ties | Fixed by requiring tool_use JSON evidence. |

---

## Next cells (in flight)

| Task | Claim | How |
| ---- | ----- | --- |
| `hybrid-recall-source-pin` | Truth only via PageIndex; vault/decoy keyword is wrong | build_tree + synthesize on `handbook.md`; decoy `rose-99` |
| `codegraph-guided-edit` | Structural index required to locate `SECRET_MARKER` | `codegraph_index` + query/explain on fixture `repo/` |
| `schedule-synthetic-dry-run` | Create synthetic HTTP check + `trigger` dry_run pass | `clawql_schedule` create + trigger against `https://example.com/` |

Update each section above when these land WINs (or fails with lessons). Append run IDs to the [ledger](./openbench-results-ledger.md).
