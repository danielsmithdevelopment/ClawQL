ClawQL Deck — Full Text Transcript
Slide 1 — ClawQL
ClawQL
AI-Orchestrated API, Document & Enterprise Knowledge Automation
Natural language. Any API. Any document. Any knowledge source. One platform.
An MCP server that lets AI assistants discover and call any REST operation across any OpenAPI-described API — without context bloat, without custom wrappers — plus a complete local-first document pipeline, enterprise-wide semantic knowledge search via Onyx, real-time connector sync via Flink, and durable cross-session memory.
PLATFORM HIGHLIGHTS
MCP Server (stdio / HTTP / gRPC)
OpenAPI 3 + Swagger 2 + Discovery
9 Bundled Provider Specs
Obsidian Vault Memory System
PDF + Archive Document Pipeline
Onyx Enterprise Knowledge Search (40+ connectors)
Flink Real-Time Index Sync
Embedded Ouroboros Engine
Cuckoo Filters + Merkle Trees
Slack notify() Integration
Unified Kubernetes Helm Chart
Cursor-First — Local & Private
Slide 2 — The Problem
The Problem
Modern API integration, document automation, and enterprise knowledge retrieval are still unnecessarily hard
API Accessibility — 01 APIs Are Inaccessible to AI
OpenAPI specs run to megabytes. Dumping them into an AI context window is expensive and noisy. Writing custom wrappers for every endpoint is tedious and brittle. Agents hallucinate operations that don’t exist because they have no structured way to discover what’s actually available.
No Persistence — 02 Memory Dies With Every Session
Every AI conversation starts completely blank. Architectural decisions, debugging breakthroughs, workflow history, and hard-won institutional knowledge vanish the moment the chat ends. Teams repeat the same mistakes every single session — even with the same assistant.
Document & Knowledge Silos — 03 Documents and Company Knowledge Live in Isolated Silos
PDFs, Word documents, spreadsheets, Slack threads, Confluence pages, Jira tickets, Drive docs — each in a different system with no unified retrieval or processing layer. Document automation tools don’t know about your company knowledge. Enterprise search tools can’t trigger document workflows. Nothing talks to each other without custom integration work.

Slide 3 — What is ClawQL?
What is ClawQL?
A TypeScript MCP server that makes AI assistants genuinely capable of operating any API, any document workflow, and any enterprise knowledge source
ClawQL is an MCP (Model Context Protocol) server published as clawql-mcp on npm. It bridges AI assistants — like Cursor or Claude — to any API described by OpenAPI 3, Swagger 2, or Google Discovery format.
Instead of dumping multi-megabyte API specs into the AI context window, ClawQL exposes two elegant core tools — search and execute — that let the AI discover and call any operation on demand, keeping context lean and responses accurate.
On top of the API layer sits a complete document processing pipeline (Stirling-PDF, Paperless NGX, Apache Tika, Gotenberg), an enterprise knowledge search layer (Onyx with 40+ connectors, kept fresh by Flink), an invisible workflow orchestration engine (Ouroboros), durable cross-session memory via an Obsidian vault, and a Slack notification integration — all deployed as one unified Helm chart in Kubernetes.
API Bridge
Discover & call any REST operation across 9 bundled providers via search + execute
Memory Layer
Durable Obsidian vault memory with graph-traversable wikilinks, persistent across all sessions
Document Pipeline
PDF, text, archive, extraction, conversion — 1,000+ formats supported end-to-end
Knowledge Layer (New)
Onyx semantic search across 40+ enterprise connectors (Slack, Drive, Confluence, Jira, GitHub, and more) — permission-aware, citation-returning, Flink-synced in real time
Orchestration Brain
Embedded Ouroboros engine for invisible multi-step workflow automation with retry logic
npm install -g clawql-mcp · github.com/danielsmithdevelopment/ClawQL

Slide 4 — Who ClawQL Is For
Who ClawQL Is For
Three audiences — one platform that serves all of them from a single deployment
Developers & Power Users
Use Cursor + ClawQL MCP to operate any REST API via natural language — no postman, no curl
Build workflows that span GitHub, Cloudflare, Google Cloud, Slack, Onyx, and your own services
Persistent Obsidian memory means decisions made in Monday’s session are recalled on Friday — including Onyx-retrieved company knowledge
Operate your homelab (TrueNAS, Kubernetes, Paperless) the same way you operate SaaS APIs
Document processing pipeline handles PDFs, Office files, and archives without manual tool switching
Onyx lets you cross-reference company knowledge inside any document workflow automatically
stdio transport works seamlessly inside Cursor — no ports to configure
Companies & Teams
Automate document ingestion, OCR, redaction, and archiving entirely in-house — no SaaS data exposure
Onyx indexes your entire company knowledge base (Slack, Confluence, Drive, Jira, GitHub, email) and makes it queryable inside any Ouroboros workflow — permission-aware and citation-backed
Flink pipelines keep Onyx’s index continuously up to date — no stale retrieval
Slack notify() integration delivers workflow results to the right channel automatically
Audit trails via Merkle trees prove every processing step — including knowledge retrieval — valuable for compliance
Cuckoo filter deduplication prevents duplicate document imports at scale
Unified Helm chart means one ops person manages the entire platform
Investors & Partners
MCP is emerging as the standard AI tool protocol — ClawQL is early infrastructure
9 bundled providers covers the most valuable developer APIs out of the box, plus Onyx enterprise search
The memory system (vault + hybrid sqlite-vec) combined with Onyx retrieval is a genuine technical moat
Document pipeline (Tika + Gotenberg + Stirling + Paperless) is production-grade from day one
Onyx integration elevates ClawQL from document automation to full enterprise knowledge automation
Local-first architecture resonates strongly with enterprise data governance requirements
One Helm chart deployment model makes adoption and scaling straightforward

Slide 5 — Section Divider: Core Platform
Core Platform
The MCP server, tool surface, transport layers, GraphQL projection, and memory system that power everything
Section 1

Slide 6 — Architecture Overview
Architecture Overview
Three clean layers — AI interface, ClawQL core, and the API & service targets
AI CLIENTS (Layer 1)
Cursor (stdio — primary)
Claude Desktop
Any MCP-compatible client
HTTP REST consumers
gRPC consumers
CLAWQL CORE (Layer 2)
search — Operation discovery from loaded specs
execute — REST call execution with auth injection
memory_ingest / memory_recall — Obsidian vault durable memory
knowledge_search_onyx — Semantic enterprise knowledge retrieval via Onyx
GraphQL Projection — Response trimming for lean context
Ouroboros Engine — Invisible workflow orchestration
notify() + cache + audit — Slack, LRU cache, audit ring buffer
API & SERVICE TARGETS (Layer 3)
GitHub
Google Cloud
Cloudflare
Paperless NGX
Stirling-PDF
Apache Tika
Gotenberg
Slack
Onyx (Enterprise Knowledge Search — 40+ connectors, Flink-synced)

Slide 7 — MCP Tool Surface
MCP Tool Surface
Ten tools — two core, eight extended — covering API operations, memory, knowledge search, code execution, notifications, and audit
search
Core Fuzzy-discovers operations and parameters from all loaded OpenAPI/Discovery specs. Returns the most relevant endpoints without dumping the full spec into context. The AI never sees more than it needs.
execute
Core Calls a discovered REST operation with proper auth headers and a fully typed request body. Handles all providers — GitHub, Cloudflare, Paperless, Stirling, Onyx, Slack, and more — through one consistent interface.
memory_ingest
Memory Writes durable Markdown notes into an Obsidian vault on disk. Supports structured insights, optional conversation capture, tool outputs, wikilinks between notes, and frontmatter provenance metadata. Automatically enriched with Onyx-retrieved citations when called after knowledge search steps.
memory_recall
Memory Retrieves topically relevant vault notes using keyword matching and optional graph-depth traversal (maxDepth). Returns ranked pages — not the whole vault — so context stays lean and precise.
knowledge_search_onyx
Knowledge (New) Thin wrapper that calls search() internally for Onyx’s MCP/REST tools, then execute(). Returns permission-aware, semantically ranked chunks with citations from your full enterprise index — Slack threads, Drive docs, Confluence pages, Jira tickets, GitHub issues, email, and more. GraphQL projection trims to only relevant fields + citations. Enabled via CLAWQL_ENABLE_ONYX=true.
sandbox_exec
Execution Executes remote code in a Cloudflare Sandbox via a bridge. Enables agents to run code, validate outputs, and test scripts without requiring local execution infrastructure on the client side.
ingest_external_knowledge
Knowledge Bulk-ingests Markdown content and optionally fetches and stores external URLs. Useful for seeding the knowledge layer with documentation, runbooks, or third-party reference material.
notify
New First-class Slack notification tool. Sends structured messages to configured channels using the bundled Slack spec and CLAWQL_SLACK_TOKEN. Called by Ouroboros at workflow milestones, completions, retries, and audit events. Can include Onyx citation links and Paperless document links in notifications.
cache
Optional In-process LRU scratch storage for session-scoped ephemeral state. Enabled via CLAWQL_ENABLE_CACHE. Stores transient tool results, intermediate computations, or tool-discovery caches during a session.
audit
Optional In-process event ring buffer for operator audit trails. Enabled via CLAWQL_ENABLE_AUDIT. Records all tool calls — including Onyx knowledge retrievals — execution results, and workflow events in a structured, queryable log for compliance purposes.

Slide 8 — search + execute: How API Discovery Works
search + execute: How API Discovery Works
The two core tools that make any OpenAPI-described API instantly accessible without context bloat
search() — Step 1: Discover the right operation
User asks: “Create a GitHub issue for the Cuckoo filter work”
search() receives query: ‘GitHub create issue POST’
ClawQL scans all loaded specs — only GitHub in this case
Returns: operationId issues_create, path POST /repos/{owner}/{repo}/issues
Also returns: required fields (title), optional (body, labels, assignees)
AI sees only the relevant operation — not 50MB of GitHub’s full spec
execute() — Step 2: Call the operation precisely
AI calls execute() with operationId: issues_create
ClawQL injects CLAWQL_GITHUB_TOKEN as Authorization header automatically
Builds POST body: { title: “…”, body: “…”, labels: […] }
Sends to https://api.github.com/repos/{owner}/{repo}/issues
GraphQL projection strips unused fields from the response
Returns: issue number, URL, and status — exactly what AI needs, nothing more
Key insight: The AI never sees the full OpenAPI spec. search() returns only the relevant slice. execute() handles all auth and HTTP mechanics transparently. The same pattern applies to every provider — including Onyx’s search_indexed_documents operation.

Slide 9 — Memory System: Obsidian Vault
Memory System: Obsidian Vault
Durable, graph-connected, cross-session memory that works with any assistant — not just the current one
How the Memory System Works
Ingest
memory_ingest() writes Markdown notes to an Obsidian vault on disk. Notes include structured insights, wikilinks to related pages, frontmatter provenance (when, what), and optional conversation capture. Use stable, append-friendly note titles so runbooks accumulate instead of fragment. When called after an Onyx knowledge retrieval step, the note automatically includes ranked citations from the enterprise index — making company knowledge permanently recallable without re-querying Onyx.
Graph
[[wikilinks]] between notes build Obsidian’s graph. memory_recall() can traverse this graph via maxDepth — so a query for ‘Q1 pricing policy’ surfaces not just the direct note, but linked Onyx citation pages, Paperless document IDs, GitHub issue references, and related workflow decisions across the entire graph.
Recall
In a fresh Cursor session (hours, days, or weeks later), memory_recall() returns ranked, topically relevant pages. The AI gets exactly enough context — not the whole vault. Hybrid sqlite-vec vector embeddings (roadmap) will make recall even more precise. Onyx-ingested knowledge enriches the recall results further without a live Onyx query.
Why This Changes Everything
Plans made in a Grok or Claude session can be recalled in Cursor the next day
Architectural decisions persist across months — no more re-explaining context
Onyx-retrieved company knowledge (pricing decisions, policies, Jira tickets) is ingested into the vault and becomes recallable in any future session without re-querying Onyx
memory_ingest after any significant workflow builds a living runbook automatically
Cross-tool: ingest from Claude, recall in Cursor — vault is tool-agnostic
After recall, search + execute can file GitHub issues from the recalled plan — no copy-paste
After document workflows, Ouroboros auto-ingests summaries with Onyx citations, Merkle roots, and document IDs
Hybrid memory.db sidecar (SQLite + sqlite-vec) planned for vector-ranked chunk retrieval

Slide 10 — Cross-Thread Recall: The Killer Feature
Cross-Thread Recall: The Killer Feature
This is what separates ClawQL from every other MCP server
REAL CASE STUDY — April 2026
The Situation
A detailed Cuckoo filter + hybrid memory architecture was designed and discussed in a Grok session. The plan was never committed to GitHub. No code was written. The design only existed in that conversation.
Without ClawQL:
A fresh Cursor session finds nothing in the repo. The answer is “no Cuckoo filter references found” — accurate but completely misleading. The plan is effectively lost.
With ClawQL memory_recall:
The Grok summary was ingested into the vault. memory_recall(‘Cuckoo filter hybrid memory’) surfaces the full design, env vars, sqlite-vec wiring, and Merkle semantics — then search + execute files GitHub epic #68 and children #69–72 from that recalled context.
With Onyx Added:
Onyx’s index includes the Slack thread where the team discussed filter implementation tradeoffs. knowledge_search_onyx(‘Cuckoo filter implementation’) retrieves those cited chunks, which are then ingested into the vault alongside the architectural decisions — so future sessions get both the design plan and the team discussion context in a single memory_recall call.
THE WORKFLOW
Session A (any tool) — Work on architecture + run knowledge_search_onyx for relevant company context. At end of session, memory_ingest() a stable summary note including Onyx citations and wikilinks.
Session B (fresh — any tool) — Run memory_recall(‘topic’) at the start. Cursor gets ranked vault pages — including the ingested Onyx context — no pasting, no context reloading.
Synthesize + Act — AI combines recalled vault context (including Onyx-derived company knowledge) with current repo state. No contradictions. No stale data.
File the Work — search() + execute() on GitHub API converts recalled plans directly into issues — epic + children. Zero copy-paste.

Slide 11 — Transport Layers & GraphQL Projection
Transport Layers & GraphQL Projection
Three ways to connect; one layer that keeps responses lean regardless of provider
stdio ← PRIMARY
Primary transport for Cursor. Zero configuration — point Cursor’s MCP settings at the clawql-mcp binary. Runs in-process, sub-millisecond latency, no ports to open, no auth tokens to configure on the transport layer. This is how you use ClawQL daily. USE CASE: Daily development in Cursor
Streamable HTTP
Exposes ClawQL at /mcp over HTTP for remote deployments — including the Kubernetes cluster. Enables web-based MCP clients, CI/CD pipelines, and automated agents to call ClawQL without running a local process. Supports streaming responses for long-running operations. USE CASE: K8s deployment, remote agents
gRPC (optional)
High-performance protobuf MCP transport on port 50051, enabled via ENABLE_GRPC=true. Powered by the reusable mcp-grpc-transport npm package. Best for high-throughput internal service communication — e.g. Ouroboros calling ClawQL tools at volume inside the cluster, including high-frequency Onyx knowledge queries. USE CASE: High-throughput internal calls
GraphQL Projection Layer — Keeping Responses Lean
Without projection:
A Cloudflare zone list returns ~85 fields per zone. A GitHub PR response is ~200 fields. An Onyx semantic search result returns full document chunks, source metadata, and permission data. Dumping any of these into the AI context wastes tokens and buries the useful signal in noise.
With ClawQL’s GraphQL projection:
execute() passes the response through an in-process GraphQL layer that returns only the fields the AI explicitly requested. A zone list might return only {id, name, status}. An Onyx result returns only {chunk_text, source_name, citation_url, relevance_score}. Context stays clean regardless of how verbose the upstream API response is.

Slide 12 — Section Divider: Document Pipeline
Document Pipeline
Stirling-PDF · Paperless NGX · Apache Tika · Gotenberg · Onyx — four document services plus an enterprise knowledge layer
Section 2

Slide 13 — Document Pipeline Overview
Document Pipeline Overview
Five services forming a complete, knowledge-augmented, format-agnostic document processing and archival system
The Two-Layer Architecture
Knowledge Layer (runs in parallel / on-demand via Ouroboros routing): Onyx (enterprise semantic search, 40+ connectors, Flink-synced) provides company-wide context before, during, and after any document workflow. Flink keeps the Onyx index continuously updated from all connected sources.
Document Processing Layer (sequential): Apache Tika → Gotenberg → Stirling-PDF → Paperless NGX
Both layers feed into the ClawQL Obsidian vault via memory_ingest, and results surface together in memory_recall.
Apache Tika
DNS: tika:9998 | Ingress: internal only Universal text & metadata extraction from 1,000+ file formats. The document pipeline’s intake layer.
PDF text extraction
Office: Word/Excel/PPT
HTML, XML, email (.eml)
OCR fallback via Tesseract
Metadata: author, dates, lang
1,000+ MIME types supported
Gotenberg
DNS: gotenberg:3000 | Ingress: internal only High-fidelity document conversion to PDF using headless Chromium and LibreOffice.
HTML → PDF (Chromium)
Markdown → PDF
Office → PDF (LibreOffice)
URL → PDF screenshot
Merge + split in conversion
Header/footer injection
Stirling-PDF
DNS: stirling-pdf:8080 | Ingress: pdf.clawql.local Heavy PDF manipulation engine — the pipeline’s processing workhorse after conversion.
Merge / split PDFs
High-accuracy OCR
PII redaction (SSN, etc)
Sign & certify
Compress & optimize
Batch processing
Paperless NGX
DNS: paperless:8000 | Ingress: paperless.clawql.local Long-term archive with Tika-powered OCR, auto-tagging, full-text search, and consumption inbox.
Auto-tag by content
Correspondent tracking
Full-text search index
Consumption inbox folder
Tika as parser backend
Isolated Postgres + Redis
Onyx
DNS: onyx:8080 | Ingress: onyx.clawql.local (optional) Enterprise semantic search across 40+ connectors — the knowledge backbone of the entire platform.
Permission-aware semantic search
40+ connectors (Slack, Drive, Confluence, Jira, GitHub, email, and more)
Citation-returning ranked results
Real-time Flink sync
MCP server + REST OpenAPI
File upload + indexing API for newly archived Paperless documents

Slide 14 — Stirling-PDF: The PDF Manipulation Engine
Stirling-PDF: The PDF Manipulation Engine
stirlingtools/stirling-pdf:latest · Internal DNS: stirling-pdf:8080 · Ingress: pdf.clawql.local
Merge & Split
Combine multiple PDFs into one document. Split a PDF into individual pages or defined page ranges. Reorder pages within a document. Extract specific pages into new files.
High-Accuracy OCR
Convert scanned PDFs into fully searchable, text-extractable documents. Supports multiple languages. Configurable accuracy settings — higher settings trigger automatic retry in Ouroboros if quality threshold isn’t met.
PII Redaction
Automatically detect and redact sensitive information: SSNs, credit card numbers, dates of birth, custom regex patterns. Redaction is cryptographically verified via Merkle tree before Paperless import.
Sign & Certify
Apply digital signatures to PDFs. Create certified archive copies. Useful for compliance workflows where document integrity must be proven — paired with Merkle tree root storage in Postgres.
Compress & Optimize
Reduce PDF file sizes for long-term storage in Paperless. Optimize image quality vs. file size tradeoff. Batch compression across entire document sets during import workflows.
Batch Operations
Process entire folders of documents in a single API call. Combine with Paperless consume folder for hands-free batch ingestion. Ouroboros orchestrates batch jobs with per-file progress tracking and error recovery.
Config: DOCKER_ENABLE_SECURITY=false — removes the 5-user SaaS restriction for unlimited self-hosted use. No rate limits, no user caps.
Slide 15 — Paperless NGX: The Long-Term Archive
Paperless NGX: The Long-Term Archive
paperlessngx/paperless-ngx:latest · Internal DNS: paperless:8000 · Ingress: paperless.clawql.local
Core Capabilities
Full-text search across all archived documents (powered by Tesseract OCR + Tika parser)
Auto-tagging by document content, date, correspondent, and type
Correspondent tracking — associate documents with senders/issuers (e.g. ‘IRS’, ‘Bank of America’)
Consumption inbox folder — drop files in, Paperless ingests and tags automatically
Document versioning and update tracking
Custom field definitions for domain-specific metadata
REST API (OpenAPI spec at /api/schema/) — what ClawQL uses for search + execute
Bulk import, export, and migration tools
Tika Integration
Paperless is configured with TIKA_ENABLED=true and TIKA_URL=http://tika:9998. This replaces Paperless’s built-in parser with Apache Tika, extending support from basic PDFs to 1,000+ formats including Office documents, emails, and archives — all ingested natively.
Onyx Bridge
After a successful Paperless import, Ouroboros can optionally call Onyx’s file upload + indexing API to make the newly archived document immediately searchable inside Onyx’s enterprise index — so the document is both archived in Paperless and semantically queryable via knowledge_search_onyx in the same workflow.
Isolated Backends
Paperless runs with its own dedicated Postgres (paperless-postgres:5432) and Redis (paperless-redis:6379) instances — isolated from ClawQL’s shared backends to prevent schema conflicts. Both are included in the unified Helm chart.
OpenAPI spec fetched from /api/schema/ and bundled as providers/paperless.json. Runtime base URL injected via PAPERLESS_BASE_URL at spec refresh time.

Slide 16 — Apache Tika: Universal Content Extraction
Apache Tika: Universal Content Extraction
apache/tika:latest · Internal DNS: tika:9998 · Internal-only service
Apache Tika is the document pipeline’s intake layer — the universal translator that extracts text, metadata, and structure from virtually any file format. Tika backs both Paperless NGX (as parser) and standalone extraction calls from Ouroboros. While Tika handles raw extraction from files already in the pipeline, Onyx handles semantic retrieval across the broader enterprise knowledge base — the two complement each other without overlap.
Documents
PDF (text + scanned via OCR)
Microsoft Word (.doc, .docx)
Microsoft Excel (.xls, .xlsx)
Microsoft PowerPoint (.ppt, .pptx)
LibreOffice / OpenDocument
Rich Text Format (RTF)
Web & Markup
HTML / XHTML
XML and derived formats
JSON (structured extraction)
RSS / Atom feeds
SVG (text content)
CSS (text extraction)
Email & Archive
Email (.eml, .msg)
ZIP / TAR / GZip archives
RAR / 7-Zip archives
Outlook PST / OST mailboxes
mbox mail archives
Thunderbird mail files
Media & Other
JPEG / PNG / TIFF (EXIF)
Audio metadata (MP3, FLAC)
Video metadata (MP4, MKV)
ePub / MOBI eBooks
iCal / vCard
Source code (30+ languages)
1,000+ MIME types supported. Tika drives metadata-informed routing decisions in Ouroboros — e.g. detecting Office files and routing to Gotenberg before Stirling.

Slide 17 — Gotenberg: High-Fidelity Document Conversion
Gotenberg: High-Fidelity Document Conversion
gotenberg/gotenberg:8 · Internal DNS: gotenberg:3000 · Internal-only service
Gotenberg converts any document type to PDF with pixel-accurate rendering. It uses headless Chromium for HTML/URL-to-PDF and LibreOffice for Office-to-PDF. In the pipeline, it sits between Tika (detection) and Stirling (manipulation) — ensuring everything is a clean PDF before processing.
HTML → PDF (Chromium)
Full Chromium rendering engine converts HTML pages to PDF with exact visual fidelity — fonts, CSS, JavaScript-rendered content, flexbox layouts. Supports custom headers, footers, margins, and paper sizes. Ideal for invoice templates, report generation, and web-scraped content archival.
Office → PDF (LibreOffice)
LibreOffice converts Word (.doc, .docx), Excel (.xls, .xlsx), PowerPoint (.ppt, .pptx), and OpenDocument formats to PDF with high layout fidelity. Critical for the pipeline when users drop Office files into the Paperless consume folder — Gotenberg converts them before Stirling processes.
Markdown → PDF
Converts Markdown documents to styled PDFs. Useful for technical documentation, runbooks, and meeting notes stored in markdown. Supports syntax highlighting, tables, and embedded images. Often triggered when exporting vault notes or developer documentation for archival.
URL → PDF (Screenshot)
Navigates to any URL using Chromium and renders a full-page PDF. Headers, footers, and JavaScript-rendered content are all captured. Useful for archiving web pages, terms of service snapshots, invoices from web portals, or any URL-based document that needs to be preserved.
PDF Merge (in conversion)
Gotenberg can merge multiple PDF files in a single conversion request — before Stirling receives them. This allows Ouroboros to batch-convert a folder of Office files and merge them in one Gotenberg call, rather than a separate Stirling merge step, for efficiency.
Header & Footer Injection
Inject custom HTML headers and footers into converted PDFs — company logos, page numbers, date stamps, document reference numbers, or confidentiality notices. Driven by Ouroboros workflow parameters so each document class can have its own footer template.

Slide 18 — Onyx: Enterprise Knowledge Search
Onyx: Enterprise Knowledge Search
The knowledge backbone — semantic search across your entire company, permission-aware, real-time, citation-backed
What Onyx Is
Onyx is an open-source enterprise knowledge search platform that indexes your entire company’s knowledge base across 40+ connectors. It exposes both a REST API and an official MCP server (search_indexed_documents and related tools), which means ClawQL integrates it exactly like Paperless or Stirling — via providers/onyx.json bundled into the ClawQL image, with runtime base URL injection (ONYX_BASE_URL) and CLAWQL_ENABLE_ONYX=true.
40+ Connectors
Slack (threads, channels, DMs — indexed and searchable in near real time via Flink)
Google Drive (Docs, Sheets, Slides, folders)
Confluence (pages, spaces, comments)
Jira (tickets, epics, comments, sprint history)
GitHub (issues, PRs, code, wikis)
Gmail / Outlook (email threads)
Notion, Linear, Zendesk, Salesforce, and more
Permission-Aware Search
Onyx respects the permission model of each connected source. If a user doesn’t have access to a given Confluence space, that space doesn’t appear in their Onyx results — even when queried through ClawQL. Enterprise data governance is enforced at the retrieval layer, not at the application layer.
Citation-Returning Results
Every result from knowledge_search_onyx includes a source name, document title, relevant chunk text, and a citation URL back to the original source. These citations are automatically included when the result is ingested into the Obsidian vault — making company knowledge permanently attributable and auditable.
Flink Real-Time Sync
Flink pipelines keep Onyx’s index continuously updated from all connected sources. New Slack messages, updated Confluence pages, closed Jira tickets — all reflected in Onyx’s index within minutes. knowledge_search_onyx never returns stale results, even in fast-moving company environments.

Slide 19 — Complete Pipeline: Step by Step
Complete Pipeline: Step by Step
A real Cursor session — from natural language to archived, cross-referenced, verified, and notified
You type in Cursor: “Process the new Q1 invoices from the consume folder, cross-reference them against our company pricing decisions from last quarter, redact PII, archive everything, and create follow-up GitHub issues if anything is missing.”
1 — Onyx: Knowledge Retrieval
Ouroboros calls knowledge_search_onyx(‘Q1 pricing decisions 2025’ + ‘invoice policy’). Onyx queries its index across Slack, Confluence, Drive, and Jira — returns 7 ranked, permission-aware chunks with citations. GraphQL projection trims to only relevant fields. Results held in context for the cross-reference step.
2 — Tika: Extract & Detect
Tika analyzes each incoming file: PDFs pass through, Office files (Word/Excel) are flagged for conversion, damaged files are reported. Metadata extracted: author, creation date, language, MIME type — drives all downstream routing decisions.
3 — Gotenberg: Convert to PDF
All non-PDF files (Word invoices, Excel statements) are converted to PDF by Gotenberg using LibreOffice. Cuckoo filter checks: is this converted PDF already in the pipeline? If yes, skip. Result: a clean set of PDFs ready for Stirling.
4 — Stirling: Merge + OCR + Redact
Stirling merges all PDFs into one document, runs high-accuracy OCR, then cross-references OCR’d invoice line items against the Onyx pricing results — flagging 3 discrepancies. Redacts all SSN and credit card patterns. Merkle tree hashes each step output including the Onyx retrieval leaf.
5 — Paperless: Import & Archive
Cuckoo filter: document hash not seen before. Paperless imports the merged, OCR’d, redacted PDF with tags [‘Q1-2026-invoices’]. Onyx indexing API called — document now immediately searchable enterprise-wide via knowledge_search_onyx.
6 — GitHub: File Issues
For each flagged pricing discrepancy, search() finds GitHub issue create → execute() files a tracking issue with the Onyx citation link and Paperless document reference. Three issues filed: #201, #202, #203.
7 — Vault: memory_ingest
Ouroboros ingests a rich summary: doc ID, Merkle root, Onyx citation links, 3 discrepancies found, GitHub issue numbers, OCR quality score. Wikilinks connect to pricing policy note and Q1 invoices history.
8 — Slack: notify() fires
Posts to #finance: “✅ Q1 invoice batch complete. Doc #5102 archived. 3 pricing discrepancies → GitHub #201–203. Onyx citations + Merkle root: a3f9… attached.”

Slide 19 — Section Divider: Intelligence Layer
Intelligence Layer
Ouroboros · Onyx Knowledge Search · Cuckoo Filters · Merkle Trees · notify() — the invisible brain that makes workflows self-orchestrating
Section 3

Slide 20 — Ouroboros: The Invisible Orchestration Engine
Ouroboros: The Invisible Orchestration Engine
Embedded in the ClawQL pod — no separate service, no visible commands, no learning curve
What Ouroboros Is
Ouroboros is a TypeScript-ported structured workflow engine that runs entirely in-process inside the ClawQL pod. It is the reason users can write complex multi-step requests in natural language — combining enterprise knowledge retrieval, document processing, and API calls — and get reliable, verified results.
It is completely invisible to the user. There is no ‘ooo’ prefix, no workflow command, no mode switch. ClawQL’s routing layer silently decides whether to fast-path a simple request directly to search/execute, or hand a complex request to Ouroboros.
All Ouroboros tool calls use ClawQL’s own internal tool executor registry — so they are in-process, not additional network hops. This includes knowledge_search_onyx, which Ouroboros can call at any point in an Execute phase to pull in relevant enterprise context before, during, or after document processing steps. Seeds (immutable workflow specifications) and evaluation logs are stored in shared Postgres.
Routing: Fast Path vs Ouroboros
FAST PATH (simple, single-step):
“Search Paperless for invoice #123” → direct search + execute against Paperless API. No Ouroboros. Milliseconds. “What did we decide about pricing last quarter?” → direct knowledge_search_onyx call. No Ouroboros.
OUROBOROS PATH (complex, multi-step):
“Process the Q1 invoices, cross-reference against our pricing policy, redact PII, archive, and notify Slack” → Ouroboros Interview → Seed → Execute (Onyx + Tika + Gotenberg + Stirling + Paperless + GitHub) → Evaluate → Evolve. Full structured loop, invisible to user.
The routing layer uses lightweight intent and ambiguity analysis on every message. The user never picks which path — ClawQL decides.
Ouroboros is compiled into the ClawQL Docker image — rebuild the image, roll to Kubernetes. Zero new pods. Zero new services. Zero visible commands.

Slide 21 — The Ouroboros Loop: 5 Phases
The Ouroboros Loop: 5 Phases
Every complex workflow passes through all five phases — invisibly, automatically, with automatic retry
1 — Interview
Ouroboros analyzes the user’s request for ambiguity. If the task is fully specified, this phase is skipped and execution proceeds immediately. If key details are missing (e.g. ‘which folder?’ ‘what redaction scope?’ ‘which Onyx connectors to query?’), ClawQL replies with one natural clarifying question. No jargon, no technical prompts — just conversation.
2 — Seed
Creates an immutable workflow specification — the ‘Seed’ — containing the full task description and measurable acceptance criteria. The Seed is stored in shared Postgres immediately. It never changes. Example criteria for a knowledge-augmented document workflow: “Onyx returns ≥ 3 relevant results with citations, OCR confidence > 0.95, redaction verified, Paperless import confirmed, GitHub issues filed for all flagged items.”
3 — Execute
Decomposes the Seed into an ordered sequence of tool calls and executes them using ClawQL’s internal tool executor registry. For knowledge-augmented document workflows: knowledge_search_onyx → Tika → Gotenberg (if needed) → Stirling → Cuckoo check → Paperless → Onyx index push → memory_ingest → GitHub issues → notify(). Each step’s output is hashed and added to the Merkle tree. All calls are in-process.
4 — Evaluate
Checks each result against the Seed’s acceptance criteria. Onyx result count and relevance scores validated. OCR confidence score measured. SSN redaction verified by pattern scan. Paperless import confirmed. GitHub issue numbers validated. If all criteria pass, Ouroboros proceeds to completion. Any failure triggers Evolve.
5 — Evolve
If any criterion fails, Ouroboros automatically adjusts and retries. Onyx returned too few results? Retry with a broader query or different connector scope. OCR below threshold? Retry with higher accuracy settings. Paperless import timeout? Retry with backoff. After successful retry, re-evaluates from scratch. Retry history is logged to Postgres. If evolution exhausts retry budget, reports failure conversationally with exact reason.

Slide 22 — Cuckoo Filters: O(1) Deduplication
Cuckoo Filters: O(1) Deduplication
Probabilistic membership testing with deletion support — keeping the pipeline fast at scale
A Cuckoo filter answers “have I seen this before?” in O(1) time with very low false positive rates. Unlike Bloom filters, it supports deletions — meaning documents can be removed from the deduplicated set without rebuilding. Configured via CLAWQLCUCKOO\* environment variables.
Stirling → Paperless Ingestion
WHEN: Before every Paperless import call Computes a hash of the processed PDF (post-OCR, post-redact). Checks the filter: has this exact document been imported before? If yes — skip. This prevents duplicate imports at scale without requiring a full database scan on every ingestion.
Ouroboros Execute Phase
WHEN: Before each new Seed execution begins Checks whether an identical Seed (same hash of task specification + inputs) has already been evaluated. If yes, Ouroboros returns the cached result immediately. Prevents re-running identical multi-step workflows — important when Cursor sessions overlap or retry.
Tika/Gotenberg Output Checks
WHEN: After each conversion or extraction step Before passing a converted PDF to the next pipeline stage, the Cuckoo filter checks if this exact converted output already exists downstream. This prevents re-processing the same intermediate artifact if the pipeline is interrupted and resumed mid-run.
Onyx Knowledge Retrieval Cache
WHEN: Before repeated knowledge_search_onyx calls with identical queries If the same Onyx query has been run in the current session, the Cuckoo filter detects it and returns the cached ranked result set — avoiding redundant index queries. Especially useful in Ouroboros Evolve phase when retrying a workflow that already completed the knowledge retrieval step successfully.
ClawQL MCP Layer
WHEN: During tool-discovery caching Caches tool-discovery result patterns and detects duplicate tool-call sequences. If the AI makes the same search() call twice in a session, the second call returns from the cached result set rather than re-scanning all specs.

Slide 23 — Merkle Trees: Cryptographic Audit Trails
Merkle Trees: Cryptographic Audit Trails
Tamper-evident, verifiable proof that every processing step produced the correct result — including knowledge retrieval
A Merkle tree hashes each processing step’s output into a leaf node. The root hash proves the entire chain — if any step’s output was tampered with, the root changes. ClawQL stores the Merkle root in Postgres after every Ouroboros workflow. Configured via CLAWQLMERKLE\* environment variables.
Merkle Tree Structure (Knowledge-Augmented Workflow)
ROOT HASH (stored in Postgres)
Hash(L1+L2)
L1: Onyx retrieval result set + citations
L2: Tika extract + metadata
Hash(L3+L4+L5)
L3: Stirling OCR + redact
L4: Paperless import confirmation
L5: GitHub issues filed
Root stored in Postgres. Optional proofOfIntegrity GraphQL endpoint for external audit.
Where Merkle Trees Are Used
Ouroboros Step Outputs (including Onyx)
Each phase output — including knowledge_search_onyx result sets — becomes a leaf. Root proves the entire workflow ran correctly and in order, including what company knowledge was retrieved and when. Critical for regulated industries where AI-assisted decisions must be auditable.
Post-Stirling PDF Verification
After merge/OCR/redact, Merkle root proves the processed PDF hasn’t been tampered with. Efficient chunk-level proof for any specific page without re-hashing the whole doc.
Paperless Archive Versioning
When documents are updated or re-exported, Merkle tree enables efficient version proofs — proving what changed between versions without storing full copies.
Onyx Knowledge Retrieval Audit
The Merkle leaf for each knowledge_search_onyx call records exactly which query was run, which connector sources were searched, and the citation set returned — a cryptographic record of what company knowledge influenced each AI decision.
GraphQL Response Integrity
Optional Merkle root for cross-session GraphQL response consistency checks. Proves that API responses haven’t been altered between caching and delivery.

Slide 24 — notify() + Slack Integration
notify() + Slack Integration
First-class MCP tool for structured Slack notifications at any workflow milestone
How notify() Works
notify() is a first-class MCP tool that internally calls execute() against the bundled Slack OpenAPI spec. It authenticates using CLAWQL_SLACK_TOKEN (a Slack Bot Token with chat:write scope at minimum). Notifications now routinely include Onyx citation links and Paperless document links as part of the standard workflow completion message.
When Ouroboros Calls notify()
Workflow Completion: ✅ Q1 invoice batch complete. Doc #5102 archived. 3 pricing discrepancies found (Onyx citations attached). GitHub issues #201–203 created. Merkle: a3f9…
Knowledge Retrieval Alert: ℹ️ Onyx returned 0 results for ‘Q4 pricing policy’. Broadening query scope and retrying.
Auto-Retry Event: ⚠️ OCR quality 0.87 on page 3, retrying with accuracy=high…
Failure / Escalation: 🚨 Workflow failed after 3 retries: Paperless timeout. Manual review needed. Onyx results saved to vault.
Audit / Compliance: 📋 Workflow audit: 8 steps including Onyx retrieval. Merkle root stored. Doc #5102 archived. Log ID: wf-2026-04.
Slack as a Full Bundled Provider
The Slack spec is retained in providers/slack.json as one of the nine default bundled providers. This means search() + execute() can target the full Slack API — not just notifications. Custom workflows can post file uploads, look up users, create channels, or read message history from within any Ouroboros workflow.
Token & Permission Setup
CLAWQL_SLACK_TOKEN in Helm values.yaml
Minimum scope: chat:write for notify()
Add files:write for attachment uploads
Add channels:read for channel lookup
Bot must be invited to target channels
Slide 25 — Section Divider: Infrastructure
Infrastructure
9 bundled providers · Unified Helm chart · 11+ services · One deployment · Privacy-first
Section 4

Slide 26 — Bundled Providers: The Default Stack
Bundled Providers: The Default Stack
9 providers ship in providers/ — CLAWQL_PROVIDER=default-multi-provider loads all of them
GitHub
providers/github.json | Auth: CLAWQL_GITHUB_TOKEN Issue tracking, PR management, repo operations. Used by ClawQL’s own tooling — the cross-thread recall case study files GitHub issues directly from recalled vault plans. Also targeted by Ouroboros when filing tracking issues from Onyx-retrieved discrepancy findings.
Google Cloud
providers/google-top50.json | Auth: CLAWQL_GOOGLE_TOKEN ~50 curated Google Discovery services merged: GKE, Drive, Calendar, Gmail, BigQuery, Cloud Run, and more. The most comprehensive cloud provider bundle.
Cloudflare
providers/cloudflare.json | Auth: CLAWQL_CLOUDFLARE_API_TOKEN Workers, DNS, zones, custom domains, KV, R2. Used to deploy and operate docs.clawql.com — the documentation site is built and maintained via ClawQL execute() calls.
Paperless NGX
providers/paperless.json | Auth: PAPERLESS_BASE_URL (self-hosted) Document archive API. Fetched from self-hosted instance at /api/schema/. Runtime base URL injection via PAPERLESS_BASE_URL. CLAWQL_BUNDLED_OFFLINE=1 prevents re-fetch.
Stirling-PDF
providers/stirling.json | Auth: STIRLING_BASE_URL (self-hosted) PDF manipulation API. Fetched from /v3/api-docs. Runtime base URL injection. All Stirling operations (merge, OCR, redact, sign) are discoverable via search() and callable via execute().
Slack
providers/slack.json | Auth: CLAWQL_SLACK_TOKEN Powers the notify() tool and full Slack API access. chat.postMessage, files.upload, channels.read, and more — all discoverable and callable. Bot Token with appropriate scopes.
Apache Tika
providers/tika.json | Auth: TIKA_BASE_URL (self-hosted) Universal extraction API. 1,000+ format support. Fetched from self-hosted instance. Ouroboros calls Tika via execute() for metadata-driven routing decisions in every document workflow.
Gotenberg
providers/gotenberg.json | Auth: GOTENBERG_BASE_URL (self-hosted) Document conversion API. HTML, Markdown, Office → PDF. Fetched from self-hosted instance. Triggered by Ouroboros when Tika detects non-PDF input files in a document workflow.
Onyx
providers/onyx.json | Auth: ONYX_BASE_URL (self-hosted) + ONYX_API_TOKEN Enterprise knowledge search. MCP server spec (search_indexed_documents + related tools) bundled or fetched at init time from self-hosted instance. Permission-aware semantic search across 40+ connectors. Enabled via CLAWQL_ENABLE_ONYX=true. Flink keeps the index fresh in real time.

Slide 27 — Unified Kubernetes Helm Chart
Unified Kubernetes Helm Chart
One helm install command deploys the entire platform — all 11+ services, all secrets, all ingress rules
charts/clawql-full-stack
helm install clawql charts/clawql-full-stack --namespace clawql
Single values.yaml controls every service — env vars, secrets, resource limits, ingress rules
CLAWQL_BUNDLED_OFFLINE=1 enforced by default — no external spec fetches at runtime
CLAWQL_ENABLE_ONYX=true toggles the Onyx knowledge layer on/off without rebuilding
Namespace: clawql — all services co-located, internal DNS works out of the box
Init jobs: validate specs and inject base URLs for Tika, Gotenberg, Stirling, Paperless, Onyx
Resource tuning: Stirling and Tika get higher CPU/memory limits for batch OCR/conversion; Onyx gets appropriate index serving limits
Secrets: CLAWQL_SLACK_TOKEN, ONYX_BASE_URL, ONYX_API_TOKEN, API tokens, PAPERLESS_BASE_URL — all in one values.yaml
Ingress: clawql.local, pdf.clawql.local, paperless.clawql.local, onyx.clawql.local (configurable in values)
Paperless isolated Postgres and Redis included — no external DB dependency
Flink included as a deployment for real-time connector sync into Onyx
Rolling updates: rebuild ClawQL image, helm upgrade — zero-downtime in most cases
Spec Refresh Command
npm run fetch-provider-specs
Accepts environment variables:
STIRLING_BASE_URL
PAPERLESS_BASE_URL
TIKA_BASE_URL
GOTENBERG_BASE_URL
ONYX_BASE_URL
Fetches specs from running self-hosted instances and saves to providers/. Run once after new service deployment.
Runtime Base URL Injection
Self-hosted provider specs contain servers: entries pointing at internal k8s DNS (stirling-pdf:8080, tika:9998, onyx:8080, etc). Values are injected at runtime via the same mechanism as auth headers in auth-headers.ts — making the same bundle work across dev and prod cluster topologies.
Slide 28 — Complete Service Map
Complete Service Map
All 11+ services in the clawql namespace — one Helm release, one namespace, one kubectl context
Service
Internal DNS
Ingress
Role
ClawQL MCP + Ouroboros
clawql:3000
clawql.local
Central brain — MCP server, routing, Ouroboros engine, GraphQL proxy, tool executor registry
Stirling-PDF
stirling-pdf:8080
pdf.clawql.local
PDF manipulation — merge, split, OCR, redact, sign, compress, batch ops
Paperless NGX
paperless:8000
paperless.clawql.local
Long-term archive — Tika parser, auto-tagging, full-text search, consumption inbox
Apache Tika
tika:9998
— (internal only)
Universal extraction — 1,000+ formats, OCR fallback, Paperless parser backend
Gotenberg
gotenberg:3000
— (internal only)
Document conversion — HTML/Markdown/Office/URL → PDF via Chromium + LibreOffice
Onyx
onyx:8080
onyx.clawql.local
Enterprise knowledge search — 40+ connectors, permission-aware, citation-backed, Flink-synced
Flink
flink-jobmanager:8081
— (internal only)
Real-time connector sync — keeps Onyx index fresh from all connected enterprise sources
Redis (shared)
redis:6379
— (internal only)
ClawQL + Ouroboros — workflow queues, progress pub/sub, session state
Postgres (shared)
postgres:5432
— (internal only)
ClawQL + Ouroboros — Seeds, eval logs, Merkle roots, metadata, audit trails
Paperless Postgres
paperless-postgres:5432
— (internal only)
Paperless internal schema only — isolated to prevent conflicts with ClawQL DB
Paperless Redis
paperless-redis:6379
— (internal only)
Paperless task queue only — Celery workers for background OCR and ingestion

Slide 29 — Privacy, Security & Local-First Architecture
Privacy, Security & Local-First Architecture
Everything runs in your cluster — no cloud, no SaaS data exposure, no per-user limits
100% Local Execution
Every service — ClawQL, Stirling-PDF, Paperless, Tika, Gotenberg, Onyx, Flink, Redis, Postgres — runs inside your Docker Desktop Kubernetes cluster. Documents and company knowledge never leave your machine. Onyx’s enterprise index is built and served entirely locally — company knowledge is never sent to a third-party AI or search service.
No SaaS Limits or Subscriptions
Stirling-PDF runs with DOCKER_ENABLE_SECURITY=false — removing the 5-user SaaS restriction. Paperless NGX is fully open source with no document limits. Onyx is open source and self-hosted — no per-seat licensing, no query limits, no data leaving your cluster. No monthly fees for any component in the pipeline.
Token Isolation
Each provider token (CLAWQL_GITHUB_TOKEN, CLAWQL_CLOUDFLARE_API_TOKEN, CLAWQL_SLACK_TOKEN, ONYX_API_TOKEN, etc.) is isolated in Kubernetes Secrets and injected only into the ClawQL process. Tokens never appear in logs, never leave the cluster, and are never shared between provider contexts.
Vault Memory Privacy
The Obsidian vault lives on your local filesystem at CLAWQL_OBSIDIAN_VAULT_PATH. Memory notes — including ingested Onyx citations — never leave your machine. memory_ingest explicitly prohibits storing secrets. The hybrid memory.db sidecar is also local.
Cryptographic Integrity
Every Ouroboros workflow step — including Onyx knowledge retrieval steps — is hashed into a Merkle tree. The root is stored in Postgres. Any tampering with processed documents, retrieved knowledge, or workflow records is immediately detectable. Compliance-grade audit trails covering both document processing and AI knowledge retrieval decisions.
Onyx Permission Enforcement
Onyx enforces the permission model of each connected source inside the cluster. A ClawQL user without access to a given Confluence space will not receive results from that space via knowledge_search_onyx — even if they craft a targeted query. Enterprise data governance is preserved at the retrieval layer.
CLAWQL_BUNDLED_OFFLINE=1
In production, CLAWQL_BUNDLED_OFFLINE=1 is enforced in the Helm chart. This prevents ClawQL from ever fetching provider specs from the network — all spec files are pre-bundled in the Docker image. No outbound traffic for spec loading. No dependency on external registries at runtime.

Slide 30 — Section Divider: Roadmap & Vision
Roadmap & Vision
What’s built, what’s being built, and where ClawQL is going
Section 5

Slide 31 — Real-World Demo: The Complete Workflow
Real-World Demo: The Complete Workflow
One Cursor message. Everything else is automatic.
You type in Cursor: “Take the Q1 invoices from my Paperless consume folder, extract text and metadata, convert any Office files to PDF, merge everything, run high-accuracy OCR, redact all SSNs and credit card numbers, cross-reference against our Q1 pricing decisions and flag any discrepancies, import to Paperless tagged ‘Q1-2026-invoices’ with correspondent ‘IRS’, file GitHub issues for any pricing gaps, and notify #finance on Slack when done.”
Routing:
Multi-step complex task with knowledge retrieval + document processing + GitHub filing detected → routes silently to Ouroboros.
Interview:
Task fully specified. Seed created in Postgres. Criteria: Onyx ≥ 3 results, OCR > 0.95, zero PII patterns, Paperless import confirmed, GitHub issues filed for all flagged items.
Onyx:
knowledge_search_onyx(‘Q1 pricing decisions 2025’) returns 7 ranked chunks from Confluence and Slack with citations. GraphQL projection trims to chunk text + citation URL.
Tika:
14 files analyzed: 9 PDFs, 3 Word docs, 2 Excel files. Office files flagged for Gotenberg.
Gotenberg:
3 Word docs + 2 Excel files → PDF via LibreOffice. Cuckoo filter: not seen before. Proceeds.
Stirling:
14 PDFs merged → 1 document. OCR run. OCR’d text cross-referenced against Onyx pricing results — 3 line items flagged. PII redacted. Merkle tree: 6 leaf hashes (including Onyx leaf), root computed.
Evaluate:
OCR confidence 0.97 ✓, zero PII ✓, Onyx returned 7 results ✓, Merkle root stored ✓. Proceeding.
Paperless:
Imported as document #5102 with tags and correspondent. Onyx index push: document now searchable enterprise-wide via knowledge_search_onyx.
GitHub:
3 pricing discrepancy issues filed — #201, #202, #203 — each with Onyx citation link and Paperless doc reference.
Vault:
memory_ingest() writes rich summary: doc ID, Merkle root, Onyx citations, discrepancies, GitHub issues, OCR score, wikilinks to pricing policy history.
notify():
Posts to #finance: “✅ Q1 invoice batch complete. Doc #5102 archived. 3 pricing discrepancies → GitHub #201–203. Merkle: a3f9… | Onyx citations attached.”
What the user sees in Cursor: “Done. 14 files processed, merged, OCR’d, PII redacted, cross-referenced against Q1 pricing policy — 3 discrepancies found and filed as GitHub issues — archived as doc #5102 in Paperless, and #finance has been notified on Slack.”

Slide 32 — Development Roadmap
Development Roadmap
What’s being built — ordered by dependency, not priority
Ouroboros TypeScript Port — IN PROGRESS
Full Interview → Seed → Execute → Evaluate → Evolve loop embedded in ClawQL pod. In-process tool executor registry. Seeds and logs to shared Postgres. Onyx calls handled through the same executor registry as all other providers.
Tika + Gotenberg Spec Bundling — IN PROGRESS
Fetch/generate OpenAPI specs from running instances. Save as providers/tika.json and providers/gotenberg.json. Wire into default-multi-provider preset.
Onyx Provider Bundling + knowledge_search_onyx Tool — NEXT
Bundle or fetch Onyx’s MCP/REST spec as providers/onyx.json. Add ONYX_BASE_URL + ONYX_API_TOKEN runtime injection. Implement knowledge_search_onyx as a thin wrapper over search() + execute() against the Onyx spec. Enable via CLAWQL_ENABLE_ONYX=true.
Flink Connector Pipeline Deployment — NEXT
Deploy Flink job manager and task manager into the clawql namespace. Configure connector jobs to keep Onyx index fresh from Slack, Confluence, Drive, Jira, GitHub, and other sources. Flink jobmanager:8081 internal only.
notify() Tool Implementation — NEXT
New MCP tool wrapping Slack chat.postMessage (+ ephemeral, file upload). Updated to include Onyx citation links and Paperless document links in standard workflow completion templates.
Self-Hosted Spec Fetch Config — NEXT
STIRLING_BASE_URL, PAPERLESS_BASE_URL, TIKA_BASE_URL, GOTENBERG_BASE_URL, ONYX_BASE_URL in fetch-provider-specs. Runtime base URL injection for all self-hosted providers.
default-multi-provider Update — NEXT
Redefine preset to include all 9 providers: GitHub + Google + Cloudflare + Paperless + Stirling + Slack + Tika + Gotenberg + Onyx. Remove n8n, Sentry, Jira, Bitbucket.
Cuckoo Filter Integration — PLANNED
In ingestion path, Ouroboros Execute phase, Tika/Gotenberg output checks, and Onyx knowledge retrieval cache. CLAWQLCUCKOO* env vars.
Merkle Tree Integration — PLANNED
Per-step hashing in Ouroboros — including Onyx retrieval steps as leaves. Root stored in Postgres. Optional proofOfIntegrity GraphQL endpoint. CLAWQLMERKLE* env vars.
Hybrid memory.db (sqlite-vec) — PLANNED
SQLite + sqlite-vec vector sidecar alongside Obsidian vault. Works alongside Onyx — vault covers session-level runbooks and decisions, Onyx covers live enterprise index queries. Tracked in GitHub issues #68–#72.
Unified Helm Chart Finalization — PLANNED
charts/clawql-full-stack with all 11+ services including Onyx and Flink, values.yaml, CLAWQL_BUNDLED_OFFLINE=1, CLAWQL_ENABLE_ONYX=true, resource limits, init jobs.
Docker Image Rebuild + K8s Rollout — PLANNED
Include new providers, Ouroboros TS port, Onyx + Flink configs, Cuckoo + Merkle integrations. Roll out to clawql namespace. Zero new pods for Ouroboros.
Docs + Case Studies Update — FUTURE
New docs.clawql.com case study for the knowledge-augmented document pipeline. Updated bundled-specs page with 9-provider table. knowledge_search_onyx tool reference documentation.
Additional Onyx Connectors via Flink — FUTURE
New data sources become new Flink connector jobs — no ClawQL code changes required. Future connectors: Postal (email), additional internal systems, custom data sources via CLAWQL_SPEC_PATH.

Slide 33 — Design Principles
Design Principles
Six principles that have guided every architectural decision in ClawQL
01 — Conversational & Invisible
Users speak naturally in Cursor. They never know about Ouroboros, Seeds, Cuckoo filters, Merkle trees, Onyx connector queries, Flink sync jobs, MCP internals, or spec loading. ClawQL’s job is to make complex automation feel like a simple conversation — any visible complexity is a design failure.
02 — Local-First & Private
Every service — including Onyx and Flink — runs in your Kubernetes cluster. Documents and company knowledge never leave your machine. No cloud dependencies. No SaaS subscriptions. No per-user or per-query limits. CLAWQL_BUNDLED_OFFLINE=1 ensures no outbound spec fetches at runtime. Your data and your company’s knowledge are yours.
03 — Self-Improving & Verifiable
Ouroboros retries and adjusts automatically (Evolve phase). Merkle trees make every workflow — including Onyx knowledge retrieval steps — auditable and tamper-evident. Cuckoo filters prevent duplicate work. Every AI claim about retrieved company knowledge is independently verifiable via citation links.
04 — Context-Efficient by Design
search() returns only relevant operation slices — not full specs. execute() responses are trimmed by the GraphQL projection layer. memory_recall() returns ranked pages — not the whole vault. knowledge_search_onyx returns ranked chunks with citations — not your entire enterprise index. Every design decision keeps the AI’s context window clean and signal-rich regardless of data volume.
05 — Extensible by Default
Adding a new service is adding a new OpenAPI spec to providers/. Ouroboros discovers and orchestrates it automatically. Onyx itself is extensible: new data sources are new Flink connector jobs — no ClawQL code changes required. The platform grows with your company’s data sources.
06 — Memory-Continuous
memory_ingest after every significant workflow means future sessions — in any thread, with any assistant — can memory_recall the full history of what was processed, decided, and why. Onyx-retrieved company knowledge is ingested into the vault alongside workflow results, making enterprise knowledge permanently recallable without re-querying the live index. Plans and knowledge from Monday are available in Cursor on Friday. No re-explaining, ever.

Slide 34 — Why ClawQL Wins
Why ClawQL Wins
What ClawQL does that no other MCP server, document tool, or enterprise search platform does today
The market has MCP servers that wrap specific APIs. The market has document tools that process specific formats. The market has AI memory products. The market has enterprise search tools. ClawQL is the first platform that unifies all four — API orchestration, document pipeline, durable memory, and enterprise knowledge search — under a single conversational interface, with cryptographic audit trails and zero data leaving your cluster.
vs. Other MCP Servers
Most MCP servers wrap one API. ClawQL ships 9 providers as defaults and accepts any OpenAPI spec
No other MCP server has a durable cross-session memory system (Obsidian vault + hybrid sqlite-vec)
No other MCP server embeds a structured workflow engine (Ouroboros) with automatic retry and Merkle verification
No other MCP server integrates enterprise semantic knowledge search (Onyx) inside the same tool executor registry — so knowledge retrieval and action-taking happen in the same workflow
Cuckoo filter deduplication in ClawQL prevents redundant operations — not found in any competitor
vs. Document Automation Tools
n8n, Zapier, Make: visual workflow builders requiring explicit node configuration. ClawQL is natural language
Stirling-PDF alone: just PDF manipulation. ClawQL adds Tika (extraction), Gotenberg (conversion), Paperless (archive), Onyx (live enterprise knowledge cross-reference), and AI orchestration in one platform
No document tool on the market has a cryptographic Merkle audit trail per processing step
No document tool can cross-reference processed content against live enterprise knowledge during the same workflow — ClawQL does this in the Stirling step before Paperless archival
ClawQL’s document pipeline is self-hosted and private — no SaaS data exposure
vs. Enterprise Search Platforms
Glean, Guru, Notion AI: cloud-hosted, subscription-based, per-seat pricing. Onyx inside ClawQL is self-hosted and open source — zero per-query or per-seat cost
Enterprise search tools return answers. ClawQL returns answers AND acts on them — filing GitHub issues, processing documents, sending Slack notifications, all in the same automated workflow
No enterprise search platform feeds retrieval results into a document processing pipeline and archives the output in a single automated step
Onyx’s retrieved citations are automatically ingested into the Obsidian vault — making enterprise knowledge permanently recallable without re-querying the live index

Slide 35 — Closing
ClawQL
The AI-Orchestrated API, Document & Enterprise Knowledge Automation Platform
Natural language drives the entire platform — from API calls to document workflows to enterprise knowledge retrieval to Slack notifications
9 bundled providers, 11+ services, 1 Helm chart, 1 kubectl context
Cross-session memory that works with any AI assistant, any time — enriched by Onyx-retrieved company knowledge
Cryptographically verifiable audit trails on every workflow step, including knowledge retrieval
100% local, private, and yours — no cloud, no SaaS, no limits
GET STARTED
Documentation
docs.clawql.com
GitHub
danielsmithdevelopment/ClawQL
npm Package
clawql-mcp
Kubernetes
docs.clawql.com/kubernetes
Helm Chart
docs.clawql.com/helm
Case Studies
docs.clawql.com/case-studies
