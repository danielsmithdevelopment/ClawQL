# ClawQL Ecosystem

### AI-Orchestrated API, Document & Enterprise Knowledge Automation

**Natural language. Any API. Any document. Any knowledge source. One platform.**

`npm install -g clawql-mcp` · [github.com/danielsmithdevelopment/ClawQL](https://github.com/danielsmithdevelopment/ClawQL) · [docs.clawql.com](https://docs.clawql.com)

_April 2026 · Self-Hosted, Local-First, Production-Hardened Kubernetes Stack_

_Authoritative mechanics (tool tiers, env flags, bundled spec paths): [`mcp-tools.md`](mcp-tools.md), [`readme/configuration.md`](readme/configuration.md), [`providers/README.md`](../providers/README.md)._

_Sections below mix **north-star narrative** with shipped behavior; aspirational items are collected in [**Appendix: Fiction and roadmap**](#appendix-fiction-and-roadmap)._

---

## What ClawQL Is

ClawQL is the first AI platform where **memory and action are a closed loop** — what you know informs what you do, and what you do becomes what you know.

At its core is an MCP (Model Context Protocol) server that lets AI assistants and autonomous agents discover and call REST operations from loaded OpenAPI (and optional native GraphQL/gRPC) specs — without context bloat, without custom wrappers. On top: a complete local-first document pipeline, enterprise semantic search via Onyx (`knowledge_search_onyx`), **vault-backed recall** (`memory_recall`: keyword scoring, optional vector KNN, wikilink traversal), the **clawql-ouroboros** workflow library (optional `ouroboros_*` MCP tools), and production-oriented **`cache`** + **`audit`** (always-on in-process helpers).

Everything runs in your Kubernetes cluster. No cloud dependencies. No SaaS subscriptions. No data leaving your walls.

---

## The Core Loop

This is what separates ClawQL from every other MCP server, agent framework, and enterprise search platform.

```
memory_recall()
      │
      │  "what do we know about X?"
      ▼
  Vault recall (`memory_recall`)
  (keyword + optional vector KNN + wikilinks; pair with `knowledge_search_onyx` for enterprise index)
      │
      │  returns ranked, lean context
      ▼
  Model reasons over recalled context
      │
      │  "now go do something with it"
      ▼
  search() → discovers the right operation
  execute() → calls it precisely
  GraphQL  → trims the response to signal only
      │
      │  lean, typed result returned
      ▼
  memory_ingest()
      │
      │  enriches the vault with what just happened
      ▼
  next recall knows about this action
```

Memory informs execution. Execution enriches memory. The system compounds with every workflow, not just every training run.

---

## The Problem

### 1 — APIs Are Inaccessible to AI

OpenAPI specs run to megabytes. Dumping them into an AI context window is expensive and noisy. Writing custom wrappers for every endpoint is tedious and brittle. Agents hallucinate operations that don’t exist because they have no structured way to discover what’s actually available.

### 2 — Memory Dies With Every Session

Every AI conversation starts completely blank. Architectural decisions, debugging breakthroughs, workflow history, and hard-won institutional knowledge vanish the moment the chat ends. Teams repeat the same mistakes every single session — even with the same assistant.

### 3 — Documents and Company Knowledge Live in Isolated Silos

PDFs, Word documents, spreadsheets, Slack threads, Confluence pages, Jira tickets, Drive docs — each in a different system with no unified retrieval or processing layer. Document automation tools don’t know about your company knowledge. Enterprise search tools can’t trigger document workflows. Nothing talks to each other without custom integration work.

### 4 — Production Hardening Is Fragmented

Self-hosted stacks force teams to bolt on scanning, mesh, and observability by hand. Vulnerability management lives in a separate CI job from the runtime. Zero-trust networking between services is left as an exercise. Trivy here, Istio there, SBOMs in a spreadsheet — inconsistent posture, duplicated effort, blind spots.

---

## Platform Highlights

- MCP Server (stdio / HTTP / gRPC) + GraphQL projection; OpenAPI 3 + Swagger 2 + Google Discovery; optional **native GraphQL / gRPC** upstreams ([`adr/0002-multi-protocol-supergraph.md`](adr/0002-multi-protocol-supergraph.md)); bundled **Linear** is GraphQL-only (`providers/linear/schema.graphql`)
- **Bundled vendor ids:** 13 entries in `BUNDLED_PROVIDERS` (e.g. GitHub, Cloudflare, Slack, Sentry, n8n, document stack, Onyx, **Linear**, Atlassian aliases, …) plus the **Google Cloud** manifest (`google/google-top50-apis.json`) when using `all-providers` — see [`providers/README.md`](../providers/README.md)
- **`memory_recall`:** vault Markdown scan with **keyword relevance**, optional **embedding/KNN** (`CLAWQL_VECTOR_BACKEND` sqlite or postgres), **`[[wikilink]]` graph hops**, optional **Cuckoo**/Merkle hooks via `memory.db` — **not** RRF fusion; **`knowledge_search_onyx`** is a **separate** MCP tool (chain with ingest for durable trails)
- Obsidian vault + **`memory.db`** sidecar for chunks/embeddings; optional **pgvector** when `CLAWQL_VECTOR_BACKEND=postgres`
- Full document pipeline (1,000+ formats) — Tika → Gotenberg → Stirling → Paperless
- Onyx enterprise knowledge (40+ connectors, Flink real-time sync, citation-backed)
- Ouroboros 5-phase orchestration loop — Interview → Seed → Execute → Evaluate → Evolve
- Cuckoo Filters (O(1) deduplication) + Merkle Trees (cryptographic audit)
- **Hyperledger Fabric (roadmap)** — consortium-grade permissioned provenance ([#187](https://github.com/danielsmithdevelopment/ClawQL/issues/187))
- OSV-Scanner (Google) — layer-aware container + dependency vulnerability detection and SBOM support, wired into the Golden Image Pipeline alongside Trivy
- Optional Istio service mesh: mTLS, AuthorizationPolicy, traffic management, Kiali topology — Ambient or sidecar
- Unified Helm chart **`charts/clawql-mcp`** (optional stacks: document pipeline, Onyx, Flink, NATS, UI, … — see chart `values.yaml`; advanced items like **Fabric** are roadmap)
- ClawQL-Agent (LangGraph) + OpenClaw + NATS JetStream + Edge Worker mode

---

## Who ClawQL Is For

### Developers & Power Users

- Use Cursor + ClawQL MCP to operate any REST API via natural language — no Postman, no curl
- Build workflows that span GitHub, Cloudflare, Google Cloud, Slack, Onyx, and your own services
- Persistent hybrid memory means decisions made in Monday’s session are recalled precisely on Friday, including Onyx-retrieved company knowledge
- Operate your homelab (TrueNAS, Kubernetes, Paperless) the same way you operate SaaS APIs
- Document processing pipeline handles PDFs, Office files, and archives without manual tool switching
- stdio transport works seamlessly inside Cursor — no ports to configure
- **Supply chain:** Trivy + OSV-Scanner in **CI / Golden Image** pipelines — not exposed as a bundled OpenAPI **`search`/`execute`** provider in-repo today

### Companies & Teams

- Automate document ingestion, OCR, redaction, and archiving entirely in-house — no SaaS data exposure
- Onyx indexes your entire company knowledge base (Slack, Confluence, Drive, Jira, GitHub, email) and makes it queryable inside any Ouroboros workflow — permission-aware and citation-backed
- Flink pipelines keep Onyx’s index continuously up to date — no stale retrieval
- Audit trails via Merkle trees prove every processing step — including knowledge retrieval — valuable for compliance
- **Hyperledger Fabric (roadmap)** for multi-org consortia — not deployed by `charts/clawql-mcp` today
- One Helm chart manages everything: MCP, documents, Onyx, Flink, OSV-Scanner jobs, optional Istio + Kiali, Vault — not a patchwork of install guides

### Investors & Partners

- Early MCP + automation moat: broad bundled merge (`all-providers`), Onyx, durable vault memory + optional vectors, Ouroboros tooling
- Technical moat: hybrid recall stack + Merkle + **roadmap** Fabric-style anchoring — compounds as more agents and knowledge sources are added
- Local-first story resonates strongly for enterprise and regulated buyers
- Production security as part of the moat: Trivy + OSV-Scanner + SBOM in the Golden Image Pipeline, not an aftermarket bolt-on

---

## Core Platform

### Architecture Overview

**Layer 1 — AI Clients**

- Cursor (stdio — primary)
- Claude Desktop, any MCP-compatible client
- HTTP / Streamable HTTP and gRPC consumers (cluster or remote)

**Layer 2 — ClawQL Core**

- `search` / `execute` — discovery and execution across loaded specs (OpenAPI/Discovery; native GraphQL/gRPC when configured)
- `memory_recall` — keyword + optional vector KNN + wikilink traversal over the vault (see [`mcp-tools.md`](mcp-tools.md))
- `memory_ingest` — structured vault writes with typed receipts and wikilinks
- `knowledge_search_onyx` — live Onyx search (requires documents + `CLAWQL_ENABLE_ONYX`; not inside `memory_recall`)
- GraphQL projection — trims verbose JSON responses where applicable
- **Ouroboros** — evolutionary-loop library; optional MCP tools `ouroboros_*` when `CLAWQL_ENABLE_OUROBOROS=1` ([`clawql-ouroboros.md`](clawql-ouroboros.md))
- `notify` (optional), **`cache`** + **`audit`** (core, always on — LRU / ring buffer)

**Layer 3 — API & Data-Plane Targets**

- GitHub, Google Cloud, Cloudflare, Paperless NGX, Stirling-PDF, Tika, Gotenberg, Slack, Sentry, n8n, Jira/Bitbucket (Atlassian), **Linear** (GraphQL-only), …
- Onyx (40+ connectors, Flink-synced) + custom specs via `providers/` or `CLAWQL_SPEC_PATHS`
- **Hyperledger Fabric (roadmap)** — consortium provenance; not shipped as a bundled provider or Helm sub-chart in this repository yet ([issue #187](https://github.com/danielsmithdevelopment/ClawQL/issues/187), [`adr/0002-multi-protocol-supergraph.md`](adr/0002-multi-protocol-supergraph.md))
- MinIO / object storage, Postgres, Redis for app state, optional Ouroboros/event data — **vault Merkle snapshots default to `memory.db`**, not Postgres

**Layer 4 — Security, Supply Chain, and Service Mesh**

- Golden Image Pipeline — Trivy + OSV-Scanner + SBOM; Cosign signing; OPA Gatekeeper / Kyverno; Vault-backed attestation
- Istio (optional) — mTLS, L7 AuthorizationPolicy, retries, circuit breakers, canary-friendly traffic
- Kiali — service graph, health, config validation
- Jaeger / OTel — end-to-end traces across Ouroboros spans, Onyx, document services, mesh hops

---

## MCP Tool Surface

ClawQL registers **more than ten** tools; tiers and flags are summarized in [`mcp-tools.md`](mcp-tools.md) and [`readme/configuration.md`](readme/configuration.md). Core pair: **`search`** + **`execute`**.

| Tool                        | Type              | Purpose                                                                                                                                                                                                       |
| --------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`                    | Core              | Discovers operations and parameters from the loaded index (OpenAPI/Discovery; native GraphQL/gRPC when configured). Returns a relevant slice — not the full spec.                                             |
| `execute`                   | Core              | Runs one discovered operation with auth from `auth-headers` / env; multi-spec REST or native protocols per config.                                                                                            |
| `memory_recall`             | Memory            | Vault keyword scoring, optional vector KNN, wikilink hops — ranked Markdown paths/snippets ([`memory-recall.ts`](../src/memory-recall.ts)).                                                                   |
| `memory_ingest`             | Memory            | Writes durable Markdown under the vault; insights, receipts, `enterpriseCitations`, wikilinks ([`memory-obsidian.md`](memory-obsidian.md)).                                                                   |
| `knowledge_search_onyx`     | Knowledge         | Optional when **`CLAWQL_ENABLE_ONYX=1`** and documents stack is on — wraps Onyx `POST /search/send-search-message` ([`onyx-knowledge-tool.md`](onyx-knowledge-tool.md)).                                      |
| `sandbox_exec`              | Execution         | Optional — **`CLAWQL_ENABLE_SANDBOX=1`** — bridge / Seatbelt / Docker ([`mcp-tools.md`](mcp-tools.md) § **`sandbox_exec`**, [`cloudflare/sandbox-bridge/README.md`](../cloudflare/sandbox-bridge/README.md)). |
| `ingest_external_knowledge` | Knowledge         | Bulk Markdown ingest + optional URL fetch when enabled ([`external-ingest.md`](external-ingest.md)).                                                                                                          |
| `schedule`                  | Automation        | Optional — **`CLAWQL_ENABLE_SCHEDULE=1`** — persisted synthetic checks ([`schedule-synthetic-checks.md`](schedule-synthetic-checks.md)).                                                                      |
| `notify`                    | Notification      | Optional — **`CLAWQL_ENABLE_NOTIFY=1`** — Slack `chat.postMessage` wrapper ([`notify-tool.md`](notify-tool.md)).                                                                                              |
| `ouroboros_*` (×3)          | Workflow          | Optional — **`CLAWQL_ENABLE_OUROBOROS=1`** — seed, evolutionary loop, lineage ([`clawql-ouroboros.md`](clawql-ouroboros.md)).                                                                                 |
| `cache`                     | Core / State      | Always on — in-process **LRU** session scratch ([`cache-tool.md`](cache-tool.md)); **no** `CLAWQL_ENABLE_CACHE`.                                                                                              |
| `audit`                     | Core / Compliance | Always on — in-process **ring buffer** ([`enterprise-mcp-tools.md`](enterprise-mcp-tools.md)); **no** `CLAWQL_ENABLE_AUDIT`.                                                                                  |

---

## search + execute: How API Discovery Works

### search() — Discover the Right Operation

1. User asks: “Create a GitHub issue for the Cuckoo filter work”
1. `search()` receives query: `GitHub create issue POST`
1. ClawQL scans all loaded specs — only GitHub in this case
1. Returns: `operationId issues_create`, path `POST /repos/{owner}/{repo}/issues`
1. Returns required fields (`title`) and optional fields (`body`, `labels`, `assignees`)
1. The AI sees only the relevant operation — not the full spec

### execute() — Call the Operation Precisely

1. AI calls `execute()` with `operationId: issues_create`
1. ClawQL injects `CLAWQL_GITHUB_TOKEN` as `Authorization` header automatically
1. Builds POST body: `{ title: "…", body: "…", labels: […] }`
1. Sends to `https://api.github.com/repos/{owner}/{repo}/issues`
1. GraphQL projection strips unused fields from the response
1. Returns: issue number, URL, and status — exactly what the AI needs, nothing more

**Key insight:** The same pattern applies across bundled providers — Onyx’s `onyx_send_search_message`, Paperless, Slack, etc. Responses are trimmed to signal. **OSV-Scanner / image CVE gates** run in **CI and supply-chain pipelines** (Trivy, OSV-Scanner); there is **no** bundled `providers/osv*.json` spec in-repo today for `search`/`execute`.

### Memory-Aware Execution

Agents combine **`memory_recall`** / **`memory_ingest`** with **`search`/`execute`** so prior vault notes (including typed execute receipts you choose to write) inform the next call. The MCP server does not silently inject vault history into **`search`** — composition is explicit. **`memory_ingest`** can record provider, `operationId`, params summary, and outcomes for durable trails ([`memory-obsidian.md`](memory-obsidian.md)).

---

## Hybrid Memory Recall

Implementation today (**[`src/memory-recall.ts`](../src/memory-recall.ts)**) combines:

1. **Keyword relevance** — scans Markdown under the vault (bounded by `CLAWQL_MEMORY_RECALL_*` limits), scores notes by term overlap.
2. **Optional vector KNN** — when embeddings exist (`CLAWQL_VECTOR_BACKEND` **`sqlite`** uses chunk rows in **`memory.db`**; **`postgres`** uses **pgvector** with `CLAWQL_VECTOR_DATABASE_URL`), cosine-ranked chunks seed recall.
3. **Wikilink graph expansion** — from keyword/vector seeds, follows `[[wikilinks]]` up to **`maxDepth`** (BFS-style queue).
4. **Optional Cuckoo filter** — when enabled, can drop duplicate vector chunks during recall (`CLAWQL_CUCKOO_*` / `memory.db`).
5. **Enterprise knowledge** — **not** merged inside `memory_recall`. Use **`knowledge_search_onyx`** for live Onyx search, then **`memory_ingest`** with `enterpriseCitations` so later **`memory_recall`** can surface those notes like any other vault page.

**Session scratch:** the separate **`cache`** MCP tool is an **LRU in-process map** — it is **not** automatically queried by `memory_recall`; agents can use both explicitly.

**Not implemented:** Reciprocal Rank Fusion (RRF), Postgres **FTS-as-recall** inside `memory_recall`, or automatic “call Onyx when confidence is low” inside one `memory_recall` invocation.

### Recall pipeline (as implemented)

```
memory_recall(query)
      │
      ├── Load vault Markdown paths; optional sync memory.db
      │
      ├── Score files by keyword relevance → seed set
      ├── Optional: vector KNN → merge scores into seed set
      │
      ├── Expand via [[wikilinks]] up to maxDepth
      │
      ├── Sort/rank hits; optional Merkle snapshot in JSON when enabled
      │
      └── Return ranked paths + snippets (no GraphQL trim inside this tool)
```

### Why This Changes Everything

- Plans made in a Grok or Claude session are recalled precisely in Cursor the next day
- Architectural decisions persist across months — no more re-explaining context
- Onyx-retrieved company knowledge (pricing decisions, policies, Jira tickets) is ingested into the vault and becomes recallable in any future session without re-querying Onyx
- Execute typed receipts mean the vault knows not just what was decided but what was done and what the outcome was
- Cross-tool — ingest in any assistant, recall in any other; the vault is the source of truth, not the session
- `memory_ingest` after any significant workflow builds a living, searchable runbook automatically

### Real Case Study — April 2026

**The Situation:** A detailed Cuckoo filter + hybrid memory architecture was designed in a Grok session. The plan was never committed to GitHub. No code was written. The design only existed in that conversation.

**Without ClawQL:** A fresh Cursor session finds nothing in the repo. The answer is “no Cuckoo filter references found” — accurate but completely misleading. The plan is effectively lost.

**With ClawQL:** The Grok summary was ingested into the vault. `memory_recall('Cuckoo filter hybrid memory')` surfaces the full design, env vars, sqlite-vec wiring, and Merkle semantics — then `search` + `execute` files GitHub epic #68 and children #69–72 from that recalled context.

---

## Document Pipeline

Five services forming a complete, knowledge-augmented document processing and archival system.

```
Onyx (knowledge, parallel)
      │
Tika → Gotenberg → Stirling → Paperless
      │                            │
   Extract                      Archive
   Detect                       Index
   Route                        Search
```

All pipeline outputs feed back to the Obsidian vault via `memory_ingest`. Istio mTLS (when enabled) wraps every hop: clawql → tika → gotenberg → stirling → paperless → onyx.

---

### Apache Tika

**DNS:** `tika:9998` · Internal only

Universal text and metadata extraction from 1,000+ file formats. The document pipeline’s intake layer and routing brain.

- **Documents:** PDF, Word (.doc/.docx), Excel (.xls/.xlsx), PowerPoint (.ppt/.pptx), LibreOffice/OpenDocument, RTF
- **Web & Markup:** HTML/XHTML, XML, JSON, RSS/Atom, SVG, CSS
- **Email & Archive:** .eml, .msg, ZIP/TAR/GZip, RAR/7-Zip, Outlook PST/OST, mbox, Thunderbird
- **Media & Other:** JPEG/PNG/TIFF (EXIF), audio/video metadata, ePub/MOBI, iCal/vCard, 30+ source code languages

Metadata extracted (author, creation date, language, MIME type) drives all downstream routing decisions in Ouroboros — e.g. detecting Office files and routing to Gotenberg before Stirling. Tika also backs Paperless NGX as its parser backend when `TIKA_ENABLED=true`.

---

### Gotenberg

**DNS:** `gotenberg:3000` · Internal only

High-fidelity document conversion to PDF. Sits between Tika (detection) and Stirling (manipulation) — ensuring everything is a clean PDF before processing.

- **HTML → PDF:** Full Chromium rendering engine. Fonts, CSS, JavaScript-rendered content, flexbox layouts. Custom headers, footers, margins, paper sizes.
- **Office → PDF:** LibreOffice converts Word, Excel, PowerPoint, and OpenDocument with high layout fidelity.
- **Markdown → PDF:** Styled PDFs with syntax highlighting, tables, and embedded images. Used when exporting vault notes or developer documentation.
- **URL → PDF:** Full-page Chromium screenshot. Headers, footers, JavaScript-rendered content all captured.
- **PDF Merge (in conversion):** Merge multiple files in a single Gotenberg call before passing to Stirling.
- **Header & Footer Injection:** Custom HTML injected per document class — company logos, page numbers, date stamps, confidentiality notices.

---

### Stirling-PDF

**DNS:** `stirling-pdf:8080` · Ingress: `pdf.clawql.local`

Heavy PDF manipulation engine. The pipeline’s processing workhorse.

- **Merge / Split:** Combine or split PDFs, reorder pages, extract page ranges
- **High-Accuracy OCR:** Multi-language, configurable accuracy settings. If quality threshold isn’t met, Ouroboros automatically retries with higher accuracy setting.
- **PII Redaction:** Automatically detects and redacts SSNs, credit card numbers, dates of birth, and custom regex patterns. Redaction is cryptographically verified via Merkle tree before Paperless import.
- **Sign & Certify:** Digital signatures and certified archive copies for compliance workflows.
- **Compress & Optimize:** Reduce file sizes for long-term Paperless storage.
- **Batch Operations:** Process entire folders in a single API call. Ouroboros orchestrates batch jobs with per-file progress tracking and error recovery.

Config: `DOCKER_ENABLE_SECURITY=false` removes the 5-user SaaS restriction for unlimited self-hosted use. No rate limits, no user caps.

Ouroboros can cross-reference Stirling output with Onyx-retrieved policy before `memory_ingest` — Merkle leaves include a hash of the processing result for each run.

---

### Paperless NGX

**DNS:** `paperless:8000` · Ingress: `paperless.clawql.local`

Long-term document archive with full-text search, auto-tagging, and consumption inbox.

- Full-text search across all archived documents (Tesseract OCR + Tika parser backend)
- Auto-tagging by content, date, correspondent, and document type
- Correspondent tracking — associate documents with senders/issuers
- Consumption inbox folder — drop files in, Paperless ingests and tags automatically
- Document versioning and update tracking
- Custom field definitions for domain-specific metadata
- REST API (OpenAPI at `/api/schema/`) — what ClawQL uses for `search + execute`

**Tika Integration:** `TIKA_ENABLED=true` and `TIKA_URL=http://tika:9998`. Extends Paperless’s support from basic PDFs to 1,000+ formats — Office documents, emails, archives — all ingested natively.

**Onyx Bridge:** After a successful Paperless import, Ouroboros optionally calls Onyx’s file upload + indexing API to make the newly archived document immediately queryable via `knowledge_search_onyx` in the same workflow.

**Isolated Backends:** Paperless runs with its own dedicated Postgres (`paperless-postgres:5432`) and Redis (`paperless-redis:6379`) — isolated from ClawQL’s shared backends to prevent schema conflicts. Both included in the unified Helm chart.

---

## Enterprise Knowledge: Onyx + Flink

**DNS:** `onyx:8080` · Ingress: `onyx.clawql.local`

Onyx is an open-source enterprise knowledge search platform that indexes your company’s knowledge base across 40+ connectors. It is the live enterprise knowledge surface inside ClawQL — parallel to but distinct from the Obsidian vault (which covers session-level runbooks and decisions). Together they are complementary: vault for durable workflow memory, Onyx for live enterprise index queries.

**Configuration:** Keep **`CLAWQL_ENABLE_DOCUMENTS`** on (default); set **`CLAWQL_ENABLE_ONYX=1`**, **`ONYX_BASE_URL`**, and Bearer **`ONYX_API_TOKEN`** / **`CLAWQL_ONYX_API_TOKEN`** so **`knowledge_search_onyx`** registers ([`mcp-tools.md`](mcp-tools.md)). The bundled minimal OpenAPI at `providers/onyx/openapi.yaml` covers `POST /search/send-search-message` and optional `POST /onyx-api/ingestion`. Refresh upstream specs with `npm run fetch-provider-specs` when `ONYX_BASE_URL` is set.

**40+ Connectors:**
Slack (threads, channels, DMs), Google Drive (Docs, Sheets, Slides), Confluence (pages, spaces, comments), Jira (tickets, epics, sprint history), GitHub (issues, PRs, code, wikis), Gmail/Outlook, Notion, Linear, Zendesk, Salesforce, and more.

**Permission-Aware Search:** Onyx respects the permission model of each connected source. If a user doesn’t have access to a given Confluence space, that space doesn’t appear in their results — even when queried through ClawQL. Enterprise data governance is enforced at the retrieval layer.

**Citation-Returning Results:** For durable vault trails, chain `knowledge_search_onyx` → `memory_ingest` with `enterpriseCitations` or redacted `toolOutputs` — small, attributable rows without dumping full retrieval JSON into the vault.

**Flink Real-Time Sync:** Flink pipelines keep Onyx’s index continuously updated from all connected sources. New Slack messages, updated Confluence pages, closed Jira tickets — all reflected within minutes. `knowledge_search_onyx` never returns stale results.

---

## Intelligence Layer

### Ouroboros: Structured Workflow Engine

**clawql-ouroboros** ([`clawql-ouroboros.md`](clawql-ouroboros.md)) supplies evolutionary-loop primitives; the MCP server exposes **optional** tools when **`CLAWQL_ENABLE_OUROBOROS=1`**: `ouroboros_create_seed_from_document`, `ouroboros_run_evolutionary_loop`, `ouroboros_get_lineage_status`. Optional **`CLAWQL_OUROBOROS_DATABASE_URL`** persists events to Postgres instead of in-memory.

Natural-language routing (“fast path” vs full loop) is a **product vision** — today assistants compose **`search`/`execute`**, **`memory_*`**, **`knowledge_search_onyx`**, document providers, etc., explicitly or via prompts. Complex pipelines (Tika → Gotenberg → Stirling → Paperless → Onyx) are orchestrated through **those tools** and Helm-deployed services — not a hidden automatic router described here.

Seeds / lineage storage match the library + MCP wiring in-repo; full **Interview → Seed → Execute → Evaluate → Evolve** automation as a single invisible daemon remains **roadmap** material alongside Ouroboros issues ([#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141), [#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142)).

---

### The Ouroboros Loop: 5 Phases

**1 — Interview**
Analyzes the request for ambiguity. If fully specified, this phase is skipped. If key details are missing, ClawQL replies with one natural clarifying question. No jargon.

**2 — Seed**
Creates an immutable workflow specification — the “Seed” — with measurable acceptance criteria; persisted to **Postgres when `CLAWQL_OUROBOROS_DATABASE_URL` is set**, otherwise **in-memory** ([`clawql-ouroboros.md`](clawql-ouroboros.md)). Example criteria: “Onyx returns ≥ 3 relevant results with citations, OCR confidence > 0.95, redaction verified, Paperless import confirmed, GitHub issues filed for all flagged items.”

**3 — Execute**
Decomposes the Seed into an ordered sequence of tool calls. Typical knowledge-augmented path: `knowledge_search_onyx` → Tika → Gotenberg → Stirling → Cuckoo check → Paperless → Onyx index push → `memory_ingest` → GitHub issues → optional **`notify`**. Supply-chain gates (**Trivy/OSV-Scanner**) belong in **CI**, not as an MCP **`execute`** step unless you add a custom spec.

**4 — Evaluate**
Checks each result against the Seed’s acceptance criteria. Onyx result count and relevance scores validated. OCR confidence measured. PII redaction verified. Paperless import confirmed. GitHub issue numbers validated. Any failure triggers Evolve.

**5 — Evolve**
If any criterion fails, the loop adjusts and retries (behavior depends on orchestration — today’s **`ouroboros_*`** tools expose lineage; fully automatic Evolve across external services is **roadmap**). Retry history: Postgres when `CLAWQL_OUROBOROS_DATABASE_URL` is set**. Escalations can use **`notify`** when enabled; PagerDuty requires **your\*\* bundled spec or webhook integration.

---

### Cuckoo Filters: O(1) Deduplication

Cuckoo predicates can be loaded from **`memory.db`** when **`CLAWQL_CUCKOO_*`** / sync paths are enabled ([`memory-db-schema.md`](memory-db-schema.md)).

**Implemented / wired in MCP paths:** optional **vector chunk dedup** during **`memory_recall`** when a Cuckoo predicate is present — see [`memory-recall.ts`](../src/memory-recall.ts).

**Roadmap / orchestration (not automatic in core today):** Stirling→Paperless dedup, Ouroboros seed memoization, Tika/Gotenberg artifact dedup, Onyx query memoization, MCP `search` memoization, OSV duplicate suppression — these belong to higher-level workflows or future hooks, not universal defaults.

---

### Merkle Trees: Cryptographic Audit Trails

**Shipped today:** with **`CLAWQL_MERKLE_ENABLED=1`** and a synced **`memory.db`**, Merkle snapshots fingerprint **vault Markdown index state** and surface on **`memory_ingest`** / **`memory_recall`** / health paths ([`mcp-tools.md`](mcp-tools.md), [`memory-db-schema.md`](memory-db-schema.md)). Roots live in the **SQLite sidecar**, not implicitly in Postgres unless you add separate orchestration.

**Target / roadmap (multi-step pipelines):** hashing each pipeline step (Onyx → Tika → Stirling → Paperless → GitHub) into a chain — plus optional **`proofOfIntegrity`** GraphQL — remains **design** until wired end-to-end.

**Illustrative tree (future knowledge-augmented workflow):**

```
ROOT HASH (conceptual — per-step anchoring TBD)
├── Onyx retrieval + citations (hashed payload refs)
├── Tika extract + metadata
├── Stirling OCR + redact
├── Paperless import confirmation
└── GitHub issues filed
```

**Where Merkle fits:**

- **Today:** vault index integrity via **`memory.db`** when Merkle sync is enabled.
- **Roadmap:** per-step document pipeline leaves, Ouroboros phase outputs, Onyx citation attestations — see Merkle/Cuckoo issues and **[`memory-db-hybrid-implementation.md`](memory-db-hybrid-implementation.md)**.

---

### notify() + Slack Integration

When **`CLAWQL_ENABLE_NOTIFY=1`**, **`notify`** wraps Slack **`chat.postMessage`** by delegating to **`execute`** on the bundled Slack spec ([`notify-tool.md`](notify-tool.md)). Authenticates like **`execute`** on **`slack`** (`CLAWQL_SLACK_TOKEN`, …; **`chat:write`** minimum).

**When Ouroboros calls `notify()`:**

- ✅ Workflow completion — doc archived, issues filed, Merkle root, Onyx citations
- ℹ️ Knowledge retrieval alerts — Onyx returned 0 results, broadening query
- ⚠️ Auto-retry events — OCR quality below threshold, retrying
- 🚨 Failure/escalation — retry budget exhausted, manual review needed
- 🔐 Supply chain — image scan complete, CVE summary, SBOM link
- 📋 Audit/compliance — Merkle root stored, workflow log ID

Slack is also a **full bundled provider** — `search + execute` can target the full Slack API for custom workflows: file uploads, channel lookups, message history reads, and more.

---

## Complete Pipeline: Step by Step

**You type in Cursor:** _“Process the new Q1 invoices from the consume folder, cross-reference them against our company pricing decisions from last quarter, redact PII, archive everything, and create follow-up GitHub issues if anything is missing.”_

**Step 1 — memory_recall:** Vault checked first. Any prior Q1 invoice workflows, pricing policy notes, or Onyx citations from previous sessions are surfaced and held in context.

**Step 2 — Onyx:** `knowledge_search_onyx('Q1 pricing decisions 2025')` returns ranked, permission-aware chunks from Confluence and Slack with citations. GraphQL projection trims to chunk text + citation URL.

**Step 3 — Tika:** 14 files analyzed. 9 PDFs pass through. 3 Word docs, 2 Excel files flagged for Gotenberg. Metadata extracted for routing decisions.

**Step 4 — Gotenberg:** 3 Word docs + 2 Excel files → PDF via LibreOffice. Cuckoo filter: not seen before. Proceeds.

**Step 5 — Stirling:** 14 PDFs merged → 1 document. OCR run (confidence 0.97). OCR’d text cross-referenced against Onyx pricing results — 3 discrepancies flagged. PII redacted. Merkle tree: 6 leaf hashes including the Onyx retrieval leaf, root computed.

**Step 6 — Evaluate:** OCR confidence ✓, zero PII ✓, Onyx returned results ✓, Merkle root stored ✓.

**Step 7 — Paperless:** Cuckoo filter: not seen before. Imported as document #5102 with tags `['Q1-2026-invoices']`, correspondent `'IRS'`. Onyx index push: document now queryable enterprise-wide via `knowledge_search_onyx`.

**Step 8 — GitHub:** 3 pricing discrepancy issues filed — #201, #202, #203 — each with Onyx citation link and Paperless document reference.

**Step 9 — memory_ingest:** Rich vault summary written: doc ID, Merkle root, Onyx citations, discrepancy count, GitHub issue numbers, OCR score, typed execute receipts. Wikilinks to pricing policy history.

**Step 10 — notify():** Posts to `#finance`: _“✅ Q1 invoice batch complete. Doc #5102 archived. 3 pricing discrepancies → GitHub #201–203. Merkle: a3f9… | Onyx citations attached.”_

**What you see in Cursor:** _“Done. 14 files processed, merged, OCR’d, PII redacted, cross-referenced against Q1 pricing policy — 3 discrepancies found and filed as GitHub issues — archived as doc #5102 in Paperless, and #finance has been notified on Slack.”_

---

## Infrastructure

### Bundled Providers

Default **`all-providers`** loads **Google Cloud** (manifest `providers/google/google-top50-apis.json`) plus **every** id in **`BUNDLED_PROVIDERS`** ([`provider-registry.ts`](../src/provider-registry.ts)). Examples:

| Provider id                                          | Spec on disk                                                                         | Notes                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `github`                                             | `providers/github/openapi.yaml`                                                      | REST; token: `CLAWQL_GITHUB_TOKEN`, …                                                              |
| `google`                                             | `providers/google/google-top50-apis.json` + `providers/google/apis/*/discovery.json` | Curated GCP APIs                                                                                   |
| `cloudflare`                                         | `providers/cloudflare/openapi.yaml`                                                  |                                                                                                    |
| `slack`                                              | `providers/slack/openapi.json`                                                       | Also used by optional **`notify`**                                                                 |
| `sentry`                                             | `providers/sentry/openapi.json`                                                      |                                                                                                    |
| `n8n`                                                | `providers/n8n/openapi.json`                                                         |                                                                                                    |
| `jira` / `bitbucket`                                 | `providers/atlassian/jira/openapi.yaml`, `…/bitbucket/openapi.yaml`                  | Preset **`atlassian`** merges both                                                                 |
| `linear`                                             | `providers/linear/schema.graphql`                                                    | **GraphQL only** — `LINEAR_API_KEY` / `CLAWQL_LINEAR_API_KEY`                                      |
| `tika`, `gotenberg`, `paperless`, `stirling`, `onyx` | `providers/<id>/openapi.yaml`                                                        | Document / knowledge stack; base URLs + tokens per [`providers/README.md`](../providers/README.md) |

**OSV-Scanner:** used in **CI / image hardening**, not shipped as a **`providers/osv*`** OpenAPI bundle for **`execute`**.

**Spec Refresh:**

```bash
npm run fetch-provider-specs
# Accepts: STIRLING_BASE_URL, PAPERLESS_BASE_URL, TIKA_BASE_URL, GOTENBERG_BASE_URL, ONYX_BASE_URL
```

---

### Unified Kubernetes Helm Chart

Primary chart in this repository:

```bash
helm install clawql charts/clawql-mcp --namespace clawql
```

- **`charts/clawql-mcp`** — see [`charts/clawql-mcp/README.md`](../charts/clawql-mcp/README.md) and `values.yaml` for optional document pipeline, Onyx, Flink, NATS, UI ingress, etc.
- `CLAWQL_BUNDLED_OFFLINE=1` — typical production stance so MCP does not fetch specs at runtime (see README / deployment docs)
- **Onyx stack** — gated by chart values (`onyx.enabled` pattern); MCP **`CLAWQL_ENABLE_ONYX`** aligns with [`onyx-knowledge-tool.md`](onyx-knowledge-tool.md)
- **Fabric** — not present as a sub-chart here; see **Roadmap** / [#187](https://github.com/danielsmithdevelopment/ClawQL/issues/187)
- Namespace: `clawql` — typical co-location for internal DNS
- Paperless isolated Postgres and Redis included — no external DB dependency
- Flink included for real-time Onyx connector sync
- Optional Istio — istiod, ingress/egress gateways, Kiali; Ambient profile preferred for new installs; mTLS STRICT by default in hardened overlays
- OSV-Scanner — CronJob and/or in-cluster scan Deployment wired to the same namespace
- Vault (or OpenBao) — subchart or external URL; Vault Agent Injector for ClawQL, Flink job secrets, and Istio-compatible TLS material

---

### Complete Service Map

**Headscale tailnet:** the **`*.clawql.local`** pattern also appears when MagicDNS is served to **enrolled Tailscale nodes**; those names resolve on the **mesh**, not via in-cluster DNS — beginner overview **[`docs/deployment/tailscale-and-headscale-for-clawql.md`](deployment/tailscale-and-headscale-for-clawql.md)**; Headscale runbook **[`docs/deployment/headscale-tailnet.md`](deployment/headscale-tailnet.md)** ([#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206)); least-privilege starter ACL **[`docs/deployment/headscale-acls-clawql.hujson`](deployment/headscale-acls-clawql.hujson)** ([#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213)).

| Service                  | Internal DNS                                   | Ingress                  | Role                                                                                                  |
| ------------------------ | ---------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| ClawQL MCP               | `clawql:8080` (container; see chart `service`) | `clawql.local` (example) | HTTP MCP + health + GraphQL — see [`charts/clawql-mcp/values.yaml`](../charts/clawql-mcp/values.yaml) |
| Stirling-PDF             | `stirling-pdf:8080`                            | `pdf.clawql.local`       | PDF merge/OCR/redact                                                                                  |
| Paperless NGX            | `paperless:8000`                               | `paperless.clawql.local` | Archive, consume, API                                                                                 |
| Apache Tika              | `tika:9998`                                    | internal                 | Extraction, MIME detection, routing                                                                   |
| Gotenberg                | `gotenberg:3000`                               | internal                 | Document conversion to PDF                                                                            |
| Onyx                     | `onyx:8080`                                    | `onyx.clawql.local`      | Enterprise knowledge, 40+ connectors                                                                  |
| Flink (JM/TM)            | `flink-jobmanager:8081`                        | internal                 | Onyx index sync                                                                                       |
| OSV-Scanner              | CronJob / Job                                  | internal                 | Vuln + SBOM scans on image refs / lockfiles                                                           |
| Istio control plane      | `istiod:15012`                                 | internal                 | mTLS, xDS to Envoys / ztunnel                                                                         |
| Istio ingress/egw        | `istio-ingressgateway`                         | `*.clawql.local`         | North-south, VirtualService + Gateway                                                                 |
| Kiali                    | `kiali:20001`                                  | `kiali.clawql.local`     | Mesh graph, health, config validation                                                                 |
| Vault / OpenBao          | `vault:8200`                                   | internal (mesh-only)     | Secrets, injectors, dynamic creds                                                                     |
| Redis (shared)           | `redis:6379`                                   | internal                 | Queues, session state                                                                                 |
| Postgres (shared)        | `postgres:5432`                                | internal                 | App/Ouroboros data when deployed — not the primary Merkle store (see `memory.db`)                     |
| Paperless Postgres/Redis | isolated                                       | internal                 | Isolated from shared DB                                                                               |
| MinIO (optional)         | —                                              | internal                 | S3 API for big artifacts, SBOM storage                                                                |
| Uptime Kuma              | `uptime-kuma:3001`                             | `status.clawql.local`    | Synthetic monitoring, status pages                                                                    |
| Grafana                  | —                                              | `grafana.clawql.local`   | Unified dashboards, OTel traces, Prometheus                                                           |
| NATS JetStream           | —                                              | internal                 | Event bus, agent coordination, checkpointing                                                          |

---

### Secrets Management: HashiCorp Vault / OpenBao

- KV v2 paths per environment (`secret/clawql/…`, `onyx/…`, `github/…`); Vault Agent sidecar templates → files or env for ClawQL and workers
- Per-user or per-workflow paths where isolation is required; Istio AuthorizationPolicy can restrict which ServiceAccount may reach Vault’s K8s Service
- No Vault UI on the public internet — ClusterIP + mesh-only or port-forward; root and unseal keys in HSM per policy
- OpenBao — API-compatible subset for air-gapped teams who want Vault semantics without a HashiCorp commercial agreement
- SBOM and OSV attestation bundles can be written to Vault and referenced from `memory_ingest` (digest + path), matching Merkle leaves

---

## Privacy, Security & Local-First Architecture

### 100% Local Execution

Every service — ClawQL, Stirling-PDF, Paperless, Tika, Gotenberg, Onyx, Flink, Redis, Postgres — runs inside your Kubernetes cluster. Documents and company knowledge never leave your machine. Onyx’s enterprise index is built and served entirely locally.

### No SaaS Limits or Subscriptions

Stirling-PDF runs with `DOCKER_ENABLE_SECURITY=false` — removing the 5-user SaaS restriction. Paperless NGX is fully open source with no document limits. Onyx is open source and self-hosted — no per-seat licensing, no query limits.

### Token Isolation

Each provider token is isolated in Kubernetes Secrets and injected only into the ClawQL process. Tokens never appear in logs, never leave the cluster, and are never shared between provider contexts.

### Vault Memory Privacy

The Obsidian vault lives on your local filesystem at `CLAWQL_OBSIDIAN_VAULT_PATH`. Memory notes — including ingested Onyx citations — never leave your machine. `memory_ingest` explicitly prohibits storing secrets.

### Cryptographic Integrity

With **`CLAWQL_MERKLE_ENABLED`**, vault-facing Merkle snapshots live in **`memory.db`** (see **Merkle Trees** above). **Full** multi-step pipeline hashing (every Ouroboros step + Onyx + documents) is **roadmap** — not a single Postgres root for all workflows today.

### Onyx Permission Enforcement

Onyx enforces the permission model of each connected source inside the cluster. A ClawQL user without access to a given Confluence space will not receive results from that space — even if they craft a targeted query.

### Offline Spec Loading

`CLAWQL_BUNDLED_OFFLINE=1` prevents ClawQL from ever fetching provider specs from the network at runtime. All spec files are pre-bundled in the Docker image. No outbound traffic for spec loading.

### Zero-Trust Networking (optional Istio)

Automatic mTLS between ClawQL, Paperless, Onyx, Stirling, Tika, Gotenberg, Flink, and OSV workers — with L7 AuthorizationPolicy (JWT, mTLS SPIFFE IDs, or namespace boundaries). Egress controlled with ServiceEntry + EgressGateway.

---

## Security & Supply Chain

### Golden Image Pipeline

All ClawQL containers and co-deployed services are built from minimal (distroless / Chainguard-style) base images.

- **Container + dependency scanning:** Trivy + OSV-Scanner in CI; Critical/High as merge gates per `policy.yaml`
- **SBOM:** CycloneDX or SPDX emitted per build; versioned with the image digest
- **Image signing:** Cosign; keys in Vault or K8s Sealed/External secrets
- **Deploy by digest:** Helm values pin `@sha256` for ClawQL and golden child images
- **OSV-Scanner / lockfile scans:** run in **CI and cluster CronJobs** wired by policy — **not** exposed as a bundled OpenAPI provider for MCP **`execute`** in this repo

### OPA Gatekeeper Enforcement

- Enforces distroless base, signed images only, no root containers, no privileged pods, approved registries
- Rejects non-compliant images at admission time with clear violation messages
- Audit and dry-run modes supported

### Vulnerability Response Tiers

| Severity           | Response                               | In ClawQL + CI                                                  |
| ------------------ | -------------------------------------- | --------------------------------------------------------------- |
| Critical (≈9.0–10) | P1; block deploy to prod               | Trivy/OSV gate; fail pipeline; Grafana annotation               |
| High (≈7.0–8.9)    | Patch in days; owner waiver in writing | Same gates or staging-only override per policy; notify → ticket |
| Medium / Low       | Backlog, SLAs                          | Tracked; scheduled upgrades                                     |

### Traffic Resilience (Istio)

Retries, timeouts, circuit breakers, outlier detection, subset-level routing — canary-friendly rollouts of ClawQL and Stirling without a second chart fork.

---

## Optional: Hyperledger Fabric (roadmap)

**Status:** Design and issue tracking only — **no** `providers/fabric/openapi.yaml`, **no** `CLAWQL_ENABLE_FABRIC` Helm toggle, and **no** `fabric_*` MCP tools ship in this repository today. See [#187](https://github.com/danielsmithdevelopment/ClawQL/issues/187) and [`adr/0002-multi-protocol-supergraph.md`](adr/0002-multi-protocol-supergraph.md).

The narrative below is a **target architecture**: consortium-grade, tamper-evident provenance **beyond** Merkle trees + Postgres inside one cluster.

**Principles (planned):**

- Same **`search`/`execute`** mental model once a Fabric REST/OpenAPI façade exists
- Mesh-friendly TLS between workloads and any future Fabric gateway

**Illustrative on-ledger payloads (hashes + refs — not raw data):**

- Merkle roots and Seed IDs; evaluate pass/fail and key metrics
- Document pipeline lifecycle hashes (Tika → Gotenberg → Stirling → Paperless)
- Onyx citation attestations (trimmed payloads)
- Optional `memory_ingest` cross-refs to ledger tx ids **when** tooling exists

**Illustrative MCP tools (not registered today):**

| Tool                       | Purpose (planned)                  |
| -------------------------- | ---------------------------------- |
| `fabric_submit_provenance` | Anchor Merkle root / seed metadata |
| `fabric_query_provenance`  | Permissioned audit readback        |
| `fabric_chaincode_invoke`  | General chaincode calls            |
| `fabric_anchor_merkle`     | Public commitment of private state |
| `fabric_channel_list`      | Channel discovery                  |
| `fabric_consortium_status` | Network health                     |

**Trade-offs:** Extra stateful Fabric pods, endorsement policies, and ops — only justified when consortium anchoring is a requirement; otherwise **`memory.db` Merkle** + vault Markdown + optional Postgres (Ouroboros) cover many single-cluster audit needs.

---

## Observability Stack

### Uptime Kuma — Synthetic Monitoring

- First-class integration with the `schedule()` MCP tool
- HTTP, TCP, Ping, Docker, keyword, JSON, and SSL certificate checks
- Failures trigger `notify()` to Slack and audit events
- Auto-generates public or team status pages at `status.clawql.local`

**Natural language example:** _“Schedule synthetic monitoring for Paperless, Onyx, and ClawQL MCP every 60 seconds with status page at status.clawql.local”_

### Prometheus + Grafana — Metrics & Dashboards

Pre-built dashboards included in the Helm chart:

- MCP tool usage, latency, and error rates
- Document pipeline throughput and OCR quality
- Onyx index freshness and query performance
- Golden Image + OPA Gatekeeper health
- OSV-Scanner / CI scan results as Grafana annotations

### OpenTelemetry — Distributed Tracing & Logs

- OTel Collector receives traces and logs from every component
- Automatic instrumentation for MCP tools, Ouroboros 5-phase loop, document pipeline (with Merkle correlation), Onyx searches, and OSV-Scanner job completions

### Istio + Kiali + Jaeger/Tempo — Mesh-Native View

- Istio service metrics (request rate, 5xx, mTLS handshake failures) to Prometheus
- Kiali (`kiali.clawql.local`) — topology, health, VirtualService and DestinationRule validation
- Jaeger or Grafana Tempo — end-to-end traces: MCP → ClawQL → mesh hop → Onyx → Flink — W3C and B3 context propagated from Istio and app sidecars

**Single pane of glass:** `grafana.clawql.local` — unified view with embedded Uptime Kuma status pages, Prometheus dashboards, and OTel traces.

### Incident Management: PagerDuty

**Not bundled:** there is no `providers/pagerduty.json` in-tree. Add PagerDuty (or another incident API) via **`CLAWQL_SPEC_PATHS`** / your own OpenAPI spec, then use **`search`/`execute`** with tokens per [`auth-headers`](../src/auth-headers.ts) conventions.

| Source                  | Trigger                    | Incident Includes                     |
| ----------------------- | -------------------------- | ------------------------------------- |
| Uptime Kuma             | Monitor down > 30s         | Status page link, check history       |
| Prometheus Alertmanager | Any firing alert           | Grafana link, runbook, labels         |
| OpenTelemetry           | High error/latency spans   | Trace ID, correlated Merkle root      |
| Ouroboros               | Retry budget exhausted     | Seed ID, failed phase, evaluation log |
| OSV-Scanner / Trivy     | New Critical on main image | Digest, SBOM link, Grafana annotation |

---

## ClawQL-Agent, OpenClaw & NATS

### ClawQL-Agent

The production-grade agent runtime built on LangGraph that turns ClawQL’s MCP tools into persistent digital employees.

- **LangGraph backbone:** Persistent checkpointing backed by Postgres, Redis, and NATS JetStream — agents survive restarts, failures, and long-running executions across days or weeks
- **ClawQL tool integration:** Automatic registration of all MCP tools and any OpenAPI provider as LangGraph tools with structured schemas, error recovery, and retry logic
- **Ouroboros hybrid engine:** LangGraph nodes delegate complex structured workflows to full Ouroboros 5-phase loops while LangGraph handles dynamic planning, branching, and multi-agent coordination
- **LangFuse observability:** Complete tracing, evaluation datasets, prompt versioning, cost tracking, and performance analytics — self-hosted instance included in the Helm chart
- **Multi-agent patterns:** Supervisor + specialist agents sharing the same Onyx knowledge layer and Obsidian memory vault
- **Role-based identity:** Each digital employee has a scoped memory vault, role prompt, performance history, and dedicated NATS subscription

`npm install clawql-agent` · Private repo: `danielsmithdevelopment/ClawQL-Agent`

---

### OpenClaw

The secure frontend and governance layer for ClawQL + ClawQL-Agent.

- Modern chat interface with streaming responses and threaded conversations
- Workflow template gallery and one-click “Deploy Digital Employee” for common roles (Finance, DevOps, Compliance)
- Human-in-the-loop approval flows with full context, Onyx citations, Merkle proofs, and LangFuse traces before high-stakes actions
- Real-time operational dashboard: active agents, workflow status, document pipeline throughput, Onyx query performance, NATS event streams
- Comprehensive audit UI: searchable Merkle-verified logs, Obsidian vault explorer, citation browser, compliance export
- Role-based access control that respects Onyx permission models
- Fully contained in the unified Helm chart at `openclaw.clawql.local`

---

### NATS JetStream

The event bus and durable streaming platform — the nervous system for 24/7 agent coordination.

**Core use cases:**

- Task queuing and load balancing across cluster pods and edge workers
- Real-time agent-to-agent communication and workflow handoffs
- Durable LangGraph checkpointing and state synchronization
- Publication of Ouroboros phase completions, audit events, and Merkle root updates
- _(Roadmap)_ Fabric chaincode events → JetStream subjects (if/when Fabric integration lands)
- Reactive triggering from Flink/Onyx changes or external webhooks

**Standardized subject hierarchy:** `clawql.workflow.>`, `clawql.agent.>`, `clawql.document.>`, `clawql.edge.>`

Lower operational complexity than Kafka while delivering the durability, ordering guarantees, and request/reply patterns needed for reliable autonomous agents.

---

### Edge Worker Mode

Optional pooled laptop participation that extends cluster capacity without compromising reliability.

1. Laptop runs `clawql-agent --mode=edge --connect-to=cluster`
1. Registers with NATS JetStream as a best-effort worker in specific queues
1. Pulls low-priority or burstable tasks (heavy OCR batches, local document testing, dev workflows)
1. Executes using local resources (GPU acceleration if available)
1. Pushes completed artifacts to central MinIO, memory notes to shared Obsidian vault, and full Merkle proofs + LangFuse traces back to the cluster
1. Disconnects gracefully on sleep/shutdown; cluster requeues any unfinished work

Central policy engine decides which task types can run on edge. All actions remain fully audited. Sensitive data never leaves the organization.

---

### Digital Employees

ClawQL + ClawQL-Agent + OpenClaw creates persistent digital employees that go beyond simple agents.

**Characteristics:**

- **Persistent identity:** Own scoped Obsidian vault, role prompt, performance history, dedicated NATS subscription
- **Goal-oriented:** Accepts high-level objectives and decomposes them using LangGraph + Ouroboros
- **Proactive:** Monitors events (new documents, Slack mentions, Onyx changes) and initiates workflows without constant human prompting
- **Self-correcting:** Full reflection loops + Ouroboros Evolve + LangGraph retries and backtracking
- **Auditable and safe:** Every decision, knowledge retrieval, and action is Merkle-verified and visible in OpenClaw
- **Collaborative:** Works with other digital employees and human teammates via shared Onyx knowledge and `notify()`

**Current autonomy level:** 2–3 (highly supervised execution with strong proactive elements inside well-defined domains)
**Roadmap target:** Level 4 (highly autonomous within role, human oversight on strategy and exceptions only)

**Real example:** A Finance Digital Employee wakes on new Paperless documents at 3 AM, runs Onyx cross-reference against pricing policy, processes the full pipeline, files GitHub issues for discrepancies, posts a summary to Slack, ingests the complete outcome to the vault — and only escalates when confidence drops or policy thresholds are breached.

---

## Why ClawQL Wins

**vs. Other MCP Servers**
Most MCP servers wrap one API. ClawQL’s default **`all-providers`** merge loads **many** bundled specs (REST + GraphQL **Linear** + Google Discovery bundle) and still accepts additional OpenAPI paths. Differentiators include vault **`memory_*`** with optional vectors, optional **Onyx** via **`knowledge_search_onyx`**, optional **Ouroboros** MCP hooks, and optional **Merkle/Cuckoo** hooks via `memory.db` — see [`mcp-tools.md`](mcp-tools.md).

**vs. Document Automation Tools (n8n, Zapier, Make)**
Visual workflow builders require explicit node configuration. ClawQL is natural language. No document tool has a cryptographic Merkle audit trail per processing step. No document tool can cross-reference processed content against live enterprise knowledge during the same workflow. ClawQL’s pipeline is entirely self-hosted — no SaaS data exposure.

**vs. Enterprise Search Platforms (Glean, Guru, Notion AI)**
Cloud-hosted, subscription-based, per-seat pricing. Onyx inside ClawQL is self-hosted and open source — zero per-query or per-seat cost. Enterprise search tools return answers. ClawQL returns answers and acts on them — filing GitHub issues, processing documents, sending Slack notifications — in the same automated workflow.

**vs. Agent Frameworks (LangGraph, AutoGen, CrewAI)**
Powerful orchestration but typically lack a unified MCP + API surface and a self-hosted knowledge plane in one deployable story. ClawQL aims to combine **`search`/`execute`**, vault memory, optional Onyx, and Helm-backed stacks; **Fabric-grade** consortium anchoring remains **roadmap** ([#187](https://github.com/danielsmithdevelopment/ClawQL/issues/187)).

**vs. Cobbled Platform Engineering Stacks**
Teams that stitch Trivy in one repo, Istio in another, a vector DB in a third, and MCP nowhere still lack a single **MCP + vault + optional Onyx** story. ClawQL concentrates **`search`/`execute`** across bundled providers, documents, and enterprise search tools; supply-chain scanning stays in **CI/images** unless you add custom specs for it.

---

## Design Principles

**1 — Conversational First**
Users speak naturally in Cursor. Advanced pieces (Ouroboros hooks, Seeds, Cuckoo/Merkle, Onyx, Flink) stay optional or behind flags unless the user needs them. Unnecessary operational jargon in the main path is a design failure.

**2 — Local-First & Private**
Every service runs in your Kubernetes cluster. Documents and company knowledge never leave your machine. No cloud dependencies. No SaaS subscriptions. `CLAWQL_BUNDLED_OFFLINE=1` ensures no outbound spec fetches at runtime.

**3 — Self-Improving & Verifiable**
Ouroboros retries and adjusts automatically (Evolve phase). Merkle trees make every workflow — including Onyx knowledge retrieval — auditable. Trivy + OSV-Scanner + SBOM in the Golden Image make supply chain state verifiable. Cuckoo filters prevent duplicate work. The system gets smarter with every workflow, not just every training run.

**4 — Context-Efficient by Design**
`search()` returns only relevant operation slices. `execute()` responses are trimmed where GraphQL projection applies. `memory_recall()` returns ranked paths/snippets — not the whole vault. Limits + vector top-K + wikilink depth cap keep recall bounded. Every design decision keeps the AI’s context window clean and signal-rich.

**5 — Extensible by Default**
Adding a new service is adding a new OpenAPI spec to `providers/`. Ouroboros discovers and orchestrates it automatically. New data sources in Onyx = new Flink connector jobs. Istio mesh profiles and Kiali are config, not a fork. OSV-Scanner and Trivy are pluggable in CI and the MCP merge list.

**6 — Memory-Continuous**
`memory_ingest` after every significant workflow means future sessions — in any thread, with any assistant — can `memory_recall` the full history of what was processed, decided, and why. Onyx-retrieved company knowledge is ingested into the vault alongside workflow results, making enterprise knowledge permanently recallable without re-querying the live index. Plans and knowledge from Monday are available in Cursor on Friday. No re-explaining, ever.

**7 — Auditable by Architecture**
Merkle trees, typed **`memory_ingest`** receipts, optional Postgres-backed Ouroboros lineage, and **roadmap** consortium ledger hooks aim to keep “what did the AI do, with what knowledge, and why?” answerable — at the application layer, not just in logs.

---

## Development Roadmap

### In Progress

- **Supply-chain hardening:** Trivy + OSV-Scanner on every merge; CycloneDX/SPDX SBOM; Cosign sign; Kyverno/OPA admit; Istio (Ambient) + Kiali + Jaeger/Tempo in values overlays for staging
- **Ouroboros:** deepen **Interview → Seed → Execute → Evaluate → Evolve** automation beyond today’s **`ouroboros_*`** MCP tools + optional Postgres lineage ([#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141), [#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142))
- **Tika + Gotenberg spec bundling:** Fetch/generate OpenAPI specs from running instances; wire into bundled providers registry
- **NATS, ClawQL-Agent (LangGraph + LangFuse), OpenClaw (approvals, dashboards), Edge Worker**

### Shipped

- Onyx bundle + `knowledge_search_onyx` — `providers/onyx/openapi.yaml`, optional `knowledge_search_onyx`, test stubs, stdio/Streamable HTTP/gRPC listTools parity; `memory_ingest` `enterpriseCitations` for vault-safe trails; ingestion op `onyx_ingest_document`

### Next

- **Flink connector pipeline deployment:** Flink job manager and task manager in the `clawql` namespace; connector jobs for Slack, Confluence, Drive, Jira, GitHub, and other Onyx sources
- **`notify` templates:** richer default messages with Onyx citation links and Paperless document links (baseline **`notify`** exists behind **`CLAWQL_ENABLE_NOTIFY`** — [`notify-tool.md`](notify-tool.md))
- **Self-hosted spec fetch config:** `STIRLING_BASE_URL`, `PAPERLESS_BASE_URL`, `TIKA_BASE_URL`, `GOTENBERG_BASE_URL`, `ONYX_BASE_URL` in `fetch-provider-specs`; runtime base URL injection for all self-hosted providers
- **Merged default updates:** Unconfigured installs use full all-providers merge; custom merge via `CLAWQL_BUNDLED_PROVIDERS` or `CLAWQL_SPEC_PATHS`
- **Digital employee templates:** Finance, DevOps, Compliance starter roles; stronger LangGraph reflection nodes
- **Fabric MVP path:** Test net + `providers/fabric` OpenAPI + Merkle/Seed anchoring + `memory_ingest` txid; lightweight single-node for audit-only deployments

### Planned

- **Cuckoo filter integration:** Ingestion path, Ouroboros Execute phase, Tika/Gotenberg output checks, Onyx knowledge retrieval cache, recall result deduplication
- **Merkle tree integration:** Per-step hashing in Ouroboros including Onyx retrieval steps as leaves; root stored in Postgres; optional `proofOfIntegrity` GraphQL endpoint
- **Hybrid memory.db (sqlite-vec):** SQLite + sqlite-vec vector sidecar alongside Obsidian vault; vector-ranked chunk retrieval; content hash for incremental re-embedding; designed as drop-in upgrade to sidecar embedding files
- **Unified Helm chart finalization:** All 12+ services including Onyx, Flink, OSV-Scanner jobs, optional Istio/Kiali, resource limits, init jobs
- **LangFuse eval loops + compliance packaging**
- **Fabric medium tier:** Ouroboros-aware Evaluate ↔ ledger queries; Onyx citation attestations; proofs in Vault; multi-org consortia onboarding

### Future

- Additional Onyx connectors via Flink (no ClawQL code changes required per new connector)
- Hybrid sqlite-vec as primary vector backend at scale
- Level-4 autonomy with human ratification gates in OpenClaw
- Community digital employee template marketplace

---

## Appendix: Fiction and roadmap

The body of this doc describes a **target experience**. The bullets below are **not** guaranteed by the open-source **`clawql-mcp`** repo alone — they are **aspirational**, **cross-repo**, or **partially implemented**. Use [`mcp-tools.md`](mcp-tools.md) and linked issues for ground truth.

**Separate products / repos**

- **OpenClaw** — governance UI, audit explorer, “digital employee” console: **not** shipped inside this repository; track integration via [#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128).
- **ClawQL-Agent** — LangGraph runtime, long-lived employees, LangFuse-heavy ops: **private / separate** from core MCP; same epic [#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128).
- **Edge Worker mode** — laptops as pooled workers: narrative only until [#129](https://github.com/danielsmithdevelopment/ClawQL/issues/129) (and related work) lands end-to-end.

**Observability & platform polish**

- **Full OTel auto-instrumentation** — automatic spans across MCP, Ouroboros, every document hop, Onyx, mesh, and OSV jobs: **partial / follow-up** ([#160](https://github.com/danielsmithdevelopment/ClawQL/issues/160)).
- **Pre-built Grafana dashboards** “for every layer” as described in prose — varies by chart overlay and env; not one guaranteed bundle.
- **Uptime Kuma** + **`schedule`** as a turnkey pair — tracked for Helm/docs ([#199](https://github.com/danielsmithdevelopment/ClawQL/issues/199)); not a default install requirement today.

**Orchestration & autonomy**

- **Invisible natural-language router** that chooses fast-path vs full Ouroboros without user intent — **product vision**, not core MCP routing.
- **Level‑4 autonomy**, **community template marketplace**, **Fabric consortium** flows beyond Merkle/`memory.db` — roadmap ([#134](https://github.com/danielsmithdevelopment/ClawQL/issues/134), [#187](https://github.com/danielsmithdevelopment/ClawQL/issues/187)).
- **End-to-end illustrative workflows** (e.g. Q1 invoice story) — **walkthrough fiction** unless you wire tools and infrastructure yourself.

**Roadmap ↔ issues**

- Parity checklist for this document vs GitHub: [#197](https://github.com/danielsmithdevelopment/ClawQL/issues/197).

---

## Local Hardware Requirements

| Scenario                 | Host Machine         | Docker Desktop Allocation          | Idle RAM | Peak RAM |
| ------------------------ | -------------------- | ---------------------------------- | -------- | -------- |
| Minimum (dev, Onyx off)  | 16 GB RAM, 6+ cores  | 8–12 GB RAM, 4–6 CPUs, 100 GB disk | 4–7 GB   | 10–12 GB |
| Recommended (full stack) | 32 GB RAM, 8+ cores  | 16–24 GB RAM, 8 CPUs, 200+ GB disk | 10–14 GB | 20–28 GB |
| Future-proof             | 64 GB RAM, 12+ cores | 32 GB RAM, 10–12 CPUs              | 14–18 GB | 30+ GB   |

**Key resource consumers:**

- Onyx + Flink: ~10–16 GB (largest sustained)
- Stirling-PDF + Tika + Gotenberg: heavy CPU/RAM spikes during OCR and batch conversions
- Paperless + isolated DBs: moderate steady usage

**Tips:**

- Allocate ≤ 75% of host RAM for headroom
- Use built-in Grafana dashboards to monitor real usage
- Set `CLAWQL_ENABLE_ONYX=false` temporarily to reduce usage by ~10 GB
- On a 32 GB / 8-core machine, allocate 16–24 GB RAM + 8 CPUs to Docker Desktop for a smooth full-stack experience

---

## Get Started

| Resource         | Link                                                                              |
| ---------------- | --------------------------------------------------------------------------------- |
| Documentation    | [docs.clawql.com](https://docs.clawql.com)                                        |
| GitHub           | [danielsmithdevelopment/ClawQL](https://github.com/danielsmithdevelopment/ClawQL) |
| npm (MCP server) | `npm install -g clawql-mcp`                                                       |
| Kubernetes       | [docs.clawql.com/kubernetes](https://docs.clawql.com/kubernetes)                  |
| Helm Chart       | [docs.clawql.com/helm](https://docs.clawql.com/helm)                              |
| Case Studies     | [docs.clawql.com/case-studies](https://docs.clawql.com/case-studies)              |
| Contact          | Daniel Smith — danielsmithdevelopment@gmail.com                                   |

---

_Local. Private. Powerful. Production-ready. Knowledge-augmented. Security-hardened. Enterprise- and agent-trusted._

_April 2026 · danielsmithdevelopment/ClawQL · docs.clawql.com_
