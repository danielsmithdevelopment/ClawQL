# ClawQL Intelligent Document Processing Platform

**Version:** July 2026 (6.4.0+)  
**Tagline:** Sovereign • Modular • Production-Ready • Hosted & Self-Hosted

**Audience:** Investors · Developers & architects · Operators

**Related:** [IDP pipeline hub](../providers/idp-pipeline.md) · [Requirements matrix](../roadmap/idp-master-requirements-matrix.md) · [OpenClaw IDP skill profile](../openclaw/openclaw-idp-skill-profile.md) · [Master enablement guide](./clawql-master-enablement-guide.md) · [Deployment guide](../deployment/clawql-deployment-operations-guide.md)

---

## For Investors

Understand the market problem, business model, competitive differentiation, and the path to a hosted product.

## For Developers & Architects

Deep-dive into architecture decisions, component integrations, deployment topology, and the archive layer design.

---

## Executive Summary

ClawQL is a sovereign Intelligent Document Processing platform that replaces fragmented SaaS toolchains with a single AI-orchestrated pipeline — from document ingestion to secure external distribution — available both as a self-hosted deployment and as a fully managed hosted service.

Enterprises manage documents across dozens of disconnected tools: OCR vendors, PDF processors, document management systems, knowledge bases, and data room platforms. Each handoff introduces cost, latency, compliance risk, and data exposure. ClawQL collapses this stack into one modular system orchestrated by AI agents, with a clean path to either self-hosted sovereignty or a managed hosted plan.

---

## The Problem

- Document workflows span 5–10+ SaaS products, each with separate billing, compliance postures, and API contracts.
- Every SaaS touchpoint is a potential breach vector — especially critical for legal, financial, and healthcare documents.
- AI automation requires deep pipeline integration that fragmented tools cannot provide out of the box.
- Audit trails are inconsistent or absent across tool boundaries.
- Virtual Data Room incumbents (Intralinks, Datasite, Ansarada) charge significant per-user and per-GB fees with no pipeline integration.

---

## The ClawQL Solution

- End-to-end IDP pipeline: ingest → convert → redact → archive → semantically index → share — orchestrated by a single MCP server.
- Two deployment models: self-hosted (full data sovereignty) and managed hosted (zero infrastructure overhead).
- Cryptographic audit trails via Merkle trees for tamper-evident, per-step processing records.
- AI agents drive the entire workflow via natural language — no custom integration code required.
- Modular architecture: adopt components incrementally, swap alternatives where needed.

---

## Business Value at a Glance

| Value Driver         | Detail                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Cost Reduction**   | Replaces 5–10 SaaS subscriptions. Self-hosted plan has no per-document or per-user fees beyond infrastructure.        |
| **Compliance**       | Data processed locally (self-hosted) or in a dedicated tenant (hosted). Cryptographic audit trail for every step.     |
| **AI Readiness**     | Native MCP integration means AI agents operate the full pipeline without custom code. Improves as models improve.     |
| **Scalability**      | Kubernetes/Helm deployment scales horizontally. 1,000+ document formats supported.                                    |
| **VDR Market Entry** | Coneshare delivers Virtual Data Room capabilities at a fraction of incumbent pricing, with full pipeline integration. |
| **Hosted Revenue**   | Managed hosted plan creates recurring SaaS revenue on top of the open-source self-hosted core.                        |

---

## Deployment Models

ClawQL is available in two deployment configurations. Both run identical pipeline logic; they differ in who manages the infrastructure and where data resides.

|                     | **Self-Hosted**                                                                             | **Managed Hosted**                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Target customer** | Enterprises with existing Kubernetes infrastructure and strict data residency requirements. | Teams who want ClawQL's capabilities without managing infrastructure.                |
| **Data residency**  | Fully local — no data leaves the operator's environment.                                    | Tenant-isolated; data processed and stored in dedicated infrastructure per customer. |
| **Infrastructure**  | Customer-managed Kubernetes/Helm. ClawQL provides the chart.                                | Fully managed by ClawQL. Customer connects via API or web UI.                        |
| **Licensing model** | Apache 2.0 core — free to deploy. Commercial support tiers available.                       | Monthly or annual subscription. Usage-based tiers by document volume and seats.      |
| **Deployment time** | Hours to days depending on existing Kubernetes maturity.                                    | Minutes. Tenant provisioned automatically on signup.                                 |
| **Updates**         | Customer-managed via Helm chart upgrades.                                                   | Managed by ClawQL — customers always on latest release.                              |

---

## Hosted Plan: Architecture Decisions

The managed hosted plan required one significant architecture change from the self-hosted stack: the removal of Paperless-ngx as the archive layer. This is a deliberate, proactive decision driven by licensing and business model requirements.

Paperless-ngx is licensed under GPL-3.0. In a self-hosted deployment this presents no commercial friction. However, in a hosted/managed SaaS product, distributing a service that bundles GPL-3.0 software triggers license propagation obligations that are incompatible with a closed commercial offering. Paperless-ngx is therefore removed from the hosted plan entirely.

### The ClawQL-Native Archive Layer

Rather than substituting a different GPL-adjacent DMS, ClawQL replaces Paperless-ngx with a purpose-built archive layer assembled from components already in the stack. This results in a cleaner, more capable architecture:

| Component                            | Role in Archive Layer                                                                                                                                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nextcloud**                        | Human-accessible file storage and team UI. Documents are stored here as first-class files, browsable and shareable without any DMS login.                                                                                                                  |
| **Nextcloud Automated Tagging**      | Rule-based collaborative tags applied on upload/update via the Files Automated Tagging app. Replaces Paperless tag assignment for basic classification.                                                                                                    |
| **Nextcloud Full-Text Search**       | Elasticsearch-backed full-text search with Tesseract OCR integration indexes all PDFs and Office files. Replaces Paperless search for keyword retrieval.                                                                                                   |
| **ClawQL Metadata Store (Postgres)** | A lightweight ClawQL-managed Postgres schema stores rich document metadata: correspondent, document type, custom fields, processing history, and Merkle roots. This replaces Paperless's Django metadata model with a schema fully under ClawQL's control. |
| **Onyx**                             | Semantic search and cross-document knowledge retrieval. Substantially more powerful than Paperless search — supports vector search, citation-backed results, and 40+ connector integrations.                                                               |
| **Stirling-PDF**                     | OCR is handled here, before archiving, rather than on import. Documents arrive in Nextcloud already OCR'd and text-searchable.                                                                                                                             |

**Net result:** the hosted plan archive layer is more capable than Paperless-ngx in every dimension that matters for enterprise use — richer metadata, superior search (Onyx semantic vs. Paperless keyword), native file access via Nextcloud, and no GPL dependency. The only thing lost is Paperless's dedicated web UI, which is replaced by Nextcloud's file browser and Onyx's search interface.

### Hosted Plan: Tenant Isolation

Each hosted customer receives a dedicated tenant with full isolation at the data and infrastructure layer:

- Dedicated Nextcloud instance per tenant — no shared storage.
- Dedicated Postgres schema per tenant for the ClawQL metadata store.
- Dedicated Onyx index per tenant — no cross-tenant knowledge bleed.
- Coneshare VDR links scoped to the tenant's Nextcloud instance.
- mTLS between all tenant services via Istio; tenant-scoped secrets in HashiCorp Vault.

### Hosted Plan: Pricing Model (July 2026 — plugin bundles)

Managed hosting is structured around **plugin bundles**, not a single document-volume ladder. Gateway-only customers pay dramatically less than IDP customers.

| Tier             | Price          | Plugin bundle           | Included                                                                                                  |
| ---------------- | -------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| **Free**         | $0/mo          | MCP Gateway             | Unlimited executions, 1 user, basic memory vault — no IDP, no VDR                                         |
| **Developer**    | $29/mo         | Gateway + memory        | Unlimited executions, 3 users, vault memory — no IDP, no GPU                                              |
| **Teams**        | $99/mo         | Gateway + memory + Onyx | Unlimited executions, 10 users, full Onyx semantic search — no IDP                                        |
| **Starter**      | $299/mo        | IDP plugin bundle       | Unlimited executions, 5,000 documents/mo, VDR, classify/extract, sovereign inference                      |
| **Business**     | $599/mo        | IDP plugin bundle       | Unlimited executions, 25,000 documents/mo, priority queue, full VDR analytics, 99.5% SLA                  |
| **Professional** | $1,200/mo      | Full stack              | Unlimited executions, 75,000 documents/mo, dedicated namespace, vertical fine-tune, SSO/SAML              |
| **Enterprise**   | from $3,500/mo | Full stack + security   | Unlimited executions, dedicated node, custom fine-tune, EU multi-region, Sovereign Security Pack included |

**Unlimited executions on every tier.** ClawQL does not meter MCP gateway usage or charge execution overage. Stateless gateway workers scale on spot capacity — usage-based execution pricing would only encourage customers to throttle their agents. Real cost drivers are reserved-pool memory (Onyx, Nextcloud per tenant), GPU inference, and document storage (R2). Those are covered by flat subscription tiers and storage overage. executor.sh caps Team at 250,000 executions/mo with $0.20/1,000 overage; ClawQL does not.

Sovereign Security Pack: **+$200/mo** on any paid tier.

> **Note:** tiers are indicative for GTM positioning. Validate against infrastructure cost modeling before launch.

---

## Platform Overview

ClawQL's IDP platform automates the full document lifecycle: ingestion, classification, extraction, enrichment, redaction, archiving, semantic indexing, and secure external sharing — unified under a single AI orchestration layer.

### Core Architecture Principles

- **Local-first:** All processing runs in the operator's environment (self-hosted) or a dedicated tenant (hosted). No document data sent to external SaaS APIs.
- **Specification-driven:** Every service exposes an OpenAPI spec loaded into ClawQL, enabling uniform agent access via `search()` and `execute()` tools.
- **Agentic orchestration:** The Ouroboros 5-phase loop (Interview → Seed → Execute → Evaluate → Evolve) handles complex, retryable multi-step workflows automatically.
- **Cryptographic integrity:** Merkle trees generate per-step audit roots; Cuckoo filters handle deduplication at scale.
- **Modular deployment:** Adopt the full stack or individual services. Each exposes clean API boundaries.

### Component Map

| Component                | Role in Platform                                                              |
| ------------------------ | ----------------------------------------------------------------------------- |
| **ClawQL Core**          | MCP server and AI orchestration layer (TypeScript, Apache 2.0)                |
| **Apache Tika**          | Universal document parsing and metadata extraction (1,000+ formats)           |
| **Gotenberg**            | High-fidelity document-to-PDF conversion (LibreOffice + Chromium)             |
| **Stirling-PDF**         | PDF manipulation, PII redaction, OCR, and Merkle audit generation             |
| **ClawQL Archive Layer** | Nextcloud + Postgres metadata store + Onyx. Replaces Paperless-ngx. GPL-free. |
| **Onyx**                 | Semantic search and knowledge layer with 40+ pre-built connectors             |
| **Obsidian Vault**       | Durable cross-session agent memory (Markdown, local, portable)                |
| **Nextcloud**            | Human-accessible file storage, collaboration, and archive UI                  |
| **Coneshare**            | Secure sharing, Virtual Data Rooms, and engagement analytics (MIT)            |

Paperless-ngx (GPL-3.0) is supported in self-hosted deployments for operators who prefer it. It is not included in the managed hosted plan. The ClawQL-native archive layer described above is the default for all new deployments and all hosted customers.

---

## ClawQL Core: Orchestration and Agent Interface

**License:** Apache License 2.0 — open-source, commercially permissive.

ClawQL is a TypeScript-based Model Context Protocol (MCP) server published as `clawql-mcp` on npm. It enables AI agents to discover and invoke operations across any REST API, document workflow, or knowledge source using just two tools — keeping agent context lean while providing access to the entire pipeline.

### The Two-Tool Pattern

- **`search()`:** Discovers available operations by natural language query across all loaded OpenAPI specs. Agents never need to know the full API surface.
- **`execute()`:** Invokes a specific operation with parameters. Optional GraphQL projection trims responses for token efficiency.

A single agent prompt — _"Process Q1 invoices, redact PII, cross-reference our pricing knowledge base, archive, create a data room, notify Slack"_ — triggers the entire pipeline automatically through this two-tool interface. No custom integration code. No manual handoffs.

### Key Capabilities

- MCP server supporting stdio, HTTP, and gRPC transports.
- Bundled provider specifications: GitHub, Cloudflare, Slack, Sentry, n8n, Linear, Jira, Bitbucket, and all document pipeline services.
- First-class MCP tools: `memory_ingest`/`recall()`, `knowledge_search_onyx()`, `sandbox_exec()`, `ingest_external_knowledge()`, `notify()`, `cache()`, `audit()`.
- Ouroboros 5-phase orchestration loop for complex, retryable multi-step workflows.
- Cuckoo filters for deduplication; Merkle trees for tamper-evident audit trails.
- Environment-variable feature toggles for optional layers (Onyx, Web3 provenance, Paperless compatibility).
- Unified Helm chart managing 12+ services in a single deployment.

### Production Hardening

- **Golden Image Pipeline:** Trivy + OSV-Scanner vulnerability scanning, SBOM generation, and Cosign image signing on every build.
- **Istio Service Mesh:** Optional mTLS, L7 traffic policies, and Kiali observability between all services.
- **HashiCorp Vault:** Secrets and certificate lifecycle management.
- **Kubernetes/Helm:** Horizontal scaling, rolling updates, and health-check-driven self-healing.

---

## Document Processing Pipeline

Documents flow through a sequential, modular pipeline. Each stage is a self-contained service with a clean API boundary, orchestrated by ClawQL agents via MCP tools. Files enter from Nextcloud folders, email, WebDAV, or direct upload.

**Pipeline flow:** Nextcloud / Email / WebDAV → Tika (parse + detect) → Gotenberg (convert to PDF) → Stirling-PDF (OCR + redact + Merkle) → ClawQL Archive Layer (store + index) → Onyx (semantic index) → Coneshare (distribute)

### Stage 1: Apache Tika — Universal Parsing

**License:** Apache License 2.0 — Apache Software Foundation.

Tika is the intake layer. It determines what a document is and extracts its content regardless of format, using a plugin-based parser architecture covering 1,000+ MIME types.

**Capabilities**

- Text and metadata extraction from 1,000+ formats: PDF, Office, HTML, email, archives, images, and more.
- MIME type detection and language identification.
- Tesseract OCR integration for scanned or image-based documents.
- Rich metadata preservation: EXIF, Dublin Core, document-specific properties.
- Streaming and batch processing.

**Integration Role**

ClawQL loads Tika's OpenAPI spec as a bundled provider. Agents invoke it via `execute()` on incoming files, flagging Office documents for Gotenberg conversion and extracting text that seeds Onyx indexing and Ouroboros workflows.

### Stage 2: Gotenberg — Document Conversion

**License:** MIT License — open-source, commercially permissive.

Gotenberg is a Docker-based API for converting document formats to PDF. It uses LibreOffice for Office files and Chromium for HTML and Markdown, delivering high-fidelity headless rendering.

**Capabilities**

- Converts DOCX, XLSX, PPTX, HTML, URLs, and Markdown to PDF.
- PDF merge, split, headers/footers, and compression.
- RESTful API with JSON configuration.

**Integration Role**

Receives Office files flagged by Tika. ClawQL calls it via its OpenAPI spec to normalize all documents to PDF. Output feeds directly into Stirling-PDF. Agents orchestrate batch conversion within Ouroboros loops.

### Stage 3: Stirling-PDF — Manipulation, OCR, and Redaction

**License:** Open-core. Base OSS functionality used in ClawQL. Advanced enterprise features available in paid Stirling tiers.

Stirling-PDF is the most capability-dense stage in the pipeline. All compliance-critical operations — OCR, PII redaction, and cryptographic audit generation — occur here.

**Capabilities**

- High-accuracy OCR on scanned documents (runs before archiving, so stored documents are always text-searchable).
- PII redaction with pattern matching: SSNs, account numbers, emails, and custom regex rules.
- Merkle tree generation: cryptographic audit hash per redaction step, verifiable independently of ClawQL.
- PDF merge, split, rotate, page reorganization.
- Digital signing, certification, compression, and form handling.
- Batch processing support.

**Integration Role**

Receives converted PDFs from Gotenberg. ClawQL invokes redaction rules via `execute()` and stores resulting Merkle roots in Postgres. This is the compliance enforcement point for the entire pipeline.

> **Investor note:** Stirling-PDF's open-core model means ClawQL delivers strong base capabilities with a clear upgrade path to enterprise Stirling features for customers requiring advanced compliance tooling.

### Stage 4: ClawQL Archive Layer — Storage, Metadata, and Retrieval

**License:** Assembled from Apache 2.0, AGPL, and MIT licensed components. No GPL dependency. Hosted-plan safe.

The ClawQL archive layer replaces Paperless-ngx with a purpose-built combination of components already present in the stack. It stores documents, records rich metadata, and makes the archive queryable — without introducing any GPL licensing constraints.

**Architecture**

- **Nextcloud:** Primary document store. Files land here after Stirling-PDF processing, fully OCR'd and redacted. Team members access documents via Nextcloud's familiar file browser.
- **Nextcloud Automated Tagging:** Rule-based tags applied on upload: document type classification, correspondent assignment, and workflow routing — configured via the Nextcloud admin UI or API.
- **Nextcloud Full-Text Search + Elasticsearch:** Indexes all PDF and Office content with Tesseract OCR for keyword search across the archive. Provides the same search capability as Paperless-ngx for basic retrieval.
- **ClawQL Metadata Store (Postgres):** A ClawQL-managed schema records all document metadata: correspondent, document type, custom fields, processing timestamps, Merkle roots, and redaction logs. Fully queryable by agents via MCP tools. Replaces Paperless's Django metadata model with a schema under complete ClawQL control.

**What This Replaces from Paperless-ngx**

| Paperless-ngx Feature            | ClawQL Archive Equivalent                                                   |
| -------------------------------- | --------------------------------------------------------------------------- |
| Consumption inbox (watch folder) | Nextcloud folder watch + ClawQL webhook trigger                             |
| Auto-tagging on import           | Nextcloud Automated Tagging app + ClawQL agent tag assignment via Ouroboros |
| Correspondent tracking           | ClawQL Postgres metadata store (correspondent field)                        |
| Document type classification     | ClawQL Postgres metadata store + Onyx semantic classification               |
| Full-text search                 | Nextcloud Elasticsearch full-text search (keyword) + Onyx (semantic)        |
| OCR on import                    | Stirling-PDF OCR upstream — documents are pre-OCR'd before archiving        |
| REST API                         | ClawQL MCP tools expose metadata store and Nextcloud API uniformly          |
| Archive web UI                   | Nextcloud file browser (human access) + Onyx search UI (semantic access)    |

The ClawQL archive layer is more capable than Paperless-ngx in every dimension relevant to enterprise use: richer metadata (Postgres vs. Django ORM), superior search (Onyx semantic + Elasticsearch keyword vs. Paperless keyword-only), native file collaboration (Nextcloud), and zero GPL dependency.

Self-hosted operators who prefer Paperless-ngx can continue to use it via environment-variable toggle. The ClawQL metadata store runs alongside it and picks up processed documents via post-import webhooks.

### Knowledge and Semantic Layer: Onyx

**License:** Open-source enterprise search — commercially permissive core. Review current repository for enterprise licensing terms.

Onyx transforms the document archive from a static repository into a live, queryable knowledge graph. It provides semantic retrieval with citation-backed results across all documents processed by the pipeline, plus 40+ external connectors.

**Capabilities**

- Semantic search with citation-backed results — agents know not just what was found, but where and why.
- 40+ pre-built connectors: Slack, Confluence, Drive, Jira, GitHub, email, and more.
- Real-time indexing via Apache Flink — indexes stay current as documents are processed.
- Permission-aware retrieval — agents surface only content the requesting user is authorized to see.
- Hybrid search combining keyword and vector methods for high recall and precision.

**Integration Role**

Onyx indexes content from the ClawQL archive, Nextcloud files, and Ouroboros workflow outputs. ClawQL exposes `knowledge_search_onyx()` as a first-class MCP tool, allowing agents to cross-reference institutional knowledge mid-workflow — for example, pulling pricing data from Slack during invoice processing. Post-processing results flow back into Onyx, creating a continuously enriching knowledge loop.

**Business value:** every invoice, contract, or report processed by ClawQL immediately becomes searchable and referenceable by AI agents in future workflows. Onyx is the memory that makes the system smarter over time.

### Durable Agent Memory: Obsidian Vault

**License:** Obsidian application: proprietary (free personal use). Vault file format: plain Markdown — fully open, portable, no license restrictions.

ClawQL uses Obsidian-style Markdown vaults for durable, cross-session agent memory. Unlike in-context memory that vanishes when a session ends, vault memory persists decisions, citations, Merkle roots, redaction logs, and workflow summaries across deployments and agent sessions.

**Integration Role**

The `memory_ingest()` and `memory_recall()` MCP tools write and retrieve from the vault. After each Ouroboros cycle, outputs, citations, audit hashes, and decisions are stored. This gives ClawQL genuine long-term institutional memory — a key differentiator from stateless AI pipelines that require re-explanation of context on every session.

- Vaults sync to Nextcloud for human review and team access.
- Roadmap: sqlite-vec integration for in-vault semantic recall (planned, not yet in production).

### Storage and Collaboration: Nextcloud

**License:** AGPL-3.0 — self-hosted. Nextcloud GmbH offers commercial enterprise licensing and support.

Nextcloud is the primary human-accessible storage, collaboration, and archive interface. It serves as both the entry point for documents into the pipeline and the delivery destination for processed outputs. It carries additional responsibility in ClawQL's architecture as the backbone of the native archive layer.

**Capabilities**

- File sync and sharing with granular, role-based permissions.
- Real-time collaboration via OnlyOffice or Collabora Office integration.
- WebDAV and REST API access for programmatic use by ClawQL agents.
- Automated Tagging app for rule-based file classification on upload.
- Full-text search framework (Elasticsearch + Tesseract) for keyword search across PDFs and Office files.
- Files Retention app for policy-based archival and deletion rules.
- Guest accounts and advanced access control for external collaborators.

**Integration Role**

Documents arrive in Nextcloud folders watched by ClawQL pipeline triggers. Processed outputs return to Nextcloud after Stirling-PDF, becoming the human-browsable archive. ClawQL agents interact via WebDAV or Nextcloud API. Coneshare layers on top of Nextcloud storage to add secure external sharing without file migration.

### Secure Sharing and Virtual Data Rooms: Coneshare

**License:** MIT License — open-source, commercially permissive. Self-hosted.

Coneshare is an open-source, self-hosted platform that adds secure sharing, engagement tracking, and workflow automation as a layer directly on top of Nextcloud storage. It is the external distribution endpoint of the IDP pipeline — the point at which processed, redacted, audited documents are shared with investors, legal counterparties, customers, or regulators.

**Capabilities**

- Secure share links with password protection, expiration dates, and email verification.
- Virtual Data Rooms (VDRs) with granular folder- and file-level permissions.
- Page-level engagement analytics: views, time spent per page, downloads, and revisit tracking.
- Dynamic watermarking to deter unauthorized distribution.
- File request capabilities for collecting documents from external parties.
- Webhook and Slack integrations for automated follow-up on viewer activity.

**Integration Role**

After ClawQL processes and indexes documents, agents or users create VDRs or share links via Coneshare APIs exposed through ClawQL's MCP tools. Viewer activity triggers webhooks back into Ouroboros — automatically firing Slack notifications, updating memory vaults, filing follow-up tasks, or escalating based on engagement signals. This closes the IDP loop from document ingestion to trackable external distribution.

> **Investor note:** Coneshare directly targets the Virtual Data Room market historically served by Intralinks, Datasite, and Ansarada — platforms charging $1,000–$5,000+ per deal. ClawQL delivers equivalent VDR capabilities self-hosted or via the hosted plan, with the added advantage of deep pipeline integration no standalone VDR product can match.

---

## Security, Audit, and Resilience

ClawQL is designed around a zero-trust security model. Every processing step is auditable, every service boundary is authenticated, and no document data leaves the operator's control. The hosted plan extends this model with tenant isolation and managed key management.

### Security Architecture

- **Zero-Trust Networking:** Optional Istio service mesh with mTLS, L7 traffic policies, and Kiali observability between all services.
- **Secrets Management:** HashiCorp Vault for credential and certificate lifecycle management. Per-tenant vault namespaces in hosted deployments.
- **Image Security:** Golden Image Pipeline: Trivy + OSV-Scanner scanning, SBOM generation, and Cosign signing on every container before deployment.
- **Data Sovereignty:** Self-hosted: all processing is local. Hosted: dedicated per-tenant infrastructure; no cross-tenant data access.

### Audit and Integrity

- **Merkle Trees:** Each processing step generates a cryptographic hash. Roots are stored in Postgres and verifiable independently. Tampering with any intermediate step invalidates the chain.
- **Cuckoo Filters:** Probabilistic deduplication at scale — documents are not double-processed without full database scans.
- **Audit Tool:** The `audit()` MCP tool gives agents direct access to processing logs and verification endpoints.
- **ClawQL Metadata Store:** Complete processing history per document stored in Postgres: who triggered it, which steps ran, timestamps, Merkle roots, and redaction records.

### Roadmap: On-Chain Provenance

Hyperledger Fabric integration is planned for permissioned blockchain-based document provenance — providing tamper-evident distributed history for regulated industries. This is a future capability.

> **Roadmap items:** On-chain provenance (Hyperledger Fabric) and in-vault semantic search (sqlite-vec) are planned features. All other capabilities in this document are available in the April 2026 release.

---

## End-to-End Workflow Example

The following illustrates a complete IDP workflow triggered by a single agent instruction: _"Process Q1 invoices, redact PII, cross-reference our pricing knowledge base, archive, create a data room, and notify the team."_

1. Document arrives in a Nextcloud folder (or via email/WebDAV). ClawQL detects it via folder watch or webhook.
2. ClawQL agent invokes Tika via `execute()`: MIME detection, text extraction, metadata extraction.
3. Gotenberg converts Office files to PDF for uniform downstream processing.
4. Stirling-PDF applies OCR, PII redaction rules, and generates a Merkle verification hash per step.
5. Processed, OCR'd, redacted PDF is written to Nextcloud. ClawQL Metadata Store records correspondent, document type, Merkle roots, and processing history in Postgres.
6. Nextcloud Automated Tagging applies classification tags. Onyx indexes the document for semantic search.
7. Agent queries Onyx via `knowledge_search_onyx()` to cross-reference pricing data from Slack.
8. Workflow outputs, citations, Merkle roots, and decisions ingested into Obsidian vault via `memory_ingest()`.
9. Coneshare creates a trackable VDR link with expiry, password, and watermarking.
10. Viewer engagement triggers Ouroboros webhook: Slack notification sent, memory updated, follow-up task filed.

The entire sequence above runs from a single natural-language agent prompt. No custom integration code. No manual handoffs. Full cryptographic audit trail from step 1 through step 10.

---

## Competitive Positioning

ClawQL competes across four adjacent markets — price each plugin bundle against the right incumbent:

| Competitor Category                                                                   | ClawQL tier                                                | ClawQL differentiation                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP gateways** ([executor.sh](https://executor.sh/), emerging agent infrastructure) | Developer ($29/mo), Teams ($99/mo)                         | executor.sh meters executions (250K cap + $0.20/1K overage on Team). ClawQL: unlimited executions on every tier. Plus eight efficiency layers, persistent vault memory, Onyx semantic search, and optional full IDP platform executor.sh does not ship. |
| **SaaS IDP vendors** (Hyperscience, Kofax, ABBYY)                                     | Starter–Professional (IDP bundle)                          | Cloud-hosted; per-document pricing at scale. No native MCP/agent interface. ClawQL: tenant-isolated hosted or self-hosted, flat IDP tiers, MCP-native from day one.                                                                                     |
| **VDR incumbents** (Intralinks, Datasite, Ansarada)                                   | Starter+ (IDP bundle includes Coneshare)                   | Hosted VDRs with no document processing pipeline. High per-user/per-GB/per-deal licensing. ClawQL: full pipeline integration, Coneshare VDR included in IDP subscription.                                                                               |
| **Vertical CRMs** (REsimpli, franchise transaction tools)                             | Teams ($99/mo) for agent memory; Starter ($299/mo) for IDP | CRMs track pipeline; Drive folders hold files. ClawQL connects CRM APIs + storage via MCP, indexes documents in Onyx, threads deal context in vault — without replacing Command, Dotloop, or SkySlope.                                                  |

### Real estate vertical

Brokerages on Keller Williams Command, eXp BoldTrail, Follow Up Boss, or Compass share a structural gap: **CRM knows the deal, Drive holds the files** — no semantic link between contacts and transaction PDFs.

| Need                                                             | Recommended tier                  | Why                                                                                                   |
| ---------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Connect Command + Drive, semantic search, deal memory            | **Teams ($99/mo)**                | MCP gateway + Onyx + vault — no IDP overhead for teams that do not process documents daily            |
| Title commitment classify/extract, Coneshare VDR for disclosures | **Starter ($299/mo)**             | IDP plugin bundle — explicitly opted in                                                               |
| REsimpli comparison                                              | Teams vs REsimpli Basic ($149/mo) | REsimpli is CRM-only for investors; ClawQL unifies CRM integration, document search, and agent memory |

ClawQL does **not** replace Dotloop (forms, e-sign, broker compliance) or MLS listing platforms. It is the intelligent document layer on top.

### MCP gateway: executor.sh (Market 1)

executor.sh is the closest direct competitor to ClawQL's MCP gateway layer. It routes tool calls; ClawQL operates a stateful agent platform.

| Dimension         | executor.sh                           | ClawQL                                                                              |
| ----------------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| Token efficiency  | One layer: search-and-execute only    | Eight compounding layers on top of search/execute                                   |
| Agent memory      | None — every session starts from zero | Obsidian vault with memory_ingest / memory_recall                                   |
| Semantic search   | None                                  | Onyx — 40+ connectors, hybrid search, citations                                     |
| Security          | Host-side secrets, basic audit log    | Kata isolation, WORM Merkle logs, Panguard fail-closed, documented defense-in-depth |
| Document pipeline | None                                  | Tika → Gotenberg → Stirling → archive → Onyx                                        |
| VDR               | None                                  | Coneshare included from IDP Starter                                                 |
| Sovereign LLM     | None                                  | Fine-tuned Qwen inside tenant boundary (IDP tiers)                                  |
| Execution pricing | 250K cap + $0.20/1K overage on Team   | Unlimited on every tier — no caps, no overage bills                                 |
| Gateway pricing   | Team $150/org/mo — metered routing    | Developer $29/mo · Teams $99/mo with memory + search · unlimited executions         |

executor.sh is a stateless tool router. ClawQL is a stateful agent operating system with eight compounding token-efficiency layers, persistent memory, semantic search, sovereign AI inference, a full document pipeline, a VDR, and defense-in-depth security that executor.sh cannot match at any price.

ClawQL's MCP-native architecture means it benefits automatically from improvements in AI model capabilities. As frontier models improve, ClawQL's automation depth increases without code changes.

---

## Deployment Architecture

ClawQL deploys via a unified Helm chart that provisions the full stack. All services expose OpenAPI specifications auto-loaded as ClawQL bundled providers on startup.

### Self-Hosted Stack

- Unified Helm chart: deploys ClawQL core and 12+ supporting services in a single `helm install`.
- Kubernetes with optional Istio Ambient or sidecar mesh.
- Nextcloud (AIO or standard) with folder watches for pipeline ingestion.
- Coneshare deployed alongside Nextcloud, directly integrated with its storage layer.
- Persistent volumes for Obsidian vaults, Nextcloud files, Onyx indexes, and Postgres.
- Paperless-ngx available via feature toggle for operators who prefer it (self-hosted only).

### Hosted Stack (per tenant)

- Dedicated Nextcloud instance, Postgres schema, and Onyx index per tenant.
- Shared ClawQL core and processing services (Tika, Gotenberg, Stirling-PDF) with tenant-scoped job queues.
- Istio mTLS enforced between all tenant services.
- Per-tenant secrets in HashiCorp Vault namespaces.
- Paperless-ngx not deployed — ClawQL-native archive layer only.

### Scaling Characteristics

- Stateless ClawQL core and processing workers (Tika, Gotenberg, Stirling-PDF) scale horizontally.
- Postgres and Nextcloud scale vertically or via read replicas for larger deployments.
- Onyx indexes scale independently via Flink pipeline parallelism.
- Minimum viable deployment (no Istio, no Onyx, no Coneshare) available via environment-variable toggles for evaluation.

---

## Licensing Summary

All components in the default ClawQL stack operate under licenses permissive for commercial deployment and SaaS distribution. Paperless-ngx (GPL-3.0) is available as an optional self-hosted toggle but is not part of the hosted plan or the default stack.

| Component                    | License & Commercial Notes                                                                                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ClawQL Core**              | Apache 2.0 — permissive, commercial use and SaaS distribution allowed.                                                                                                                                                                               |
| **Coneshare**                | MIT — permissive, commercial use and SaaS distribution allowed.                                                                                                                                                                                      |
| **Apache Tika**              | Apache 2.0 — permissive, commercial use allowed.                                                                                                                                                                                                     |
| **Gotenberg**                | MIT — permissive, commercial use allowed.                                                                                                                                                                                                            |
| **Stirling-PDF**             | Open-core. Base features open-source. Enterprise tiers commercially licensed by Stirling.                                                                                                                                                            |
| **Nextcloud**                | AGPL-3.0. Self-hosted use is unrestricted. Nextcloud GmbH offers commercial enterprise licensing. AGPL requires source disclosure of modifications if distributed, but does not propagate to ClawQL or applications using Nextcloud via API/network. |
| **Onyx**                     | Open-source core. Review current repository license for enterprise commercial terms.                                                                                                                                                                 |
| **Obsidian Vault Format**    | Plain Markdown — fully open, no license restrictions on vault data.                                                                                                                                                                                  |
| **Paperless-ngx (optional)** | GPL-3.0. Self-hosted deployments only. Not included in hosted plan. Operators should review GPL obligations before distributing derivative products.                                                                                                 |

The managed hosted plan is built entirely on Apache 2.0, MIT, and AGPL-licensed components. No GPL dependencies are present in the hosted stack. Legal review of AGPL network use clauses is recommended but standard for SaaS products built on AGPL software.

---

## Roadmap

The following outlines planned capabilities beyond the April 2026 release. Roadmap items are subject to change based on customer feedback and engineering priorities.

### Near-Term (Next 1–3 Months)

- Hosted plan beta launch with Free and Starter tiers.
- ClawQL Metadata Store REST API for direct metadata query without MCP client.
- Nextcloud app for in-browser document processing trigger (no agent client required).
- Automated tenant provisioning and onboarding flow for hosted customers.

### Medium-Term (3–6 Months)

- sqlite-vec integration in Obsidian vault for semantic recall over agent memory.
- Business and Enterprise hosted tiers with SLA and SSO/SAML support.
- Coneshare analytics dashboard integration into ClawQL MCP tools (view engagement data via agent query).
- Multi-region hosted deployments for EU data residency requirements.

### Longer-Term (6–12 Months)

- Hyperledger Fabric integration for on-chain document provenance in regulated industries.
- ClawQL-native document review UI — lightweight alternative to the Nextcloud file browser for archive access.
- White-label hosted option for resellers and system integrators.
- Connector marketplace for community-contributed OpenAPI specs and Onyx connectors.

---

## Frequently Asked Questions

### For Investors

**How does ClawQL generate revenue?**

The managed hosted plan is the primary revenue vehicle — monthly and annual subscriptions tiered by document volume and seats. Secondary revenue comes from commercial support contracts for self-hosted enterprise deployments. The open-source core drives adoption and inbound pipeline for both.

**Why won't customers just use DocSend or Intralinks?**

DocSend and Intralinks are distribution-only tools. They cannot redact PII, convert documents, semantically index content, or integrate with AI agents. ClawQL's VDR (Coneshare) is the last mile of a complete processing pipeline — you can't replicate that by adding a VDR on top of a disconnected stack. Additionally, per-deal VDR pricing from incumbents can reach $5,000+ for a single transaction; ClawQL's hosted plan covers unlimited VDRs within a subscription.

**What is the moat?**

Three layers: (1) **Pipeline depth** — the integration between ingestion, redaction, archive, semantic search, and VDR distribution is not replicable by bolting together point tools. (2) **MCP-native architecture** — as AI agents become the default interface for enterprise workflows, ClawQL is natively positioned to benefit without code changes. (3) **Cryptographic audit trail** — Merkle-verified processing records are a compliance differentiator in regulated industries that SaaS alternatives cannot easily replicate.

**Is the open-source core a threat to the hosted business?**

No — it is the growth engine. Self-hosted users who hit operational complexity (scaling, updates, security patches) convert to hosted. The open-source core also drives developer community adoption and reduces sales friction: customers evaluate the product on their own infrastructure before committing to hosted plans.

### For Developers

**Can I use ClawQL without the full stack?**

Yes. Each pipeline stage is independently deployable. The Helm chart supports feature toggles to enable or disable Onyx, Coneshare, Paperless-ngx compatibility, Web3 features, and Istio. A minimal deployment (Tika + Gotenberg + Stirling-PDF + Nextcloud) is viable for straightforward document processing without semantic search or VDR.

**How does the Ouroboros loop handle failures?**

Each phase in the Ouroboros loop (Interview → Seed → Execute → Evaluate → Evolve) is retryable. Failed `execute()` calls are logged with full context in the ClawQL metadata store. The Evaluate phase detects failures and the Evolve phase can re-route, retry with modified parameters, or escalate to a human via `notify()`. Merkle roots are only committed on successful step completion.

**How is the Nextcloud archive layer different from just using Nextcloud normally?**

Standard Nextcloud has no document metadata model, no correspondent tracking, and no processing history. The ClawQL archive layer adds a Postgres-backed metadata store that records full processing context per document, integrates with Onyx for semantic search, and exposes everything via MCP tools so agents can query the archive programmatically. Think of it as Nextcloud plus a document intelligence layer — not a replacement for Nextcloud's file management capabilities.

---

## Operator references

| Doc                                                                     | Purpose                                              |
| ----------------------------------------------------------------------- | ---------------------------------------------------- |
| [IDP pipeline hub](../providers/idp-pipeline.md)                        | Bundled providers, env, Helm, `DEFAULT_IDP_PIPELINE` |
| [Requirements matrix](../roadmap/idp-master-requirements-matrix.md)     | Shipped vs gap tracking                              |
| [OpenClaw IDP skill profile](../openclaw/openclaw-idp-skill-profile.md) | Agent + dashboard contract                           |
| [Agent chat contract](../dashboard/agent-chat.md)                       | Rich IDP UI JSON                                     |
| [Helm chart](../../charts/clawql-mcp/README.md)                         | Co-deploy document stack                             |
