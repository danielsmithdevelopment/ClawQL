# OpenBench — ClawQL stack coverage map

What ClawQL claims across the **whole product**, what OpenBench (and planning-context
benchmarks) already prove, and what still needs agent-level A/B before we lean on
customer copy.

This is the **platform** backlog. Ouroboros-only detail lives in
[`ouroboros-value-evidence.md`](./ouroboros-value-evidence.md).

**Full per-run scores (update after every matrix):**
[`openbench-results-ledger.md`](./openbench-results-ledger.md).

---

## Two measurement tracks (keep them separate)

| Track | Measures | Artifacts today |
| ----- | -------- | --------------- |
| **Planning-context** | Spec / response compression via `search` → GraphQL-shaped outputs | [`latest.md`](./latest.md), multi-provider / GCP experiment folders |
| **OpenBench (agent)** | Harness + model + tools on graded tasks (score, turns, tokens, wall) | [`openbench/`](../../openbench/), [`openbench.md`](./openbench.md) |

Unit/integration tests prove APIs exist. **OpenBench proves agents use them and win.**

---

## Live OpenBench today

| Task | Primary claim | Verified shape |
| ---- | ------------- | -------------- |
| `memory-dependent-continuation` | Vault recall beats guessing after seed removal | on **1.0** / off **0.333** ([30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516)) |
| `token-budget-constrained` | Recall nested recipe + ignore decoy noise under token score | on **1.0** / off **0.0** ([30872437811](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872437811)) |
| `multi-provider-api-workflow` | Vault notes → correct Worker/wrangler scaffold | on **1.0** / off **0.75** ([30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522); also [30868287877](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30868287877)) |
| `memory-roundtrip-ingest-recall` | Empty vault ingest→recall | on **1.0** / off **0.0** ([30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516)) |
| `search-first-discovery` | Must `search` (decoy wrong op) | on **1.0** / off **0.0** ([30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516)) |
| `execute-verify-loop` | dry-run `execute` trail (≥2) | on **1.0** / off **0.0** ([30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516)) |
| `audit-checkpoints` | `audit` append×3 + list → trail | on **1.0** / off **0.0** ([30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522); also [30872437811](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872437811)) |
| `policy-deny-execute` | In-process Panguard blocks `execute` | on **1.0** / off **0.0** ([30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516)) |
| `cache-scratch-handoff` | `cache` set/get secret assembly | on **1.0** / off **0.0** ([30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522)) |
| `pageindex-section-qa` | PageIndex build+synthesize finds buried code | on **1.0** / off **0.0** ([30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522)) |
| `ouroboros-oscillation-escape` | Ouroboros stops strategy thrash | allow + **deny** both on 1.0 / off 0.0 ([30866904277](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30866904277)) |

Still missing live cells: hybrid recall, codegraph, schedule/notify, sandbox, composed recipes, n≥3 trials. Full diary: [`openbench-results-ledger.md`](./openbench-results-ledger.md).

**CI spend control:** only [`openbench/ci-matrix.json`](../../openbench/ci-matrix.json) → `pr_active` runs on PR/push. All current graded tasks are **`retired`** after [30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522) (empty `pr_active` until new backlog tasks ship). Ouroboros workflow is dispatch-only.

---

## Coverage by product surface

Legend: **Live** = OpenBench A/B · **Context** = planning-context stats · **Unit** = package/CI tests · **Gap** = claimed in docs/skills, not agent-graded.

### Gateway core (always on)

| Capability | Claim | Evidence | Next OpenBench / note |
| ---------- | ----- | -------- | --------------------- |
| `search` | Discover ops without stuffing full OpenAPI | **Live WIN** `search-first-discovery` | Retired from PR; n≥3 optional via dispatch |
| `execute` | Typed call + dry-run / verify | **Live WIN** `execute-verify-loop` | Retired from PR |
| `cache` | Ephemeral scratch across turns | **Live WIN** `cache-scratch-handoff` ([30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522)) | Retired from PR |
| `audit` | Append/list trail during a run | **Live WIN** `audit-checkpoints` ([30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522)) | Retired from PR |

### Memory (default on)

| Capability | Claim | Evidence | Next OpenBench / note |
| ---------- | ----- | -------- | --------------------- |
| `memory_recall` (vault) | Prior decisions survive seed removal | **Live** (memory + token + multi) | Multi-trial n≥5; adversarial decoy vault notes |
| `memory_ingest` | Durable write of outcomes | **Live** `memory-roundtrip-ingest-recall` on 1.0 / off 0.0 ([30868287877](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30868287877)) | Multi-trial n≥3; two-session recall |
| `memory_sync` (R2/S3) | Team vault reconcile | Docs / Cloud Agent e2e guide | Ops smoke, not OpenBench (needs bucket secrets). Keep as **sync ensure** CI probe |
| Hybrid `sources` (`vector` / `pageindex` / `onyx` / `codegraph`) | Multi-backend recall | Unit + flags | **Hybrid recall** task: answer only in PageIndex tree or vector chunk, not raw vault keyword |
| `pageindex_*` | Hierarchical doc Q&A without stuffing full text | **Live WIN** `pageindex-section-qa` ([30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522)) | Retired from PR; hybrid recall still open |
| `codegraph_*` | Structural code Q&A | Unit | Index fixture repo → neighbors/path required for correct edit |
| Wikilinks / graph hops | Recall follows `[[links]]` | Unit-ish | Seed note A→B→fact; query only matches A |

### Documents / knowledge

| Capability | Claim | Evidence | Next OpenBench / note |
| ---------- | ----- | -------- | --------------------- |
| `ingest_external_knowledge` | Bulk MD/URL → vault | Unit / skill | Fixture MD bundle → recall-dependent coding task |
| `knowledge_search_onyx` | Enterprise evidence before act | Skill only (needs Onyx) | Mock Onyx or recorded fixture HTTP; graded citation file |
| `run_idp_pipeline` / classify / extract | IDP hops via execute | Unit / runbooks | Heavy; prefer **offline pipeline dry_run** graded artifact, not full vendor matrix |
| Docling/Tika/Paperless/… | Provider execute paths | Provider tests / context benches | Keep as provider context benches; OpenBench only if agent must pick the right vendor op |

### Automation

| Capability | Claim | Evidence | Next OpenBench / note |
| ---------- | ----- | -------- | --------------------- |
| `schedule` | Synthetic checks + dry_run | Unit / skill | Create job → `dry_run` → assert pass; no live cron needed |
| `notify` | Slack milestones | Unit (token) | Mock Slack HTTP; checker greps notify payload file / audit |
| `workflow` (Argo) | Submit/wait Workflows | Optional CI | Cluster-dependent — **scheduled integration**, not PR OpenBench |
| `argocd` | App observe/sync | Optional CI | Same — ops integration |

### Sandbox

| Capability | Claim | Evidence | Next OpenBench / note |
| ---------- | ----- | -------- | --------------------- |
| `sandbox_exec` | Isolated snippet eval | Unit | Task where host `bash` is poisoned/decoy; only sandbox result is trusted |

### Ouroboros

See [`ouroboros-value-evidence.md`](./ouroboros-value-evidence.md). P0: `doom_loop` deny A/B, lineage/drift graded, multi-gen remediation.

### Security / policy (high claim, low OpenBench)

| Capability | Claim | Evidence | Next OpenBench / note |
| ---------- | ----- | -------- | --------------------- |
| Panguard / JWT ATR proxy | Block denied tools synchronously | **Live task** `policy-deny-execute` (in-process Panguard deny list; shipped) | Confirm live A/B; later full JWT ATR proxy cell |
| Presidio redaction | PII stripped on execute/ingest | Unit / gateway | Ingest path with SSN/email fixtures; checker fails if vault retains raw PII |
| x402 / payments gate | Paywalled tools | Package tests | Later; mock 402 challenge |

### Composed recipes (skills)

[`composed-workflows.md`](../skills/composed-workflows.md) claims multi-tool rollouts (search→execute→notify→ingest, incident triage, Onyx-grounded act, synthetic monitor). **None are end-to-end OpenBench tasks yet.** Highest leverage: one **composed safe-rollout** task that grades the tool sequence, not only the final file.

### Inference / harness plumbing

| Capability | Claim | Evidence | Next |
| ---------- | ----- | -------- | ---- |
| Tool passthrough via clawql-inference | OpenCode can call MCP tools | Fixed in #758 root-cause doc | Regression OpenBench cell on every inference change |
| Multi-harness (Claude Code / Codex / Cursor) | Same MCP value across wrappers | OpenCode-centric today | One memory task × harness matrix (cheap model, n=1) |
| Model tier escalation | Frugal→frontier | Foundation (#560) | Not OpenBench until loop wiring lands |

---

## Prioritized backlog (whole stack)

### P0 — core product story

1. ~~**Search-first discovery**~~ — task shipped; prior live **tie** (off guessed id) → fixed with `"tool":"clawql_search"` evidence both arms.  
2. ~~**Execute verify loop**~~ — task shipped; prior live **tie** (off invented trail) → fixed with clawql_execute tool_use ≥2 both arms.  
3. ~~**Memory ingest → recall**~~ — verified on 1.0 / off 0.0 ([30868287877](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30868287877)).  
4. ~~**Ouroboros `doom_loop` deny A/B**~~ — verified on 1.0 / off 0.0 (n=1).  
5. ~~**Audit checkpoints**~~ — task shipped (`audit-checkpoints`); confirm live WIN.  
6. ~~**Policy / ATR deny**~~ — task shipped (`policy-deny-execute` + Panguard env forward); confirm live WIN.  
7. ~~**Cache scratch handoff**~~ — task shipped (`cache-scratch-handoff`); confirm live WIN.

### P1 — memory & docs depth (where “tons of tooling” lives)

8. **PageIndex long-doc Q&A**  
9. **Hybrid recall source pin** (vector or pageindex only)  
10. **Codegraph-guided edit**  
11. **External ingest → continue**  

### P2 — automation / sandbox / composed

12. **Schedule dry_run synthetic**  
13. **Notify mock Slack**  
14. **Sandbox-trusted compute**  
15. **Composed safe-rollout** (search→execute×2→audit→ingest)  

### P3 — keep out of PR OpenBench (ops / cluster / paid SaaS)

- Argo Workflows / Argo CD, live Onyx, live Slack, R2 sync, full IDP vendor matrix, payments x402 — **integration or scheduled jobs** with secrets, not every PR matrix cell.

---

## Suggested A/B pattern (all new tasks)

| Arm | Wiring |
| --- | ------ |
| **clawql-on** | OpenCode + ClawQL MCP + feature flags for the surface under test |
| **clawql-off** | Same model/harness; no ClawQL MCP (or tools hidden) |
| Caps | Cheap model, short wall, turn/token hard-fail (reuse thrash-study discipline) |
| Confounds | Prefer **task-local fixtures** over shared vault one-shots; disable unrelated plugins |

Ouroboros remains **on vs off** (both have ClawQL) when the claim is the loop, not the gateway.

---

## What not to OpenBench

- Pure Zod/schema / Effect unit coverage already in packages.  
- Planning-context compression already covered by `latest.md` — don’t re-encode as agent tasks.  
- Roadmap verticals (lending, healthcare, …) until horizontal P0/P1 cells exist.

---

## Links

- OpenBench overview: [`openbench.md`](./openbench.md)
- ClawQL-on failure/root-cause history: [`openbench-failure-root-cause-2026-07.md`](./openbench-failure-root-cause-2026-07.md)
- Ouroboros evidence: [`ouroboros-value-evidence.md`](./ouroboros-value-evidence.md)
- Skills / composed recipes: [`docs/skills/`](../skills/)
- Plugin registry: [`docs/reference/clawql-plugin-registry.md`](../reference/clawql-plugin-registry.md)
- Feature tiers: [`docs/readme/configuration.md`](../readme/configuration.md)
