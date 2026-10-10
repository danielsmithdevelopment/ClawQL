# MCP tools reference

**Plugin ownership:** which horizontal package registers each optional tool — [`docs/reference/clawql-plugin-registry.md`](../reference/clawql-plugin-registry.md) and [`docs/design/clawql-plugin-model.md`](../design/clawql-plugin-model.md).

**Feature tiers (diagram-aligned):** **[`docs/readme/configuration.md` § Feature tiers](../readme/configuration.md#feature-tiers-architecture-diagram)** — **ClawQL Core (no opt-out):** **`search`**, **`execute`**, **`audit`**, **`cache`**, **`skills_list`**, **`skills_get`**; **default on, opt out:** **`memory_*`**, **Documents** (`ingest_external_knowledge`, **`knowledge_search_onyx`** when **`CLAWQL_ENABLE_ONYX=1`**); **default off, opt in:** **`CLAWQL_ENABLE_PRESIDIO=1`** (gateway redaction on execute + ingest paths), **`CLAWQL_ENABLE_PRIVACY_FILTER=1`** (local Privacy Filter backup after Presidio; [#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245)), **`sandbox_exec`** (**`CLAWQL_ENABLE_SANDBOX=1`**), **`schedule`**, **`notify`**, **`workflow`** ([#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243)), **`argocd`** ([#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244)), **`hitl_enqueue_label_studio`** ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)), and (8.0 demotion) **`clawql_think`** / **`ouroboros_*`** (via **`clawql-harness`**; **`CLAWQL_ENABLE_OUROBOROS_TOOLS=1`** or instance/tier `ouroboros.enabled: true` — no additive agent-loop proof yet). Langfuse eval remains opt-in (**`CLAWQL_ENABLE_LANGFUSE_EVAL`**), nested under the harness gate above. **Removed in 8.0:** **`pageindex_*`** / **`CLAWQL_ENABLE_PAGEINDEX`** / hybrid PageIndex, and **`codegraph_*`** / **`CLAWQL_ENABLE_CODEGRAPH`** / Graphify (Track B retest: tie vs grep) — see [purge inventory](../releases/8.0.0-purge-inventory-spec-v0.1.md) and [post-8.0 CodeGraph backlog](../backlog/post-8.0-codegraph-revisit.md).

**Instrumentation vs exports (8.0):** **OpenTelemetry** is the sole instrumentation layer (`CLAWQL_ENABLE_OTEL_TRACING`). **Prometheus** (`GET /metrics` / prom-client; `CLAWQL_ENABLE_HTTP_METRICS`) and **Langfuse** (`CLAWQL_ENABLE_LANGFUSE`) are **export destinations**, not parallel instrumentation stacks. See [observability README](../observability/README.md#one-instrumentation-layer-80).

ClawQL registers **`search`**, **`execute`**, **`skills_list`**, **`skills_get`**, **`ingest_external_knowledge`**, in-process **`cache`**, **`audit`**, and vault **`memory_ingest`** / **`memory_recall`** by default (stdio or Streamable HTTP). Harness **`clawql_think`** / **`ouroboros_*`** are **opt-in** as of 8.0 — set **`CLAWQL_ENABLE_OUROBOROS_TOOLS=1`** or instance/tier `ouroboros.enabled: true`. Set **`CLAWQL_ENABLE_MEMORY=0`** and/or **`CLAWQL_ENABLE_DOCUMENTS=0`** to hide memory tools or the **document** stack (see optional flags table: default **`all-providers`** then omits **docling**, **paperless**, **onyx**, **nextcloud**, **coneshare**). **Tika** / **Gotenberg** / **Stirling** are **opt-in only** as of 8.0 (sole default converter is **Docling**) — they are excluded from `all-providers` unconditionally; pull one back with explicit **`CLAWQL_BUNDLED_PROVIDERS=tika,gotenberg,stirling,…`**. **`memory_*`** use a writable **`CLAWQL_OBSIDIAN_VAULT_PATH`** when you actually read/write. Additional optional tools include **`sandbox_exec`** when **`CLAWQL_ENABLE_SANDBOX=1`** ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207)), **`schedule`** when **`CLAWQL_ENABLE_SCHEDULE=1`** ([#76](https://github.com/danielsmithdevelopment/ClawQL/issues/76)), **`notify`** when **`CLAWQL_ENABLE_NOTIFY=1`** ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)), **`workflow`** when **`CLAWQL_ENABLE_WORKFLOW=1`** ([#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243)), **`argocd`** when **`CLAWQL_ENABLE_ARGO_CD=1`** ([#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244)), **`hitl_enqueue_label_studio`** when **`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`** ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)), and **`knowledge_search_onyx`** when **`CLAWQL_ENABLE_ONYX=1`** ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)). The **core** pair is **`search`** + **`execute`** for the active API index (OpenAPI/Discovery by default, plus optional **native GraphQL** / **gRPC** when **`CLAWQL_GRAPHQL_SOURCES`** / **`CLAWQL_GRPC_SOURCES`** are set — see [ADR 0002](../adr/0002-multi-protocol-supergraph.md)); **`skills_list`** / **`skills_get`** expose ProviderPlugin / StandaloneSkillPlugin skill bodies. Other features depend on configuration (vault path, Sandbox backends when enabled, external ingest flag, optional **`CLAWQL_ENABLE_*`** flags). **`CLAWQL_ENABLE_OUROBOROS`** is **deleted** (was already deprecated as a registration gate; not resurrected) — the new gate is **`CLAWQL_ENABLE_OUROBOROS_TOOLS`**, default **false**.

| Tool                                                                                                                                                                                                        | Requires                                                                                                                                                                                         | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`                                                                                                                                                                                                    | Loaded spec                                                                                                                                                                                      | Rank operations (and skills) by natural-language intent; when **`CLAWQL_DOCS_INDEX_PATH`** or the bundled docs index is present, also returns **`kind: "doc"`** hits ([ADR 0015](../adr/0015-program-mode-alongside-search-execute.md))                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `docs_search`                                                                                                                                                                                               | **`CLAWQL_ENABLE_DOCS_SEARCH=1`** (+ docs index)                                                                                                                                                 | Docs-only search over the same JSON index Core **`search`** uses (`kind: "doc"`). Pattern from apps/docs WebMCP **`clawql.docs.search`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `execute`                                                                                                                                                                                                   | OpenAPI/Discovery: single-spec in-process OpenAPI→GraphQL (REST fallback); multi-spec REST. Native: HTTP GraphQL or gRPC unary when configured.                                                  | Run one operation with lean responses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `proxy_call`                                                                                                                                                                                                | **`CLAWQL_ENABLE_PLAIN_PROXY=1`** **or** key group in **`CLAWQL_PLAIN_PROXY_KEY_GROUPS`** (host sets **`CLAWQL_API_KEY_GROUP`**)                                                                 | Thin alias of **`execute`** for harnesses with their own catalog UX — same gate/risk/redaction/audit ([plain-proxy-mode-v0.1](../specs/mcp/plain-proxy-mode-v0.1.md), [ADR 0015](../adr/0015-program-mode-alongside-search-execute.md))                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `execute_program`                                                                                                                                                                                           | **`CLAWQL_ENABLE_PROGRAMS=1`**                                                                                                                                                                   | **v0 plan runner** (not a full JS AST interpreter — OpenCode vendor is next): JSON plan of parallel/sequential **read** `search`/`execute` calls in one round trip, each on the same gate/IFC/audit path with a `programId`. Writes never run in a program: list them in `plan.proposals` (`$ref` to read results or earlier proposals) and they come back resolved, bound to the `argsHash` a mandate would park — run them with **`submit_program_proposals`** or plain **`execute`** ([ADR 0015](../adr/0015-program-mode-alongside-search-execute.md) § Proposed writes). Caps: `CLAWQL_PROGRAM_MAX_*`.                                                                                                |
| `submit_program_proposals`                                                                                                                                                                                  | **`CLAWQL_ENABLE_PROGRAMS=1`**                                                                                                                                                                   | Runs the proposals an **`execute_program`** call returned, in plan order, each through the normal **`execute`** path (gate, risk, session IFC, mandate park, audit); fills `<id>.result` refs from earlier results. Not atomic: each leaf ends `ran` / `failed` / `dropped` / `pending`. Call again with the same `programId` after approving parked mandates in Review; settled leaves never run twice, and submit never approves anything itself. Records are per process and session — elsewhere, pass the echoed `proposals`.                                                                                                                                                                          |
| `sandbox_exec`                                                                                                                                                                                              | **`CLAWQL_ENABLE_SANDBOX=1`**; then **`CLAWQL_SANDBOX_BACKEND`** / bridge URL + token / Kata / Docker / Seatbelt per § **`sandbox_exec`** below                                                  | Isolated snippets: **Kata** (default in-cluster **`auto`**), Docker/Podman, macOS **`sandbox-exec`**, or Cloudflare bridge ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `data_query`, `data_ingest`, `data_status` (+ optional `clawql_sql`)                                                                                                                                        | **`CLAWQL_ENABLE_DATA=1`**; optional **`CLAWQL_ENABLE_CLAWQL_SQL_ALIAS=1`**                                                                                                                      | Node DuckDB structured SQL (`packages/clawql-data`). Primary name is **`data_query`**. Legacy **`clawql_sql`** alias is opt-in (Harvey LAB remaps via `lab-mcp-proxy.mjs`). Not Python `duckdb`. Not chDB. Read-only `SELECT`/`WITH`. Ingest `matters` / `matter_documents`.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `memory_ingest`                                                                                                                                                                                             | _default on_; set **`CLAWQL_ENABLE_MEMORY=0`** to hide; `CLAWQL_OBSIDIAN_VAULT_PATH` (writable) for I/O                                                                                          | Write Obsidian Markdown under `Memory/`; optional **`enterpriseCitations`** (short Onyx-style rows, [#130](https://github.com/danielsmithdevelopment/ClawQL/issues/130)); optional **`rebuild.embeddings`**; refreshes **`memory.db`** when enabled; optional **`_INDEX_*.md`** hub page ([#38](https://github.com/danielsmithdevelopment/ClawQL/issues/38)); when **`CLAWQL_MERKLE_ENABLED`** / **`CLAWQL_CUCKOO_ENABLED`**, JSON may include **`merkleSnapshotBefore`**, **`merkleSnapshot`**, **`merkleRootChanged`**, **`cuckooMembershipReady`**                                                                                                                                                      |
| `memory_recall`                                                                                                                                                                                             | _default on_; set **`CLAWQL_ENABLE_MEMORY=0`** to hide; `CLAWQL_OBSIDIAN_VAULT_PATH` (readable) for I/O                                                                                          | Multi-source recall via optional **`sources`**: `vault` \| `vector` \| `onyx` → normalized **`hits[]`** + **`followUps`**; vault **`results[]`** kept for compatibility; lexical ranker **`CLAWQL_MEMORY_VAULT_RANKER`** (`idf` only — `bm25` removed in 8.0.0); optional **vector KNN**; optional **`CLAWQL_MEMORY_RECALL_HYBRID_ONYX`** (master `CLAWQL_MEMORY_RECALL_HYBRID` **removed** in 8.0); see [memory plugin](../plugins/memory.md)                                                                                                                                                                                                                                                             |
| `read_around`                                                                                                                                                                                               | _default on_ with memory tier                                                                                                                                                                    | Expand a vault path or chunk snippet into the enclosing ATX heading section (`section_id`, `content`); used by pageindex-ab vector/vault arms                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `sources_propose`                                                                                                                                                                                           | _default on_ (Core)                                                                                                                                                                              | Preview or park a custom source with operation-risk summary. Does **not** write `sources.json`. Approval is operator-only (`clawql sources approve` / console / phone) — **`sources_approve` is not an MCP tool** and is stripped from session seed. See [sources-propose-v0.1](../specs/risk/sources-propose-v0.1.md).                                                                                                                                                                                                                                                                                                                                                                                    |
| `console_link`                                                                                                                                                                                              | **`CLAWQL_ENABLE_CONSOLE_LINK=1`**                                                                                                                                                               | Core deep-link URL into the ClawQL console for the current session/org (`CLAWQL_CONSOLE_BASE_URL` / `CLAWQL_PUBLIC_ORIGIN`). Thin alias of ChatGPT-extension **`clawql_console`** (UI resource) for non-Apps clients ([ADR 0015](../adr/0015-program-mode-alongside-search-execute.md)).                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `clawql_console`                                                                                                                                                                                            | ChatGPT extensions on (**`CLAWQL_ENABLE_CHATGPT_EXTENSIONS`** default on)                                                                                                                        | Opens the six-section console via MCP Apps (`ui://clawql/console`). Prefer **`console_link`** when the host needs a plain HTTPS URL instead of an Apps resource.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `memory_sync`                                                                                                                                                                                               | _default on_; set **`CLAWQL_ENABLE_MEMORY=0`** to hide; **`CLAWQL_SYNC_BUCKET`** + credentials (R2/S3/GCS)                                                                                       | Reconcile local vault with remote team bucket: default **`auto`** = pull then push; optional **`direction`**: `pull` \| `push`; **`force`** for conflicts; **`dryRun`** to plan only — a **Cloud Agent job** (ephemeral VM, no local `~/.ClawQL`), not a human approval gate. Prefer this over shell **`clawql sync push/pull`** on Cloud Agents.                                                                                                                                                                                                                                                                                                                                                          |
| `ingest_external_knowledge`                                                                                                                                                                                 | **`CLAWQL_EXTERNAL_INGEST=1`** (exact); documents tier on; vault path; optional fetch                                                                                                            | Bulk **Markdown** (`documents[]`) and optional **HTTPS** fetch (`source: url`, **`CLAWQL_EXTERNAL_INGEST_FETCH=1`**). **Not registered by default in 8.0** — vault writes use **`memory_ingest`**. Runs vault lock + **`memory.db`** sync when enabled ([#40](https://github.com/danielsmithdevelopment/ClawQL/issues/40)); no payload → roadmap preview                                                                                                                                                                                                                                                                                                                                                   |
| `cache`                                                                                                                                                                                                     | _ClawQL Core_ (no env gate, no opt-out)                                                                                                                                                          | Ephemeral **in-process LRU** KV (set/get/delete/list/search); evicts LRU when full — **not** on disk; use **`memory_ingest`** / **`memory_recall`** for persisted vault memory ([#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75))                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `audit`                                                                                                                                                                                                     | _ClawQL Core_ (no env gate, no opt-out)                                                                                                                                                          | In-process **ring buffer** of structured events (append/list/clear) — **not** on disk; not compliance-grade alone; use **`memory_ingest`** for durable trails ([#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89))                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `schedule`                                                                                                                                                                                                  | **`CLAWQL_ENABLE_SCHEDULE=1`**                                                                                                                                                                   | Persisted schedule jobs (`create/list/get/delete/trigger`) with typed actions; v1 action kind is **synthetic HTTP checks** (`action.kind: "synthetic"`) with assertion-based pass/fail and run history ([#76](https://github.com/danielsmithdevelopment/ClawQL/issues/76), [schedule-synthetic-checks.md](schedule-synthetic-checks.md))                                                                                                                                                                                                                                                                                                                                                                   |
| `notify`                                                                                                                                                                                                    | **`CLAWQL_ENABLE_NOTIFY=1`**, Slack spec in merge, bot token                                                                                                                                     | Slack **`chat.postMessage`** wrapper for workflow milestones and completion signals ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)); same auth as **`execute`** on **`slack`** (`CLAWQL_SLACK_TOKEN`, …)                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `workflow`                                                                                                                                                                                                  | **`CLAWQL_ENABLE_WORKFLOW=1`**, Argo Workflows ≥ 3.4.0 in cluster, namespace allowlist                                                                                                           | Argo **`Workflow`** submit / wait / get / logs / suspend / resume / cron / artifacts via **`clawql-automation`** ([#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243)); see **[workflow-tool.md](workflow-tool.md)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `argocd`                                                                                                                                                                                                    | **`CLAWQL_ENABLE_ARGO_CD=1`**, Argo CD **`Application`** CRDs in allowlisted namespaces                                                                                                          | Observe / sync **Argo CD Applications** via Kubernetes CRD API ([#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244)); see **[argocd-tool.md](argocd-tool.md)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `hitl_enqueue_label_studio`                                                                                                                                                                                 | **`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`**, **`CLAWQL_LABEL_STUDIO_URL`**, **`CLAWQL_LABEL_STUDIO_API_TOKEN`**                                                                                      | Label Studio **`POST /api/projects/{id}/import`** — human review queue + **`POST /hitl/label-studio/webhook`** for decisions ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)); see **[hitl-label-studio.md](hitl-label-studio.md)**                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `knowledge_search_onyx`                                                                                                                                                                                     | _documents on_; **`CLAWQL_ENABLE_ONYX=1`**, **`onyx`** in loaded merge, **`ONYX_BASE_URL`**, Bearer token                                                                                        | Onyx **`POST /search/send-search-message`** wrapper ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)); same auth as **`execute`** on **`onyx`**. Not registered if **`CLAWQL_ENABLE_DOCUMENTS=0`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `run_idp_pipeline`                                                                                                                                                                                          | **`CLAWQL_ENABLE_IDP_PIPELINE=1`** and documents enabled                                                                                                                                         | Automated **`DEFAULT_IDP_PIPELINE`** executor — per-hop **`execute`**, retries, Merkle snapshots ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)); see **[idp-pipeline-runner.md](idp-pipeline-runner.md)**. **`dry_run`** defaults **`true`**.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `classify_document`                                                                                                                                                                                         | **`CLAWQL_ENABLE_IDP_CLASSIFIER=1`** and documents enabled                                                                                                                                       | Document type label + confidence via **`CLASSIFIER_BASE_URL/classify`** or local heuristic ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)); see **[fine-tuned-classifier.md](../runbooks/fine-tuned-classifier.md)**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `inspect_pdf`                                                                                                                                                                                               | **`CLAWQL_ENABLE_PDF_INSPECTOR=1`** and documents enabled                                                                                                                                        | Firecrawl **pdf-inspector** — local PDF type + Markdown + Docling route recommendation; see **[pdf-inspector-onboarding.md](../providers/pdf-inspector-onboarding.md)**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `convert_document`                                                                                                                                                                                          | **`CLAWQL_ENABLE_ANYDOC=1`** and documents enabled                                                                                                                                               | Firecrawl **anydoc** — Office/PDF/CSV → GFM Markdown + Docling/Tika route; see **[anydoc-onboarding.md](../providers/anydoc-onboarding.md)**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `extract_document`                                                                                                                                                                                          | **`CLAWQL_ENABLE_LANGEXTRACT=1`** and documents enabled                                                                                                                                          | Schema-grounded LangExtract extractions with **`char_interval`** + optional HTML path refs ([#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)); see **[langextract-onboarding.md](../providers/langextract-onboarding.md)**.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ouroboros_create_seed_from_document`, `ouroboros_run_evolutionary_loop`, `ouroboros_get_lineage_status`, `ouroboros_measure_drift`, `clawql_think`                                                         | **`CLAWQL_ENABLE_OUROBOROS_TOOLS=1`** or instance/tier `ouroboros.enabled: true` (8.0 demotion — default **off**); optional **`CLAWQL_OUROBOROS_DATABASE_URL`** for Postgres-backed events       | Harness plugin registers tools; MCP bridges them ([#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141)): seed-from-document, run evolutionary loop, read lineage, **3-component drift** ([#557](https://github.com/danielsmithdevelopment/ClawQL/issues/557)), plus `clawql_think`. Without **`CLAWQL_OUROBOROS_DATABASE_URL`**, events stay in-memory ([#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142)). No additive agent-loop proof yet — demoted to opt-in; server-side Ouroboros capability lifecycle is unaffected. **`CLAWQL_ENABLE_OUROBOROS`** (old name) is deleted, not resurrected — see [purge inventory](../releases/8.0.0-purge-inventory-spec-v0.1.md). |
| `ouroboros_propose_seed_revision_from_eval`                                                                                                                                                                 | **`CLAWQL_ENABLE_LANGFUSE_EVAL=1`** AND the harness gate above (**`CLAWQL_ENABLE_OUROBOROS_TOOLS=1`** or instance `ouroboros.enabled: true`); webhook **`CLAWQL_LANGFUSE_WEBHOOK_TOKEN`** (prod) | Langfuse eval → seed revision gate ([#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250)); **`POST /observability/langfuse/webhook`**; default dry-run — **`CLAWQL_LANGFUSE_EVAL_AUTO_APPLY=1`** to apply; see **[langfuse-eval-ouroboros.md](langfuse-eval-ouroboros.md)**.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `observability_query_logs`, `observability_query_metrics`, `observability_query_traces`, `observability_query_profiles`, `observability_health`, `observability_alerts`, `observability_apply_alloy_config` | **`CLAWQL_ENABLE_OBSERVABILITY=1`** (default **off**)                                                                                                                                            | **Named job: operator LGTM+ query/apply** — LogQL / PromQL / TraceQL / Pyroscope + health / alerts / Alloy apply. **Not** agent-loop reasoning. Distinct from OTEL emission and from Prometheus/Langfuse **exports**. See [observability README](../observability/README.md#one-instrumentation-layer-80).                                                                                                                                                                                                                                                                                                                                                                                                 |

**Presidio (not separate MCP tools):** When **`CLAWQL_ENABLE_PRESIDIO=1`**, the gateway redacts text on **`execute`** responses, **`memory_ingest`**, and **`ingest_external_knowledge`** before persistence. Configure **`CLAWQL_PRESIDIO_ANALYZER_URL`**, **`CLAWQL_PRESIDIO_ANONYMIZER_URL`**, and **`CLAWQL_PRESIDIO_FAILURE_POLICY`**. See [MCP clients — Presidio](https://docs.clawql.com/mcp-clients#presidio-redaction) and `.env.example`.

**Privacy Filter (local backup, not separate MCP tools):** When **`CLAWQL_ENABLE_PRIVACY_FILTER=1`**, a **second local** redact pass runs after Presidio (or alone) via **`CLAWQL_PRIVACY_FILTER_URL`** — open-weight / demo sidecar, **no OpenAI API**. See [`docs/security/privacy-filter-local.md`](../security/privacy-filter-local.md) and [#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245).

See also: **[memory-obsidian.md](../memory/memory-obsidian.md)** (vault concepts), **[integrations/cursor-vault-memory.md](../integrations/cursor-vault-memory.md)** (Cursor rule + skill for vault tools), **[cache-tool.md](cache-tool.md)** (**`cache`** vs **`memory_*`**, LRU), **[notify-tool.md](notify-tool.md)** (**`notify`** Slack guide + examples), **[workflow-tool.md](workflow-tool.md)** (**`workflow`** Argo guide + examples), **[argocd-tool.md](argocd-tool.md)** (**`argocd`** Argo CD guide), **[hitl-label-studio.md](hitl-label-studio.md)** (HITL / Label Studio bridge), **[langfuse-eval-ouroboros.md](langfuse-eval-ouroboros.md)** (Langfuse eval → Ouroboros), **[onyx-knowledge-tool.md](onyx-knowledge-tool.md)** (**`knowledge_search_onyx`** Onyx guide + examples), **[backlog/archive/notify-tool-test-backlog.md](../backlog/archive/notify-tool-test-backlog.md)** (future **`notify`** test issues), **[enterprise-mcp-tools.md](enterprise-mcp-tools.md)** (audit / metrics / governance roadmap), **[memory-db-schema.md](../memory/memory-db-schema.md)** (SQLite sidecar), **[external-ingest.md](external-ingest.md)** (bulk ingest stub), **[clawql-ouroboros.md](../ouroboros/clawql-ouroboros.md)** (evolutionary-loop library + MCP hook shapes), **[README](../../README.md)** (install, env tables), **[readme/deployment.md](../readme/deployment.md)** (**`GET /metrics`** Prometheus · **`GET /healthz`** optional **`nativeProtocolMetrics`** · **`CLAWQL_ENABLE_HTTP_METRICS=0`**, [#191](https://github.com/danielsmithdevelopment/ClawQL/issues/191)), **[deployment/deploy-k8s.md](../deployment/deploy-k8s.md)** (Kubernetes Service ports **8080** + **50051** for HTTP MCP and gRPC), **[infra/cloudflare/sandbox-bridge/README.md](../../infra/cloudflare/sandbox-bridge/README.md)** (Worker deploy).

---

## `cache` (ClawQL Core — always on)

**Full write-up:** **[cache-tool.md](cache-tool.md)** (vs vault memory, LRU semantics, multi-replica).

**Env:** Always registered — there is no **`CLAWQL_ENABLE_CACHE`** toggle. Tune with **`CLAWQL_CACHE_MAX_VALUE_BYTES`** — max UTF-8 size per value (default **1048576**, cap **16 MiB**). **`CLAWQL_CACHE_MAX_ENTRIES`** — max distinct keys (default **10000**); least-recently-used keys are evicted when full (`get` / `set` refresh recency).

**Temporary session data only:** entries live in an **LRU `Map` in this process** — no disk, no vault. Restart or another replica has an empty cache. For **durable** notes and graph recall, use **`memory_ingest`** and **`memory_recall`**.

**Input (discriminated by `operation`):**

| `operation` | Fields                                                                          | Result                                                                |
| ----------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `set`       | `key`, `value`                                                                  | `{ ok, key, evicted? }` (evicted = LRU keys dropped when at capacity) |
| `get`       | `key`                                                                           | `{ hit, key, value? }`                                                |
| `delete`    | `key`                                                                           | `{ deleted }`                                                         |
| `list`      | optional `prefix`, `limit` (default 100)                                        | `{ keys[] }` sorted                                                   |
| `search`    | `query` (substring, keys only, case-insensitive), optional `limit` (default 50) | `{ keys[] }`                                                          |

---

## `audit` (ClawQL Core — always on)

**Full write-up:** **[enterprise-mcp-tools.md](enterprise-mcp-tools.md)** (threat model, future metrics/governance).

**Env:** Always registered — there is no **`CLAWQL_ENABLE_AUDIT`** toggle. **`CLAWQL_AUDIT_MAX_ENTRIES`** — max events retained (default **500**, cap **50_000**); oldest entries drop when over capacity.

**Not durable:** the buffer is **in RAM only** — use **`memory_ingest`** for vault-backed or reviewable trails. Every registered MCP tool call (search, execute, memory_*, …) **auto-appends** a redacted `mcp_tool` row unless **`CLAWQL_AUDIT_TOOL_CALLS=0`**. The `audit` tool itself is not auto-logged (avoids recursion).

**Prometheus (aggregates):** on every ClawQL process, **`clawql_audit_append_total`**, **`clawql_audit_ring_entries_dropped_total`**, **`clawql_audit_clear_total`**, and **`clawql_audit_buffer_entries`** are updated (same registry as **`GET /metrics`** on **`clawql-mcp-http`**). No per-event labels — safe scrape cardinality.

**Loki (optional):** when **`CLAWQL_LOKI_PUSH_URL`** is set (full push URL, usually **`…/loki/api/v1/push`**), each successful **`append`** (including auto tool-call rows) **POST**s one JSON log line (`category`, `action`, `summary`, optional `correlationId`, `ts`) with stream labels **`job`** + **`service`** only (`job` default **`clawql-audit`**, `service=clawql-mcp`). Inference call-store records are a **separate** stream: **`job=clawql-inference`** (`CLAWQL_LOKI_INFERENCE_JOB`), `service=clawql-inference`, metadata only (no prompt/response bodies). Auth: **`CLAWQL_LOKI_BEARER_TOKEN`**, **`CLAWQL_LOKI_TENANT_ID`** (`X-Scope-OrgID`). Failures log to stderr and **do not** fail the MCP tool or the completion. See **`.env.example`**.

**Input:**

| `operation` | Fields                                                               | Result                                 |
| ----------- | -------------------------------------------------------------------- | -------------------------------------- |
| `append`    | `category`, `action`, `summary` (required), optional `correlationId` | `{ ok, total, dropped }`               |
| `list`      | optional `limit` (default 20, max 100)                               | `{ ok, total, maxEntries, entries[] }` |
| `clear`     | —                                                                    | `{ ok, cleared }`                      |

---

## `notify` (optional)

**Full write-up (setup, `notify` vs `execute`, examples, errors):** **[notify-tool.md](notify-tool.md)** ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)).

**Env:** **`CLAWQL_ENABLE_NOTIFY=1`** (or `true` / `yes`). The **loaded OpenAPI index** must include Slack’s **`chat_postMessage`** operation (bundled id **`slack`** — e.g. **`CLAWQL_PROVIDER=slack`**, **`CLAWQL_BUNDLED_PROVIDERS`** that lists **`slack`**, or **`all-providers`**). Authenticate like **`execute`** on **`slack`**: **`CLAWQL_SLACK_TOKEN`**, **`SLACK_BOT_TOKEN`**, **`SLACK_TOKEN`**, **`CLAWQL_SLACK_BOT_TOKEN`**, or a **`slack`** entry in **`CLAWQL_PROVIDER_AUTH_JSON`** (see **`src/auth-headers.ts`**). Minimum scope **`chat:write`**.

**Behavior:** builds the same request as **`execute`** with **`operationId`** **`chat_postMessage`** and `application/x-www-form-urlencoded` body. Default response trimming keeps **`ok`**, **`error`**, **`channel`**, **`ts`**, **`message`**, **`warning`** so Slack **`ok:false`** payloads still include the API **`error`** code before **`notify`** remaps the body. If Slack returns HTTP 200 with **`"ok": false`**, the tool surfaces that as an **`error`** JSON object (Slack’s **`error`** code plus the parsed body under **`slack`**) instead of treating it as success.

**Example (minimal):**

```json
{
  "channel": "C0123456789",
  "text": "✅ *Invoice batch* complete — 14 files → Paperless doc <https://paperless.example/documents/5102/detail|#5102>."
}
```

**Input (required + common optional):**

| Field             | Required | Notes                                                                                    |
| ----------------- | -------- | ---------------------------------------------------------------------------------------- |
| `channel`         | yes      | Channel ID (`C…` / `G…` / `D…`), or **`#name`** for public channels the bot is in.       |
| `text`            | yes      | Message body; embed Onyx / Paperless / doc links inline for workflow summaries.          |
| `thread_ts`       | no       | Reply in a thread.                                                                       |
| `blocks`          | no       | JSON **string** of Block Kit blocks (Slack form field).                                  |
| `attachments`     | no       | JSON **string** of legacy attachments.                                                   |
| `username`        | no       | Bot display name override.                                                               |
| `icon_emoji`      | no       | Bot icon emoji.                                                                          |
| `icon_url`        | no       | Bot icon URL.                                                                            |
| `mrkdwn`          | no       | Set **`false`** to disable mrkdwn.                                                       |
| `unfurl_links`    | no       | Slack unfurl toggles.                                                                    |
| `unfurl_media`    | no       |                                                                                          |
| `reply_broadcast` | no       | Thread reply visibility.                                                                 |
| `parse`           | no       | Slack **`parse`** mode.                                                                  |
| `link_names`      | no       | Link `#channels` and `@users`.                                                           |
| `as_user`         | no       | Post as the authed user instead of the bot when **`true`**.                              |
| `fields`          | no       | Same as **`execute`** `fields` — top-level response keys only (multi-spec: REST shapes). |

---

## `hitl_enqueue_label_studio` (optional)

**Full write-up (confidence policy, webhook, Helm):** **[hitl-label-studio.md](hitl-label-studio.md)** ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)). **Website overview:** **`/hitl-label-studio`** on the docs site.

**Env:** **`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`**, **`CLAWQL_LABEL_STUDIO_URL`**, **`CLAWQL_LABEL_STUDIO_API_TOKEN`**. For **`POST /hitl/label-studio/webhook`**, set **`CLAWQL_HITL_WEBHOOK_TOKEN`** (required when **`NODE_ENV=production`**).

**Behavior:** POSTs a batch of tasks to Label Studio **`/api/projects/{project_id}/import`**, merging **`clawql_hitl`** metadata (confidence, correlation ids, provenance) into each task’s **`data`**. Webhook payloads are appended to vault memory (**`memory_ingest`**) or **`audit`** when the vault is unavailable.

---

## `knowledge_search_onyx` (optional)

**Full write-up (setup, wrapper vs `execute`, `memory_ingest` / `notify` pairing, examples, errors):** **[onyx-knowledge-tool.md](onyx-knowledge-tool.md)** ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)).

**Env:** **`CLAWQL_ENABLE_DOCUMENTS`** must be on (default); then **`CLAWQL_ENABLE_ONYX=1`** (or `true` / `yes`). The **loaded OpenAPI index** must include the **`onyx`** bundled provider (operation id **`onyx_send_search_message`**, merged as **`onyx::onyx_send_search_message`** when **`onyx`** is part of a multi-spec merge — e.g. default **`all-providers`**, or **`CLAWQL_BUNDLED_PROVIDERS`** listing **`onyx`**, or **`CLAWQL_PROVIDER=onyx`**). Set **`ONYX_BASE_URL`** to your Onyx **API root** (often ends with **`/api`**). Authenticate like **`execute`** on **`onyx`**: **`ONYX_API_TOKEN`**, **`CLAWQL_ONYX_API_TOKEN`**, or a **`onyx`** entry in **`CLAWQL_PROVIDER_AUTH_JSON`** (see **`src/auth-headers.ts`**).

**Behavior:** resolves the correct **`operationId`** (`onyx::…` or single-spec), maps **`query`** → **`search_query`**, sets **`stream`: false**, defaults **`num_hits`** / **`include_content`**, then delegates to the same path as **`execute`** (multi-spec **REST**). Optional **`fields`** applies **top-level** JSON key filtering like **`execute`**.

**Example (minimal):**

```json
{
  "query": "Q1 2026 pricing approval workflow"
}
```

**Input (primary fields):**

| Field                 | Required | Notes                                                          |
| --------------------- | -------- | -------------------------------------------------------------- |
| `query`               | yes      | Maps to Onyx **`search_query`**.                               |
| `num_hits`            | no       | Default **15**; max **100**.                                   |
| `include_content`     | no       | Default **`true`** when omitted.                               |
| `stream`              | no       | Must be **`false`** or omitted.                                |
| `run_query_expansion` | no       | Default **`false`**.                                           |
| `hybrid_alpha`        | no       | Optional float for hybrid retrieval.                           |
| `filters`             | no       | Optional object; shape is Onyx-version-specific.               |
| `tenant_id`           | no       | Optional multi-tenant query parameter.                         |
| `fields`              | no       | Same as **`execute`** `fields` — top-level response keys only. |

---

## `search`

**Input (conceptual):**

```json
{
  "query": "list kubernetes clusters in a project",
  "limit": 5
}
```

Returns ranked **`operationId`** candidates and metadata — no upstream HTTP.

---

## `execute`

**Input:**

```json
{
  "operationId": "run.projects.locations.services.list",
  "args": {
    "parent": "projects/my-proj/locations/us-central1",
    "pageSize": 10
  },
  "fields": ["name", "uri"]
}
```

`fields` is optional; omit for defaults. For **OpenAPI/Discovery** operations, single-spec mode uses in-process OpenAPI→GraphQL (no separate proxy). **Native** GraphQL / gRPC operations ignore that path; see below.

### Native GraphQL and gRPC (`CLAWQL_GRAPHQL_URL` / `CLAWQL_GRAPHQL_SOURCES` / `CLAWQL_GRPC_SOURCES`)

**Bundled providers** (e.g. **Linear**, **GitHub**, **Cloudflare**): set **`CLAWQL_PROVIDER`** and the provider's auth token. ClawQL picks the best internal connection (**gRPC → GraphQL → OpenAPI**) — users only need **`search`** and **`execute`**.

**Linear:** **`CLAWQL_PROVIDER=linear`** + **`LINEAR_API_KEY`**. Do not set **`CLAWQL_GRAPHQL_*`** unless you are connecting a non-bundled GraphQL endpoint.

**Custom GraphQL HTTP provider** (not in the bundled catalog): set **`CLAWQL_GRAPHQL_URL`** (load-time introspection + **`execute`** POST target). Optionally **`CLAWQL_GRAPHQL_NAME`**, **`CLAWQL_GRAPHQL_HEADERS`**, and on-disk **`CLAWQL_GRAPHQL_SCHEMA_PATH`** / **`CLAWQL_GRAPHQL_INTROSPECTION_PATH`** when upstream introspection is blocked. On **`CLAWQL_GRAPHQL_SOURCES`** entries, use **`schemaPath`** / **`introspectionPath`** instead; if both file hints are set, introspection wins. Missing on-disk paths are logged and ignored. Known endpoints (e.g. **`api.linear.app/graphql`**) auto-route to bundled providers. **`endpoint`** stays required for **`execute`** (POST).

**Custom provider only:** when **`CLAWQL_GRAPHQL_*`** / **`CLAWQL_GRPC_SOURCES`** are set **without** **`CLAWQL_PROVIDER`** or other spec env, ClawQL loads **only** those providers — not the default Cloudflare/GitHub/… stack. If the provider cannot be reached, startup fails with a clear error.

When custom endpoints are set **alongside** **`CLAWQL_PROVIDER`** / spec paths, they merge into the same operation index. **`execute`** routes internally by provider metadata:

- **GraphQL** — HTTP POST to the configured endpoint with a built document and variables; auth from **`mergedAuthHeaders(name)`** plus optional per-source **`headers`** / **`CLAWQL_GRAPHQL_HEADERS`**.
- **gRPC** — unary calls only; **`insecure: true`** selects plaintext; metadata carries the same merged auth pattern where applicable.

Full shape and examples: **`.env.example`**, **`docs/adr/0002-multi-protocol-supergraph.md`**.

---

## `sandbox_exec`

**Registration:** set **`CLAWQL_ENABLE_SANDBOX=1`** (`1` / `true` / `yes`) so **`listTools`** includes **`sandbox_exec`** (diagram **default off — opt in**). Registered by **`SandboxPlugin`** via `onRegister`. Without the flag, the tool is not registered.

Runs a snippet using **`CLAWQL_SANDBOX_BACKEND`** or **auto-selection** (same MCP tool shape):

**Backend selection**

- **Unset in-cluster (Kubernetes):** defaults to **`auto`** — **Kata** (when RuntimeClass is available) → **Docker/Podman** → **Cloudflare bridge** → **Seatbelt** on macOS.
- **Unset off-cluster:** **Cloudflare bridge** only (legacy); requires **`CLAWQL_SANDBOX_BRIDGE_URL`** + token when you run snippets.
- **`auto`:** same cascade as in-cluster unset: **Kata** → **Docker** → **bridge** → **Seatbelt**. If none qualify, returns one error listing options.
- **`kata`:** force Kubernetes Jobs with **`runtimeClassName`** (see **`CLAWQL_SANDBOX_KATA_*`** and Helm **`sandboxKata`**).
- **`macos-seatbelt`** / **`seatbelt`:** force Seatbelt only.
- **`docker`** / **`container`** / **`orbstack`** / **`podman`:** force container only.
- **`bridge`** / **`cloudflare`:** force Cloudflare Worker only (requires URL + token).
- **Unknown value:** treated as **`bridge`** (safe default).

Backends:

1. **Kata Containers (in-cluster)** — ephemeral Kubernetes **Job** with **`runtimeClassName`** (default **`kata-qemu`**); requires in-cluster RBAC and a working RuntimeClass ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207)).
2. **macOS Seatbelt —** **`/usr/bin/sandbox-exec`** with an embedded profile (**`(deny network*)`** plus **`(allow default)`** today). Workspaces under **`$TMPDIR/clawql-seatbelt-workspaces/`** ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207), [#23](https://github.com/danielsmithdevelopment/ClawQL/issues/23)).
3. **OCI container —** **`docker run`** (or **`podman`**) with **`--network`** default **`none`**, bind-mount under **`$TMPDIR/clawql-docker-workspaces/`**, default images **`python:3.12-alpine`** / **`node:22-alpine`** / **`alpine:3.21`**. OrbStack / Docker Desktop / Linux Engine compatible.
4. **Cloudflare Sandbox** — Worker you deploy (`infra/cloudflare/sandbox-bridge`); the Node process does not load the Sandbox SDK directly.

Successful responses include **`backend`**: **`kata`** \| **`bridge`** \| **`macos-seatbelt`** \| **`docker`** for auditing.

The MCP tool is named **`sandbox_exec`** so it is not confused with editing or running code on the host machine outside this pipeline; the JSON argument for the source text is still **`code`**.

**Env (bridge):** `CLAWQL_SANDBOX_BRIDGE_URL`, `CLAWQL_CLOUDFLARE_SANDBOX_API_TOKEN` (same value as Worker `BRIDGE_SECRET`), optional `CLAWQL_CLOUDFLARE_ACCOUNT_ID`, `CLAWQL_SANDBOX_*`.

**Env (Seatbelt):** same **`CLAWQL_SANDBOX_PERSISTENCE_MODE`** / **`CLAWQL_SANDBOX_TIMEOUT_MS`** / **`CLAWQL_SANDBOX_TIMEOUT_MS_MAX`** as the bridge.

**Env (Docker):** **`CLAWQL_SANDBOX_DOCKER_BIN`** (default **`docker`**), **`CLAWQL_SANDBOX_DOCKER_NETWORK`** (default **`none`**), **`CLAWQL_SANDBOX_DOCKER_IMAGE_PYTHON`** / **`_NODE`** / **`_SHELL`**, optional **`CLAWQL_SANDBOX_DOCKER_RUN_EXTRA`** (extra **`docker run`** flags before the image name, space-separated).

**Input:**

```json
{
  "code": "print(2 + 2)",
  "language": "python",
  "sessionId": "thread-1",
  "persistenceMode": "session",
  "timeoutMs": 120000
}
```

`language`: `python` | `javascript` | `shell`.

---

## `memory_ingest`

**Env:** Unset registers the tool. **`CLAWQL_ENABLE_MEMORY=0`** hides it. **`CLAWQL_OBSIDIAN_VAULT_PATH`**: directory must exist and be writable at startup. Optional **`CLAWQL_MCP_LOG_TOOLS=1`**: stderr logs **tool shape** only (e.g. title length), never note bodies. For **large** tool bodies without sending megabytes in MCP tool JSON, see **`toolOutputsFile`** and **`CLAWQL_MEMORY_INGEST_FILE_*`** below.

**Input:**

```json
{
  "title": "Session 2026-04-15 API notes",
  "type": "decision",
  "description": "Use ETag when polling GitHub APIs.",
  "tags": ["github", "http"],
  "correlationId": "corr-abc-123",
  "insights": "Use ETag when polling GitHub APIs.",
  "conversation": "User: …\nAssistant: …",
  "toolOutputs": "{ \"status\": 200 }",
  "toolOutputsFile": "docs/small-snippet.md",
  "enterpriseCitations": [
    {
      "title": "Refund policy",
      "url": "https://intranet.example/doc/1",
      "document_id": "onyx-42",
      "snippet": "VP approval required for enterprise refunds."
    }
  ],
  "wikilinks": ["GitHub API", "Rate limits"],
  "sessionId": "abc-123",
  "append": true
}
```

**OKF frontmatter:** New notes are [OKF v0.2](https://okf.io)–compatible. Required **`type`** defaults to **`context`**. Trust signals (`generated`, `status`, optional `verified` / `sources` / `staleAfter`) are written automatically. Optional MCP fields map to frontmatter: **`description`**, **`resource`**, **`tags`**, **`correlationId`** → `correlation_id`, **`wormRef`**, **`agentId`**, **`verdict`**, **`staleAfter`**, **`status`**. Legacy markers (`clawql_ingest`, `clawql_ingest_created`, `date`) are retained for compatibility. Full contract: **[memory/okf.md](../memory/okf.md)**.

**`enterpriseCitations`:** Optional array (max **30** rows) of short citation fields for vault-safe trails after enterprise search — e.g. chaining **`knowledge_search_onyx`** → **`memory_ingest`** ([#130](https://github.com/danielsmithdevelopment/ClawQL/issues/130)). See **[onyx-knowledge-tool.md](onyx-knowledge-tool.md)** §4 and **`enterpriseCitationsFromOnyxSearchToolText`** in **`src/enterprise-citations.ts`**.

**`toolOutputs` vs `toolOutputsFile`:** Use **`toolOutputs`** (or an array) for text that fits comfortably in a single tool call. Use **`toolOutputsFile`** for **large** verbatim text: the ClawQL **server** reads UTF-8 from that path on its filesystem and treats it as **`toolOutputs`**. The MCP only carries a **short path string**—solving Cursor/agent payload limits for very large files. The path may be **absolute** or **relative to `process.cwd()`** (typically the ClawQL repo root in dev). If both **`toolOutputsFile`** and **`toolOutputs`** are set, the **file wins** (inline body is ignored). A short line in the new section’s **Insights** notes the server read.

**Allowlist (security):** Reads are only allowed for files that resolve under **`CLAWQL_MEMORY_INGEST_FILE_ROOTS`** (comma- or newline-separated **absolute** directory prefixes, each resolved with **`realpath`**). If **unset**, the only allowed root is **realpath(`process.cwd()`)**. Set **`CLAWQL_MEMORY_INGEST_FILE=0`** (or `false` / `off` / `no`) to **disable** all `toolOutputsFile` reads. Max bytes: **`CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES`** (default **10_000_000**). The target must be a **regular** file. See also **`.env.example`**.

Writes **`Memory/<slug>.md`** with OKF YAML frontmatter and optional `[[wikilinks]]`. Duplicate payloads (same content hash) are skipped when appending. When enabled (default), also maintains **`Memory/_INDEX_{Provider}.md`** and OKF **`Memory/index.md`**, and appends to **`Memory/log.md`** — **`CLAWQL_MEMORY_INDEX_PAGE=0`** disables both indexes; **`CLAWQL_MEMORY_OKF_INDEX=0`** / **`CLAWQL_MEMORY_OKF_LOG=0`** disable OKF pages only; **`CLAWQL_MEMORY_INDEX_PROVIDER`** sets the `_INDEX_*` label/filename (see **[memory-obsidian.md](../memory/memory-obsidian.md)**, **[okf.md](../memory/okf.md)**, [#38](https://github.com/danielsmithdevelopment/ClawQL/issues/38)).

After a successful, non-skipped write, **`memory.db`** is resynced. When **`CLAWQL_MERKLE_ENABLED=1`**, the tool result JSON can include **`merkleSnapshotBefore`** and **`merkleSnapshot`** (see **`memory_recall`** for field shapes) and **`merkleRootChanged`** when both are comparable. When **`CLAWQL_CUCKOO_ENABLED=1`** and the sidecar sync ran, **`cuckooMembershipReady`** is **`true`** (filter rebuilt over chunk ids).

---

## `memory_recall`

**Env:** Unset registers the tool. **`CLAWQL_ENABLE_MEMORY=0`** hides it. **`CLAWQL_OBSIDIAN_VAULT_PATH`**, optional `CLAWQL_MEMORY_RECALL_*` (scan root, limits, depth, snippet size). Optional **`CLAWQL_MCP_LOG_TOOLS=1`**: stderr logs **tool shape** only (e.g. query character count), never query text.

**Input:**

```json
{
  "query": "github rate limit pat",
  "limit": 10,
  "maxDepth": 2,
  "minScore": 1,
  "sources": ["vault", "vector", "onyx"]
}
```

Returns JSON with:

- **`results[]`** (vault): `path`, `score`, `depth`, `reason` (`keyword` | `link` | `vector`), `snippet`, optional `linkFrom`
- **`hits[]`** (normalized multi-source): `source` (`vault` | `vector` | `link` | `onyx`), `id`, `score`, `snippet`, optional `path` / `title` / `meta`
- **`followUps[]`**: specialist tool hints (`tool`, `reason`, optional `args`)
- **`sourcesUsed`**, optional **`sourceNotes`**

**Defaults:** omit `sources` → vault + vector, plus the Onyx hybrid env flag (`CLAWQL_MEMORY_RECALL_HYBRID_ONYX`).

Lexical match + graph expansion via wikilinks. Optional **vectors** when **`CLAWQL_VECTOR_BACKEND`** is set (**`sqlite`** or **`postgres`**) and an embedding API key is set — see README (`CLAWQL_EMBEDDING_*`, `CLAWQL_VECTOR_DATABASE_URL`, `CLAWQL_MEMORY_VECTOR_*`). **`sqlite`:** in-process cosine KNN over **`memory.db`** BLOBs. **`postgres`:** pgvector first; optional **dual-write** BLOBs in **`memory.db`** (default on; disable with **`CLAWQL_MEMORY_VECTOR_DUAL_WRITE=0`**). When **`CLAWQL_MERKLE_ENABLED=1`**, the response includes **`merkleSnapshot`** (`rootHex`, `leafCount`, `treeHeight`, `builtAt`) or **`null`** if no snapshot row. When **`CLAWQL_CUCKOO_ENABLED=1`** and a membership filter is loaded, vector-ranked rows are filtered so **`chunk_id`** must appear in the Cuckoo filter (drops inconsistent/stale hits); **`cuckooVectorChunksDropped`** counts removed chunks. See [hybrid-memory-backends.md](hybrid-memory-backends.md), [vector-search-design.md](vector-search-design.md), [memory plugin](../plugins/memory.md), [#16](https://github.com/danielsmithdevelopment/ClawQL/issues/16), [#81](https://github.com/danielsmithdevelopment/ClawQL/issues/81).

---

## `ingest_external_knowledge`

**Env:** Document tools must be on (default); set **`CLAWQL_ENABLE_DOCUMENTS=0`** to hide this tool. **`CLAWQL_EXTERNAL_INGEST=1`** (must be exactly **`1`**) registers imports. **`CLAWQL_EXTERNAL_INGEST_FETCH=1`** allows **`url`** mode (HTTPS fetch; **`http`** only for **`localhost`** / **`127.0.0.1`**). Optional **`CLAWQL_MCP_LOG_TOOLS=1`**: shape-only logging.

**Markdown import:** pass **`documents`**: `[{ "path": "Memory/imports/x.md", "markdown": "# …" }]` (up to **50** files, ~**2 MiB** each). **`dryRun`** defaults **`true`** — set **`dryRun: false`** to write. Paths must stay under the vault (no **`..`**) and end with **`.md`**.

**URL import:** **`source`: `"url"`**, **`url`**: `https://…`**, optional **`scope`**: vault-relative target **`.md`** (default **`Memory/external/<slug>.md`**). Requires **`CLAWQL_EXTERNAL_INGEST_FETCH=1`**. Response bodies are capped (~**2 MiB\*\*); content is stored in a fenced block with YAML frontmatter (`clawql_external_ingest`, `source_url`).

**No `documents` / `url`:** returns **`stub: true`** with **`roadmap[]`** (operator preview). When the vault has **`memory.db`**, Merkle/Cuckoo flags may add **`merkleSnapshot`** / **`cuckooMembershipReady`**.

Successful writes run **`syncMemoryDbForVaultScanRoot`** + **`_INDEX_*.md`** update (same as **`memory_ingest`**). See **[external-ingest.md](external-ingest.md)** ([#40](https://github.com/danielsmithdevelopment/ClawQL/issues/40)).

---

## Optional tool flags (`CLAWQL_ENABLE_*` and related)

Boolean flags are parsed in one place — **[`packages/clawql-api/src/config/optional-flags.ts`](../../packages/clawql-api/src/config/optional-flags.ts)** ([GitHub #79](https://github.com/danielsmithdevelopment/ClawQL/issues/79)) — so env wiring stays consistent. **Truthy** means `1`, `true`, or `yes` (case-insensitive) when set. **Exception:** **`CLAWQL_ENABLE_MEMORY`** and **`CLAWQL_ENABLE_DOCUMENTS`**: **unset = on**; set **`0`**, **`false`**, or **`no`** to **opt out** (hide tools / shrink **`all-providers`** for document vendors). The **`audit`** and **`cache`** tools are not gated by env — they are always registered. Harness **`ouroboros_*`** / **`clawql_think`** are the opposite shape (8.0 demotion): **unset = off**; set **`CLAWQL_ENABLE_OUROBOROS_TOOLS=1`** or instance/tier `ouroboros.enabled: true` to opt in.

| Concern                                  | Env var(s)                                                                                                                                                                                                                                                                                       | Default                     | MCP tools / behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gRPC MCP                                 | `ENABLE_GRPC`, `ENABLE_GRPC_REFLECTION`                                                                                                                                                                                                                                                          | off                         | Same tools over gRPC (**`GRPC_PORT`**, optional reflection); see README and [`packages/mcp-grpc-transport/README.md`](../../packages/mcp-grpc-transport/README.md). OpenAPI + GraphQL + gRPC scaffold for any MCP: [`mcp/mcp-api-adapter.md`](mcp-api-adapter.md).                                                                                                                                                                                                                                                                                                                                                                                |
| Document stack (merge + tools)           | `CLAWQL_ENABLE_DOCUMENTS`                                                                                                                                                                                                                                                                        | on (when unset)             | **`0` / `false` / `no`**: remove **docling**, **paperless**, **onyx**, **nextcloud**, **coneshare** from default **`all-providers`**; hide **`ingest_external_knowledge`** and **`knowledge_search_onyx`**. Explicit **`CLAWQL_BUNDLED_PROVIDERS=…`** can still include those ids. **Tika** / **Gotenberg** / **Stirling** stay out of `all-providers` regardless of this flag (8.0 converter cut — opt-in only via `CLAWQL_BUNDLED_PROVIDERS=tika,gotenberg,stirling`). **`CLAWQL_ENABLE_CONESHARE=1`** additionally registers **`POST /idp/coneshare/webhook`** (Coneshare remains in merge unless documents opt-out).                          |
| External ingest                          | `CLAWQL_EXTERNAL_INGEST`, optional `CLAWQL_EXTERNAL_INGEST_FETCH`                                                                                                                                                                                                                                | off                         | Exact **`1`** registers **`ingest_external_knowledge`** (8.0 verb-twin demotion — hidden otherwise). Same flag required for non-stub imports; **`CLAWQL_EXTERNAL_INGEST_FETCH=1`** allows URL fetch mode.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Obsidian vault path                      | `CLAWQL_OBSIDIAN_VAULT_PATH`                                                                                                                                                                                                                                                                     | unset                       | When set and the path is valid, start-up checks run; used by **`memory_*`** and **`ingest_external_knowledge`** (when writing). See [memory-obsidian.md](../memory/memory-obsidian.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Vault memory (tool registration)         | `CLAWQL_ENABLE_MEMORY`                                                                                                                                                                                                                                                                           | on (when unset)             | Unset: **`memory_ingest`** and **`memory_recall`** are registered. **`0` / `false` / `no`**: tools hidden. Use with a writable vault path to persist notes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **`memory_ingest` file**                 | `CLAWQL_MEMORY_INGEST_FILE` (`0` disables), `CLAWQL_MEMORY_INGEST_FILE_ROOTS` (allowlist; default: cwd), `CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES`                                                                                                                                                   | see § **`memory_ingest`**   | Optional **server-side** read for **`toolOutputsFile`**; large bodies without large MCP tool JSON.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **`sandbox_exec` tool**                  | **`CLAWQL_ENABLE_SANDBOX`**                                                                                                                                                                                                                                                                      | off                         | [#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207): **`1` / `true` / `yes`** registers **`sandbox_exec`** via **`SandboxPlugin`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Sandbox backends (when on)               | **`CLAWQL_SANDBOX_BACKEND`**: unset in-cluster = **`auto`** (Kata-first); unset off-cluster = **bridge**; or pin **`kata`** / **`auto`** / **`bridge`** / **`macos-seatbelt`** / **`docker`**                                                                                                    | in-cluster unset → **auto** | After registration, pick execution backend; responses include **`backend`**. Helm: **`sandboxKata`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Vector / hybrid memory                   | `CLAWQL_VECTOR_BACKEND`, embedding + DB vars                                                                                                                                                                                                                                                     | off                         | Optional **`memory_recall`** KNN; see README and [hybrid-memory-backends.md](hybrid-memory-backends.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Hybrid Onyx recall**                   | **`CLAWQL_MEMORY_RECALL_HYBRID_ONYX`**, optional **`CLAWQL_MEMORY_RECALL_ONYX_LIMIT`**                                                                                                                                                                                                           | off                         | Include **`onyx`** in default **`memory_recall`** sources; needs **`CLAWQL_ENABLE_ONYX=1`** + wired search. (**PageIndex hybrid and CodeGraph (`codegraph_*`) removed in 8.0** — [purge inventory](../releases/8.0.0-purge-inventory-spec-v0.1.md).)                                                                                                                                                                                                                                                                                                                                                                                              |
| **`cache` tool**                         | _(ClawQL Core — always registered)_                                                                                                                                                                                                                                                              | always                      | [#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75): in-process LRU; **`CLAWQL_CACHE_MAX_VALUE_BYTES`**, **`CLAWQL_CACHE_MAX_ENTRIES`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **`audit` tool**                         | _(ClawQL Core — always registered)_; optional **`CLAWQL_LOKI_PUSH_URL`**, **`CLAWQL_LOKI_BEARER_TOKEN`**, **`CLAWQL_LOKI_TENANT_ID`**, **`CLAWQL_LOKI_JOB`**, **`CLAWQL_LOKI_INFERENCE_JOB`**, **`CLAWQL_LOKI_PUSH_TIMEOUT_MS`**, **`CLAWQL_AUDIT_TOOL_CALLS=0`** to disable auto tool-call rows | always                      | [#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89): ring buffer **`CLAWQL_AUDIT_MAX_ENTRIES`**; **`clawql_audit_*`** Prometheus aggregates; auto **`mcp_tool`** append on registered tools; optional Loki push per **`append`**. Inference call-store uses the same push URL with **`job=clawql-inference`**.                                                                                                                                                                                                                                                                                                                      |
| **`schedule` tool**                      | `CLAWQL_ENABLE_SCHEDULE`, optional `CLAWQL_SCHEDULE_*` caps/path                                                                                                                                                                                                                                 | off                         | [#76](https://github.com/danielsmithdevelopment/ClawQL/issues/76): persisted jobs + synthetic checks (`trigger` supports `dry_run`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **`notify` tool**                        | `CLAWQL_ENABLE_NOTIFY`                                                                                                                                                                                                                                                                           | off                         | [#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77): Slack **`chat.postMessage`** when the Slack spec is loaded + bot token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **`workflow` tool**                      | `CLAWQL_ENABLE_WORKFLOW`, `CLAWQL_WORKFLOW_NAMESPACE_ALLOWLIST`, optional `CLAWQL_WORKFLOW_*`                                                                                                                                                                                                    | off                         | [#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243): Argo Workflows ≥ 3.4.0; see **[workflow-tool.md](workflow-tool.md)**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **`argocd` tool**                        | `CLAWQL_ENABLE_ARGO_CD`, `CLAWQL_ARGO_CD_NAMESPACE_ALLOWLIST`, optional `CLAWQL_ARGO_CD_ALLOW_SYNC`                                                                                                                                                                                              | off                         | [#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244): Argo CD Application CRDs; see **[argocd-tool.md](argocd-tool.md)**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **`hitl_enqueue_label_studio` tool**     | **`CLAWQL_ENABLE_HITL_LABEL_STUDIO`**, **`CLAWQL_LABEL_STUDIO_URL`**, **`CLAWQL_LABEL_STUDIO_API_TOKEN`**; webhook **`CLAWQL_HITL_WEBHOOK_TOKEN`** (prod)                                                                                                                                        | off                         | [#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228): Label Studio import + **`POST /hitl/label-studio/webhook`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **`knowledge_search_onyx` tool**         | `CLAWQL_ENABLE_ONYX` **and** documents enabled, **`ONYX_BASE_URL`**, token                                                                                                                                                                                                                       | off (Onyx)                  | Also requires **`CLAWQL_ENABLE_DOCUMENTS`** (default on). [#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118): Onyx search; **`onyx`** in merge unless documents opt-out removed it from **`all-providers`**.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **`run_idp_pipeline` tool**              | **`CLAWQL_ENABLE_IDP_PIPELINE=1`** and documents enabled; optional **`CLAWQL_IDP_PIPELINE_MAX_RETRIES`**, **`CLAWQL_IDP_PIPELINE_RETRY_DELAY_MS`**                                                                                                                                               | off                         | [#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307): synchronous **`DEFAULT_IDP_PIPELINE`** runner; see **[idp-pipeline-runner.md](idp-pipeline-runner.md)**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **`inspect_pdf` tool**                   | **`CLAWQL_ENABLE_PDF_INSPECTOR=1`** and documents enabled; optional **`CLAWQL_PDF_INSPECTOR_FILE_ROOTS`**, **`CLAWQL_PDF_INSPECTOR_LOCAL_MIN_CONFIDENCE`**                                                                                                                                       | off                         | Firecrawl pdf-inspector (in-process); see **[pdf-inspector-onboarding.md](../providers/pdf-inspector-onboarding.md)**. Helm: **`enablePdfInspector`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **`convert_document` tool**              | **`CLAWQL_ENABLE_ANYDOC=1`** and documents enabled; optional **`CLAWQL_ANYDOC_FILE_ROOTS`** (falls back to pdf-inspector roots)                                                                                                                                                                  | off                         | Firecrawl anydoc (in-process); see **[anydoc-onboarding.md](../providers/anydoc-onboarding.md)**. Helm: **`enableAnydoc`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **`classify_document` tool**             | **`CLAWQL_ENABLE_IDP_CLASSIFIER=1`** and documents enabled; optional **`CLASSIFIER_BASE_URL`**, **`CLASSIFIER_MIN_CONFIDENCE`**                                                                                                                                                                  | off                         | [#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248); Helm **`enableIdpClassifier`** + **`documentPipeline.classifier`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **`extract_document` tool**              | **`CLAWQL_ENABLE_LANGEXTRACT=1`** and documents enabled; optional **`LANGEXTRACT_BASE_URL`**, **`LANGEXTRACT_BACKEND`**, **`LANGEXTRACT_MODEL_ID`**                                                                                                                                              | off                         | [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246); Helm **`enableLangextract`** + **`documentPipeline.langextract`**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **`ouroboros_*` / `clawql_think` tools** | **`CLAWQL_ENABLE_OUROBOROS_TOOLS=1`** or instance/tier `ouroboros.enabled: true` (8.0 demotion); optional `CLAWQL_OUROBOROS_DATABASE_URL` or split `CLAWQL_OUROBOROS_DB_*` vars. **`CLAWQL_ENABLE_OUROBOROS`** (old name) deleted — not resurrected.                                             | off                         | [#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141) / [#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142): **`clawql_think`**, **`ouroboros_create_seed_from_document`**, **`ouroboros_run_evolutionary_loop`**, **`ouroboros_get_lineage_status`**, **`ouroboros_measure_drift`** ([#557](https://github.com/danielsmithdevelopment/ClawQL/issues/557)); Postgres config enables durable **`clawql_ouroboros_events`**. **`ouroboros_propose_seed_revision_from_eval`** when **`CLAWQL_ENABLE_LANGFUSE_EVAL=1`** (nested under this gate) ([#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250)). |
| **Langfuse eval webhook**                | **`CLAWQL_ENABLE_LANGFUSE_EVAL`**, **`CLAWQL_LANGFUSE_WEBHOOK_TOKEN`** (prod); optional **`CLAWQL_LANGFUSE_EVAL_MIN_SCORE`**, **`CLAWQL_LANGFUSE_EVAL_AUTO_APPLY`**                                                                                                                              | off                         | [#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250): **`POST /observability/langfuse/webhook`**; see **[langfuse-eval-ouroboros.md](langfuse-eval-ouroboros.md)**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **`observability_*` tools**              | **`CLAWQL_ENABLE_OBSERVABILITY`**                                                                                                                                                                                                                                                                | off                         | Operator **LGTM+ query/apply** (LogQL / PromQL / TraceQL / Pyroscope + Alloy / health / alerts). Default stays **off**. Not agent-loop reasoning. OTEL = instrumentation; Prometheus / Langfuse = exports — [observability README](../observability/README.md#one-instrumentation-layer-80).                                                                                                                                                                                                                                                                                                                                                      |
| **Vision** (`CLAWQL_ENABLE_VISION`)      | —                                                                                                                                                                                                                                                                                                | removed                     | **Deleted in 8.0.0** — placeholder flag for a `vision`/`multimodal` tool that never shipped (vapor flag, [#78](https://github.com/danielsmithdevelopment/ClawQL/issues/78)); see [purge inventory](../releases/8.0.0-purge-inventory-spec-v0.1.md).                                                                                                                                                                                                                                                                                                                                                                                               |
| **`execute_program` tool**               | **`CLAWQL_ENABLE_PROGRAMS=1`**; optional caps **`CLAWQL_PROGRAM_MAX_SOURCE_LENGTH`**, **`CLAWQL_PROGRAM_MAX_TOOL_CALLS`**, **`CLAWQL_PROGRAM_DEFAULT_TIMEOUT_MS`**, **`CLAWQL_PROGRAM_MAX_TIMEOUT_MS`**, **`CLAWQL_PROGRAM_MAX_OUTPUT_BYTES`**, **`CLAWQL_PROGRAM_MAX_PROPOSALS`**               | off                         | [ADR 0015](../adr/0015-program-mode-alongside-search-execute.md) **v0 plan runner** (not full OpenCode JS). JSON plan of parallel/sequential **read** `search`/`execute`; writes never run inside — `plan.proposals` come back resolved for **`submit_program_proposals`** (same flag). Gate lives in `packages/clawql-api/src/program/` (same pattern as **`console_link`** / **`proxy_call`**, not `optional-flags.ts`).                                                                                                                                                                                                                        |

---

## `execute_program` (opt-in, ADR 0015 v0)

Enable with **`CLAWQL_ENABLE_PROGRAMS=1`**. **Honesty: v0 plan runner; OpenCode vendor is next** — `source` is a JSON plan, not free-form JavaScript.

```json
{
  "v": 1,
  "mode": "parallel",
  "calls": [
    {
      "tool": "execute",
      "operationId": "repos.listForOrg",
      "args": { "org": "acme" },
      "fields": ["name"]
    },
    { "tool": "search", "query": "list open pull requests", "limit": 5 }
  ]
}
```

Returns `{ ok, programId, result, calls, diagnostics }`. Each nested call uses the Core **`search`** / **`execute`** path with `programId` on WORM metadata. Only operations whose risk policy is **`allow`** run inside a program; anything else fails with `program_write_rejected` — list it in `proposals` instead, or use plain **`execute`**.

### Proposed writes

Writes never run inside a program. List them after the reads in `proposals`; `execute_program` returns them resolved in `result.proposals`, and running them is a separate call — **`submit_program_proposals`**, or plain **`execute`** per proposal. Either way each one takes the normal path: gate → risk → session IFC → mandate → Review → consume ([ADR 0015](../adr/0015-program-mode-alongside-search-execute.md) § Proposed writes).

```json
{
  "v": 1,
  "mode": "sequential",
  "calls": [
    {
      "id": "A",
      "tool": "execute",
      "operationId": "issues.get",
      "args": { "number": 7 },
      "fields": ["title"]
    }
  ],
  "proposals": [
    {
      "id": "W1",
      "operationId": "issues.create",
      "args": { "title": { "$ref": "A.result.title" } }
    },
    {
      "id": "W2",
      "operationId": "issues.createComment",
      "args": { "issue_number": { "$ref": "W1.result.number" }, "body": "Tracking" }
    }
  ]
}
```

A `$ref` placeholder is an object whose only key is `$ref`, holding `<id>.<root>` plus a path:

- **`<call>.result.…`** reads a read call's result and **`<proposal>.args.…`** an earlier proposal's resolved args — both filled by `execute_program`.
- **`<proposal>.result.…`** reads an earlier proposal's execute result — filled by `submit_program_proposals` once that proposal ran.
- Refs may only target read calls or **earlier** proposals in the same plan, must resolve to one JSON value (string, number, boolean, or null — not an object or array), and the path is at most **8** segments deep. Everything fails closed: a malformed ref fails the plan before any read runs; a path that is missing at run time rejects that proposal and every proposal that depends on it.

Each entry in `result.proposals` has a `status`:

| `status`   | Meaning                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `ready`    | Fully resolved. `argsHash` is the digest a mandate parks for exactly these args.                                  |
| `deferred` | Waits on an earlier proposal's result; `pendingRefs` lists the placeholders still in `args`.                      |
| `rejected` | Never runs. `code` is `unknown_operation`, `ifc_blocked`, `ref_unresolved`, or `dependency_rejected`, with a fix. |

Entries also carry `policy` (the risk policy execute applies at submit; `mandate` parks for approval) and `dependsOn`. Any rejected proposal makes `ok` false. A plan may hold at most **`CLAWQL_PROGRAM_MAX_PROPOSALS`** (default 16) proposals, and may omit `calls` when it only proposes.

With **`CLAWQL_ENABLE_SESSION_IFC=1`**, each proposal's destination is checked against the session's labels plus every source the program read — failed reads included, since their responses are in program memory too. An operation without spec facts counts as a destination that accepts no labels. A blocked proposal comes back `rejected` with `code: "ifc_blocked"` and the `ifc` block payload; the others are checked again at submit, when the session may have read more.

### `submit_program_proposals`

Same flag. Pass the `programId`; the session that ran the program can omit `proposals` to submit the stored set:

```json
{ "programId": "prog_…" }
```

Proposals run in plan order, each through the normal **`execute`** path, and `<proposal>.result` refs fill from earlier results. The batch is **not atomic** — nothing rolls back — and each leaf ends in one state:

| Leaf `state` | Meaning                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `ran`        | Execute succeeded; `result` is kept for refs up to **`CLAWQL_PROGRAM_MAX_OUTPUT_BYTES`**.          |
| `pending`    | Parked for a mandate (`executionId`, `argsHash`), or waiting on a parked dependency (`waitingOn`). |
| `failed`     | Execute failed or its outcome is unknown; dependents are dropped.                                  |
| `dropped`    | Blocked, declined, expired, or rejected by `execute_program`; dependents are dropped.              |

Approve parked mandates in Review, then call **`submit_program_proposals`** again with the same `programId`: each approved leaf is consumed once (the mandate's digest must still match) and the leaves waiting on it run. Settled leaves never run twice, and submit never approves or declines anything itself. A mandate settled elsewhere is adopted; one approved through **`resume`** counts as `ran` without a kept result, so proposals reading its result are dropped with `result_unavailable` — approve in Review to keep a dependent chain.

Stored proposals are per process and per session, and live as long as a parked mandate (**`CLAWQL_PENDING_EXECUTION_TTL_HOURS`**). On another replica or after a restart, pass the `proposals` array from the `execute_program` result; they then run exactly like plain **`execute`** calls. Running a `ready` proposal's `operationId` / `args` / `fields` / `where` with plain **`execute`** parks the same `argsHash`.

---

## `ouroboros_*` (opt-in via `clawql-harness`, 8.0 demotion)

**`clawql-mcp`** composes **`makeHarnessLayer`** with **`createOuroborosHarnessPlugin`** (`clawql-harness/plugin`) only when **`flags.enableOuroborosTools`** is true — set **`CLAWQL_ENABLE_OUROBOROS_TOOLS=1`** or instance/tier `ouroboros.enabled: true` (default **off**; no additive agent-loop proof yet). When off, the harness layer is not pushed at all — there are no other `clawql-harness` consumers today. When on, that harness plugin registers **`clawql_think`**, **`ouroboros_create_seed_from_document`**, **`ouroboros_run_evolutionary_loop`**, **`ouroboros_get_lineage_status`**, **`ouroboros_measure_drift`** ([#557](https://github.com/danielsmithdevelopment/ClawQL/issues/557)), and (with **`CLAWQL_ENABLE_LANGFUSE_EVAL=1`**, nested under the same gate) **`ouroboros_propose_seed_revision_from_eval`** ([#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250)); the harness → MCP bridge exposes them. Handlers return JSON as MCP **text** content. There is no separate MCP-only `makeOuroborosLayer` path in composition. **`CLAWQL_ENABLE_OUROBOROS`** (old name) is **deleted** — not resurrected as the gate; the new gate is **`CLAWQL_ENABLE_OUROBOROS_TOOLS`**. The **`clawql-ouroboros`** / **`clawql-harness`** packages and server-side Ouroboros capability lifecycle stay regardless of this flag. Do **not** use **`clawql-ouroboros/mcp-hooks`** as the **`clawql-mcp`** registration path — that export is for embedding the library in your own host.

**`ouroboros_measure_drift`:** upstream Q00 3-component model — `combined_drift = 0.5×goal + 0.3×constraint + 0.2×ontology`. Bands: ≤0.15 excellent, ≤0.30 acceptable, >0.30 exceeded. The evolutionary loop appends **`drift_measured`** events each generation; call the tool directly with `seedId` + `currentOutput` for ad-hoc checks.

**Persistence:** set **`CLAWQL_OUROBOROS_DATABASE_URL`** (or split **`CLAWQL_OUROBOROS_DB_HOST`**, **`CLAWQL_OUROBOROS_DB_PORT`**, **`CLAWQL_OUROBOROS_DB_USER`**, **`CLAWQL_OUROBOROS_DB_PASSWORD`**, **`CLAWQL_OUROBOROS_DB_NAME`**) to use Postgres for append + lineage rebuild (**`clawql_ouroboros_events`**). If unset, **`InMemoryEventStore`** is used (per-process only).

### Route hints for default executor (practical usage)

The default executor can route to real internal ClawQL operations without custom code when the input Seed carries a **route hint** inside **`brownfield_context.context_references`**.

Use one of these hint objects:

- **Execute path**
  - `{ "clawql_execute": { "operationId": "listPets", "args": { ... }, "fields": ["..."] } }`
- **Search path**
  - `{ "clawql_search": { "query": "find pet operations", "limit": 5 } }`

Why this shape: `SeedSchema` is strict for many fields; `context_references` is designed to carry arbitrary context objects safely, so hints survive schema validation and transport boundaries.

### End-to-end example (`ouroboros_run_evolutionary_loop`)

```json
{
  "seed": {
    "goal": "List pets through internal execute",
    "task_type": "analysis",
    "brownfield_context": {
      "project_type": "brownfield",
      "context_references": [
        {
          "clawql_execute": {
            "operationId": "listPets",
            "args": {},
            "fields": ["name"]
          }
        }
      ],
      "existing_patterns": [],
      "existing_dependencies": []
    },
    "constraints": [],
    "acceptance_criteria": ["Return non-empty output"],
    "ontology_schema": {
      "name": "PetOntology",
      "description": "Pet listing ontology",
      "fields": []
    },
    "evaluation_principles": [],
    "exit_conditions": [],
    "metadata": {
      "seed_id": "seed-demo-1",
      "version": "1.0.0",
      "created_at": "2026-01-01T00:00:00.000Z",
      "ambiguity_score": 0.1,
      "interview_id": null,
      "parent_seed_id": null
    }
  },
  "maxGenerations": 2,
  "convergenceThreshold": 0.8
}
```

Then call **`ouroboros_get_lineage_status`** with `seedId` equal to the loop response `lineageId`; generation records include `execution_output` with route metadata (for example `"route":"execute"`).

**Full library story (embed outside MCP, poller, Zod shapes):** **[`docs/ouroboros/clawql-ouroboros.md`](../ouroboros/clawql-ouroboros.md)**. **Website:** [Ouroboros library](https://docs.clawql.com/ouroboros).

---

## `schedule` (optional)

**Env:** `CLAWQL_ENABLE_SCHEDULE=1` to register the tool. Optional envs: `CLAWQL_SCHEDULE_DB_PATH`, `CLAWQL_SCHEDULE_HISTORY_LIMIT`, `CLAWQL_SCHEDULE_INTERVAL_MIN_SECONDS`, `CLAWQL_SCHEDULE_INTERVAL_MAX_SECONDS`, `CLAWQL_SCHEDULE_URL_ALLOWLIST_PREFIXES`, and synthetic request caps under `CLAWQL_SCHEDULE_SYNTHETIC_*`.

The **`schedule`** tool supports persisted jobs (cron / interval / one-shot) with **typed actions**. In v1, `action.kind` is **`synthetic`** and includes `synthetic_test` (HTTP request + assertions) as described in **[schedule-synthetic-checks.md](schedule-synthetic-checks.md)**. Supported operations are `create`, `list`, `get`, `delete`, and `trigger`; `trigger` can run with `dry_run: true` to validate and execute assertions without persisting a run row. When `CLAWQL_ENABLE_SCHEDULE=1`, the server also starts a background worker that evaluates due jobs and executes them automatically on a poll interval (`CLAWQL_SCHEDULE_POLL_MS`, default 5000 ms). Failure notifications are intended to pair with **`notify`** ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)); retrieval-heavy runbooks can pair with **`knowledge_search_onyx`** ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)) when **`CLAWQL_ENABLE_ONYX`** is set. ClawQL does not bundle third-party observability vendors; scheduled probes are defined and stored in a local SQLite schedule store.
