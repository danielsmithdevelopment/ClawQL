# OpenBench — ClawQL stack coverage map

What ClawQL claims across the **whole product**, what OpenBench (and planning-context
benchmarks) already prove, and what still needs agent-level A/B before we lean on
customer copy.

This is the **platform** backlog. Ouroboros-only detail lives in
[`ouroboros-value-evidence.md`](./ouroboros-value-evidence.md).

**Full per-run scores (update after every matrix):**
[`openbench-results-ledger.md`](./openbench-results-ledger.md).

**Thorough prove / why / how for every verified task:**
[`openbench-task-explanations.md`](./openbench-task-explanations.md).

---

## Two measurement tracks (keep them separate)

| Track                 | Measures                                                             | Artifacts today                                                     |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Planning-context**  | Spec / response compression via `search` → GraphQL-shaped outputs    | [`latest.md`](./latest.md), multi-provider / GCP experiment folders |
| **OpenBench (agent)** | Harness + model + tools on graded tasks (score, turns, tokens, wall) | [`openbench/`](../../openbench/), [`openbench.md`](./openbench.md)  |

Unit/integration tests prove APIs exist. **OpenBench proves agents use them and win.**

---

## Live OpenBench today

| Task                             | Primary claim                                               | Verified shape                                                                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory-dependent-continuation`  | Vault recall beats guessing after seed removal              | on **1.0** / off **0.333** ([30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516))                                                                                                        |
| `token-budget-constrained`       | Recall nested recipe + ignore decoy noise under token score | on **1.0** / off **0.0** ([30872437811](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872437811))                                                                                                          |
| `multi-provider-api-workflow`    | Vault notes → correct Worker/wrangler scaffold              | on **1.0** / off **0.75** ([30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522); also [30868287877](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30868287877))          |
| `memory-roundtrip-ingest-recall` | Empty vault ingest→recall                                   | on **1.0** / off **0.0** ([30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516))                                                                                                          |
| `search-first-discovery`         | Must `search` (decoy wrong op)                              | on **1.0** / off **0.0** n=3 ([31011980064](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31011980064); prior [30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516))      |
| `execute-verify-loop`            | dry-run `execute` trail (≥2)                                | on **1.0** / off **0.0** ([30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516))                                                                                                          |
| `audit-checkpoints`              | `audit` append×3 + list → trail                             | on **1.0** / off **0.0** ([30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522); also [30872437811](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872437811))           |
| `policy-deny-execute`            | In-process Panguard blocks `execute`                        | on **1.0** / off **0.0** ([30872913516](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30872913516))                                                                                                          |
| `cache-scratch-handoff`          | `cache` set/get secret assembly                             | on **1.0** / off **0.0** ([30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522))                                                                                                          |
| `pageindex-section-qa`           | PageIndex build+synthesize finds buried code                | on **1.0** / off **0.0** ([30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522))                                                                                                          |
| `codegraph-guided-edit`          | Structural index locates SECRET_MARKER                      | on **1.0** / off **0.0** ([30885341377](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30885341377))                                                                                                          |
| `codegraph-impact-edit`          | Cross-file rename via codegraph impact set (B-3.1)          | on **1.0** / off **0.0** ([30977578882](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30977578882))                                                                                                          |
| `codegraph-feature-api-surface`  | Full GET /widgets/:id impact set via codegraph              | on **1.0** / off **0.0** ([30981709304](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30981709304))                                                                                                          |
| `schedule-synthetic-dry-run`     | schedule create + dry_run trigger                           | on **1.0** / off **0.0** ([30885341377](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30885341377))                                                                                                          |
| `external-ingest-continue`       | Bulk MD ingest → recall                                     | on **1.0** / off **0.0** ([30887394038](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30887394038))                                                                                                          |
| `hybrid-recall-source-pin`       | PageIndex retrieves buried handbook code                    | on **1.0** / off **0.0** ([30888793063](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30888793063))                                                                                                          |
| `ouroboros-oscillation-escape`   | Ouroboros stops strategy thrash                             | allow + **deny** both on 1.0 / off 0.0 ([30866904277](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30866904277))                                                                                            |
| `notify-mock-slack`              | Stubbed Slack `notify` milestone                            | on **1.0** / off **0.0** ([30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305))                                                                                                          |
| `sandbox-trusted-compute`        | Docker `sandbox_exec` trusted token                         | on **1.0** / off **0.0** ([30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305))                                                                                                          |
| `composed-safe-rollout`          | search→dry_run×2→audit→ingest                               | on **1.0** / off **0.0** ([30985126247](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30985126247) RTP v1.1; prior [30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305)) |
| `idp-safe-pipeline-lite`         | Stubbed 7-stage IDP (search→dry×2→audit→onyx→notify→ingest) | on **1.0** / off **0.0** ([31039035892](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31039035892))                                                                                                          |
| `idp-pipeline-resilience`        | Onyx outage mid-pipeline + Ouroboros recovery (B-2.2)       | on **1.0** / off fail ([31139014771](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31139014771))                                                                                                             |
| `onyx-mock-cite`                 | Stubbed `knowledge_search_onyx` cite                        | on **1.0** / off **0.0** ([30893132189](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30893132189))                                                                                                          |
| `memory-wikilink-hop`            | Vault recall follows `[[wikilink]]`                         | on **1.0** / off **0.0** ([30893132189](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30893132189))                                                                                                          |

Still missing after this wave: n≥3 trials; ops-only (Argo / live Onyx / live Slack / R2). Full diary: [`openbench-results-ledger.md`](./openbench-results-ledger.md).

**CI spend control:** only [`openbench/ci-matrix.json`](../../openbench/ci-matrix.json) → `pr_active` burns tokens on PR/push. Graded cells above are **`retired`** except recently retired **`idp-pipeline-resilience` (B-2.2)**. B-4.2 remains parked offline. Live vendor IDP = scheduled **B2.3** (not PR).

Explanations for every verified cell: [`openbench-task-explanations.md`](./openbench-task-explanations.md).

---

## Coverage by product surface

Legend: **Live** = OpenBench A/B · **Context** = planning-context stats · **Unit** = package/CI tests · **Gap** = claimed in docs/skills, not agent-graded.

### Gateway core (always on)

| Capability | Claim                                      | Evidence                                                                                                                        | Next OpenBench / note                                                                                 |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `search`   | Discover ops without stuffing full OpenAPI | **Live WIN** `search-first-discovery` n=3                                                                                       | Phase 0 done [31011980064](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31011980064) |
| `execute`  | Typed call + dry-run / verify              | **Live WIN** `execute-verify-loop`                                                                                              | Retired from PR                                                                                       |
| `cache`    | Ephemeral scratch across turns             | **Live WIN** `cache-scratch-handoff` ([30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522)) | Retired from PR                                                                                       |
| `audit`    | Append/list trail during a run             | **Live WIN** `audit-checkpoints` ([30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522))     | Retired from PR                                                                                       |

### Memory (default on)

| Capability                                                       | Claim                                           | Evidence                                                                                                                                                                                                                     | Next OpenBench / note                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `memory_recall` (vault)                                          | Prior decisions survive seed removal            | **Live** (memory + token + multi)                                                                                                                                                                                            | Multi-trial n≥5; adversarial decoy vault notes                                           |
| `memory_ingest`                                                  | Durable write of outcomes                       | **Live** `memory-roundtrip-ingest-recall` on 1.0 / off 0.0 ([30868287877](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30868287877))                                                                        | Multi-trial n≥3; two-session recall                                                      |
| `memory_sync` (R2/S3)                                            | Team vault reconcile                            | Docs / Cloud Agent e2e guide                                                                                                                                                                                                 | Ops smoke, not OpenBench (needs bucket secrets). Keep as **sync ensure** CI probe        |
| Hybrid `sources` (`vector` / `pageindex` / `onyx` / `codegraph`) | Multi-backend recall                            | **Live WIN** `memory-recall-pageindex-pin` ([31189112838](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31189112838) on 1.0 / off 0.0); prior PageIndex via `hybrid-recall-source-pin`                                                                                         | Retired from PR                                                                          |
| `pageindex_*`                                                    | Hierarchical doc Q&A without stuffing full text | **Live WIN** `pageindex-section-qa` + `hybrid-recall-source-pin` ([30888793063](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30888793063))                                                                  | Retired from PR                                                                          |
| `codegraph_*`                                                    | Structural code Q&A + impact rename             | **Live WIN** guided-edit ([30885341377](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30885341377)) + impact-edit ([30977578882](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30977578882)) | Retired from PR                                                                          |
| Wikilinks / graph hops                                           | Recall follows `[[links]]`                      | **Live WIN** `memory-wikilink-hop` ([30893132189](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30893132189))                                                                                                | Retired from PR                                                                          |
| Adversarial / conflict recall                                    | Surface conflicting vault facts                 | **OpenBench WIN** `memory-conflict-pricing`                                                                                                                                                                                  | [30930194746](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30930194746) |

### Documents / knowledge

| Capability                              | Claim                          | Evidence                                                                                                                                                                                                                                                                            | Next OpenBench / note                                                                   |
| --------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ingest_external_knowledge`             | Bulk MD/URL → vault            | **Live WIN** `external-ingest-continue` ([30887394038](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30887394038))                                                                                                                                                  | Retired from PR                                                                         |
| `knowledge_search_onyx`                 | Enterprise evidence before act | **Live WIN** `onyx-mock-cite` ([30893132189](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30893132189))                                                                                                                                                            | Retired from PR                                                                         |
| `run_idp_pipeline` / classify / extract | IDP hops via execute           | **Live WIN** stub `idp-safe-pipeline-lite` ([31039035892](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31039035892)); **B2.2** resilience WIN `idp-pipeline-resilience` ([31139014771](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31139014771)) | Live vendor matrix = scheduled B2.3, not PR                                             |
| Docling/Tika/Paperless/…                | Provider execute paths         | Provider tests / context benches                                                                                                                                                                                                                                                    | Keep as provider context benches; OpenBench only if agent must pick the right vendor op |

### Automation

| Capability        | Claim                      | Evidence                                                                                                                             | Next OpenBench / note                                           |
| ----------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `schedule`        | Synthetic checks + dry_run | **Live WIN** `schedule-synthetic-dry-run` ([30885341377](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30885341377)) | Retired from PR                                                 |
| `notify`          | Slack milestones           | **Live WIN** `notify-mock-slack` ([30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305))          | Retired from PR                                                 |
| `workflow` (Argo) | Submit/wait Workflows      | Optional CI                                                                                                                          | Cluster-dependent — **scheduled integration**, not PR OpenBench |
| `argocd`          | App observe/sync           | Optional CI                                                                                                                          | Same — ops integration                                          |

### Sandbox

| Capability     | Claim                 | Evidence                                                                                                                          | Next OpenBench / note                 |
| -------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `sandbox_exec` | Isolated snippet eval | **Live WIN** `sandbox-trusted-compute` ([30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305)) | Retired from PR; other backends later |

### Ouroboros

See [`ouroboros-value-evidence.md`](./ouroboros-value-evidence.md). P0: `doom_loop` deny A/B, lineage/drift graded, multi-gen remediation.

### Security / policy (high claim, low OpenBench)

| Capability               | Claim                            | Evidence                                                                     | Next OpenBench / note                                                       |
| ------------------------ | -------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Panguard / JWT ATR proxy | Block denied tools synchronously | **Live task** `policy-deny-execute` (in-process Panguard deny list; shipped) | Confirm live A/B; later full JWT ATR proxy cell                             |
| Presidio redaction       | PII stripped on execute/ingest   | Unit / gateway                                                               | Ingest path with SSN/email fixtures; checker fails if vault retains raw PII |
| x402 / payments gate     | Paywalled tools                  | Package tests                                                                | Later; mock 402 challenge                                                   |

### Composed recipes (skills)

[`composed-workflows.md`](../skills/composed-workflows.md) claims multi-tool rollouts (search→execute→notify→ingest, incident triage, Onyx-grounded act, synthetic monitor). **`composed-safe-rollout`** verified on 1.0 / 0.0 ([30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305)). Broader recipes (notify+Onyx+Argo) stay later cells.

### Inference / harness plumbing

| Capability                                   | Claim                          | Evidence                     | Next                                                |
| -------------------------------------------- | ------------------------------ | ---------------------------- | --------------------------------------------------- |
| Tool passthrough via clawql-inference        | OpenCode can call MCP tools    | Fixed in #758 root-cause doc | Regression OpenBench cell on every inference change |
| Multi-harness (Claude Code / Codex / Cursor) | Same MCP value across wrappers | OpenCode-centric today       | One memory task × harness matrix (cheap model, n=1) |
| Model tier escalation                        | Frugal→frontier                | Foundation (#560)            | Not OpenBench until loop wiring lands               |

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

8. ~~**PageIndex long-doc Q&A**~~ — verified on 1.0 / off 0.0 ([30881158522](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30881158522)).
9. ~~**Hybrid recall source pin**~~ — verified on 1.0 / off 0.0 ([30888793063](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30888793063)).
10. ~~**Codegraph-guided edit**~~ — verified on 1.0 / off 0.0 ([30885341377](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30885341377)).
11. ~~**External ingest → continue**~~ — verified on 1.0 / off 0.0 ([30887394038](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30887394038)).

### P2 — automation / sandbox / composed

12. ~~**Schedule dry_run synthetic**~~ — verified on 1.0 / off 0.0 ([30885341377](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30885341377)).
13. ~~**Notify mock Slack**~~ — verified on 1.0 / off 0.0 ([30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305)).
14. ~~**Sandbox-trusted compute**~~ — verified on 1.0 / off 0.0 ([30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305)).
15. ~~**Composed safe-rollout**~~ — verified on 1.0 / off 0.0 ([30891002305](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30891002305)).

### P2.5 — remaining horizontal gaps (next PR wave)

16. ~~**Onyx mock cite**~~ — verified on 1.0 / off 0.0 ([30893132189](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30893132189)).
17. ~~**Memory wikilink hop**~~ — verified on 1.0 / off 0.0 ([30893132189](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30893132189)).
18. ~~**n≥3 trials** on headline subset~~ — Phase 0 trio done (search / memory-roundtrip / policy-deny); optional n≥5 — [`openbench-advanced-suites.md`](./openbench-advanced-suites.md).

### Phase 1 advanced (frugal tool delta — no fine-tune)

19. **`memory-conflict-pricing` (B-4.1)** — **WIN** retired ([30930194746](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30930194746)).
20. **`codegraph-impact-edit` (B-3.1 lite)** — **WIN** retired ([30977578882](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30977578882)).
21. **`codegraph-feature-api-surface`** — **WIN** retired ([30981709304](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/30981709304)); RTP v1.1 durable.
22. B-4.2 **parked** (offline only). B-4.3 **WIN** `memory-injection-attempt` ([31022595633](https://github.com/danielsmithdevelopment/ClawQL/actions/runs/31022595633)).

Full breakdown (B-1 flywheel → B-6 domain HLE-analog): [`openbench-advanced-suites.md`](./openbench-advanced-suites.md). Trace collection from GHA: [`openbench-trace-collection.md`](./openbench-trace-collection.md).

### P3 — keep out of PR OpenBench (ops / cluster / paid SaaS)

- Argo Workflows / Argo CD, live Onyx, live Slack, R2 sync, full IDP vendor matrix, payments x402 — **integration or scheduled jobs** with secrets, not every PR matrix cell.

---

## Suggested A/B pattern (all new tasks)

| Arm            | Wiring                                                                                |
| -------------- | ------------------------------------------------------------------------------------- |
| **clawql-on**  | OpenCode + ClawQL MCP + feature flags for the surface under test                      |
| **clawql-off** | Same model/harness; no ClawQL MCP (or tools hidden)                                   |
| Caps           | Cheap model, short wall, turn/token hard-fail (reuse thrash-study discipline)         |
| Confounds      | Prefer **task-local fixtures** over shared vault one-shots; disable unrelated plugins |

Ouroboros remains **on vs off** (both have ClawQL) when the claim is the loop, not the gateway.

---

## What not to OpenBench

- Pure Zod/schema / Effect unit coverage already in packages.
- Planning-context compression already covered by `latest.md` — don’t re-encode as agent tasks.
- Roadmap verticals (lending, healthcare, …) until horizontal P0/P1 cells exist.

---

## Links

- [OpenBench overview](./openbench.md)
- [Results ledger](./openbench-results-ledger.md)
- [Task explanations (prove / why / how)](./openbench-task-explanations.md)
- [Advanced suites plan (B-1…B-6 task breakdown)](./openbench-advanced-suites.md)
- [Trace collection from GitHub Actions (call store → export)](./openbench-trace-collection.md)
- [Stack coverage / backlog](./openbench-stack-coverage.md)
- [Ouroboros evidence](./ouroboros-value-evidence.md)
- [Skills / composed recipes](../skills/)
- [Plugin registry](../reference/clawql-plugin-registry.md)
- [Feature tiers](../readme/configuration.md)
