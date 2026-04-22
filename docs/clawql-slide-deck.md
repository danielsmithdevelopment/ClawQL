---
title: "ClawQL Deck — Full Text Transcript (April 2026)"
date: 2026-04-22T03:07:02.209Z
tags: [clawql-ingest]
clawql_ingest: true
clawql_ingest_created: "2026-04-22T03:07:02.209Z"
---

# ClawQL Deck — Full Text Transcript (April 2026)

## Related

- [[ClawQL MCP tools]]
- [[Obsidian vault memory]]

---

### Ingestion (2026-04-22T03:07:02.208Z)

_Session:_ `2026-04-21-deck-fulltext`

#### Insights

## Summary

Full-text source capture of the **ClawQL** pitch deck (35 slides, April 2026): positioning, problem/solution, MCP core (`search`, `execute`, vault memory, optional `cache`/`audit`), transports, GraphQL projection, Obsidian + cross-thread recall narrative, document pipeline (Tika → Gotenberg → Stirling → Paperless), Ouroboros five-phase loop, Cuckoo filters, Merkle trees, Slack `notify()`, eight bundled providers, Helm ten-service map, privacy/local-first, roadmap, principles, competitive framing, closing links.

## Tags / topics

#clawql #deck #transcript #mcp #openapi #helm #k8s #obsidian #document-pipeline #ouroboros #roadmap #april-2026

## Deck ↔ implementation caveat

Slides mix **shipped** behavior with **roadmap** (Ouroboros depth, Cuckoo/Merkle wiring, hybrid sqlite-vec, `notify()` rollout). Cross-check `main`, issues **#68–#72**, and `docs/mcp-tools.md` before treating marketing copy as release truth.

## Verbatim transcript

The sections below (Tool outputs + appended ingestions) preserve slide copy **in delivery order**.

#### Tool outputs

# ClawQL Deck — Full Text Transcript

_Every word from all 35 slides_

---

## Slide 1 — Title

**ClawQL**

_AI-Orchestrated API & Document Automation_

Natural language. Any API. Any document. One platform.

An MCP server that lets AI assistants discover and call any REST operation across any OpenAPI-described API — without context bloat, without custom wrappers — plus a complete local-first document pipeline and durable cross-session memory.

**PLATFORM HIGHLIGHTS**

- MCP Server (stdio / HTTP / gRPC)
- OpenAPI 3 + Swagger 2 + Discovery
- 8 Bundled Provider Specs
- Obsidian Vault Memory System
- PDF + Archive Document Pipeline
- Embedded Ouroboros Engine
- Cuckoo Filters + Merkle Trees
- Slack notify() Integration
- Unified Kubernetes Helm Chart
- Cursor-First — Local & Private

April 2026 · danielsmithdevelopment/ClawQL · docs.clawql.com

---

## Slide 2 — The Problem

**The Problem**

_Modern API integration and document automation are still unnecessarily hard_

**API Accessibility — 01**
**APIs Are Inaccessible to AI**
OpenAPI specs run to megabytes. Dumping them into an AI context window is expensive and noisy. Writing custom wrappers for every endpoint is tedious and brittle. Agents hallucinate operations that don’t exist because they have no structured way to discover what’s actually available.

**No Persistence — 02**
**Memory Dies With Every Session**
Every AI conversation starts completely blank. Architectural decisions, debugging breakthroughs, workflow history, and hard-won institutional knowledge vanish the moment the chat ends. Teams repeat the same mistakes every single session — even with the same assistant.

**Document Silos — 03**
**Documents Live in Isolated Silos**
PDFs, Word documents, spreadsheets, HTML, email, and more — each requiring different tools with no unified pipeline. OCR, extraction, archiving, tagging, and full-text search require manually integrating half a dozen separate products, with no consistent orchestration layer.

---

## Slide 3 — What is ClawQL?

**What is ClawQL?**

_A TypeScript MCP server that makes AI assistants genuinely capable of operating any API and any document workflow_

ClawQL is an MCP (Model Context Protocol) server published as clawql-mcp on npm. It bridges AI assistants — like Cursor or Claude — to any API described by OpenAPI 3, Swagger 2, or Google Discovery format.

Instead of dumping multi-megabyte API specs into the AI context window, ClawQL exposes two elegant core tools — search and execute — that let the AI discover and call any operation on demand, keeping context lean and responses accurate.

On top of the API layer sits a complete document processing pipeline (Stirling-PDF, Paperless NGX, Apache Tika, Gotenberg), an invisible workflow orchestration engine (Ouroboros), durable cross-session memory via an Obsidian vault, and a Slack notification integration — all deployed as one unified Helm chart in Kubernetes.

**API Bridge**
Discover & call any REST operation across 8 bundled providers via search + execute

**Memory Layer**
Durable Obsidian vault memory with graph-traversable wikilinks, persistent across all sessions

**Document Pipeline**
PDF, text, archive, extraction, conversion — 1,000+ formats supported end-to-end

**Orchestration Brain**
Embedded Ouroboros engine for invisible multi-step workflow automation with retry logic

npm install -g clawql-mcp · github.com/danielsmithdevelopment/ClawQL

---

## Slide 4 — Who ClawQL Is For

**Who ClawQL Is For**

_Three audiences — one platform that serves all of them from a single deployment_

**Developers & Power Users**

- Use Cursor + ClawQL MCP to operate any REST API via natural language — no postman, no curl
- Build workflows that span GitHub, Cloudflare, Google Cloud, Slack, and your own services
- Persistent Obsidian memory means decisions made in Monday’s session are recalled on Friday
- Operate your homelab (TrueNAS, Kubernetes, Paperless) the same way you operate SaaS APIs
- Document processing pipeline handles PDFs, Office files, and archives without manual tool switching
- stdio transport works seamlessly inside Cursor — no ports to configure

**Companies & Teams**

- Automate document ingestion, OCR, redaction, and archiving entirely in-house — no SaaS data exposure
- Slack notify() integration delivers workflow results to the right channel automatically
- Audit trails via Merkle trees prove every processing step — valuable for compliance
- Cuckoo filter deduplication prevents duplicate document imports at scale
- Unified Helm chart means one ops person manages the entire platform
- Extensible: add any new API by pointing ClawQL at its OpenAPI spec

**Investors & Partners**

- MCP is emerging as the standard AI tool protocol — ClawQL is early infrastructure
- 8 bundled providers covers the most valuable developer APIs out of the box
- The memory system (vault + hybrid sqlite-vec) is a genuine technical moat
- Document pipeline (Tika + Gotenberg + Stirling + Paperless) is production-grade from day one
- Local-first architecture resonates strongly with enterprise data governance requirements
- One Helm chart deployment model makes adoption and scaling straightforward

---

## Slide 5 — Section Divider: Core Platform

**01**

**Core Platform**

_The MCP server, tool surface, transport layers, GraphQL projection, and memory system that power everything_

Section 1

---

## Slide 6 — Architecture Overview

**Architecture Overview**

_Three clean layers — AI interface, ClawQL core, and the API & service targets_

**AI CLIENTS (Layer 1)**

- Cursor (stdio — primary)
- Claude Desktop
- Any MCP-compatible client
- HTTP REST consumers
- gRPC consumers

**CLAWQL CORE (Layer 2)**

- search — Operation discovery from loaded specs
- execute — REST call execution with auth injection
- memory_ingest / memory_recall — Obsidian vault durable memory
- GraphQL Projection — Response trimming for lean context
- Ouroboros Engine — Invisible workflow orchestration
- notify() + cache + audit — Slack, LRU cache, audit ring buffer

**API & SERVICE TARGETS (Layer 3)**

- GitHub
- Google Cloud
- Cloudflare
- Paperless NGX
- Stirling-PDF
- Tika
- Gotenberg
- Slack

````

#### Provenance
- **Tool:** `memory_ingest` · **UTC:** `2026-04-22T03:07:02.208Z` · **session:** `2026-04-21-deck-fulltext`
- **Section fingerprint:** SHA-256 `b8e3a22265c90494…` (canonical hash in the HTML comment below).

<!-- clawql-hash:b8e3a22265c9049498f799a1a34c995989603a5051827d1b30442534a3874470 -->

---

### Ingestion (2026-04-22T03:07:26.198Z)
_Session:_ `2026-04-21-deck-fulltext-p2`

#### Insights
#### Verbatim continuation (slides 7–12)

#### Tool outputs
```text
-----

## Slide 7 — MCP Tool Surface

**MCP Tool Surface**

*Nine tools — two core, seven extended — covering API operations, memory, code execution, notifications, and audit*

**search** — Core
Fuzzy-discovers operations and parameters from all loaded OpenAPI/Discovery specs. Returns the most relevant endpoints without dumping the full spec into context. The AI never sees more than it needs.

**execute** — Core
Calls a discovered REST operation with proper auth headers and a fully typed request body. Handles all providers — GitHub, Cloudflare, Paperless, Stirling, Slack, and more — through one consistent interface.

**memory_ingest** — Memory
Writes durable Markdown notes into an Obsidian vault on disk. Supports structured insights, optional conversation capture, tool outputs, wikilinks between notes, and frontmatter provenance metadata.

**memory_recall** — Memory
Retrieves topically relevant vault notes using keyword matching and optional graph-depth traversal (maxDepth). Returns ranked pages — not the whole vault — so context stays lean and precise.

**sandbox_exec** — Execution
Executes remote code in a Cloudflare Sandbox via a bridge. Enables agents to run code, validate outputs, and test scripts without requiring local execution infrastructure on the client side.

**ingest_external_knowledge** — Knowledge
Bulk-ingests Markdown content and optionally fetches and stores external URLs. Useful for seeding the knowledge layer with documentation, runbooks, or third-party reference material.

**notify()** — New
First-class Slack notification tool. Sends structured messages to configured channels using the bundled Slack spec and CLAWQL_SLACK_TOKEN. Called by Ouroboros at workflow milestones, completions, retries, and audit events.

**cache** — Optional
In-process LRU scratch storage for session-scoped ephemeral state. Enabled via CLAWQL_ENABLE_CACHE. Stores transient tool results, intermediate computations, or tool-discovery caches during a session.

**audit** — Optional
In-process event ring buffer for operator audit trails. Enabled via CLAWQL_ENABLE_AUDIT. Records all tool calls, execution results, and workflow events in a structured, queryable log for compliance purposes.

-----

## Slide 8 — search + execute: How API Discovery Works

**search + execute: How API Discovery Works**

*The two core tools that make any OpenAPI-described API instantly accessible without context bloat*

**search() — Step 1: Discover the right operation**

1. User asks: “Create a GitHub issue for the Cuckoo filter work”
1. search() receives query: ‘GitHub create issue POST’
1. ClawQL scans all loaded specs — only GitHub in this case
1. Returns: operationId issues_create, path POST /repos/{owner}/{repo}/issues
1. Also returns: required fields (title), optional (body, labels, assignees)
1. AI sees only the relevant operation — not 50MB of GitHub’s full spec

**execute() — Step 2: Call the operation precisely**

1. AI calls execute() with operationId: issues_create
1. ClawQL injects CLAWQL_GITHUB_TOKEN as Authorization header automatically
1. Builds POST body: { title: “…”, body: “…”, labels: […] }
1. Sends to https://api.github.com/repos/{owner}/{repo}/issues
1. GraphQL projection strips unused fields from the response
1. Returns: issue number, URL, and status — exactly what AI needs, nothing more

**Key insight:** The AI never sees the full OpenAPI spec. search() returns only the relevant slice. execute() handles all auth and HTTP mechanics transparently.

-----

## Slide 9 — Memory System: Obsidian Vault

**Memory System: Obsidian Vault**

*Durable, graph-connected, cross-session memory that works with any assistant — not just the current one*

**How the Memory System Works**

**Ingest**
memory_ingest() writes Markdown notes to an Obsidian vault on disk. Notes include structured insights, wikilinks to related pages, frontmatter provenance (when, what), and optional conversation capture. Use stable, append-friendly note titles so runbooks accumulate instead of fragment.

**Graph**
[[wikilinks]] between notes build Obsidian’s graph. memory_recall() can traverse this graph via maxDepth — so a query for ‘Cuckoo filters’ surfaces not just that note, but linked architecture pages, GitHub issue references, and related design decisions.

**Recall**
In a fresh Cursor session (hours, days, or weeks later), memory_recall() returns ranked, topically relevant pages. The AI gets exactly enough context — not the whole vault. Hybrid sqlite-vec vector embeddings (roadmap) will make recall even more precise.

**Why This Changes Everything**

- Plans made in a Grok or Claude session can be recalled in Cursor the next day
- Architectural decisions persist across months — no more re-explaining context
- memory_ingest after any significant workflow builds a living runbook automatically
- Cross-tool: ingest from Claude, recall in Cursor — vault is tool-agnostic
- After recall, search + execute can file GitHub issues from the recalled plan — no copy-paste
- After document workflows, Ouroboros auto-ingests summaries with Merkle roots and document IDs
- Hybrid memory.db sidecar (SQLite + sqlite-vec) planned for vector-ranked chunk retrieval

-----

## Slide 10 — Cross-Thread Recall: The Killer Feature

**Cross-Thread Recall: The Killer Feature**

*This is what separates ClawQL from every other MCP server*

**REAL CASE STUDY — April 2026**

**The Situation**
A detailed Cuckoo filter + hybrid memory architecture was designed and discussed in a Grok session. The plan was never committed to GitHub. No code was written. The design only existed in that conversation.

**Without ClawQL:**
A fresh Cursor session finds nothing in the repo. The answer is “no Cuckoo filter references found” — accurate but completely misleading. The plan is effectively lost.

**With ClawQL memory_recall:**
The Grok summary was ingested into the vault. memory_recall(‘Cuckoo filter hybrid memory’) surfaces the full design, env vars, sqlite-vec wiring, and Merkle semantics — then search + execute files GitHub epic #68 and children #69–72 from that recalled context.

**THE WORKFLOW**

1. **Session A (any tool)** — Work on architecture. At end of session, memory_ingest() a stable summary note with wikilinks.
1. **Session B (fresh — any tool)** — Run memory_recall(‘topic’) at the start. Cursor gets ranked vault pages — no pasting, no context reloading.
1. **Synthesize + Act** — AI combines recalled vault context with current repo state. No contradictions. No stale data.
1. **File the Work** — search() + execute() on GitHub API converts recalled plans directly into issues — epic + children. Zero copy-paste.

-----

## Slide 11 — Transport Layers & GraphQL Projection

**Transport Layers & GraphQL Projection**

*Three ways to connect; one layer that keeps responses lean regardless of provider*

**stdio ← PRIMARY**
Primary transport for Cursor. Zero configuration — point Cursor’s MCP settings at the clawql-mcp binary. Runs in-process, sub-millisecond latency, no ports to open, no auth tokens to configure on the transport layer. This is how you use ClawQL daily.
USE CASE: Daily development in Cursor

**Streamable HTTP**
Exposes ClawQL at /mcp over HTTP for remote deployments — including the Kubernetes cluster. Enables web-based MCP clients, CI/CD pipelines, and automated agents to call ClawQL without running a local process. Supports streaming responses for long-running operations.
USE CASE: K8s deployment, remote agents

**gRPC (optional)**
High-performance protobuf MCP transport on port 50051, enabled via ENABLE_GRPC=true. Powered by the reusable mcp-grpc-transport npm package. Best for high-throughput internal service communication — e.g. Ouroboros calling ClawQL tools at volume inside the cluster.
USE CASE: High-throughput internal calls

**GraphQL Projection Layer — Keeping Responses Lean**

Without projection: A Cloudflare zone list returns ~85 fields per zone. A GitHub PR response is ~200 fields. Dumping these into the AI context wastes tokens and buries the useful signal in noise.

With ClawQL’s GraphQL projection: execute() passes the response through an in-process GraphQL layer that returns only the fields the AI explicitly requested. A zone list might return only {id, name, status}. A PR returns only {number, title, state, mergeable}. Context stays clean.

-----

## Slide 12 — Section Divider: Document Pipeline

**02**

**Document Pipeline**

*Stirling-PDF · Paperless NGX · Apache Tika · Gotenberg — four services, one unified orchestration layer*

Section 2
````

#### Provenance

- **Tool:** `memory_ingest` · **UTC:** `2026-04-22T03:07:26.198Z` · **session:** `2026-04-21-deck-fulltext-p2`
- **Section fingerprint:** SHA-256 `55c3680a8214f1da…` (canonical hash in the HTML comment below).

<!-- clawql-hash:55c3680a8214f1da8a706ff770ccd2bd4f33f1639137176ac526ec7fad1da8af -->

---

### Ingestion (2026-04-22T03:07:59.524Z)

_Session:_ `2026-04-21-deck-fulltext-p3`

#### Insights

#### Verbatim continuation (slides 13–18)

#### Tool outputs

```text
-----

## Slide 13 — Document Pipeline Overview

**Document Pipeline Overview**

*Four specialized services forming a complete, format-agnostic document processing and archival system*

**Apache Tika** → **Gotenberg** → **Stirling-PDF** → **Paperless NGX**

**Apache Tika**
DNS: tika:9998 | Ingress: internal only
Universal text & metadata extraction from 1,000+ file formats. The pipeline’s intake layer.

- PDF text extraction
- Office: Word/Excel/PPT
- HTML, XML, email (.eml)
- OCR fallback via Tesseract
- Metadata: author, dates, lang
- 1,000+ MIME types supported

**Gotenberg**
DNS: gotenberg:3000 | Ingress: internal only
High-fidelity document conversion to PDF using headless Chromium and LibreOffice.

- HTML → PDF (Chromium)
- Markdown → PDF
- Office → PDF (LibreOffice)
- URL → PDF screenshot
- Merge + split in conversion
- Header/footer injection

**Stirling-PDF**
DNS: stirling-pdf:8080 | Ingress: pdf.clawql.local
Heavy PDF manipulation engine — the pipeline’s processing workhorse after conversion.

- Merge / split PDFs
- High-accuracy OCR
- PII redaction (SSN, etc)
- Sign & certify
- Compress & optimize
- Batch processing

**Paperless NGX**
DNS: paperless:8000 | Ingress: paperless.clawql.local
Long-term archive with Tika-powered OCR, auto-tagging, full-text search, and consumption inbox.

- Auto-tag by content
- Correspondent tracking
- Full-text search index
- Consumption inbox folder
- Tika as parser backend
- Isolated Postgres + Redis

-----

## Slide 14 — Stirling-PDF: The PDF Manipulation Engine

**Stirling-PDF: The PDF Manipulation Engine**

*stirlingtools/stirling-pdf:latest · Internal DNS: stirling-pdf:8080 · Ingress: pdf.clawql.local*

**Merge & Split**
Combine multiple PDFs into one document. Split a PDF into individual pages or defined page ranges. Reorder pages within a document. Extract specific pages into new files.

**High-Accuracy OCR**
Convert scanned PDFs into fully searchable, text-extractable documents. Supports multiple languages. Configurable accuracy settings — higher settings trigger automatic retry in Ouroboros if quality threshold isn’t met.

**PII Redaction**
Automatically detect and redact sensitive information: SSNs, credit card numbers, dates of birth, custom regex patterns. Redaction is cryptographically verified via Merkle tree before Paperless import.

**Sign & Certify**
Apply digital signatures to PDFs. Create certified archive copies. Useful for compliance workflows where document integrity must be proven — paired with Merkle tree root storage in Postgres.

**Compress & Optimize**
Reduce PDF file sizes for long-term storage in Paperless. Optimize image quality vs. file size tradeoff. Batch compression across entire document sets during import workflows.

**Batch Operations**
Process entire folders of documents in a single API call. Combine with Paperless consume folder for hands-free batch ingestion. Ouroboros orchestrates batch jobs with per-file progress tracking and error recovery.

Config: DOCKER_ENABLE_SECURITY=false — removes the 5-user SaaS restriction for unlimited self-hosted use. No rate limits, no user caps.

-----

## Slide 15 — Paperless NGX: The Long-Term Archive

**Paperless NGX: The Long-Term Archive**

*paperlessngx/paperless-ngx:latest · Internal DNS: paperless:8000 · Ingress: paperless.clawql.local*

**Core Capabilities**

- Full-text search across all archived documents (powered by Tesseract OCR + Tika parser)
- Auto-tagging by document content, date, correspondent, and type
- Correspondent tracking — associate documents with senders/issuers (e.g. ‘IRS’, ‘Bank of America’)
- Consumption inbox folder — drop files in, Paperless ingests and tags automatically
- Document versioning and update tracking
- Custom field definitions for domain-specific metadata
- REST API (OpenAPI spec at /api/schema/) — what ClawQL uses for search + execute
- Bulk import, export, and migration tools

**Tika Integration**
Paperless is configured with TIKA_ENABLED=true and TIKA_URL=http://tika:9998. This replaces Paperless’s built-in parser with Apache Tika, extending support from basic PDFs to 1,000+ formats including Office documents, emails, and archives — all ingested natively.

**Isolated Backends**
Paperless runs with its own dedicated Postgres (paperless-postgres:5432) and Redis (paperless-redis:6379) instances — isolated from ClawQL’s shared backends to prevent schema conflicts. Both are included in the unified Helm chart.

OpenAPI spec fetched from /api/schema/ and bundled as providers/paperless.json. Runtime base URL injected via PAPERLESS_BASE_URL at spec refresh time.

-----

## Slide 16 — Apache Tika: Universal Content Extraction

**Apache Tika: Universal Content Extraction**

*apache/tika:latest · Internal DNS: tika:9998 · Internal-only service*

Apache Tika is the pipeline’s intake layer — the universal translator that extracts text, metadata, and structure from virtually any file format. Tika backs both Paperless NGX (as parser) and standalone extraction calls from Ouroboros.

**Documents**

- PDF (text + scanned via OCR)
- Microsoft Word (.doc, .docx)
- Microsoft Excel (.xls, .xlsx)
- Microsoft PowerPoint (.ppt, .pptx)
- LibreOffice / OpenDocument
- Rich Text Format (RTF)

**Web & Markup**

- HTML / XHTML
- XML and derived formats
- JSON (structured extraction)
- RSS / Atom feeds
- SVG (text content)
- CSS (text extraction)

**Email & Archive**

- Email (.eml, .msg)
- ZIP / TAR / GZip archives
- RAR / 7-Zip archives
- Outlook PST / OST mailboxes
- mbox mail archives
- Thunderbird mail files

**Media & Other**

- JPEG / PNG / TIFF (EXIF)
- Audio metadata (MP3, FLAC)
- Video metadata (MP4, MKV)
- ePub / MOBI eBooks
- iCal / vCard
- Source code (30+ languages)

1,000+ MIME types supported. Tika drives metadata-informed routing decisions in Ouroboros — e.g. detecting Office files and routing to Gotenberg before Stirling.

-----

## Slide 17 — Gotenberg: High-Fidelity Document Conversion

**Gotenberg: High-Fidelity Document Conversion**

*gotenberg/gotenberg:8 · Internal DNS: gotenberg:3000 · Internal-only service*

Gotenberg converts any document type to PDF with pixel-accurate rendering. It uses headless Chromium for HTML/URL-to-PDF and LibreOffice for Office-to-PDF. In the pipeline, it sits between Tika (detection) and Stirling (manipulation) — ensuring everything is a clean PDF before processing.

**HTML → PDF (Chromium)**
Full Chromium rendering engine converts HTML pages to PDF with exact visual fidelity — fonts, CSS, JavaScript-rendered content, flexbox layouts. Supports custom headers, footers, margins, and paper sizes. Ideal for invoice templates, report generation, and web-scraped content archival.

**Office → PDF (LibreOffice)**
LibreOffice converts Word (.doc, .docx), Excel (.xls, .xlsx), PowerPoint (.ppt, .pptx), and OpenDocument formats to PDF with high layout fidelity. Critical for the pipeline when users drop Office files into the Paperless consume folder — Gotenberg converts them before Stirling processes.

**Markdown → PDF**
Converts Markdown documents to styled PDFs. Useful for technical documentation, runbooks, and meeting notes stored in markdown. Supports syntax highlighting, tables, and embedded images. Often triggered when exporting vault notes or developer documentation for archival.

**URL → PDF (Screenshot)**
Navigates to any URL using Chromium and renders a full-page PDF. Headers, footers, and JavaScript-rendered content are all captured. Useful for archiving web pages, terms of service snapshots, invoices from web portals, or any URL-based document that needs to be preserved.

**PDF Merge (in conversion)**
Gotenberg can merge multiple PDF files in a single conversion request — before Stirling receives them. This allows Ouroboros to batch-convert a folder of Office files and merge them in one Gotenberg call, rather than a separate Stirling merge step, for efficiency.

**Header & Footer Injection**
Inject custom HTML headers and footers into converted PDFs — company logos, page numbers, date stamps, document reference numbers, or confidentiality notices. Driven by Ouroboros workflow parameters so each document class can have its own footer template.

-----

## Slide 18 — Complete Pipeline: Step by Step

**Complete Pipeline: Step by Step**

*A real Cursor session — from natural language to archived, verified, notified*

You type in Cursor: “Take the Q1 invoices from the consume folder, process everything, redact SSNs, import to Paperless tagged ‘Q1-2026-invoices’, and notify #finance on Slack.”

**1 — Tika: Extract & Detect**
Tika analyzes each file: PDFs pass through, Office files (Word/Excel) are flagged for conversion, damaged files are reported. Metadata extracted: author, creation date, language, MIME type — drives all downstream routing decisions.

**2 — Gotenberg: Convert to PDF**
All non-PDF files (Word invoices, Excel statements) are converted to PDF by Gotenberg using LibreOffice. Cuckoo filter checks: is this converted PDF already in the pipeline? If yes, skip. Result: a clean set of PDFs.

**3 — Stirling: Merge + OCR + Redact**
Stirling merges all PDFs into one document, runs high-accuracy OCR so text is fully searchable, then redacts all SSN patterns. Merkle tree hashes each step output. Ouroboros checks OCR quality — if below threshold, retries with higher accuracy settings automatically.

**4 — Paperless: Import & Archive**
Cuckoo filter: has this document hash been imported before? No. Paperless imports the merged, OCR’d, redacted PDF — assigns tags [‘Q1-2026-invoices’], auto-detects correspondent. Returns document ID #5102. Tika re-parses for full-text search index.

**5 — Slack: notify() fires**
notify() calls execute() against the Slack spec: posts to #finance — “✅ Q1 invoice batch complete. 14 files merged, OCR’d, SSNs redacted. Document #5102 archived in Paperless. Merkle root: a3f9…” — with timestamp and link.

**6 — Vault: memory_ingest**
Ouroboros auto-ingests a summary note: which files were processed, document ID, Merkle root, OCR quality score, any retries, Slack notification confirmation. Future sessions can memory_recall(‘Q1 invoices 2026’) and get the full history.
```

#### Provenance

- **Tool:** `memory_ingest` · **UTC:** `2026-04-22T03:07:59.524Z` · **session:** `2026-04-21-deck-fulltext-p3`
- **Section fingerprint:** SHA-256 `3c6363e531099cf3…` (canonical hash in the HTML comment below).

<!-- clawql-hash:3c6363e531099cf382606c53f6ee685a8069b3367e3692a0753b6c4e612621e1 -->

---

### Ingestion (2026-04-22T03:08:35.109Z)

_Session:_ `2026-04-21-deck-fulltext-p4`

#### Insights

#### Verbatim continuation (slides 19–24)

#### Tool outputs

```text
-----

## Slide 19 — Section Divider: Intelligence Layer

**03**

**Intelligence Layer**

*Ouroboros · Cuckoo Filters · Merkle Trees · notify() — the invisible brain that makes workflows self-orchestrating*

Section 3

-----

## Slide 20 — Ouroboros: The Invisible Orchestration Engine

**Ouroboros: The Invisible Orchestration Engine**

*Embedded in the ClawQL pod — no separate service, no visible commands, no learning curve*

**What Ouroboros Is**
Ouroboros is a TypeScript-ported structured workflow engine that runs entirely in-process inside the ClawQL pod. It is the reason users can write complex multi-step requests in natural language and get reliable, verified results.

It is completely invisible to the user. There is no ‘ooo’ prefix, no workflow command, no mode switch. ClawQL’s routing layer silently decides whether to fast-path a simple request directly to search/execute, or hand a complex request to Ouroboros.

All Ouroboros tool calls use ClawQL’s own internal tool executor registry — so they are in-process, not additional network hops. Seeds (immutable workflow specifications) and evaluation logs are stored in shared Postgres.

**Routing: Fast Path vs Ouroboros**

FAST PATH (simple, single-step):
“Search Paperless for invoice #123” → direct search + execute against Paperless API. No Ouroboros. Milliseconds.

OUROBOROS PATH (complex, multi-step):
“Merge the Q1 invoices, OCR them, redact SSNs, import to Paperless, notify Slack” → Ouroboros Interview → Seed → Execute → Evaluate → Evolve. Full structured loop, invisible to user.

The routing layer uses lightweight intent and ambiguity analysis on every message. The user never picks which path — ClawQL decides.

Ouroboros is compiled into the ClawQL Docker image — rebuild the image, roll to Kubernetes. Zero new pods. Zero new services. Zero visible commands.

-----

## Slide 21 — The Ouroboros Loop: 5 Phases

**The Ouroboros Loop: 5 Phases**

*Every complex workflow passes through all five phases — invisibly, automatically, with automatic retry*

**1 — Interview**
Ouroboros analyzes the user’s request for ambiguity. If the task is fully specified, this phase is skipped and execution proceeds immediately. If key details are missing (e.g. ‘which folder?’ ‘what redaction scope?’), ClawQL replies with one natural clarifying question. No jargon, no technical prompts — just conversation.

**2 — Seed**
Creates an immutable workflow specification — the ‘Seed’ — containing the full task description and measurable acceptance criteria. The Seed is stored in shared Postgres immediately. It never changes. All subsequent phases evaluate against this criteria. This is the foundation of verifiable, auditable AI automation.

**3 — Execute**
Decomposes the Seed into an ordered sequence of tool calls and executes them using ClawQL’s internal tool executor registry. Tika → Gotenberg (if needed) → Stirling → Cuckoo check → Paperless → notify(). Each step’s output is hashed and added to the Merkle tree. All calls are in-process — no extra network hops.

**4 — Evaluate**
Checks each result against the Seed’s acceptance criteria. OCR confidence score measured. SSN redaction verified by pattern scan. Paperless import confirmation ID validated. Slack delivery confirmed. If all criteria pass, Ouroboros proceeds to completion. Any failure triggers Evolve.

**5 — Evolve**
If any criterion fails, Ouroboros automatically adjusts and retries. OCR below threshold? Retry with higher accuracy settings. Paperless import timeout? Retry with backoff. After successful retry, re-evaluates from scratch. Retry history is logged to Postgres. If evolution exhausts retry budget, reports failure conversationally with exact reason.

-----

## Slide 22 — Cuckoo Filters: O(1) Deduplication

**Cuckoo Filters: O(1) Deduplication**

*Probabilistic membership testing with deletion support — keeping the pipeline fast at scale*

A Cuckoo filter answers “have I seen this before?” in O(1) time with very low false positive rates. Unlike Bloom filters, it supports deletions — meaning documents can be removed from the deduplicated set without rebuilding. Configured via CLAWQL_CUCKOO_* environment variables.

**Stirling → Paperless Ingestion**
WHEN: Before every Paperless import call
Computes a hash of the processed PDF (post-OCR, post-redact). Checks the filter: has this exact document been imported before? If yes — skip. This prevents duplicate imports at scale without requiring a full database scan on every ingestion.

**Ouroboros Execute Phase**
WHEN: Before each new Seed execution begins
Checks whether an identical Seed (same hash of task specification + inputs) has already been evaluated. If yes, Ouroboros returns the cached result immediately. Prevents re-running identical multi-step workflows — important when Cursor sessions overlap or retry.

**Tika/Gotenberg Output Checks**
WHEN: After each conversion or extraction step
Before passing a converted PDF to the next pipeline stage, the Cuckoo filter checks if this exact converted output already exists downstream. This prevents re-processing the same intermediate artifact if the pipeline is interrupted and resumed mid-run.

**ClawQL MCP Layer**
WHEN: During tool-discovery caching
Caches tool-discovery result patterns and detects duplicate tool-call sequences. If the AI makes the same search() call twice in a session, the second call returns from the cached result set rather than re-scanning all specs — reducing latency for repetitive operations.

-----

## Slide 23 — Merkle Trees: Cryptographic Audit Trails

**Merkle Trees: Cryptographic Audit Trails**

*Tamper-evident, verifiable proof that every processing step produced the correct result*

A Merkle tree hashes each processing step’s output into a leaf node. The root hash proves the entire chain — if any step’s output was tampered with, the root changes. ClawQL stores the Merkle root in Postgres after every Ouroboros workflow. Configured via CLAWQL_MERKLE_* environment variables.

**Merkle Tree Structure (Ouroboros Workflow)**

- ROOT HASH (stored in Postgres)
  - Hash(L1+L2)
    - L1: Tika extract
    - L2: Stirling OCR
  - Hash(L3+L4)
    - L3: Stirling redact
    - L4: Paperless import

Root stored in Postgres. Optional proofOfIntegrity GraphQL endpoint for external audit.

**Where Merkle Trees Are Used**

**Ouroboros Step Outputs**
Each phase (Interview/Execute/Evaluate/Evolve) output becomes a leaf. Root proves the entire workflow ran correctly and in order. Stored in Postgres after every completed workflow.

**Post-Stirling PDF Verification**
After merge/OCR/redact, Merkle root proves the processed PDF hasn’t been tampered with. Efficient chunk-level proof for any specific page without re-hashing the whole doc.

**Paperless Archive Versioning**
When documents are updated or re-exported, Merkle tree enables efficient version proofs — proving what changed between versions without storing full copies.

**GraphQL Response Integrity**
Optional Merkle root for cross-session GraphQL response consistency checks. Proves that API responses haven’t been altered between caching and delivery.

-----

## Slide 24 — notify() + Slack Integration

**notify() + Slack Integration**

*First-class MCP tool for structured Slack notifications at any workflow milestone*

**How notify() Works**
notify() is a first-class MCP tool that internally calls execute() against the bundled Slack OpenAPI spec. It authenticates using CLAWQL_SLACK_TOKEN (a Slack Bot Token with chat:write scope at minimum). Because it uses the bundled spec, search() can also discover any other Slack operation — channel listing, user lookup, file uploads — for use in custom workflows.

**When Ouroboros Calls notify()**

- Workflow Completion: ✅ Q1 invoice batch complete. 14 files → doc #5102. Merkle: a3f9…
- Auto-Retry Event: ⚠️ OCR quality 0.87 on page 3, retrying with accuracy=high…
- Failure / Escalation: 🚨 Workflow failed after 3 retries: Paperless timeout. Manual review needed.
- Audit / Compliance: 📋 Workflow audit: 6 steps, Merkle root stored, doc #5102 archived. Log ID: wf-2026-04.

**Slack as a Full Bundled Provider**
The Slack spec is retained in providers/slack.json as one of the eight default bundled providers. This means search() + execute() can target the full Slack API — not just notifications. Custom workflows can post file uploads, look up users, create channels, or read message history from within any Ouroboros workflow.

**Token & Permission Setup**

- CLAWQL_SLACK_TOKEN in Helm values.yaml
- Minimum scope: chat:write for notify()
- Add files:write for attachment uploads
- Add channels:read for channel lookup
- Bot must be invited to target channels
```

#### Provenance

- **Tool:** `memory_ingest` · **UTC:** `2026-04-22T03:08:35.109Z` · **session:** `2026-04-21-deck-fulltext-p4`
- **Section fingerprint:** SHA-256 `c329a742398fd0bf…` (canonical hash in the HTML comment below).

<!-- clawql-hash:c329a742398fd0bfda82b76817391e4d27d773a821aa26de1848806f1c60edd8 -->

---

### Ingestion (2026-04-22T03:08:56.750Z)

_Session:_ `2026-04-21-deck-fulltext-p5`

#### Insights

#### Verbatim continuation (slides 25–30)

#### Tool outputs

```text
-----

## Slide 25 — Section Divider: Infrastructure

**04**

**Infrastructure**

*Default merge: Google top50 + 7 bundled REST vendors · Unified Helm chart · 10 services · One deployment · Privacy-first*

Section 4

-----

## Slide 26 — Bundled Providers: The Default Stack

**Bundled Providers: The Default Stack**

*Default install (`default-multi-provider`): Google top50 + Cloudflare + GitHub + Slack + Paperless + Stirling + Tika + Gotenberg — one merged search/execute index*

**GitHub**
providers/github.json | Auth: CLAWQL_GITHUB_TOKEN
Issue tracking, PR management, repo operations. Used by ClawQL’s own tooling — the cross-thread recall case study files GitHub issues directly from recalled vault plans.

**Google Cloud**
providers/google (bundled Cloud manifest) | Auth: CLAWQL_GOOGLE_ACCESS_TOKEN
~50 curated Google Discovery services merged: GKE, Drive, Calendar, Gmail, BigQuery, Cloud Run, and more. The most comprehensive cloud provider bundle.

**Cloudflare**
providers/cloudflare.json | Auth: CLAWQL_CLOUDFLARE_API_TOKEN
Workers, DNS, zones, custom domains, KV, R2. Used to deploy and operate docs.clawql.com — the documentation site is built and maintained via ClawQL execute() calls.

**Paperless NGX**
providers/paperless.json | Auth: PAPERLESS_BASE_URL (self-hosted)
Document archive API. Fetched from self-hosted instance at /api/schema/. Runtime base URL injection via PAPERLESS_BASE_URL. CLAWQL_BUNDLED_OFFLINE=1 prevents re-fetch.

**Stirling-PDF**
providers/stirling.json | Auth: STIRLING_BASE_URL (self-hosted)
PDF manipulation API. Fetched from /v3/api-docs. Runtime base URL injection. All Stirling operations (merge, OCR, redact, sign) are discoverable via search() and callable via execute().

**Slack**
providers/slack.json | Auth: CLAWQL_SLACK_TOKEN
Powers the notify() tool and full Slack API access. chat.postMessage, files.upload, channels.read, and more — all discoverable and callable. Bot Token with appropriate scopes.

**Apache Tika**
providers/tika.json | Auth: TIKA_BASE_URL (self-hosted)
Universal extraction API. 1,000+ format support. Fetched from self-hosted instance. Ouroboros calls Tika via execute() for metadata-driven routing decisions in every document workflow.

**Gotenberg**
providers/gotenberg.json | Auth: GOTENBERG_BASE_URL (self-hosted)
Document conversion API. HTML, Markdown, Office → PDF. Fetched from self-hosted instance. Triggered by Ouroboros when Tika detects non-PDF input files in a document workflow.

Removed from defaults: n8n (replaced by Ouroboros), Sentry (not in scope), Jira / Bitbucket (GitHub covers issue tracking). Still addable via CLAWQL_SPEC_PATH.

-----

## Slide 27 — Unified Kubernetes Helm Chart

**Unified Kubernetes Helm Chart**

*One helm install command deploys the entire platform — all 10 services, all secrets, all ingress rules*

**charts/clawql-full-stack**

`helm install clawql charts/clawql-full-stack --namespace clawql`

- Single values.yaml controls every service — env vars, secrets, resource limits, ingress rules
- CLAWQL_BUNDLED_OFFLINE=1 enforced by default — no external spec fetches at runtime
- Namespace: clawql — all services co-located, internal DNS works out of the box
- Init jobs: validate specs and inject base URLs for Tika, Gotenberg, Stirling, Paperless
- Resource tuning: Stirling and Tika get higher CPU/memory limits for batch OCR/conversion
- Secrets: CLAWQL_SLACK_TOKEN, API tokens, PAPERLESS_BASE_URL — all in one values.yaml
- Ingress: clawql.local, pdf.clawql.local, paperless.clawql.local (configurable in values)
- Paperless isolated Postgres and Redis included — no external DB dependency
- Rolling updates: rebuild ClawQL image, helm upgrade — zero-downtime in most cases

**Spec Refresh Command**
`npm run fetch-provider-specs`
Accepts environment variables:

- STIRLING_BASE_URL
- PAPERLESS_BASE_URL
- TIKA_BASE_URL
- GOTENBERG_BASE_URL

Fetches specs from running self-hosted instances and saves to providers/. Run once after new service deployment.

**Runtime Base URL Injection**
Self-hosted provider specs contain servers: entries pointing at internal k8s DNS (stirling-pdf:8080, tika:9998, etc). Values are injected at runtime via the same mechanism as auth headers in auth-headers.ts — making the same bundle work across dev and prod cluster topologies.

-----

## Slide 28 — Complete Service Map

**Complete Service Map**

*All 10 services in the clawql namespace — one Helm release, one namespace, one kubectl context*

|Service               |Internal DNS           |Ingress               |Role                                                                                        |
|----------------------|-----------------------|----------------------|--------------------------------------------------------------------------------------------|
|ClawQL MCP + Ouroboros|clawql:3000            |clawql.local          |Central brain — MCP server, routing, Ouroboros engine, GraphQL proxy, tool executor registry|
|Stirling-PDF          |stirling-pdf:8080      |pdf.clawql.local      |PDF manipulation — merge, split, OCR, redact, sign, compress, batch ops                     |
|Paperless NGX         |paperless:8000         |paperless.clawql.local|Long-term archive — Tika parser, auto-tagging, full-text search, consumption inbox          |
|Apache Tika           |tika:9998              |— (internal only)     |Universal extraction — 1,000+ formats, OCR fallback, Paperless parser backend               |
|Gotenberg             |gotenberg:3000         |— (internal only)     |Document conversion — HTML/Markdown/Office/URL → PDF via Chromium + LibreOffice             |
|Redis (shared)        |redis:6379             |— (internal only)     |ClawQL + Ouroboros — workflow queues, progress pub/sub, session state                       |
|Postgres (shared)     |postgres:5432          |— (internal only)     |ClawQL + Ouroboros — Seeds, eval logs, Merkle roots, metadata, audit trails                 |
|Paperless Postgres    |paperless-postgres:5432|— (internal only)     |Paperless internal schema only — isolated to prevent conflicts with ClawQL DB               |
|Paperless Redis       |paperless-redis:6379   |— (internal only)     |Paperless task queue only — Celery workers for background OCR and ingestion                 |

-----

## Slide 29 — Privacy, Security & Local-First Architecture

**Privacy, Security & Local-First Architecture**

*Everything runs in your cluster — no cloud, no SaaS data exposure, no per-user limits*

**100% Local Execution**
Every service — ClawQL, Stirling-PDF, Paperless, Tika, Gotenberg, Redis, Postgres — runs inside your Docker Desktop Kubernetes cluster. Documents never leave your machine. API calls go directly from your cluster to the external API providers (GitHub, Cloudflare, etc.) with your own tokens.

**No SaaS Limits or Subscriptions**
Stirling-PDF runs with DOCKER_ENABLE_SECURITY=false — removing the 5-user SaaS restriction. Paperless NGX is fully open source with no document limits. No monthly fees, no user caps, no seat licenses. The entire platform is self-hosted with your own infrastructure.

**Token Isolation**
Each provider token (CLAWQL_GITHUB_TOKEN, CLAWQL_CLOUDFLARE_API_TOKEN, CLAWQL_SLACK_TOKEN, etc.) is isolated in Kubernetes Secrets and injected only into the ClawQL process. Tokens never appear in logs, never leave the cluster, and are never shared between provider contexts.

**Vault Memory Privacy**
The Obsidian vault lives on your local filesystem at CLAWQL_OBSIDIAN_VAULT_PATH. Memory notes never leave your machine. memory_ingest explicitly prohibits storing secrets — only summarized, redacted configuration and workflow outcomes are persisted. The hybrid memory.db sidecar is also local.

**Cryptographic Integrity**
Every Ouroboros workflow step is hashed into a Merkle tree. The root is stored in Postgres. Any tampering with processed documents or workflow records is immediately detectable by recomputing the tree. This provides compliance-grade audit trails without any third-party involvement.

**CLAWQL_BUNDLED_OFFLINE=1**
In production, CLAWQL_BUNDLED_OFFLINE=1 is enforced in the Helm chart. This prevents ClawQL from ever fetching provider specs from the network — all spec files are pre-bundled in the Docker image. No outbound traffic for spec loading. No dependency on external registries at runtime.

-----

## Slide 30 — Section Divider: Roadmap & Vision

**05**

**Roadmap & Vision**

*What’s built, what’s being built, and where ClawQL is going*

Section 5
```

#### Provenance

- **Tool:** `memory_ingest` · **UTC:** `2026-04-22T03:08:56.750Z` · **session:** `2026-04-21-deck-fulltext-p5`
- **Section fingerprint:** SHA-256 `5be0e2bd6a736fdd…` (canonical hash in the HTML comment below).

<!-- clawql-hash:5be0e2bd6a736fdd723b53c8bb14025bfb29f049224e891fe625eb68e03e193c -->

---

### Ingestion (2026-04-22T03:09:21.580Z)

_Session:_ `2026-04-21-deck-fulltext-p6`

#### Insights

#### Verbatim continuation (slides 31–35)

#### Tool outputs

---

## Slide 31 — Real-World Demo: The Complete Workflow

**Real-World Demo: The Complete Workflow**

_One Cursor message. Everything else is automatic._

You type in Cursor:
“Take the Q1 invoices from my Paperless consume folder, extract text and metadata, convert any Office files to PDF, merge everything, run high-accuracy OCR, redact all SSNs and credit card numbers, import to Paperless tagged ‘Q1-2026-invoices’ with correspondent ‘IRS’, notify #finance on Slack when done.”

**Routing:** ClawQL intent analysis: multi-step complex task detected → routes silently to Ouroboros. User sees no change.

**Interview:** Task is fully specified. No clarifying questions needed. Ouroboros creates Seed in Postgres: criteria set for OCR confidence, redaction, and import confirmation.

**Tika:** 14 files analyzed: 9 PDFs, 3 Word docs, 2 Excel files. Office files flagged for Gotenberg. Language: English. Author metadata extracted.

**Gotenberg:** 3 Word docs + 2 Excel files → PDF via LibreOffice. Cuckoo filter: none of these converted PDFs have been seen before. Proceeds.

**Stirling:** 14 PDFs merged → 1 document. High-accuracy OCR run. SSN and credit card patterns redacted. Merkle tree: 5 leaf hashes generated, root computed.

**Evaluate:** Ouroboros checks all criteria: OCR confidence 0.97 ✓, zero PII patterns remaining ✓, Merkle root stored in Postgres ✓. Proceeding to import.

**Paperless:** Cuckoo filter: document hash not seen before ✓. Imported as document #5102 with tags [‘Q1-2026-invoices’], correspondent ‘IRS’. Tika re-parses for full-text index.

**notify():** execute() → Slack API → #finance: “✅ Q1 invoice batch complete. 14 files → doc #5102. Merkle: a3f9… | April 21, 2026 17:42”

**Vault:** memory_ingest() writes summary note: files processed, doc ID, Merkle root, OCR score. Future sessions can recall(‘Q1 invoices 2026’) and get the full history.

What the user sees in Cursor: “Done. 14 files processed, merged, OCR’d, PII redacted, archived as doc #5102 in Paperless, and #finance has been notified on Slack.”

---

## Slide 32 — Development Roadmap

**Development Roadmap**

_What’s being built — ordered by dependency, not priority_

**IN PROGRESS — Ouroboros TypeScript Port**
Full Interview → Seed → Execute → Evaluate → Evolve loop embedded in ClawQL pod. In-process tool executor registry. Seeds and logs to shared Postgres.

**DONE — Tika + Gotenberg + default merge**
Bundled OpenAPI stubs under `providers/`; the **default** multi-provider merge includes Tika, Gotenberg, Paperless, Stirling, and Slack alongside Google top50, Cloudflare, and GitHub.

**NEXT — notify() Tool Implementation**
New MCP tool wrapping Slack chat.postMessage (+ ephemeral, file upload). Uses internal execute() against bundled Slack spec + CLAWQL_SLACK_TOKEN.

**NEXT — Self-Hosted Spec Fetch Config**
STIRLING_BASE_URL, PAPERLESS_BASE_URL, TIKA_BASE_URL, GOTENBERG_BASE_URL in fetch-provider-specs. Runtime base URL injection for self-hosted providers.

**PLANNED — Cuckoo Filter Integration**
In ingestion path (Stirling → Paperless) and Ouroboros Execute phase for Seed deduplication and conversion output checks. CLAWQL*CUCKOO*\* env vars.

**PLANNED — Merkle Tree Integration**
Per-step hashing in Ouroboros. Root stored in Postgres. Optional proofOfIntegrity GraphQL endpoint. CLAWQL*MERKLE*\* env vars. Verification in Evaluate phase.

**PLANNED — Hybrid memory.db (sqlite-vec)**
SQLite + sqlite-vec vector sidecar alongside Obsidian vault. Vector-ranked chunk retrieval for precision recall. Tracked in GitHub issues #68–#72.

**PLANNED — Unified Helm Chart Finalization**
charts/clawql-full-stack with all 10 services, values.yaml, CLAWQL_BUNDLED_OFFLINE=1, Paperless isolated backends, resource limits, init jobs.

**PLANNED — Docker Image Rebuild + K8s Rollout**
Include new providers, Ouroboros TS port, Cuckoo + Merkle integrations in ClawQL image. Roll out to clawql namespace. Zero new pods.

**FUTURE — Docs + Case Studies Update**
New docs.clawql.com case study for document pipeline. Updated bundled-specs page with 8-provider table. notify() tool reference documentation.

**FUTURE — Additional Providers**
Gotenberg and Tika APIs already bundled. Future: Postal (email), n8n (if re-added for specific workflows), additional Google services, custom internal APIs via CLAWQL_SPEC_PATH.

---

## Slide 33 — Design Principles

**Design Principles**

_Six principles that have guided every architectural decision in ClawQL_

**01 — Conversational & Invisible**
Users speak naturally in Cursor. They never know about Ouroboros, Seeds, Cuckoo filters, Merkle trees, MCP internals, or spec loading. ClawQL’s job is to make complex automation feel like a simple conversation — any visible complexity is a design failure.

**02 — Local-First & Private**
Every service runs in your Kubernetes cluster. Documents never leave your machine. No cloud dependencies for the document pipeline. No SaaS subscriptions. No user caps. CLAWQL_BUNDLED_OFFLINE=1 ensures no outbound spec fetches at runtime. Your data is yours.

**03 — Self-Improving & Verifiable**
Ouroboros retries and adjusts automatically (Evolve phase). Merkle trees make every workflow auditable and tamper-evident. Cuckoo filters prevent duplicate work. The system gets better with each workflow run — and every claim it makes can be independently verified.

**04 — Context-Efficient by Design**
search() returns only relevant operation slices — not full specs. execute() responses are trimmed by the GraphQL projection layer. memory_recall() returns ranked pages — not the whole vault. Every design decision keeps the AI’s context window clean and signal-rich.

**05 — Extensible by Default**
Adding a new service is adding a new OpenAPI spec to providers/. Ouroboros and the routing layer discover and orchestrate it automatically via search + execute. The document pipeline is ready for Gotenberg and Tika today — and for any future service by the same mechanism.

**06 — Memory-Continuous**
memory_ingest after every significant workflow means future sessions — in any thread, with any assistant — can memory_recall the full history of what was processed, decided, and why. Plans made with Grok on Monday are available in Cursor on Friday. No re-explaining, ever.

---

## Slide 34 — Why ClawQL Wins

**Why ClawQL Wins**

_What ClawQL does that no other MCP server or document tool does today_

The market has MCP servers that wrap specific APIs. The market has document tools that process specific formats. The market has AI memory products with specific UX. ClawQL is the first platform that unifies all three — API orchestration, document pipeline, and durable memory — under a single conversational interface.

**vs. Other MCP Servers**

- Most MCP servers wrap one API. ClawQL ships 8 providers as defaults and accepts any OpenAPI spec
- No other MCP server has a durable cross-session memory system (Obsidian vault + hybrid sqlite-vec)
- No other MCP server embeds a structured workflow engine (Ouroboros) with automatic retry and Merkle verification
- Cuckoo filter deduplication in ClawQL prevents redundant operations — not found in any competitor

**vs. Document Automation Tools**

- n8n, Zapier, Make: visual workflow builders requiring explicit node configuration. ClawQL is natural language
- Stirling-PDF alone: just PDF manipulation. ClawQL adds Tika (extraction), Gotenberg (conversion), Paperless (archive), and AI orchestration in one platform
- No document tool on the market has a cryptographic Merkle audit trail per processing step
- ClawQL’s document pipeline is self-hosted and private — no SaaS data exposure

**vs. AI Memory Products**

- Mem.ai, Notion AI, etc: cloud-hosted, subscription-based, platform-locked. ClawQL vault is local, yours
- No memory product integrates memory with API execution — recall a plan, then execute it via GitHub/Cloudflare APIs in the same session
- ClawQL’s graph-traversable wikilinks (Obsidian) give memory depth that flat vector databases lack
- memory_ingest after every Ouroboros workflow means the memory layer grows automatically with every document job

---

## Slide 35 — Closing

**ClawQL**

_The AI-Orchestrated API & Document Automation Platform_

- Natural language drives the entire platform — from API calls to document workflows to Slack notifications
- 8 bundled providers, 10 services, 1 Helm chart, 1 kubectl context
- Cross-session memory that works with any AI assistant, any time
- Cryptographically verifiable audit trails on every workflow step
- 100% local, private, and private — no cloud, no SaaS, no limits

**GET STARTED**

Documentation — docs.clawql.com
GitHub — danielsmithdevelopment/ClawQL
npm Package — clawql-mcp
Kubernetes — docs.clawql.com/kubernetes
Helm Chart — docs.clawql.com/helm
Case Studies — docs.clawql.com/case-studies

Built with Cursor + ClawQL MCP
April 2026

```

#### Provenance
- **Tool:** `memory_ingest` · **UTC:** `2026-04-22T03:09:21.580Z` · **session:** `2026-04-21-deck-fulltext-p6`
- **Section fingerprint:** SHA-256 `5d207abcca7a3560…` (canonical hash in the HTML comment below).

<!-- clawql-hash:5d207abcca7a3560eb2ba34be3c860a3403799f690d533949fe051e995d927ed -->
```
