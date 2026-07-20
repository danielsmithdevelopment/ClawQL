# Enterprise Ontology essay — gap closure backlog

**Purpose:** Close the distance between the PragmaticVectors essay _“The Enterprise Ontology: OOP Taken to Its Logical Extreme”_ and ClawQL so the piece can publish **without disclaimers** — or with an explicit, minimal disclosure list for anything we refuse to fake.

**Status language:** Each workstream ends in **Done-when** criteria tied to essay claims.  
**Bands:** **A** = days with existing patterns · **B** = needs a product decision · **C** = multi-sprint / external deps.

**Related:** [ADR 0009](../adr/0009-enterprise-ontology.md) · [ADR 0010](../adr/0010-cq-file-extensions.md) · [enterprise-ontology.md](../architecture/enterprise-ontology.md) · [ontology CLI](./cli.md)

---

## Essay claim → reality (snapshot)

| Essay claim                                | Today                                                                             | Target for “as-is” publish                                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Cold-open problem + OOP framing            | Docs only                                                                         | Keep (narrative)                                                                                                     |
| `.cqe` primary format                      | **Shipped** — examples/docs/scaffolds lead with `.cqe`; tooling dual-accepts YAML | Essay can say `Contract.cqe`; YAML still accepted ([ADR 0010 §2a](../adr/0010-cq-file-extensions.md))                |
| `ontology lint` / `generate`               | Generate + register fixture MCP tools when enabled                                | Keep; expand adapters separately                                                                                     |
| Live typed tools (enums, not ints)         | **Shipped** — fixture handlers (`CLAWQL_ENABLE_ONTOLOGY=1`)                       | Essay: fixture/demo store; SQL = roadmap ([ADR 0009 §9](../adr/0009-enterprise-ontology.md))                         |
| PII from `pii_fields` → Presidio           | Presidio exists; not schema-driven                                                | Schema field list drives redaction on ontology tool results                                                          |
| Relationship → graph tools                 | Relationships in YAML only                                                        | Generate + register traversal tools (even if demo store)                                                             |
| GraphQL `@kinetic`                         | **Decision:** MCP-first for v1 kinetic writes; GraphQL = later transport          | Essay: MCP kinetic methods; GraphQL samples = target / disclose ([ADR 0009 §10](../adr/0009-enterprise-ontology.md)) |
| Transaction Sandbox risk routing           | Missing                                                                           | Effect sandbox with LOW…CRITICAL paths (can start with LOW+MEDIUM)                                                   |
| Argo / Pulumi executors                    | Separate tools; not ontology-routed                                               | Kinetic router selects executor from action schema                                                                   |
| `.cqm` / `.cqw` / `.cqk` ecosystem         | Draft specs                                                                       | Specs on docs site + lint/doctor hooks for `.cqm`; `.cqk` write path                                                 |
| VS Code extension                          | Missing                                                                           | Real blocker → disclose or ship minimal diagnostics                                                                  |
| Vault `ontology/` + `memory/` OKF layout   | Memory OKF ships; schema in Git                                                   | Document + optional generate of `ontology/index.md` in Git; `.cqk` optional                                          |
| `init` / `create-entity` / `import --pack` | Missing                                                                           | Ship CLI scaffolds + ≥1 vertical pack                                                                                |
| Command Deck builder → PR                  | Design notes only                                                                 | Real blocker → disclose or ship thin CLI-only authoring                                                              |
| Manifest pin + Arweave                     | Release MVP; Arweave deferred                                                     | Pin ontology hash in release manifest; Arweave = disclose                                                            |
| docs.clawql.com ontology page              | PR / deploy                                                                       | Must be live before essay link                                                                                       |

---

## Workstreams (ordered for publish leverage)

### WS0 — Publish prerequisites (docs site + honesty gate)

| ID      | Task                                                                                     | Band | Done-when                                                                    |
| ------- | ---------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------- |
| **0.1** | Merge + deploy docs page `/architecture/enterprise-ontology`                             | A    | URL 200; essay footer links resolve                                          |
| **0.2** | Publish `.cq*` draft specs on docs site (`/specs/cq-extensions/*` or under architecture) | A    | Apache 2.0 specs reachable; essay “specs at docs.clawql.com” true for drafts |
| **0.3** | Freeze essay ↔ backlog mapping (this doc) in repo                                        | A    | Linked from ADR 0009 follow-ups                                              |

### WS1 — Format & examples (essay `.cqe` story)

| ID      | Task                                                                                                            | Band | Done-when                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------- |
| **1.1** | Add `Contract.cqe` / `Organization.cqe` (content = current YAML); keep YAML or symlink                          | A    | Lint/generate work on `.cqe` paths used in essay                                 |
| **1.2** | Align essay schema fields to `v1alpha1` **or** extend JSON Schema to cover essay fields used in publish version | A/B  | No invented fields in published essay without schema support                     |
| **1.3** | `clawql ontology init` — create `.clawql/ontology/{entities,relationships,actions}` + README                    | A    | Essay Day-1 init works                                                           |
| **1.4** | `clawql ontology create-entity <Name>` — write templated `.cqe`                                                 | A    | Essay create-entity works                                                        |
| **1.5** | Decision: `.cqe` **primary in docs/essay**; dual-accept remains in tooling                                      | B ✅ | [ADR 0010 §2a](../adr/0010-cq-file-extensions.md); examples/scaffolds use `.cqe` |

### WS2 — Generate → live MCP read tools

| ID      | Task                                                                                                        | Band   | Done-when                                                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **2.1** | Implement `createOntologyPlugin()` (or layer) registering generated read tools                              | A      | Tools appear in MCP `ListTools` when ontology enabled                                                                              |
| **2.2** | Demo / fixture backend: in-memory or JSON fixtures returning **typed** Contract (enum status, money object) | A      | Essay “status: active not 2” demo reproducible                                                                                     |
| **2.3** | Optional SQL source adapter for `sources[type=sql]` (read-only)                                             | B/C ✅ | **Decided:** fixture mode is v1 read backend; SQL disclosed as partner/roadmap ([ADR 0009 §9](../adr/0009-enterprise-ontology.md)) |
| **2.4** | Wire `CLAWQL_ONTOLOGY_DIR` (or default `.clawql/ontology`) into gateway startup                             | A      | No manual copy of stub into plugins                                                                                                |
| **2.5** | Generate relationship traversal tools (`get_contract_parties`, reverse) from `relationships:`               | A      | Tools listed + demo-backed                                                                                                         |
| **2.6** | Schema-driven Presidio: apply `pii_fields` on ontology tool **results** before LLM                          | A/B    | Redacted field absent without ATR; present with claim in tests                                                                     |

### WS3 — Kinetic writes (essay Layer 3)

| ID      | Task                                                                                                   | Band     | Done-when                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **3.1** | Product decision: GraphQL `@kinetic` **and/or** MCP write tools with kinetic metadata                  | **B** ✅ | **Decided:** MCP write tools + kinetic metadata for v1; GraphQL `@kinetic` = transport target (**3.8**) ([ADR 0009 §10](../adr/0009-enterprise-ontology.md)) |
| **3.2** | Kinetic metadata validation on write actions at lint time (already partial) + generate write tool defs | A ✅     | `writeTools` for LOW+NATIVE; gated via `CLAWQL_ENABLE_ONTOLOGY_WRITES`                                                                                       |
| **3.3** | Minimal Transaction Sandbox: ATR check → snapshot → execute/deny → WORM/audit entry for **LOW**        | A/C ✅   | `runLowKineticTransaction` + fixture `update_contract_status` + kinetic audit chain                                                                          |
| **3.4** | MEDIUM: mandate required when `requires_mandate` / over `change_limit`                                 | C ✅     | `adjust_contract_value` + mandate gate; reject without mandate                                                                                               |
| **3.5** | HIGH canary progression                                                                                | C        | Config respected (can stub analysis gate)                                                                                                                    |
| **3.6** | CRITICAL + HITL / Command Deck Action View                                                             | C        | Staged for approval                                                                                                                                          |
| **3.7** | Executor router: `NATIVE` \| `ARGO_WORKFLOW` \| `PULUMI` from action schema                            | C        | One real Argo path + one native path                                                                                                                         |
| **3.8** | GraphQL schema with `@kinetic` directive definitions + introspection                                   | C        | Essay GraphQL samples validate against shipped schema                                                                                                        |

### WS4 — OKF / `.cqk` / vault layout

| ID      | Task                                                                                  | Band | Done-when                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **4.1** | Optional `memory_ingest` flag / type to write `.cqk` when `wormRef` set               | A    | Spec + tests; default can stay `.md`                                                                                                |
| **4.2** | Generate Git `ontology/index.md` (OKF catalog) from entity set on `ontology generate` | A    | Essay “index first” has an artifact                                                                                                 |
| **4.3** | `memory_recall` optional boost: prefer ontology index / entity types when present     | A    | Documented behavior + test                                                                                                          |
| **4.4** | Decision: schema **always Git**; instances R2 — enforce in doctor                     | B ✅ | `clawql doctor` **warns** if local schema missing or marked object-storage-only ([ADR 0009 §6](../adr/0009-enterprise-ontology.md)) |

| ID      | Task                                                                    | Band              | Done-when                                                   |
| ------- | ----------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------- |
| **5.1** | Pin ontology schema hash/version on release manifest collect            | A                 | Manifest field present; verify fails if drift               |
| **5.2** | `clawql-release lint` accepts/validates `.cqm` (or manifest path alias) | A                 | Essay release lint claim true for MVP schema                |
| **5.3** | `clawql doctor --smoke` checks ontology dir + optional manifest pin     | A                 | Fail/warn documented                                        |
| **5.4** | Arweave upload of ontology pin                                          | **C** ✅ disclose | Same as **B3(a)** — Git + manifest pin now; Arweave roadmap |

### WS6 — Vertical packs & import

| ID      | Task                                                                                         | Band   | Done-when                                                                      |
| ------- | -------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| **6.1** | Pack layout under `packages/clawql-ontology/packs/{legal,...}` or `examples/ontology/packs/` | A      | ≥1 pack (legal) with 3–5 entities                                              |
| **6.2** | `clawql ontology import --pack legal` copies into `.clawql/ontology`                         | A      | Essay import works                                                             |
| **6.3** | Healthcare / financial / real-estate packs                                                   | B/C ✅ | **Legal-only shipped**; other three roadmap placeholders (`packs/*/README.md`) |

### WS7 — Command Deck builder & VS Code

| ID      | Task                                                            | Band              | Done-when                                                 |
| ------- | --------------------------------------------------------------- | ----------------- | --------------------------------------------------------- |
| **7.1** | VS Code extension: validate `.cqe` against JSON Schema          | **C** ✅ disclose | **B2(a)/(c):** disclose; CI `ontology lint` is the gate   |
| **7.2** | Command Deck 3-panel builder → branch + PR                      | **C** ✅ disclose | **B1(a)/(b):** CLI+PR is shipped authoring (**7.3**)      |
| **7.3** | Interim: document CLI+PR workflow as the shipped authoring path | A                 | Essay “builder” section moved to roadmap **or** disclosed |

### WS8 — Onyx / sources live binding

| ID      | Task                                                         | Band              | Done-when                            |
| ------- | ------------------------------------------------------------ | ----------------- | ------------------------------------ |
| **8.1** | Emit Onyx connector config stubs from `sources:` on generate | A                 | Files emitted; manual apply OK       |
| **8.2** | Auto-apply / sync sources → Onyx                             | **C** ✅ disclose | **B5(a):** stubs only; no auto-apply |

---

## Suggested implementation sequence (close max essay surface first)

```text
0.1–0.2  docs live
1.1–1.4  .cqe + init/create-entity
2.1–2.2–2.4–2.5  live read tools + demo backend + relationships
2.6      pii_fields → Presidio on results
4.1–4.3  .cqk option + ontology index + recall boost
5.1–5.3  manifest pin + doctor
6.1–6.2  legal pack + import
3.1–3.4  kinetic decision + LOW/MEDIUM sandbox
then: 3.5–3.8 (HIGH+/Argo/GraphQL) as capacity allows — B1–B5 disclosed
```

---

## Decisions locked (publish compromises)

| Blocker / ID               | Locked choice                                               | Essay implication                          |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| **B1** builder             | **(a)/(b)** Disclose + CLI+PR authoring                     | No “Command Deck ships” claim              |
| **B2** VS Code             | **(a)/(c)** Disclose; CI lint is the gate                   | No “extension ships” claim                 |
| **B3** / **5.4** Arweave   | **(a)** Disclose; Git + release manifest pin                | No Arweave permanence claim                |
| **B4** full kinetic        | **(a)** LOW+MEDIUM MCP kinetic shipped; GraphQL = transport target | Soft-copy HIGH/Argo/`@kinetic` as phased   |
| **B5** / **8.2** auto-Onyx | **(a)** Stubs only                                          | No “generate configures Onyx” as automatic |
| **B6** / **6.3** packs     | **(a)** Legal only                                          | Other verticals = roadmap                  |
| **4.4** schema Git         | Warn in `doctor` if missing / remote-only                   | Policy enforceable without hard fail       |

**Remaining optional impl (not publish-blocking):** **3.5–3.8** still disclose/phased (canary / HITL / Argo / GraphQL).

---

## Real blockers (historical — decisions above supersede “stop here”)

These cannot be honestly claimed without multi-sprint product work or external systems. **Compromises are locked in § Decisions locked.**

| Blocker                                                                                             | Essay claim                           | Compromise options                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1. Command Deck visual builder**                                                                 | Three panels → Git PR                 | **(a)** Disclose as next · **(b)** Ship CLI-only authoring and rewrite essay builder section · **(c)** Build full UI (large)                                                 |
| **B2. VS Code extension**                                                                           | Real-time `.cqe` validation           | **(a)** Disclose · **(b)** Ship minimal extension (JSON Schema only) — still weeks · **(c)** Point to `ontology lint` in CI as the “extension” (rewrite copy)                |
| **B3. Arweave permanence**                                                                          | Schema Arweave-permanent on publish   | **(a)** Disclose “Git + WORM/manifest now; Arweave on Layer 0 roadmap” · **(b)** Implement Arweave in `clawql-release` (external deps)                                       |
| **B4. Full kinetic stack** (HIGH canary + CRITICAL HITL + GraphQL `@kinetic` + Argo/Pulumi routing) | Full Layer 3 essay                    | **(a)** Ship LOW (+ optional MEDIUM) MCP kinetic writes; rewrite GraphQL samples as “transport target” · **(b)** Full build (multi-sprint) · **(c)** Disclose phased kinetic |
| **B5. Auto Onyx from `sources`**                                                                    | generate configures Onyx              | **(a)** Emit config stubs only; soft copy · **(b)** Full connector automation · **(c)** Disclose                                                                             |
| **B6. Design-partner vertical depth**                                                               | Four industry packs, production-ready | **(a)** Ship **legal** pack only; other three “templates” · **(b)** Disclose packs as roadmap · **(c)** Wait for partners                                                    |

**Recommendation for zero-disclaimer publish:** treat **B1, B2, B3, B5** as hard disclosures (or rewrite those sentences), aggressively close **WS0–WS2, WS4–WS6, WS3.1–3.3**, and choose **B4(a)** + **B6(a)** so the essay’s core demo path (typed reads, `.cqe`, lint/generate, legal pack, LOW kinetic) is literally true. **Status: those choices are locked above.**

**Recommendation for “publish as-is” (no disclosures):** you need **B1–B6 all closed** — that is a **product program**, not a sprint. There is no honest shortcut past B1/B2/B3/B4 without either building them or changing the essay.

---

## Definition of “publish without disclaimers”

Every imperative claim in the essay is true for a reader who clones ClawQL `main` and follows the Getting Started section, **or** the essay text was edited so the claim is no longer made. Narrative history (Palantir, Fabric, semantic web) does not require implementation.

---

## Progress (band A closed on this branch)

Closed without product decisions (see PR closing no-drama gaps):

| IDs                              | Status                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **0.1–0.2**                      | Docs site pages for Enterprise Ontology + `.cq*` specs (merge + deploy still required for live URLs)                               |
| **0.3**                          | This backlog doc                                                                                                                   |
| **1.1, 1.3, 1.4, 1.5**           | `.cqe` examples; `ontology init` / `create-entity`; **`.cqe` primary** (ADR 0010 §2a)                                              |
| **2.1, 2.2, 2.3, 2.4, 2.5, 2.6** | Fixture MCP plugin + **fixture-mode decision** (ADR 0009 §9); `CLAWQL_ENABLE_ONTOLOGY` / `CLAWQL_ONTOLOGY_DIR`; relationships; PII |
| **3.1**                          | **MCP-first kinetic** (ADR 0009 §10); GraphQL `@kinetic` deferred to **3.8** / B4                                                  |
| **3.2–3.4**                      | Gated `writeTools` + LOW/MEDIUM Transaction Sandbox (mandate gate on `adjust_contract_value`)          |
| **4.1–4.4**                      | `.cqk` + recall boost + `index.md`; **schema-in-Git doctor warns** (4.4)                                                           |
| **5.1–5.3**                      | Manifest `ontologySchema` pin + verify; `clawql-release lint` for `.cqm`; doctor ontology check                                    |
| **5.4**                          | **Disclosed** — Arweave deferred (B3a)                                                                                             |
| **6.1–6.3**                      | Legal pack + import; **other verticals roadmap** (B6a)                                                                             |
| **7.1–7.3**                      | CLI+PR authoring shipped; builder/VS Code **disclosed** (B1/B2)                                                                    |
| **8.1–8.2**                      | Onyx stubs; auto-apply **disclosed** (B5a)                                                                                         |

**Publish path:** core demo is literally true; remaining essay edits are disclosure sentences per § Decisions locked. Optional later: **3.5–3.8**.

## Tracking

- Open GitHub issues per workstream (WS1–WS8) or one epic with checkboxes from this file.
- Do not mark ADR 0009 “shipped” for kinetic/graph/builder until the corresponding Done-when rows above are green.
