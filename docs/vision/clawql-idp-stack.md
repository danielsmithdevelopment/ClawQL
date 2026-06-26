# Intelligent Document Processing (IDP) Stack in ClawQL

**Version**: April 2026 (aligned with ClawQL consolidated slide deck)  
**License Summary**: ClawQL core under Apache License 2.0; Coneshare under MIT License; supporting services (Tika, Gotenberg, Stirling-PDF base, Onyx, Nextcloud integration points) under compatible permissive or isolated-service licenses. Paperless-ngx operates under GPL-3.0 as a separate containerized service. All components run as modular, self-hosted services in Kubernetes/Helm environments.

**Engineering tracker:** [`idp-master-requirements-matrix.md`](../roadmap/idp-master-requirements-matrix.md) maps each capability below to shipped code, gaps, and GitHub issues.

**Platform context:** [Master enablement guide](./clawql-master-enablement-guide.md) · [Modularization v2.1](./clawql-modularization-v2.md)

## 1. Overview of IDP in the ClawQL Ecosystem

Intelligent Document Processing (IDP) in ClawQL refers to the end-to-end automation of ingesting, classifying, extracting, enriching, redacting, archiving, semantically indexing, and securely sharing documents using AI agents. The system unifies a modular document pipeline with agentic orchestration (MCP + Ouroboros + Argo Workflows), semantic knowledge (Onyx), durable memory (Obsidian vaults), collaboration storage (Nextcloud), human-in-the-loop review (Label Studio), and external data-room sharing (Coneshare).

ClawQL serves as the central MCP server that exposes `search()` and `execute()` tools over OpenAPI specs, allowing agents to discover and invoke operations across the entire pipeline without loading full specifications into context. The **`clawql-documents`** package is the primary orchestration surface for the document pipeline — the bulkiest horizontal plugin in the ecosystem by design, because a production-grade open-source agent IDP requires end-to-end sequencing, failure isolation, Merkle attestation, and Presidio-safe handoffs to agents.

This creates a sovereign, local-first, production-hardened IDP platform capable of handling 1,000+ formats with cryptographic audit trails (Merkle trees), real-time knowledge synchronization (Flink), optional GitOps promotion (Argo CD), and optional on-chain provenance.

The architecture supports both internal enterprise workflows and external virtual data room (VDR) use cases while maintaining zero SaaS data exposure.

## 2. ClawQL Core

### Background

ClawQL is a TypeScript-based Model Context Protocol (MCP) server developed by danielsmithdevelopment. It originated from the need to enable AI assistants and autonomous agents to operate any REST API, document workflow, or knowledge source efficiently. Published as the `clawql-mcp` package on npm, it implements a two-tool pattern (`search` for discovery and `execute` for invocation) over OpenAPI 3, Swagger 2, and Google Discovery specifications. An optional in-process GraphQL projection trims responses for token efficiency.

Key design principles include local-first operation, specification-driven extensibility, and production hardening via Kubernetes, Helm, optional Istio service mesh, and Golden Image pipelines (Trivy + OSV-Scanner + SBOM + Cosign).

### Core Features

- MCP server supporting stdio, HTTP, and gRPC transports.
- Bundled provider specifications (GitHub, Cloudflare, Slack, Sentry, n8n, Linear, Jira, Bitbucket, plus document tools).
- Tools: `search()`, `execute()`, `memory_ingest/recall()`, `knowledge_search_onyx()`, `sandbox_exec()`, `ingest_external_knowledge()`, `notify()`, `cache()`, `audit()`.
- Optional tools (roadmap/shipped behind flags): `workflow()` (Argo Workflows), `ouroboros_*`, HITL Label Studio hooks.
- Ouroboros 5-phase orchestration loop (Interview → Seed → Execute → Evaluate → Evolve) for complex, retryable multi-step workflows.
- Cuckoo filters for deduplication and Merkle trees for tamper-evident audit trails.
- GraphQL projection on `execute()` for lean responses.
- Environment-variable toggles for optional layers (Onyx, document pipeline, Web3 features).
- Unified Helm chart managing 12+ services; optional **`clawql-idp`** umbrella chart (roadmap).

### Integration Role in IDP

ClawQL acts as the orchestration and agent interface layer. Agents (via Cursor, Claude, OpenClaw, or custom MCP clients) use natural language to trigger document ingestion, processing, redaction, archiving, semantic indexing, and sharing workflows. All document services expose OpenAPI specifications loaded as bundled providers, enabling uniform `search` + `execute` access. **`clawql-documents`** composes those hops into typed, retryable pipelines so agents do not hand-roll Tika → Gotenberg → Stirling → Paperless sequences on every run.

## 3. clawql-documents — Pipeline Orchestration

### Background

`clawql-documents` is the horizontal package for document intelligence. It ships **`ingest_external_knowledge`**, the typed **`DEFAULT_IDP_PIPELINE`** recipe (Nextcloud → Tika → … → Coneshare), and dashboard stage helpers. **Seven bundled providers** are wired in **`clawql-api`**; agents and OpenClaw compose **`search`/`execute`** today. The **automated multi-hop runner** (retries, Merkle per hop, Presidio ordering) remains the target — see [`idp-pipeline.md`](../providers/idp-pipeline.md).

### Target Responsibilities

- **Sequential pipeline orchestration** with failure isolation per stage (Nextcloud → Tika → Gotenberg → Stirling → Paperless → Onyx → Coneshare).
- **Typed pipeline API** — e.g. `processDocument({ source, redactRules, archiveTags, onyxIngest })` returning Merkle roots, redaction summaries, and Paperless document IDs.
- **Provider registry integration** — resolve bundled OpenAPI specs, multipart/base64 file encoding, and in-cluster base URLs from Helm-injected env.
- **Defense-in-depth redaction ordering** — Stirling document redaction **before** agent-visible text; Presidio at Panguard/MCP boundaries on any remaining agent I/O (see §11).
- **Hooks for HITL** — enqueue Label Studio tasks, suspend/resume via Argo Workflows + NATS when confidence gates fail.
- **Onyx bridge** — optional post-Paperless `onyx_ingest_document` (today via Ouroboros default executor; target: first-class `clawql-documents` hook).
- **Nextcloud / Coneshare handoffs** — read from WebDAV/mounted paths; write processed artifacts back; trigger Coneshare share/VDR creation after archive.

### Status

| Capability                                                         | Status                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| External Markdown/URL ingest                                       | **Shipped**                                                                                                  |
| **`DEFAULT_IDP_PIPELINE` recipe** (typed steps + dashboard labels) | **Shipped** — agent-composed **`search`/`execute`**; see [`idp-pipeline.md`](../providers/idp-pipeline.md)   |
| Tika → Gotenberg → Stirling → Paperless automated runner           | **Gap** — Helm services exist; package orchestration not yet extracted                                       |
| Presidio gateway integration in pipeline                           | **Partial** — Panguard vision; [#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245)           |
| Plugin Layer registration (`DocumentsLayer`)                       | **Planned** — [`modularization-implementation-status.md`](../design/modularization-implementation-status.md) |

Implementing this package to production quality is a **P0 enabler** for the IDP story described in this document.

## 4. Document Ingestion and Processing Pipeline

The pipeline follows a sequential, modular flow: **Nextcloud → Tika → Gotenberg → Stirling-PDF → Paperless-ngx → Onyx → Nextcloud (sync) → Coneshare**. **`DEFAULT_IDP_PIPELINE`** documents the recipe; agents and Ouroboros compose **`search`/`execute`** today. Files can originate from Nextcloud WebDAV, email, or direct upload.

### 4.1 Apache Tika

**Background**  
Apache Tika is an open-source content analysis toolkit from the Apache Software Foundation (Apache License 2.0). It originated in the mid-2000s as part of the Apache Lucene ecosystem to solve the problem of extracting text and metadata from heterogeneous file formats. Tika uses a plugin architecture with parsers for hundreds of MIME types and integrates Tesseract for OCR.

**Key Features**

- Universal text and metadata extraction from 1,000+ formats (PDF, Office, HTML, email, archives, images, etc.).
- MIME type detection and language identification.
- OCR via Tesseract for scanned/image-based documents.
- Metadata preservation (EXIF, Dublin Core, etc.).
- Streaming and batch processing support.

**Integration in ClawQL IDP**  
Tika serves as the intake layer. ClawQL loads its OpenAPI specification as a bundled provider. Agents or `clawql-documents` invoke Tika via `execute()` to analyze incoming files, extract text/metadata, flag Office documents for conversion, and trigger downstream steps. Results feed into Ouroboros workflows, Argo DAGs, and Onyx indexing.

### 4.2 Gotenberg

**Background**  
Gotenberg is an open-source API for converting various document formats to PDF. Developed as a Docker-based service using LibreOffice for Office files and Chromium for HTML/Markdown, it addresses the need for reliable, headless document conversion in self-hosted environments.

**Key Features**

- Conversion of Office documents (DOCX, XLSX, PPTX), HTML, URLs, and Markdown to PDF.
- PDF manipulation (merge, split, headers/footers, compression).
- High-fidelity rendering via LibreOffice and Chromium.
- RESTful API with JSON configuration.

**Integration in ClawQL IDP**  
Gotenberg follows Tika in the pipeline. ClawQL calls it via its OpenAPI spec to convert non-PDF Office files identified by Tika. Output PDFs proceed to Stirling-PDF for further manipulation.

### 4.3 Stirling-PDF

**Background**  
Stirling-PDF is an open-core PDF manipulation toolkit. The base project provides self-hosted PDF operations; later versions introduced paid plans for advanced enterprise features while maintaining core open-source functionality.

**Key Features**

- PDF merge, split, rotate, and reorganization.
- High-accuracy OCR.
- **Document-level PII redaction** with pattern matching and cryptographic verification (Merkle tree support in integrated workflows).
- Signing, certifying, compression, and optimization.
- Batch processing and form handling.

**Integration in ClawQL IDP**  
Stirling-PDF receives converted PDFs from Gotenberg. **`clawql-documents`** invokes it for advanced manipulation and **upstream document redaction** — removing PII from file bytes **before** text or summaries reach agents, memory, or LLM context. Redacted outputs include verification hashes stored in Postgres or forwarded to Onyx/Paperless. Agents use `execute()` or the pipeline API to apply rules (e.g., "redact SSNs and compute Merkle root"). By the time Presidio runs at the MCP gateway, sensitive fields should already be absent from document-derived content.

### 4.4 Paperless-ngx

**Background**  
Paperless-ngx is a community-driven, self-hosted document management system (GPL-3.0) evolved from the original Paperless project. It focuses on consuming, OCRing, tagging, and archiving documents with a consumption inbox model.

**Key Features**

- Auto-tagging, correspondent tracking, and full-text search.
- Tika-powered OCR and parsing.
- Consumption inbox for automated ingestion.
- REST API and WebDAV support.
- Post-import integration points for external indexing.

**Integration in ClawQL IDP**  
Paperless-ngx serves as the long-term archive layer. Processed documents from Stirling-PDF are imported via its API or consumption folder (often mounted from Nextcloud). ClawQL triggers imports and uses Onyx bridges for semantic indexing. Paperless provides the human-accessible archive while ClawQL handles AI-driven workflows on top.

## 5. Knowledge and Semantic Layer: Onyx

### Background

Onyx is an open-source enterprise search and knowledge platform designed for self-hosted semantic retrieval across heterogeneous data sources. It supports connectors for Slack, Confluence, Drive, Jira, GitHub, email, and more, with real-time synchronization via Flink.

### Key Features

- Semantic search with citation-backed results.
- 40+ pre-built connectors and permission-aware retrieval.
- Flink-based real-time indexing pipelines.
- REST/GraphQL APIs for search and ingestion.
- Hybrid search combining keyword and vector methods.

### Integration in ClawQL IDP

Onyx indexes content from Paperless archives, Nextcloud files, and workflow outputs. ClawQL exposes `knowledge_search_onyx()` as a first-class MCP tool. Agents query Onyx during document workflows for cross-referencing (e.g., pricing data from Slack during invoice processing). Post-processing results flow back into Onyx for continuous knowledge enrichment. Flink ensures indexes remain fresh. Post-Paperless ingest automation is **partial** ([#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120)).

## 6. Durable Memory: Obsidian Vault

### Background

Obsidian is a knowledge base application that uses local Markdown files with wikilinks and frontmatter for graph-based note-taking. The vault format itself is plain text and fully portable.

### Key Features

- Local Markdown storage with bidirectional links and graph visualization.
- Plugins and extensibility.
- Cross-session persistence of decisions, summaries, and citations.
- Hybrid vector search extensions (sqlite-vec roadmap in ClawQL).

### Integration in ClawQL IDP

ClawQL uses Obsidian-style vaults for durable, cross-session memory. The `memory_ingest()` and `memory_recall()` tools store and retrieve workflow outputs, Onyx citations, Merkle roots, redaction logs, and agent decisions. **Presidio redaction at the MCP gateway** applies to memory writes as a second line of defense. Vaults can be synced via Nextcloud for human review.

## 7. Storage and Collaboration: Nextcloud

### Background

Nextcloud is an open-source (AGPL) content collaboration platform providing file sync, sharing, real-time editing, and productivity apps. It evolved from ownCloud and emphasizes self-hosting and data sovereignty.

### Key Features

- File sync and sharing with granular permissions.
- Real-time collaboration via OnlyOffice or Collabora.
- External storage mounts, WebDAV, and API access.
- Apps for Deck (Kanban), Calendar, Talk, and more.
- Guest accounts and advanced access control.

### Integration in ClawQL IDP

Nextcloud serves as the primary human-accessible storage and collaboration layer. Documents reside in Nextcloud folders mounted or synced to the ClawQL pipeline. ClawQL agents access files via WebDAV or API (bundled provider roadmap). Processed outputs return to Nextcloud for team review. Coneshare layers on top for external sharing.

## 8. Secure Sharing and Data Rooms: Coneshare

### Background

Coneshare is an open-source (MIT), self-hosted platform that adds secure sharing, tracking, and workflow automation as a layer on top of existing storage (explicitly supporting Nextcloud). It functions as a DocSend/Papermark-style alternative focused on control and visibility without file migration.

### Key Features

- Secure links with password protection, expiration, and email verification.
- Virtual Data Rooms (VDRs) with granular folder/file permissions.
- Page-level engagement analytics (views, time spent, downloads, revisits).
- Dynamic watermarking.
- Workflow automation and webhook/Slack integrations.
- File request capabilities.

### Integration in ClawQL IDP

Coneshare operates on Nextcloud storage. After ClawQL processing and Onyx indexing, agents or users create data rooms or share links via Coneshare APIs (bundled provider roadmap). Viewer activity triggers webhooks back into Ouroboros or NATS-driven Argo resume flows for automated follow-up (notifications, memory updates, issue filing). This completes the IDP loop from ingestion to external controlled distribution with full auditability.

**Operator UI:** The ClawQL dashboard [Agent Chat](../dashboard/agent-chat.md) panel is the natural surface for IDP agent requests, rich attachment cards, SSE streaming, and thread persistence in the Obsidian vault.

## 9. Orchestration and Agent Layer

IDP uses **three complementary orchestration planes** — each optimized for a different time horizon and durability need.

### 9.1 Ouroboros + MCP (agent-native, evolutionary)

Ouroboros is ClawQL's internal 5-phase evolutionary orchestration framework (Interview → Seed → Execute → Evaluate → Evolve). Combined with MCP, it enables agents to decompose complex tasks, execute tool calls, evaluate results, and iterate — ideal for exploratory or evolving workflows (e.g., "process these invoices and improve the seed when Langfuse eval scores drop").

Agents receive natural-language requests (e.g., "Process Q1 invoices, redact PII, cross-reference pricing from Onyx, archive to Paperless, create Coneshare data room, notify Slack"). Ouroboros manages multi-step flows across Tika, Gotenberg, Stirling, Paperless, Onyx, Nextcloud, and Coneshare while maintaining Merkle-audited state in memory vaults.

**Status:** **Shipped** — [ADR 0001](../adr/0001-ouroboros-workflow-engine.md), [#110](https://github.com/danielsmithdevelopment/ClawQL/issues/110).

### 9.2 Argo Workflows + optional `workflow` MCP tool (durable, spec-driven DAGs)

For **repeatable, GitOps-friendly pipelines** — batch ingestion, scheduled re-index, lending vertical packs — ClawQL exposes an optional **`workflow`** MCP tool backed by **Argo Workflows** on Kubernetes (`Workflow`, `WorkflowTemplate`, `CronWorkflow`). Agents submit parameterized runs, poll status, and read logs/artifacts under namespace-scoped RBAC.

**Argo CD** (optional, separate flag) handles declarative promotion — sync `Application` health after tests, multi-env GitOps — complementing rather than replacing Workflows DAG execution.

**HITL suspend/resume:** Argo **`suspend`** steps integrate with Label Studio review and optional **NATS JetStream** events so pipelines pause for human approval and resume on webhook ([#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254)).

**Status:** **Planned** — [ADR 0004](../adr/0004-argo-cd-workflows-clawql-pipelines.md), [#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243) (Workflows), [#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244) (CD).

### 9.3 clawql-documents (in-process pipeline composer)

The **`clawql-documents`** package (§3) is the **default in-process orchestrator** for the standard IDP hop sequence. Ouroboros and Argo call into it (or equivalent `execute` sequences) rather than duplicating stage logic. **`clawql-documents` must be top-notch** — failure isolation, retries, Merkle per stage, and Presidio-safe outputs — for the open-source agent IDP story to hold.

### 9.4 ClawQL-Agent / LangGraph (outside repo)

Long-running agent runtimes live in [ClawQL-Agent](https://github.com/danielsmithdevelopment/ClawQL-Agent); coordinate via [#256](https://github.com/danielsmithdevelopment/ClawQL/issues/256), [#258](https://github.com/danielsmithdevelopment/ClawQL/issues/258).

## 10. Intelligence, Extraction, and Human-in-the-Loop

Beyond the core PDF pipeline, production IDP requires structured extraction, classification, privacy masking, and reviewer gates.

| Capability                           | Role in IDP                                                             | Status                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **LangExtract**                      | Schema-bound extraction with character grounding and HTML visualization | **Partial** — [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246) |
| **Docling MCP**                      | Layout-aware parsing + fine-tuned classifier path                       | **Partial** — [#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248) |
| **Local sparse-MoE mask**            | Privacy mask before extraction on sensitive corpora                     | **Partial** — [#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245) |
| **Label Studio HITL**                | Enqueue + webhook for reviewer tasks                                    | **Shipped** — [#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228) |
| **Pre-annotations + vertical packs** | Lending/healthcare/legal Label Studio templates                         | **Partial** — [#247](https://github.com/danielsmithdevelopment/ClawQL/issues/247) |
| **Multi-reviewer RBAC**              | CE vs enterprise Label Studio patterns                                  | **Partial** — [#249](https://github.com/danielsmithdevelopment/ClawQL/issues/249) |
| **Langfuse eval → Ouroboros seed**   | Active learning / seed evolution from eval scores                       | **Partial** — [#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250) |

## 11. Security, Audit, and Resilience

### 11.1 Defense-in-depth redaction (Stirling + Presidio)

Two **distinct** redaction layers — complementary, not redundant:

| Layer                                  | When                                                                                    | Purpose                                                                                                                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stirling-PDF (document stage)**      | During pipeline processing, **before** archive and **before** agent context             | Remove PII from **file bytes** — PDFs, OCR output, merged documents. Merkle-attested redaction logs. Goal: no sensitive data **needs** redacting by the time agents see document-derived text.                                                           |
| **Presidio (MCP / agent I/O gateway)** | On agent **input/output**, memory writes, log emission, external API calls via Panguard | Catch **residual** entities in tool payloads, chat context, vault notes, and `execute()` responses — including non-document leaks (Slack snippets, pasted secrets). Applied at the gateway so sensitive info never enters LLM context or durable memory. |

**Ordering:** Stirling first on documents → then Presidio on whatever crosses the agent boundary. Both layers emit audit metadata; Merkle roots cover pipeline stages ([#114](https://github.com/danielsmithdevelopment/ClawQL/issues/114), [#115](https://github.com/danielsmithdevelopment/ClawQL/issues/115)).

### 11.2 Platform security controls

- **Zero-Trust Networking**: Optional Istio (mTLS, L7 policies, Kiali visibility) between ClawQL, Paperless, Onyx, and document services.
- **Vulnerability Management**: Golden Image Pipeline with Trivy + OSV-Scanner + SBOM + Cosign signing.
- **Cryptographic Audit**: Merkle trees per processing step; roots stored and verifiable. Cuckoo filters for deduplication ([#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89) audit tool).
- **Secrets Management**: HashiCorp Vault integration for provider keys ([#241](https://github.com/danielsmithdevelopment/ClawQL/issues/241), [#242](https://github.com/danielsmithdevelopment/ClawQL/issues/242)).
- **Provenance (Roadmap)**: Hyperledger Fabric for permissioned channels and tamper-evident history ([#187](https://github.com/danielsmithdevelopment/ClawQL/issues/187)).
- **Data Sovereignty**: All processing remains local; no external SaaS exposure.

## 12. Observability, Events, and Deployment

| Area                    | Capability                                                                                                              | Status                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Metrics**             | ClawQL `/metrics` + Grafana                                                                                             | **Shipped** / **Partial** — [#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210)                                                                  |
| **Tracing**             | Langfuse + IDP dashboards; Tempo (prod) vs Jaeger (lab) per [ADR 0003](../adr/0003-tempo-dragonfly-local-operations.md) | **Gap** — [#252](https://github.com/danielsmithdevelopment/ClawQL/issues/252)                                                                                    |
| **Events**              | NATS JetStream (Helm + conventions); KEDA scale on queue lag                                                            | **Partial** / **Gap** — [#127](https://github.com/danielsmithdevelopment/ClawQL/issues/127), [#257](https://github.com/danielsmithdevelopment/ClawQL/issues/257) |
| **Helm core**           | `charts/clawql-mcp` lean chart                                                                                          | **Shipped**                                                                                                                                                      |
| **IDP umbrella**        | Optional `clawql-idp` chart (full stack + Nextcloud + Coneshare)                                                        | **Gap** — [#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255)                                                                                    |
| **Compose verticals**   | Four opinionated stacks (lending, healthcare, legal, education)                                                         | **Gap** — [#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251)                                                                                    |
| **OpenClaw**            | Install + MCP bootstrap; Slack one-mention IDP runbook                                                                  | **Shipped** / **Gap** — [#226](https://github.com/danielsmithdevelopment/ClawQL/issues/226), [#256](https://github.com/danielsmithdevelopment/ClawQL/issues/256) |
| **Samples**             | Lending W-2 end-to-end pack                                                                                             | **Gap** — [#253](https://github.com/danielsmithdevelopment/ClawQL/issues/253)                                                                                    |
| **Self-service GitOps** | Agent → PR → Argo CD pipelines                                                                                          | **Gap** — [#258](https://github.com/danielsmithdevelopment/ClawQL/issues/258)                                                                                    |

## 13. End-to-End Example Workflow

1. Document arrives in Nextcloud folder or Paperless consumption inbox (WebDAV mount).
2. **Argo CronWorkflow** or agent via Ouroboros triggers **`clawql-documents`** pipeline.
3. Tika analysis → Gotenberg conversion (if Office) → **Stirling-PDF** merge/OCR/**document redaction** (Merkle verification).
4. Optional **LangExtract** / **Docling** classification; low-confidence → **Label Studio** enqueue → Argo **suspend** until HITL webhook resumes.
5. Paperless-ngx archives with tags; **Onyx** indexes (ingest API).
6. **Presidio** sanitizes any agent-visible summaries before `memory_ingest` / LLM context.
7. Obsidian vault stores citations, Merkle roots, and workflow decisions.
8. Coneshare creates trackable data room link on Nextcloud-backed storage.
9. Viewer activity webhook → Ouroboros or NATS → Slack `notify()`, memory update, optional follow-up.
10. Full audit trail: Merkle roots per stage + audit tool + optional Langfuse trace ([#252](https://github.com/danielsmithdevelopment/ClawQL/issues/252)).

## 14. Deployment Architecture

- Unified Helm chart for ClawQL core + document pipeline services (Tika, Gotenberg, Stirling, Paperless, Onyx, Flink).
- Optional **`clawql-idp`** umbrella ([#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255)): Nextcloud (AIO or standard), Coneshare, Label Studio, Argo Workflows/CD, NATS, Presidio analyzers.
- Docker/Kubernetes with optional Istio Ambient or sidecar mesh.
- **Bring-your-own Argo** or chart-integrated Workflows for durable DAGs.
- All services expose OpenAPI for MCP consumption (Nextcloud OCS/WebDAV + Coneshare REST as bundled providers — roadmap).
- Persistent volumes for vaults, archives, and indexes.
- Four vertical **Docker Compose** stacks for local/POC ([#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251)).

---

This document describes a complete, production-capable, sovereign Intelligent Document Processing platform centered on ClawQL orchestration — with **`clawql-documents`** as the pipeline backbone — integrated storage, processing, knowledge, memory, collaboration, HITL, GitOps workflows, and secure sharing layers. All components operate as modular services with clear API boundaries.

**Maintenance:** When capabilities ship or issues close, update [`idp-master-requirements-matrix.md`](../roadmap/idp-master-requirements-matrix.md) and this document together.
