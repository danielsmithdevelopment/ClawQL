# ClawQL Ecosystem — Complete Consolidated Slide Deck (April 2026)

**AI-Orchestrated API, Document & Enterprise Knowledge Automation + Public Agent-Native Web3 Edition + Hyperledger Fabric Permissioned Ledger**

**Unified MCP Server + Secrets + Document Pipeline + Durable Memory + Onyx Knowledge Layer + Ouroboros Orchestration + Flink Sync + OSV-Scanner (vuln + SBOM) + Optional Istio Service Mesh (mTLS, traffic management, Kiali) + The Graph + Chainlink + Hyperledger Fabric (optional) + x402 + Agent Wallets + RWA / Tokenized Lending**

_Self-Hosted, Local-First, Production-Hardened Kubernetes Stack_

**Two Forks — One Core — Zero Drift:** Regulated **SeeTheGreens / ClawQL-MCP** and public **ClawQL-Web3** share the same codebase.

_April 2026 · danielsmithdevelopment/ClawQL · docs.clawql.com_

---

## Slide 1 — Title

# ClawQL Ecosystem

### AI-Orchestrated API, Document & Enterprise Knowledge Automation + Public Agent-Native Web3 Edition

_Natural language. Any API. Any document. Any knowledge source. On-chain truth + optional permissioned provenance. One platform._

An MCP (Model Context Protocol) server (`clawql-mcp` on npm) that lets AI assistants and autonomous agents discover and call any REST operation across any OpenAPI-described API — without context bloat, without custom wrappers — plus a complete local-first document pipeline, enterprise-wide semantic knowledge search via Onyx (40+ connectors, Flink real-time sync), durable cross-session Obsidian vault memory, invisible Ouroboros orchestration, Cuckoo Filters, Merkle Trees, and production-grade secrets/storage/security.

**2026 (both forks, optional where noted):** public MCP endpoint with **x402 / MPP** micropayments; agentic wallets (**Coinbase AgentKit** + **ERC-4337**); IPFS pinning; blockchain anchoring; **The Graph** (subgraph + x402 where applicable); **Chainlink** (CRE, oracles, **CCIP**, Functions, x402-native patterns); and **Hyperledger Fabric** as a toggleable permissioned layer (`CLAWQL_ENABLE_FABRIC=true`).

**PLATFORM HIGHLIGHTS**

- MCP Server (stdio / HTTP / gRPC) + GraphQL projection; OpenAPI 3 + Swagger 2 + Google Discovery
- 9+ bundled providers (GitHub, Google Cloud, Cloudflare, Paperless NGX, Stirling-PDF, Slack, Tika, Gotenberg, Onyx)
- Obsidian vault memory + hybrid sqlite-vec (roadmap)
- Full document pipeline (1,000+ formats) — Tika → Gotenberg → Stirling → Paperless
- Onyx enterprise knowledge (40+ connectors, Flink-synced, citation-backed)
- Ouroboros 5-phase loop; Cuckoo Filters + Merkle trees (cryptographic audit)
- **ClawQL-Web3 (public fork):** x402 micropayments, agent wallets, IPFS + CCIP anchoring
- **Hyperledger Fabric (optional):** permissioned provenance, private channels, RWA registration, multi-org consortia (regulated fork) or lightweight anchoring (public fork)
- **The Graph + Chainlink** as first-class on-chain data + execution surfaces (bundled-provider model)
- **OSV-Scanner (Google):** layer-aware **container + dependency** vulnerability detection and **SBOM** support, wired into the **Golden Image Pipeline** (with **Trivy**); scannable on demand via the same `search` / `execute` surface when the OSV spec is loaded
- **Istio (optional):** **mTLS**, authz policy, traffic management, **Kiali** topology — **Ambient** or sidecar; zero-trust east-west between ClawQL, Paperless, Onyx, document services, and data planes
- Unified **Helm** chart (**12+** services with Onyx, Flink, optional OSV job/cron, **Fabric** sub-chart, optional **Istio** + ingress stack)
- ClawQL-Agent + OpenClaw + NATS JetStream + Edge Worker mode; Slack `notify()`; local-first by design; **HashiCorp Vault** or **OpenBao** for static secrets (see Infrastructure)

_April 2026 · danielsmithdevelopment/ClawQL · docs.clawql.com_

---

## Slide 2 — The Problem

### The Problem

_Modern API integration, document automation, enterprise knowledge retrieval, production security/observability, and (where enabled) agentic on-chain capital formation are still unnecessarily hard._

**01 — APIs Are Inaccessible to AI**
OpenAPI specs run to megabytes. Dumping them into an AI context window is expensive and noisy. Writing custom wrappers for every endpoint is tedious and brittle. Agents hallucinate operations that don’t exist because they have no structured way to discover what’s actually available.

**02 — Memory Dies With Every Session**
Every AI conversation starts completely blank. Architectural decisions, debugging breakthroughs, workflow history, and hard-won institutional knowledge vanish the moment the chat ends. Teams repeat the same mistakes every single session — even with the same assistant.

**03 — Documents and Company Knowledge Live in Isolated Silos**
PDFs, Word documents, spreadsheets, Slack threads, Confluence pages, Jira tickets, Drive docs — each in a different system with no unified retrieval or processing layer. Document automation tools don’t know about your company knowledge. Enterprise search tools can’t trigger document workflows. Nothing talks to each other without custom integration work.

**04 — Agents Lack Sovereign Financial Infrastructure (Web3 / Fabric path)**
Autonomous agents need a reliable, payable, auditable path to tokenized RWAs, cross-chain funding, and hybrid public/private provenance. Public chains often lack enterprise-grade audit; regulated systems often lack agent-native discoverability and x402-style payments. No single platform has bridged off-chain knowledge (Onyx, Paperless) with on-chain truth (Graph, Chainlink) under durable memory and optional Fabric-backed provenance — until the ClawQL ecosystem addresses it end-to-end.

**05 — Production Hardening Is Fragmented**
Self-hosted and air-gapped stacks still force teams to bolt on scanning, mesh, and observability by hand. **Vulnerability management** (image + dependency) often lives in a separate CI job from the runtime. **Zero-trust networking** between services is left as an exercise (manual TLS, ad hoc network policies). **Trivy** here, **Istio** and **Kiali** there, SBOMs in a spreadsheet — inconsistent posture, duplicated effort, and blind spots. ClawQL unifies **Golden Image** builds (**Trivy** + **OSV-Scanner** + **SBOM** + **Cosign** + policy gates), optional **Istio** (mTLS, L7 policy, resilience), and **Kiali** / **Jaeger**-class visibility in **one** Helm story alongside the MCP and document stack.

---

## Slide 3 — What is ClawQL?

### What is ClawQL?

_A TypeScript MCP server + full ecosystem that makes AI assistants and autonomous agents capable of operating any API, any document workflow, any enterprise knowledge source, and (on the public fork) on-chain financial actions with optional permissioned provenance._

ClawQL is published as `clawql-mcp` on npm. The core bridge remains **`search` + `execute`** over OpenAPI, Swagger, and Google Discovery specs. On top: the full document pipeline, Onyx knowledge, Obsidian memory, Ouroboros, Cuckoo + Merkle audit, and the unified Helm story.

**New 2026 layers (shared core; opt-in by fork and by env):**

- **ClawQL-Web3 (public):** discoverable, payable MCP endpoint; x402 / MPP; ERC-4337 agent wallets; IPFS; CCIP anchoring.
- **Hyperledger Fabric:** `CLAWQL_ENABLE_FABRIC` — peers, orderers, CouchDB, chaincode as a Helm sub-chart when enabled. Same `search` / `execute` / GraphQL + Ouroboros paths; appears like any other bundled provider (`providers/fabric/openapi.yaml` + ABIs) where applicable.
- **The Graph + Chainlink:** bundled-provider style tooling for on-chain data, oracles, CRE, CCIP, and Functions.

The regulated fork (**SeeTheGreens / ClawQL-MCP**) and the public fork (**ClawQL-Web3**) are **one codebase** — zero drift. Fabric mode differs by deployment (full consortia vs. lightweight anchoring), not by a separate product core.

**Core Layers**

- **API Bridge:** `search` + `execute` across bundled and custom OpenAPI providers
- **Memory:** Obsidian vault + wikilinks; sqlite-vec roadmap
- **Document pipeline:** 1,000+ formats
- **Knowledge:** Onyx + Flink
- **Orchestration:** Ouroboros 5-phase loop
- **On-chain + provenance (when enabled):** Web3 pay-per-call surfaces; Graph/Chainlink; Fabric for tamper-evident, channel-isolated history
- **Security & resilience (all deployments):** **OSV-Scanner** (CVE + SBOM) integrated with the **Golden Image Pipeline**; **Trivy** in CI; optional **Istio** for **mTLS**, L7 policy, and **Kiali**-visible service graph; **Vault**/**OpenBao**-backed secrets with injector sidecars; audit ring buffer can record **OSV** summary hashes alongside Onyx and tool calls

`npm install -g clawql-mcp` · `github.com/danielsmithdevelopment/ClawQL`

---

## Slide 4 — Who ClawQL Is For

### Who ClawQL Is For

_Three audiences — one platform that serves all of them from a single deployment._

**Developers & Power Users**

- Use Cursor + ClawQL MCP to operate any REST API via natural language — no Postman, no curl
- Build workflows that span GitHub, Cloudflare, Google Cloud, Slack, Onyx, and your own services
- Persistent Obsidian memory means decisions made in Monday’s session are recalled on Friday — including Onyx-retrieved company knowledge
- Operate your homelab (TrueNAS, Kubernetes, Paperless) the same way you operate SaaS APIs
- Document processing pipeline handles PDFs, Office files, and archives without manual tool switching
- Onyx lets you cross-reference company knowledge inside any document workflow automatically
- stdio transport works seamlessly inside Cursor — no ports to configure
- Use **ClawQL-Web3** MCP for tokenized-lending and RWA flows settled via x402
- **OSV-Scanner** and **Trivy**-backed images: discover “scan this image / lockfile” operations via the same `search` + `execute` story — no separate security CLI dance for routine checks
- Optional **Istio** for **homelab** or multi-node clusters: mTLS between `clawql`, `onyx`, `paperless`, and document workers without custom firewall scripts

**Companies & Teams**

- Run **full multi-org Hyperledger Fabric** consortia for compliance-grade RWA servicing and permissioned data sharing where required
- Automate document ingestion, OCR, redaction, and archiving entirely in-house — no SaaS data exposure
- Onyx indexes your entire company knowledge base (Slack, Confluence, Drive, Jira, GitHub, email) and makes it queryable inside any Ouroboros workflow — permission-aware and citation-backed
- Flink pipelines keep Onyx’s index continuously up to date — no stale retrieval
- Slack `notify()` integration delivers workflow results to the right channel automatically, including Onyx citations and Paperless links
- Audit trails via Merkle trees prove every processing step — including knowledge retrieval — valuable for compliance
- Cuckoo filter deduplication prevents duplicate document imports at scale
- **One Helm chart** manages MCP, documents, Onyx, Flink, **OSV-Scanner** jobs, optional **Istio** + ingress, **Kiali**, **Vault** integration — not a patchwork of install guides
- **Istio mTLS** on Paperless, Onyx, and internal APIs where policy demands encryption in transit; **Kiali** for who-talks-to-whom during audits
- Extensible with any OpenAPI spec

**Investors & Partners**

- Agentic **Web3** infrastructure: enterprise knowledge + optional **permissioned-ledger** positioning (Fabric hybrid) + **x402** + **The Graph / Chainlink** in one product story
- Early MCP + automation moat: 9+ bundled providers, Onyx, durable memory, Ouroboros
- Technical moat: Obsidian + Onyx + Merkle + (optional) Fabric provenance and public on-chain verifiability — network effects as more agents and consortia join
- **Public fork revenue** (usage, RWA, channel services) can subsidize regulated / private fork development; same core code preserves engineering leverage
- Local-first story still resonates for enterprise and regulated buyers
- **Production security** as part of the moat: **Trivy** + **OSV-Scanner** + **SBOM** in the **Golden Image Pipeline**, not an aftermarket bolt-on; optional **Istio** + **Kiali** for zero-trust networking story in regulated RFPs
- Simple scaling via unified Helm; optional service-mesh and scan profiles per environment

---

## Slide 5 — Section Divider: Core Platform

# 01 — Core Platform

_The MCP server, tool surface, transport layers, GraphQL projection, memory system, Onyx knowledge layer, and **security/resilience extensions** (OSV-Scanner, Golden Image, optional Istio) that power everything — **identical across both forks** (SeeTheGreens / ClawQL-MCP and ClawQL-Web3)._

---

## Slide 6 — Architecture Overview

### Architecture Overview

_Four logical layers: clients, ClawQL core + platform security hooks, service targets, and (optional) mesh-wide security & resilience._

**Layer 1 — AI clients**

- Cursor (stdio — primary)
- Claude Desktop, any MCP-compatible client
- HTTP / Streamable HTTP and gRPC consumers (cluster or remote)

**Layer 2 — ClawQL core + in-process security hooks**

- **`search` / `execute`** — OpenAPI discovery and execution (all bundled providers, including Onyx, **OSV-Scanner**-wrapped operations when the spec is merged, and Web3/Graph/Chainlink when enabled)
- **`memory_ingest` / `memory_recall`**, **`knowledge_search_onyx`**
- **GraphQL projection** — strips verbose JSON (Onyx, **OSV** reports, service metrics)
- **Ouroboros** — Interview → Seed → Execute → Evaluate → Evolve
- **`notify()`**, **`cache`**, **`audit`** (optional ring buffer: tool calls, Onyx retrievals, **OSV** / scan summaries)

**Layer 3 — API & data-plane targets**

- GitHub, Google Cloud, Cloudflare, Paperless NGX, Stirling-PDF, Tika, Gotenberg, Slack
- **Onyx** (40+ connectors, Flink-synced) + any custom **OpenAPI** in `providers/`
- **Hyperledger Fabric** (optional) — **peer** / **orderer** / **CA** and optional **REST** **gateway**; **`search`/`execute`** to **chaincode** like any provider when `CLAWQL_ENABLE_FABRIC` is on
- **MinIO** / object storage, **Postgres** / **Redis** for seeds, Merkle, state

**Layer 4 — Security, supply chain, and service mesh (cluster-wide)**

- **Golden Image Pipeline** — **Trivy** + **OSV-Scanner** + **SBOM**; **Cosign** signing; **OPA Gatekeeper** / **Kyverno** policy; Merkle- or Vault-backed attestation of scan results where configured
- **Istio** (optional) — **mTLS**, L7 **AuthorizationPolicy**, retries, circuit breakers, canary-friendly traffic; **Ambient** (preferred for new installs) or sidecar Envoy
- **Kiali** — service graph, health, and config validation for the mesh
- **Jaeger** (or OTel → backend of choice) — end-to-end traces for Ouroboros spans, Onyx, document services, and mesh hops
- **Istio ingress/egress gateways** — single front door and controlled egress; internal DNS still `*.svc.cluster.local` behind the mesh

---

## Slide 7 — MCP Tool Surface

### MCP Tool Surface

_Ten tools — two core, eight extended — covering API operations, memory, knowledge search, code execution, notifications, and audit. **Vulnerability and SBOM** flows also surface through **`search` / `execute`** when the **OSV-Scanner** (or CI-wrap) spec is in the provider merge — same pattern as every other OpenAPI target._

**`search` — Core**
Fuzzy-discovers operations and parameters from all loaded OpenAPI/Discovery specs. Returns the most relevant endpoints without dumping the full spec into context. The AI never sees more than it needs.

**`execute` — Core**
Calls a discovered REST operation with proper auth headers and a fully typed request body. Handles all providers — GitHub, Cloudflare, Paperless, Stirling, Onyx, Slack, and more — through one consistent interface.

**`memory_ingest` — Memory**
Writes durable Markdown notes into an Obsidian vault on disk. Supports structured insights, optional conversation capture, tool outputs, optional **`enterpriseCitations`** (trimmed Onyx-style rows for vault-safe trails), wikilinks between notes, and frontmatter provenance metadata. Pair with **`knowledge_search_onyx`** and pass citations explicitly — no silent auto-append.

**`memory_recall` — Memory**
Retrieves topically relevant vault notes using keyword matching and optional graph-depth traversal (`maxDepth`). Returns ranked pages — not the whole vault — so context stays lean and precise.

**`knowledge_search_onyx` — Knowledge**
Optional MCP tool ( **`CLAWQL_ENABLE_ONYX=true`** ) over the bundled Onyx OpenAPI operation **`onyx_send_search_message`** → **`POST /search/send-search-message`** (merged id **`onyx::onyx_send_search_message`** when **`onyx`** is in the provider merge). Same auth as **`execute`** on **`onyx`** (`ONYX_BASE_URL`, Bearer token). Responses are JSON from your Onyx deployment; use **`execute`** **`fields`** or **`memory_ingest`** **`enterpriseCitations`** for small, durable slices. Where GraphQL mesh applies to a loaded spec, **`execute`** can still trim via the in-process GraphQL path; the bundled minimal Onyx surface is REST-first.

**`sandbox_exec` — Execution**
Executes remote code in a Cloudflare Sandbox via a bridge. Enables agents to run code, validate outputs, and test scripts without requiring local execution infrastructure on the client side.

**`ingest_external_knowledge` — Knowledge**
Bulk-ingests Markdown content and optionally fetches and stores external URLs. Useful for seeding the knowledge layer with documentation, runbooks, or third-party reference material.

**`notify()`**
First-class Slack notification tool. Sends structured messages to configured channels using the bundled Slack spec and `CLAWQL_SLACK_TOKEN`. Called by Ouroboros at workflow milestones, completions, retries, and audit events. Can include Onyx citation links and Paperless document links in notifications.

**`cache`**
In-process LRU scratch storage for session-scoped ephemeral state. `cache` is ClawQL Core (always on); vault memory defaults on — set `CLAWQL_ENABLE_MEMORY=0` to opt out. Stores transient tool results, intermediate computations, or tool-discovery caches during a session.

**`audit`**
In-process event ring buffer for operator audit trails — always registered. Records all tool calls — including Onyx knowledge retrievals, **`execute`**’d **OSV-Scanner** / Trivy summary callbacks (if your integration emits them to the bus), and workflow events — in a structured, queryable log for compliance purposes. Pair with `memory_ingest` to persist trimmed **vuln summary + Merkle** next to a workflow’s knowledge citations.

**Security extension — same `search` + `execute` model**

- Example prompts: _“Run OSV-Scanner on the latest `clawql` image tag”_ or _“Rescan lockfile after dependency bump”_ → `search` returns the `operationId` and minimal parameter schema; `execute` runs the scan, GraphQL trims the response to **CVE id, package, version, fix version** (no raw 50 MB reports in context).
- **Istio** and mesh CRDs are not separate MCP “magic” — where a control-plane API is exposed as OpenAPI (or via a thin wrapper), it is discoverable like anything else; day-two ops still use **Kiali** and **`kubectl`**, while agents automate change tickets from **scan** + **graph** + **Onyx** context.

---

## Slide 8 — search + execute: How API Discovery Works

### search + execute: How API Discovery Works

_The two core tools that make any OpenAPI-described API instantly accessible without context bloat — **including** Onyx, **OSV-Scanner**, and (where meshed) metrics/traffic objects trimmed by GraphQL._

**search() — Step 1: Discover the right operation**

1. User asks: e.g. “Create a GitHub issue for the Cuckoo filter work,” “Search company pricing policy,” or “**Run OSV-Scanner on the latest ClawQL image** / **rescan** `go.sum` / `package-lock`”
1. `search()` receives query: `'GitHub create issue POST'`
1. ClawQL scans all loaded specs — only GitHub in this case
1. Returns: `operationId issues_create`, path `POST /repos/{owner}/{repo}/issues`
1. Also returns: required fields (`title`), optional (`body`, `labels`, `assignees`)
1. AI sees only the relevant operation — not 50 MB of GitHub’s full spec

**execute() — Step 2: Call the operation precisely**

1. AI calls `execute()` with `operationId: issues_create`
1. ClawQL injects `CLAWQL_GITHUB_TOKEN` as Authorization header automatically
1. Builds POST body: `{ title: "…", body: "…", labels: […] }`
1. Sends to `https://api.github.com/repos/{owner}/{repo}/issues`
1. GraphQL projection strips unused fields from the response
1. Returns: issue number, URL, and status — exactly what the AI needs, nothing more

**Key insight:** The AI never sees the full OpenAPI spec. `search()` returns only the relevant slice. `execute()` handles all auth and HTTP mechanics transparently. The same pattern applies to every bundled provider — including Onyx’s **`onyx_send_search_message`** and optional **`onyx_ingest_document`**, and **OSV-Scanner**-backed or CI-bridged scan operations: responses are **GraphQL-trimmed** to a **vulnerability summary** (id, package, version, source) so the model does not drown in SBOM line noise.

---

## Slide 9 — Memory System: Obsidian Vault

### Memory System: Obsidian Vault

_Durable, graph-connected, cross-session memory that works with any assistant — not just the current one — enriched by Onyx, **Merkle**, and (when you ingest them) **OSV-Scanner** / **Trivy** result summaries for a single recall surface._

**How the Memory System Works**

**Ingest**
`memory_ingest()` writes Markdown notes to an Obsidian vault on disk. Notes include structured insights, wikilinks to related pages, frontmatter provenance (when, what), and optional conversation capture. Use stable, append-friendly note titles so runbooks accumulate instead of fragment. After **`knowledge_search_onyx`**, pass a trimmed **`enterpriseCitations`** list (or redacted **`toolOutputs`**) so enterprise hits are recallable via **`memory_recall`** without pasting full Onyx payloads (#130).

**Graph**
`[[wikilinks]]` between notes build Obsidian’s graph. `memory_recall()` can traverse this graph via `maxDepth` — so a query for `'Q1 pricing policy'` surfaces not just the direct note, but linked Onyx citation pages, Paperless document IDs, GitHub issue references, and related workflow decisions across the entire graph.

**Recall**
In a fresh Cursor session (hours, days, or weeks later), `memory_recall()` returns ranked, topically relevant pages. The AI gets exactly enough context — not the whole vault. Hybrid sqlite-vec vector embeddings (roadmap) will make recall even more precise. Onyx-ingested knowledge enriches the recall results further without a live Onyx query.

**Why This Changes Everything**

- Plans made in a Grok or Claude session can be recalled in Cursor the next day
- Architectural decisions persist across months — no more re-explaining context
- Onyx-retrieved company knowledge (pricing decisions, policies, Jira tickets) is ingested into the vault and becomes recallable in any future session without re-querying Onyx
- `memory_ingest` after any significant workflow builds a living runbook automatically
- **Cross-tool** — Ingest in **Grok** or **Claude**, **recall** in **Cursor**; add **Onyx** citations and **OSV**/**Trivy** scan summaries the same way — **`memory_recall`** surfaces all of it without re-pasting. After **`knowledge_search_onyx`** and an **`execute`’d OSV** pass, use **`enterpriseCitations`** + a trimmed **scan** block in **`memory_ingest`** for a **CVE id + Merkle + policy** runbook
- After recall, `search` + `execute` can file GitHub issues from the recalled plan — no copy-paste
- After document workflows, Ouroboros can **`memory_ingest`** summaries (citations, Merkle roots, doc IDs) — automation tracked in #116 / #141
- Hybrid `memory.db` sidecar (SQLite + sqlite-vec) planned for vector-ranked chunk retrieval

---

## Slide 10 — Cross-Thread Recall: The Killer Feature

### Cross-Thread Recall: The Killer Feature

_This is what separates ClawQL from every other MCP server._

**REAL CASE STUDY — April 2026**

**The Situation**
A detailed Cuckoo filter + hybrid memory architecture was designed and discussed in a Grok session. The plan was never committed to GitHub. No code was written. The design only existed in that conversation.

**Without ClawQL:**
A fresh Cursor session finds nothing in the repo. The answer is “no Cuckoo filter references found” — accurate but completely misleading. The plan is effectively lost.

**With ClawQL `memory_recall`:**
The Grok summary was ingested into the vault. `memory_recall('Cuckoo filter hybrid memory')` surfaces the full design, env vars, sqlite-vec wiring, and Merkle semantics — then `search` + `execute` files GitHub epic #68 and children #69–72 from that recalled context.

**With Onyx + security context added**
Onyx’s index includes the Slack thread where the team discussed filter tradeoffs. `knowledge_search_onyx('Cuckoo filter implementation')` returns cited chunks for **`memory_ingest`**. Separately, **`search` + `execute`** on **OSV-Scanner** / Trivy summary for the **current** `clawql` image and lockfile can be **ingested** the same day — so **`memory_recall('Cuckoo + scan')`** surfaces design + **company citations** + **“no critical CVEs on main image”** in one pass (exact fields depend on your spec trim rules).

**THE WORKFLOW**

1. **Session A (any tool)** — Work on architecture + run `knowledge_search_onyx` for relevant company context. At end of session, `memory_ingest()` a stable summary note including Onyx citations and wikilinks.
1. **Session B (fresh — any tool)** — Run `memory_recall('topic')` at the start. Cursor gets ranked vault pages — including the ingested Onyx context — no pasting, no context reloading.
1. **Synthesize + Act** — AI combines recalled vault context (including Onyx-derived company knowledge) with current repo state. No contradictions. No stale data.
1. **File the Work** — `search()` + `execute()` on GitHub API converts recalled plans directly into issues — epic + children. Zero copy-paste.

---

## Slide 11 — Transport Layers & GraphQL Projection

### Transport Layers & GraphQL Projection

_Three ways to connect; one layer that keeps responses lean regardless of provider._

**stdio**
Primary transport for Cursor. Zero configuration — point Cursor’s MCP settings at the `clawql-mcp` binary. Runs in-process, sub-millisecond latency, no ports to open, no auth tokens to configure on the transport layer. This is how you use ClawQL daily.
_USE CASE: Daily development in Cursor_

**Streamable HTTP**
Exposes ClawQL at `/mcp` over HTTP for remote deployments — including the Kubernetes cluster. Enables web-based MCP clients, CI/CD pipelines, and automated agents to call ClawQL without running a local process. Supports streaming responses for long-running operations.
_USE CASE: K8s deployment, remote agents_

**gRPC**
High-performance protobuf MCP transport on port 50051, enabled via `ENABLE_GRPC=true`. Powered by the reusable `mcp-grpc-transport` npm package. Best for high-throughput internal service communication — e.g. Ouroboros calling ClawQL tools at volume inside the cluster, including high-frequency Onyx knowledge queries.
_USE CASE: High-throughput internal calls_

**GraphQL Projection Layer — Keeping Responses Lean**

Without projection: A Cloudflare zone list returns ~85 fields per zone. A GitHub PR response is ~200 fields. An Onyx semantic search result returns full document chunks, source metadata, and permission data. Dumping any of these into the AI context wastes tokens and buries the useful signal in noise.

With ClawQL’s GraphQL projection: `execute()` passes the response through an in-process GraphQL layer that returns only the fields the AI explicitly requested. A zone list might return only `{id, name, status}`. An Onyx result returns only `{chunk_text, source_name, citation_url, relevance_score}`. An **OSV-Scanner** (or Trivy JSON via adapter) result returns a **vuln list + digest summary**, not full layer tar dumps. **Istio** **Envoy** stats and **Kiali**-driven service metrics can be trimmed the same way when exposed through a load or metrics OpenAPI — keeping mesh observability on-topic in the model.

---

## Slide 12 — Section Divider: Document Pipeline

# 02 — Document Pipeline

_Stirling-PDF · Paperless NGX · Apache Tika · Gotenberg · Onyx — **knowledge-augmented, security-scanned** end-to-end: **Trivy** + **OSV-Scanner** in the **Golden Image** path; optional **Istio mTLS** between every hop._

---

## Slide 13 — Document Pipeline Overview

### Document Pipeline Overview

_Five document/knowledge services plus a **security** pass — a complete, knowledge-augmented, **scan-aware** processing and archival system._

**The two-layer + security architecture**

**Knowledge layer** (parallel / on-demand via Ouroboros):
**Onyx** (40+ connectors, Flink-synced) provides company context before, during, and after workflows.

**Document processing layer** (sequential):
**Tika** → **Gotenberg** → **Stirling** → **Paperless**.

**Security layer** (post-build and/or post-step):

- **OSV-Scanner** — on **images** and **lockfiles** (CI cron or on-demand `execute`); **SBOM**-friendly output folded into the Golden Image gate and optional **`memory_ingest`**
- **Trivy** — in CI on every build; high/critical gates with Cosign+policy; complements OSV (ecosystem overlap is intentional: defense in depth)
- **Istio** — **mTLS** + authz for east-west calls (`clawql` → `tika` → `paperless` → `onyx`); not a substitute for app auth but **zero-trust** on the wire

**Services (Helm, internal DNS)** — Tika `tika:9998`, Gotenberg `gotenberg:3000`, Stirling `stirling-pdf:8080`, Paperless `paperless:8000`, Onyx `onyx:8080` (optional), **OSV-Scanner** optional **CronJob** or sidecar `osv-scanner:8080` (illustrative), all behind **Istio** when enabled.

All three logical layers feed **Obsidian** via **`memory_ingest`**; **memory_recall** surfaces Onyx, Merkle, and (if ingested) OSV summary in one ranked set.

---

**Apache Tika**
DNS: `tika:9998` | Ingress: internal only
Universal text & metadata extraction from 1,000+ file formats. The document pipeline’s intake layer.

- PDF text extraction
- Office: Word/Excel/PPT
- HTML, XML, email (.eml)
- OCR fallback via Tesseract
- Metadata: author, dates, language
- 1,000+ MIME types supported

---

**Gotenberg**
DNS: `gotenberg:3000` | Ingress: internal only
High-fidelity document conversion to PDF using headless Chromium and LibreOffice.

- HTML → PDF (Chromium)
- Markdown → PDF
- Office → PDF (LibreOffice)
- URL → PDF screenshot
- Merge + split in conversion
- Header/footer injection

---

**Stirling-PDF**
DNS: `stirling-pdf:8080` | Ingress: `pdf.clawql.local`
Heavy PDF manipulation engine — the pipeline’s processing workhorse after conversion.

- Merge / split PDFs
- High-accuracy OCR
- PII redaction (SSN, etc.)
- Sign & certify
- Compress & optimize
- Batch processing

---

**Paperless NGX**
DNS: `paperless:8000` | Ingress: `paperless.clawql.local`
Long-term archive with Tika-powered OCR, auto-tagging, full-text search, and consumption inbox.

- Auto-tag by content
- Correspondent tracking
- Full-text search index
- Consumption inbox folder
- Tika as parser backend
- Isolated Postgres + Redis

---

**Onyx**
DNS: `onyx:8080` | Ingress: `onyx.clawql.local` (optional)
Enterprise semantic search across 40+ connectors — the knowledge backbone of the entire platform.

- Permission-aware semantic search
- 40+ connectors (Slack, Drive, Confluence, Jira, GitHub, email, and more)
- Citation-returning ranked results
- Real-time Flink sync
- MCP server + REST OpenAPI
- File upload + indexing API for newly archived Paperless documents

---

## Slide 14 — Stirling-PDF: The PDF Manipulation Engine

### Stirling-PDF: The PDF Manipulation Engine

`stirlingtools/stirling-pdf:latest` · Internal DNS: `stirling-pdf:8080` · Ingress: `pdf.clawql.local`

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

_Config: `DOCKER_ENABLE_SECURITY=false` — removes the 5-user SaaS restriction for unlimited self-hosted use. No rate limits, no user caps._

**Ouroboros + Onyx + OSV**
Ouroboros can cross-reference Stirling output with **Onyx**-retrieved policy and run **OSV-Scanner** against the **image** that served this batch (or the `stirling` tag in CI) before **`memory_ingest`** — Merkle leaves can include a **hash of the scan summary** for that run.

---

## Slide 15 — Paperless NGX: The Long-Term Archive

### Paperless NGX: The Long-Term Archive

`paperlessngx/paperless-ngx:latest` · Internal DNS: `paperless:8000` · Ingress: `paperless.clawql.local`

**Core Capabilities**

- Full-text search across all archived documents (powered by Tesseract OCR + Tika parser)
- Auto-tagging by document content, date, correspondent, and type
- Correspondent tracking — associate documents with senders/issuers (e.g. ‘IRS’, ‘Bank of America’)
- Consumption inbox folder — drop files in, Paperless ingests and tags automatically
- Document versioning and update tracking
- Custom field definitions for domain-specific metadata
- REST API (OpenAPI spec at `/api/schema/`) — what ClawQL uses for `search` + `execute`
- Bulk import, export, and migration tools

**Tika Integration**
Paperless is configured with `TIKA_ENABLED=true` and `TIKA_URL=http://tika:9998`. This replaces Paperless’s built-in parser with Apache Tika, extending support from basic PDFs to 1,000+ formats including Office documents, emails, and archives — all ingested natively.

**Onyx Bridge**
After a successful Paperless import, Ouroboros can optionally call Onyx’s file upload + indexing API to make the newly archived document immediately searchable inside Onyx’s enterprise index — so the document is both archived in Paperless and semantically queryable via `knowledge_search_onyx` in the same workflow.

**Isolated Backends**
Paperless runs with its own dedicated Postgres (`paperless-postgres:5432`) and Redis (`paperless-redis:6379`) instances — isolated from ClawQL’s shared backends to prevent schema conflicts. Both are included in the unified Helm chart.

**Istio**
With **Istio** enabled, **Paperless** ingress and east-west gRPC/HTTP to **Tika** / **Gotenberg** use **mTLS** and L7 **AuthorizationPolicy** (service accounts, JWT, or mTLS ID — per your cluster policy) — reduces lateral movement if a pod is ever compromised.

_OpenAPI spec fetched from `/api/schema/` and bundled as `providers/paperless.json`. Runtime base URL injected via `PAPERLESS_BASE_URL` at spec refresh time._

---

## Slide 16 — Apache Tika: Universal Content Extraction

### Apache Tika: Universal Content Extraction

`apache/tika:latest` · Internal DNS: `tika:9998` · Internal-only service

Apache Tika is the document pipeline’s intake layer — the universal translator that extracts text, metadata, and structure from virtually any file format. Tika backs both Paperless NGX (as parser) and standalone extraction calls from Ouroboros. While Tika handles raw extraction from files already in the pipeline, Onyx handles semantic retrieval across the broader enterprise knowledge base — the two complement each other without overlap.

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

_1,000+ MIME types supported. Tika drives metadata-informed routing decisions in Ouroboros — e.g. detecting Office files and routing to Gotenberg before Stirling._  
**OSV-Scanner** validates **Tika** (and other) **images** in the **Golden Image** build; Tika’s **JARs** and native deps are in the **SBOM** for continuous monitoring.

---

## Slide 17 — Gotenberg: High-Fidelity Document Conversion

### Gotenberg: High-Fidelity Document Conversion

`gotenberg/gotenberg:8` · Internal DNS: `gotenberg:3000` · Internal-only service

Gotenberg converts any document type to PDF with pixel-accurate rendering. It uses headless Chromium for HTML/URL-to-PDF and LibreOffice for Office-to-PDF. In the pipeline, it sits between Tika (detection) and Stirling (manipulation) — ensuring everything is a clean PDF before processing.

**HTML → PDF (Chromium)**
Full Chromium rendering engine converts HTML pages to PDF with exact visual fidelity — fonts, CSS, JavaScript-rendered content, flexbox layouts. Supports custom headers, footers, margins, and paper sizes. Ideal for invoice templates, report generation, and web-scraped content archival.

**Office → PDF (LibreOffice)**
LibreOffice converts Word (.doc, .docx), Excel (.xls, .xlsx), PowerPoint (.ppt, .pptx), and OpenDocument formats to PDF with high layout fidelity. Critical for the pipeline when users drop Office files into the Paperless consume folder — Gotenberg converts them before Stirling processes.

**Markdown → PDF**
Converts Markdown documents to styled PDFs. Useful for technical documentation, runbooks, and meeting notes stored in Markdown. Supports syntax highlighting, tables, and embedded images. Often triggered when exporting vault notes or developer documentation for archival.

**URL → PDF (Screenshot)**
Navigates to any URL using Chromium and renders a full-page PDF. Headers, footers, and JavaScript-rendered content are all captured. Useful for archiving web pages, terms of service snapshots, invoices from web portals, or any URL-based document that needs to be preserved.

**PDF Merge (in conversion)**
Gotenberg can merge multiple PDF files in a single conversion request — before Stirling receives them. This allows Ouroboros to batch-convert a folder of Office files and merge them in one Gotenberg call, rather than a separate Stirling merge step, for efficiency.

**Header & Footer Injection**
Inject custom HTML headers and footers into converted PDFs — company logos, page numbers, date stamps, document reference numbers, or confidentiality notices. Driven by Ouroboros workflow parameters so each document class can have its own footer template.

**Istio** — In mesh installs, **Gotenberg** is internal-only; **Istio** enforces mTLS to Chromium/LibreOffice subprocess boundaries at the **pod** network (not inside the browser sandbox — pattern: isolate the whole conversion workload).

---

## Slide 18 — Onyx: Enterprise Knowledge Search

### Onyx: Enterprise Knowledge Search

_The knowledge backbone — semantic search across your entire company, permission-aware, real-time, citation-backed._

**What Onyx Is**
Onyx is an open-source enterprise knowledge search platform that indexes your company’s knowledge base across many connectors. ClawQL ships a **minimal bundled OpenAPI** at **`providers/onyx/openapi.yaml`**: semantic search via **`POST /search/send-search-message`**, optional ingestion via **`POST /onyx-api/ingestion`** (#120). Set **`ONYX_BASE_URL`** (API root; include **`/api`** if mounted there), Bearer **`ONYX_API_TOKEN`**, and **`CLAWQL_ENABLE_ONYX=true`** to register **`knowledge_search_onyx`**. Full upstream OpenAPI can be refreshed with **`npm run fetch-provider-specs`** when **`ONYX_BASE_URL`** is set (#143).

**40+ Connectors**

- Slack (threads, channels, DMs — indexed and searchable in near real time via Flink)
- Google Drive (Docs, Sheets, Slides, folders)
- Confluence (pages, spaces, comments)
- Jira (tickets, epics, comments, sprint history)
- GitHub (issues, PRs, code, wikis)
- Gmail / Outlook (email threads)
- Notion, Linear, Zendesk, Salesforce, and more

**Permission-Aware Search**
Onyx respects the permission model of each connected source. If a user doesn’t have access to a given Confluence space, that space doesn’t appear in their Onyx results — even when queried through ClawQL. Enterprise data governance is enforced at the retrieval layer, not at the application layer.

**Citation-Returning Results**
Onyx returns permission-aware hits (shape varies by version). For durable vault trails, chain **`knowledge_search_onyx`** → **`memory_ingest`** with **`enterpriseCitations`** or redacted **`toolOutputs`** — small, attributable rows without dumping the full retrieval JSON (#130).

**Flink Real-Time Sync**
Flink pipelines keep Onyx’s index continuously updated from all connected sources. New Slack messages, updated Confluence pages, closed Jira tickets — all reflected in Onyx’s index within minutes. `knowledge_search_onyx` never returns stale results, even in fast-moving company environments.

**Istio** — `onyx:8080` traffic from **ClawQL** and **Flink** connectors is **Istio-mTLS**-wrapped in hardened deployments; **Kiali** shows which workloads still talk plaintext (should be **none** in production).

---

## Slide 19 — Complete Pipeline: Step by Step

### Complete Pipeline: Step by Step

_A real Cursor session — from natural language to archived, cross-referenced, verified, and notified._

You type in Cursor: _“Process the new Q1 invoices from the consume folder, cross-reference them against our company pricing decisions from last quarter, redact PII, archive everything, and create follow-up GitHub issues if anything is missing.”_

**1 — Onyx: Knowledge Retrieval**
Ouroboros calls `knowledge_search_onyx('Q1 pricing decisions 2025' + 'invoice policy')`. Onyx queries its index across Slack, Confluence, Drive, and Jira — returns ranked, permission-aware chunks with citations. Use **`execute`** **`fields`** or post-process JSON to keep only what the agent needs. Results held in context for the cross-reference step.

**2 — Tika: Extract & Detect**
Tika analyzes each incoming file: PDFs pass through, Office files (Word/Excel) are flagged for conversion, damaged files are reported. Metadata extracted: author, creation date, language, MIME type — drives all downstream routing decisions.

**3 — Gotenberg: Convert to PDF**
All non-PDF files (Word invoices, Excel statements) are converted to PDF by Gotenberg using LibreOffice. Cuckoo filter checks: is this converted PDF already in the pipeline? If yes, skip. Result: a clean set of PDFs ready for Stirling.

**4 — Stirling: Merge + OCR + Redact**
Stirling merges all PDFs into one document, runs high-accuracy OCR, then cross-references OCR’d invoice line items against the Onyx pricing results — flagging 3 discrepancies. Redacts all SSN and credit card patterns. Merkle tree hashes each step output including the Onyx retrieval leaf.

**5 — Paperless: Import & Archive**
Cuckoo filter: document hash not seen before. Paperless imports the merged, OCR’d, redacted PDF with tags `['Q1-2026-invoices']`. Onyx indexing API called — document now immediately searchable enterprise-wide via `knowledge_search_onyx`.

**6 — GitHub: File Issues**
For each flagged pricing discrepancy, `search()` finds GitHub issue create → `execute()` files a tracking issue with the Onyx citation link and Paperless document reference. Three issues filed: #201, #202, #203.

**7 — OSV-Scanner: validate artifacts (optional but recommended)**
**`search` + `execute`** (or a **CronJob** tied to the same **digest** you deployed) runs **OSV-Scanner** on the **ClawQL** / **Stirling** (or **golden**) **image** and/or **lockfiles**; GraphQL-trimmed output becomes a **vulnerability summary** for **Evaluate** and the vault. Critical/high can short-circuit **Evolve** (rebuild) per policy.

**8 — Vault: `memory_ingest`**
Rich summary: doc ID, **Merkle** root, **Onyx** citations, GitHub issue numbers, OCR score, **trimmed OSV** row set, **image digest** scanned. Wikilinks to pricing policy and Q1 history.

**9 — Slack: `notify()`**
Posts to #finance: “✅ Q1 invoice batch complete. Doc #5102 archived. 3 pricing discrepancies → GitHub #201–203. **Merkle** a3f9… | **OSV** on `sha:…` — no critical. Onyx links attached.”

_**Istio (cross-cutting):** when the mesh is enabled, steps **1–8**’s pod-to-pod traffic is already **mTLS**-wrapped; **Kiali** proves the path; no extra app code._

---

## Slide 20 — Section Divider: Intelligence Layer

# 03 — Intelligence Layer

_Ouroboros · Onyx **Knowledge Search** · Cuckoo · Merkle · `notify()` — the invisible, **self-orchestrating** brain; **OSV-Scanner** and **Istio** participate in **Execute/Evaluate** when your Seed says “scan” or your cluster runs the mesh._

---

## Slide 21 — Ouroboros: The Invisible Orchestration Engine

### Ouroboros: The Invisible Orchestration Engine

_Embedded in the ClawQL pod — no separate service, no visible commands, no learning curve._

**What Ouroboros Is**
Ouroboros is a TypeScript-ported structured workflow engine that runs entirely in-process inside the ClawQL pod. It is the reason users can write complex multi-step requests in natural language — combining enterprise knowledge retrieval, document processing, and API calls — and get reliable, verified results.

It is completely invisible to the user. There is no ‘ooo’ prefix, no workflow command, no mode switch. ClawQL’s routing layer silently decides whether to fast-path a simple request directly to `search`/`execute`, or hand a complex request to Ouroboros.

All Ouroboros tool calls use ClawQL’s own internal tool executor registry — so they are in-process, not additional network hops (Istio adds **wire** security without changing the executor). This includes `knowledge_search_onyx`, **`execute`’d OSV-Scanner** steps when the workflow’s Seed requires a **clean bill of health** before **Paperless** commit, and document steps. Seeds and evaluation logs are stored in **Postgres**; **Merkle** and **OSV** summaries can be joined in **Evaluate**.

**Routing: Fast Path vs Ouroboros**

FAST PATH (simple, single-step):

- “Search Paperless for invoice #123” → direct `search` + `execute` against Paperless API. No Ouroboros. Milliseconds.
- “What did we decide about pricing last quarter?” → direct `knowledge_search_onyx` call. No Ouroboros.

OUROBOROS PATH (complex, multi-step):

- “Process the Q1 invoices, cross-reference against our pricing policy, redact PII, archive, and notify Slack” → Ouroboros Interview → Seed → Execute (Onyx + Tika + Gotenberg + Stirling + **optional** **OSV** gate + Paperless + GitHub) → Evaluate → Evolve. **Istio** mTLS is transparent. Full structured loop, invisible to user.

The routing layer uses lightweight intent and ambiguity analysis on every message. The user never picks which path — ClawQL decides.

_Ouroboros is compiled into the ClawQL Docker image — rebuild the image, roll to Kubernetes. Zero new pods. Zero new services. Zero visible commands._

---

## Slide 22 — The Ouroboros Loop: 5 Phases

### The Ouroboros Loop: 5 Phases

_Every complex workflow passes through all five phases — invisibly, automatically, with automatic retry._

**1 — Interview**
Ouroboros analyzes the user’s request for ambiguity. If the task is fully specified, this phase is skipped and execution proceeds immediately. If key details are missing (e.g. ‘which folder?’ ‘what redaction scope?’ ‘which Onyx connectors to query?’), ClawQL replies with one natural clarifying question. No jargon, no technical prompts — just conversation.

**2 — Seed**
Creates an immutable workflow specification — the ‘Seed’ — containing the full task description and measurable acceptance criteria. The Seed is stored in shared Postgres immediately. It never changes. Example criteria for a knowledge-augmented document workflow: “Onyx returns ≥ 3 relevant results with citations, OCR confidence > 0.95, redaction verified, Paperless import confirmed, GitHub issues filed for all flagged items.”

**3 — Execute**
Decomposes the Seed into an ordered sequence of tool calls. Typical knowledge-augmented, security-hardened path: `knowledge_search_onyx` → Tika → Gotenberg (if needed) → Stirling → Cuckoo check → **OSV-Scanner** (image/lockfile as specified) → Paperless → Onyx index push → `memory_ingest` → GitHub issues → `notify()`. **Istio** transparently mTLS’s traffic between pods. Each material step’s output (including **trimmed OSV** JSON) is eligible for a **Merkle** leaf. All **ClawQL** tool calls are in-process; mesh is **L3/L4/L7** policy outside the app.

**4 — Evaluate**
Checks each result against the Seed’s acceptance criteria. Onyx result count and relevance scores validated. OCR confidence score measured. SSN redaction verified by pattern scan. Paperless import confirmed. GitHub issue numbers validated. If all criteria pass, Ouroboros proceeds to completion. Any failure triggers Evolve.

**5 — Evolve**
If any criterion fails, Ouroboros automatically adjusts and retries. Onyx returned too few results? Broader query. **OSV** reported **fixable** vulns? Retry after bump + rebuild (if your playbooks wire that in). **Istio** 503 from **egress**? **Evolve** can back off or route via alternate ServiceEntry if defined. Retry history in **Postgres**.

---

## Slide 23 — Cuckoo Filters: O(1) Deduplication

### Cuckoo Filters: O(1) Deduplication

_Probabilistic membership testing with deletion support — keeping the pipeline fast at scale._

A Cuckoo filter answers “have I seen this before?” in O(1) time with very low false positive rates. Unlike Bloom filters, it supports deletions — meaning documents can be removed from the deduplicated set without rebuilding. Configured via `CLAWQL_CUCKOO_*` environment variables.

**Stirling → Paperless Ingestion**
_WHEN: Before every Paperless import call_
Computes a hash of the processed PDF (post-OCR, post-redact). Checks the filter: has this exact document been imported before? If yes — skip. This prevents duplicate imports at scale without requiring a full database scan on every ingestion.

**Ouroboros Execute Phase**
_WHEN: Before each new Seed execution begins_
Checks whether an identical Seed (same hash of task specification + inputs) has already been evaluated. If yes, Ouroboros returns the cached result immediately. Prevents re-running identical multi-step workflows — important when Cursor sessions overlap or retry.

**Tika/Gotenberg Output Checks**
_WHEN: After each conversion or extraction step_
Before passing a converted PDF to the next pipeline stage, the Cuckoo filter checks if this exact converted output already exists downstream. This prevents re-processing the same intermediate artifact if the pipeline is interrupted and resumed mid-run.

**Onyx Knowledge Retrieval Cache**
_WHEN: Before repeated `knowledge_search_onyx` calls with identical queries_
If the same Onyx query has been run in the current session, the Cuckoo filter detects it and returns the cached ranked result set — avoiding redundant index queries. Especially useful in the Ouroboros Evolve phase when retrying a workflow that already completed the knowledge retrieval step successfully.

**ClawQL MCP Layer**
_WHEN: During tool-discovery caching_
Caches tool-discovery result patterns and detects duplicate tool-call sequences. If the AI makes the same `search()` call twice in a session, the second call returns from the cached result set rather than re-scanning all specs.

**OSV-Scanner result deduplication**
_WHEN: The same image digest or lockfile hash was scanned in-session_
The filter avoids re-emitting identical **CVE** sets — Evolve can still **force** a rescan with a new digest.

---

## Slide 24 — Merkle Trees: Cryptographic Audit Trails

### Merkle Trees: Cryptographic Audit Trails

_Tamper-evident, verifiable proof that every processing step produced the correct result — including knowledge retrieval._

A Merkle tree hashes each processing step’s output into a leaf node. The root hash proves the entire chain — if any step’s output was tampered with, the root changes. ClawQL stores the Merkle root in Postgres after every Ouroboros workflow. Configured via `CLAWQL_MERKLE_*` environment variables.

**Merkle Tree Structure (Knowledge-Augmented Workflow)**

```
ROOT HASH (stored in Postgres)
├── Hash(L1+L2)
│   ├── L1: Onyx retrieval result set + citations
│   └── L2: Tika extract + metadata
└── Hash(L3+L4+L5)
    ├── L3: Stirling OCR + redact
    ├── L3b: OSV-Scanner summary (trimmed)
    ├── L4: Paperless import confirmation
    └── L5: GitHub issues filed
```

_Root stored in Postgres. Optional `proofOfIntegrity` GraphQL endpoint for external audit._ **Istio policy** decisions (e.g. denied egress) can be **logged** and **hashed** if your compliance pack requires “network control evidence.”

**Where Merkle Trees Are Used**

**Ouroboros Step Outputs (including Onyx)**
Each phase output — including `knowledge_search_onyx` result sets — becomes a leaf. The root proves the entire workflow ran correctly and in order, including what company knowledge was retrieved and when. Critical for regulated industries where AI-assisted decisions must be auditable.

**Post-Stirling PDF Verification**
After merge/OCR/redact, the Merkle root proves the processed PDF hasn’t been tampered with. Efficient chunk-level proof for any specific page without re-hashing the whole document.

**Paperless Archive Versioning**
When documents are updated or re-exported, Merkle tree enables efficient version proofs — proving what changed between versions without storing full copies.

**Onyx Knowledge Retrieval Audit**
The Merkle leaf for each `knowledge_search_onyx` call records exactly which query was run, which connector sources were searched, and the citation set returned — a cryptographic record of what company knowledge influenced each AI decision.

**GraphQL Response Integrity**
Optional Merkle root for cross-session GraphQL response consistency checks. Proves that API responses haven’t been altered between caching and delivery.

---

## Slide 25 — notify() + Slack Integration

### notify() + Slack Integration

_First-class MCP tool for structured Slack notifications at any workflow milestone._

**How notify() Works**
`notify()` is a first-class MCP tool that internally calls `execute()` against the bundled Slack OpenAPI spec. It authenticates using `CLAWQL_SLACK_TOKEN` (a Slack Bot Token with `chat:write` scope at minimum). Notifications routinely include Onyx citation links and Paperless document links as part of the standard workflow completion message.

**When Ouroboros Calls notify()**

- _Workflow Completion:_ ✅ Q1 invoice batch complete. Doc #5102 archived. 3 pricing discrepancies found (Onyx citations attached). GitHub issues #201–203 created. Merkle: a3f9…
- _Knowledge Retrieval Alert:_ ℹ️ Onyx returned 0 results for ‘Q4 pricing policy’. Broadening query scope and retrying.
- _Auto-Retry Event:_ ⚠️ OCR quality 0.87 on page 3, retrying with accuracy=high…
- _Failure / Escalation:_ 🚨 Workflow failed after 3 retries: Paperless timeout. Manual review needed. Onyx results saved to vault.
- _OSV / supply chain:_ 🔐 Image `sha:…` — **0 critical** / **2 high** (list). Link to build job + SBOM object in Vault.
- _Istio / SRE:_ ⚠️ Circuit open to `onyx.istio` — retried 2×, Evolve broadened timeout.
- _Audit / Compliance:_ 📋 Workflow audit: 8 steps including Onyx retrieval, **1 OSV** leaf, **Istio**-allowed egress. Merkle root stored. Doc #5102 archived. Log ID: wf-2026-04.

**Slack as a Full Bundled Provider**
The Slack spec is retained in `providers/slack.json` as one of the nine default bundled providers. This means `search()` + `execute()` can target the full Slack API — not just notifications. Custom workflows can post file uploads, look up users, create channels, or read message history from within any Ouroboros workflow.

**Token & Permission Setup**

- `CLAWQL_SLACK_TOKEN` in Helm `values.yaml`
- Minimum scope: `chat:write` for `notify()`
- Add `files:write` for attachment uploads
- Add `channels:read` for channel lookup
- Bot must be invited to target channels

---

## Slide 26 — Section Divider: Infrastructure

# 04 — Infrastructure

_9+ bundled providers (incl. **OSV-Scanner** surface) · **12+** runtime services in one **Helm** release · **optional Istio** + **Kiali** · **Trivy** + **OSV-Scanner** in **Golden Image** · **Vault**/**OpenBao** · Privacy- and **zero-trust**-first._

---

## Slide 27 — Bundled Providers: The Default Stack

### Bundled Providers: The Default Stack

_9 providers ship in `providers/` — the built-in default (`all-providers` / no spec env) loads all of them._

**GitHub**
`providers/github.json` | Auth: `CLAWQL_GITHUB_TOKEN`
Issue tracking, PR management, repo operations. Used by ClawQL’s own tooling — the cross-thread recall case study files GitHub issues directly from recalled vault plans. Also targeted by Ouroboros when filing tracking issues from Onyx-retrieved discrepancy findings.

**Google Cloud**
`providers/google-top50.json` | Auth: `CLAWQL_GOOGLE_TOKEN`
~50 curated Google Discovery services merged: GKE, Drive, Calendar, Gmail, BigQuery, Cloud Run, and more. The most comprehensive cloud provider bundle.

**Cloudflare**
`providers/cloudflare.json` | Auth: `CLAWQL_CLOUDFLARE_API_TOKEN`
Workers, DNS, zones, custom domains, KV, R2. Used to deploy and operate docs.clawql.com — the documentation site is built and maintained via ClawQL `execute()` calls.

**Paperless NGX**
`providers/paperless.json` | Auth: `PAPERLESS_BASE_URL` (self-hosted)
Document archive API. Fetched from self-hosted instance at `/api/schema/`. Runtime base URL injection via `PAPERLESS_BASE_URL`. `CLAWQL_BUNDLED_OFFLINE=1` prevents re-fetch.

**Stirling-PDF**
`providers/stirling.json` | Auth: `STIRLING_BASE_URL` (self-hosted)
PDF manipulation API. Fetched from `/v3/api-docs`. Runtime base URL injection. All Stirling operations (merge, OCR, redact, sign) are discoverable via `search()` and callable via `execute()`.

**Slack**
`providers/slack.json` | Auth: `CLAWQL_SLACK_TOKEN`
Powers the `notify()` tool and full Slack API access. `chat.postMessage`, `files.upload`, `channels.read`, and more — all discoverable and callable. Bot Token with appropriate scopes.

**Apache Tika**
`providers/tika.json` | Auth: `TIKA_BASE_URL` (self-hosted)
Universal extraction API. 1,000+ format support. Fetched from self-hosted instance. Ouroboros calls Tika via `execute()` for metadata-driven routing decisions in every document workflow.

**Gotenberg**
`providers/gotenberg.json` | Auth: `GOTENBERG_BASE_URL` (self-hosted)
Document conversion API. HTML, Markdown, Office → PDF. Fetched from self-hosted instance. Triggered by Ouroboros when Tika detects non-PDF input files in a document workflow.

**Onyx**
`providers/onyx/openapi.yaml` | Auth: `ONYX_BASE_URL` + `ONYX_API_TOKEN` (Bearer)
Minimal bundled OpenAPI: **`onyx_send_search_message`** → **`POST /search/send-search-message`**, optional **`onyx_ingest_document`** → **`POST /onyx-api/ingestion`**. Optional MCP tool **`knowledge_search_onyx`** when **`CLAWQL_ENABLE_ONYX=true`**. Refresh from a live instance with **`npm run fetch-provider-specs`** when **`ONYX_BASE_URL`** is set. Flink connector jobs for index freshness are a separate deployment story (#119).

**OSV-Scanner (security provider pattern)**
Bundled or CI-generated **OpenAPI** (or a thin `providers/osv-*.json`) that wraps the **OSV-Scanner** CLI or HTTP **adapter** — same **`search` + `execute`** semantics: discover **“scan image / lockfile / SBOM”** operations, run on demand from agents or Ouroboros, **GraphQL-trim** to **CVE / package / version / fix**. Integrates with the **Golden Image** pipeline: **Trivy** (layer) + **OSV** (ecosystem DB) + **SBOM** export; failures gate **Cosign** sign + **OPA**/**Kyverno** admit.

---

## Slide 28 — Unified Kubernetes Helm Chart

### Unified Kubernetes Helm Chart

_One `helm install` command deploys the entire platform — **all 12+** services (MCP, documents, Onyx, Flink, **OSV** jobs, **Vault**, optional **Istio** control plane, **Kiali**), all secrets, all ingress rules._

```bash
helm install clawql charts/clawql-full-stack --namespace clawql
```

- Single `values.yaml` controls every service — env vars, secrets, resource limits, ingress rules
- `CLAWQL_BUNDLED_OFFLINE=1` enforced by default — no external spec fetches at runtime
- `CLAWQL_ENABLE_ONYX=true` toggles the Onyx knowledge layer on/off without rebuilding
- Namespace: `clawql` — all services co-located, internal DNS works out of the box
- Init jobs: validate specs and inject base URLs for Tika, Gotenberg, Stirling, Paperless, Onyx
- Resource tuning: Stirling and Tika get higher CPU/memory limits for batch OCR/conversion; Onyx gets appropriate index serving limits
- Secrets: `CLAWQL_SLACK_TOKEN`, `ONYX_BASE_URL`, `ONYX_API_TOKEN`, API tokens, `PAPERLESS_BASE_URL` — all in one `values.yaml`
- Ingress: `clawql.local`, `pdf.clawql.local`, `paperless.clawql.local`, `onyx.clawql.local` (configurable in values)
- Paperless isolated Postgres and Redis included — no external DB dependency
- Flink included as a deployment for real-time connector sync into Onyx
- **Optional Istio** — `istiod`, ingress/egress gateways, **Kiali**; **Ambient** profile preferred for new clusters; mTLS **STRICT** by default in hardened `values` overlays
- **OSV-Scanner** — `CronJob` and/or in-cluster **scan** `Deployment` with read-only `docker.sock` or **Kaniko**/**Cosign** outputs — wired to the same **namespace**
- **Vault** (or **OpenBao**) — subchart or external URL; **Vault Agent Injector** for **ClawQL**, **Flink** job secrets, and **Istio**-compatible TLS material where you do not use **Istio** SDS alone
- Rolling updates: rebuild ClawQL image, `helm upgrade` — zero-downtime in most cases

### Secrets management (HashiCorp Vault · OpenBao)

**Role:** Central **static** and **dynamic** secrets; **Istio** **mTLS** protects traffic to Vault from sidecars/ambient nodes.

- **KV v2** paths per environment (`secret/clawql/…`, `onyx/…`, `github/…`); **Vault Agent** sidecar templates → files or env for **ClawQL** and workers.
- **Per-user** or per-workflow paths where your org model requires isolation; **Istio** `AuthorizationPolicy` can restrict which **ServiceAccount** may reach Vault’s K8s **Service**.
- **No** Vault UI on the public internet — **ClusterIP** + mesh-only or **port-forward**; `root` and `unseal` keys in **HSM** / break-glass per policy.
- **OpenBao** — **API-compatible** subset for air-gapped teams who want Vault semantics without HashiCorp commercial agreement (verify license and feature parity for your use case).
- **Integration with scans:** **SBOM** and **OSV** attestation bundles can be **written** to Vault and **referenced** from `memory_ingest` (digest + path), matching **Merkle** leaves.

**Spec Refresh Command**

```bash
npm run fetch-provider-specs
```

Accepts environment variables: `STIRLING_BASE_URL`, `PAPERLESS_BASE_URL`, `TIKA_BASE_URL`, `GOTENBERG_BASE_URL`, `ONYX_BASE_URL`
Fetches specs from running self-hosted instances and saves to `providers/`. Run once after new service deployment.

**Runtime Base URL Injection**
Self-hosted provider specs contain `servers:` entries pointing at internal Kubernetes DNS (e.g. `stirling-pdf:8080`, `tika:9998`, `onyx:8080`). Values are injected at runtime via the same mechanism as auth headers in `auth-headers.ts` — making the same bundle work across dev and prod cluster topologies.

---

## Slide 29 — Complete Service Map

### Complete Service Map

_All **12+** workload types in the **`clawql`** namespace (exact pods depend on `values`) — one Helm story, one **kubectl** context._

| Service / component                 | Internal DNS (illustrative) | Ingress / exposure               | Role                                                          |
| ----------------------------------- | --------------------------- | -------------------------------- | ------------------------------------------------------------- |
| ClawQL MCP + Ouroboros              | `clawql:3000`               | `clawql.local`                   | **Brain** — `search` / `execute`, Ouroboros, GraphQL, tools   |
| Stirling-PDF                        | `stirling-pdf:8080`         | `pdf.clawql.local`               | PDF merge/OCR/redact/…                                        |
| Paperless NGX                       | `paperless:8000`            | `paperless.clawql.local`         | Archive, consume, API                                         |
| Apache Tika                         | `tika:9998`                 | internal                         | Extraction, MIME                                              |
| Gotenberg                           | `gotenberg:3000`            | internal                         | Conversion to PDF                                             |
| Onyx                                | `onyx:8080`                 | `onyx.clawql.local`              | Enterprise search, 40+ connectors                             |
| Flink (JM/TM)                       | `flink-jobmanager:8081`     | internal                         | Onyx index sync                                               |
| **OSV-Scanner** (CronJob / **Job**) | e.g. `osv-scanner`          | internal / **none**              | **Vuln** + **SBOM** scans on image refs / lockfiles           |
| **Istio control plane**             | `istiod:15012`              | internal                         | mTLS, **Wasm** plugins, xDS to Envoys / **ztunnel** (Ambient) |
| **Istio ingress/egw**               | `istio-ingressgateway`      | `clawql.local`, `*.clawql.local` | North-south, **VirtualService** + **Gateway**                 |
| **Kiali** (optional)                | `kiali:20001`               | `kiali.clawql.local`             | Mesh **graph**, health, config                                |
| **Vault** / **OpenBao**             | `vault:8200`                | internal (mesh-only)             | **Secrets**, injectors, dynamic creds when configured         |
| Redis (shared)                      | `redis:6379`                | internal                         | Queues, state                                                 |
| Postgres (shared)                   | `postgres:5432`             | internal                         | Seeds, Merkle, Ouroboros log                                  |
| Paperless Postgres/Redis            | isolated                    | internal                         | Isolated from shared DB                                       |

**MinIO** (optional) — S3 API for big artifacts, SBOM storage, and paper artifacts. **Jaeger** / **Tempo** / **OTel** collectors — co-locate or `values` to your observability namespace; **Istio** can export **telemetry** to **Grafana** stacks.

_**Ambient** vs **sidecar:** new installs can prefer **Ambient** (**ztunnel** L4 + **waypoint** L7) to cut pod overhead; same **Istio** security policy model._

---

## Slide 30 — Privacy, Security & Local-First Architecture

### Privacy, Security & Local-First Architecture

_Everything runs in your cluster — no cloud, no SaaS data exposure, no per-user limits._

**100% Local Execution**
Every service — ClawQL, Stirling-PDF, Paperless, Tika, Gotenberg, Onyx, Flink, Redis, Postgres — runs inside your Docker Desktop Kubernetes cluster. Documents and company knowledge never leave your machine. Onyx’s enterprise index is built and served entirely locally — company knowledge is never sent to a third-party AI or search service.

**No SaaS Limits or Subscriptions**
Stirling-PDF runs with `DOCKER_ENABLE_SECURITY=false` — removing the 5-user SaaS restriction. Paperless NGX is fully open source with no document limits. Onyx is open source and self-hosted — no per-seat licensing, no query limits, no data leaving your cluster. No monthly fees for any component in the pipeline.

**Token Isolation**
Each provider token (`CLAWQL_GITHUB_TOKEN`, `CLAWQL_CLOUDFLARE_API_TOKEN`, `CLAWQL_SLACK_TOKEN`, `ONYX_API_TOKEN`, etc.) is isolated in Kubernetes Secrets and injected only into the ClawQL process. Tokens never appear in logs, never leave the cluster, and are never shared between provider contexts.

**Vault Memory Privacy**
The Obsidian vault lives on your local filesystem at `CLAWQL_OBSIDIAN_VAULT_PATH`. Memory notes — including ingested Onyx citations — never leave your machine. `memory_ingest` explicitly prohibits storing secrets. The hybrid `memory.db` sidecar is also local.

**Cryptographic Integrity**
Every Ouroboros workflow step — including Onyx knowledge retrieval steps — is hashed into a Merkle tree. The root is stored in Postgres. Any tampering with processed documents, retrieved knowledge, or workflow records is immediately detectable. Compliance-grade audit trails covering both document processing and AI knowledge retrieval decisions.

**Onyx Permission Enforcement**
Onyx enforces the permission model of each connected source inside the cluster. A ClawQL user without access to a given Confluence space will not receive results from that space via `knowledge_search_onyx` — even if they craft a targeted query. Enterprise data governance is preserved at the retrieval layer.

**`CLAWQL_BUNDLED_OFFLINE=1`**
In production, `CLAWQL_BUNDLED_OFFLINE=1` is enforced in the Helm chart. This prevents ClawQL from ever fetching provider specs from the network — all spec files are pre-bundled in the Docker image. No outbound traffic for spec loading. No dependency on external registries at runtime.

**Zero-Trust Networking (optional Istio)**
**Istio** enforces **automatic mTLS** between **ClawQL**, **Paperless**, **Onyx**, **Stirling**, **Tika**, **Gotenberg**, **Flink**, and **OSV** workers — with **L7 `AuthorizationPolicy`** (JWT, **mTLS** SPIFFE IDs, or namespace boundaries). **Egress** is controlled with **`ServiceEntry`** + **EgressGateway** when you need “only these CVE DBs and Git APIs.”

**Vulnerability management (Trivy + OSV-Scanner)**

- **Trivy** — filesystem + image layers in **CI**; **Critical/High** as merge gates; feeds **Grafana** / **SARIF** in your pipeline.
- **OSV-Scanner** — **Google** **Open Source Vulnerabilities** for **lockfiles** + **SBOM**-style input; **complements** Trivy with ecosystem-specific advisories. **Merkle-signed** scan attestation (optional) stored next to the **image digest** in **Vault** or **MinIO**.
- **On-demand in MCP** — the same **OSV** tools your CI uses can be **discoverable** via `search` / `execute` for “scan this `go.sum` / `package-lock` / OCI ref.”

**Traffic resilience (Istio)**
**Retries**, **timeouts**, **circuit breakers**, **outlier detection**, **subset**-level routing — **canary**-friendly rollouts of **Clawql** and **Stirling** without a second chart fork.

**Observability (mesh + cluster)**
**Kiali** — service graph, config validation, **Istio** health. **Jaeger** (or **Tempo**) for **W3C**-correlated traces across **Ouroboros** spans, **gRPC/HTTP** mesh hops, **Onyx**, and **Flink** — in one place when **OTel** and **Istio** telemetry are wired. **Grafana** dashboards: MCP latency, Onyx RPS, **Flink** lag, **4xx/5xx** on **Istio** edges.

**Golden Image Pipeline (expanded)**
**Hardened bases** (distroless / **Chainguard**-style) → **Trivy** + **OSV-Scanner** + **SBOM** (CycloneDX/SPDX) → **Cosign** sign + **Kyverno** or **OPA** policies on admit → **optional** Merkle root of the **attestation** into **Postgres** / **Vault** for audit.

**HashiCorp Vault / OpenBao**
**Static** and **short-lived** creds; **Istio** protects **injection** paths. See **slide 28** (Helm) for the **### Secrets management** block.

---

## Slide 31 — Security & Observability

### Security & Observability

_Golden Image Pipeline + OPA Gatekeeper + Uptime Kuma Synthetic Monitoring — production-grade trust from build to runtime._

**Golden Image Pipeline**

All ClawQL containers and the **12+** co-deployed services are built from **minimal** (e.g. **distroless** / **Chainguard**) base images.

- **Container + dependency scanning:** **Trivy** + **Grype** in CI; **OSV-Scanner** on **lockfiles** and **container**-derived **SBOMs**; **Critical/High** as gates per `policy.yaml`.
- **SBOM:** **CycloneDX** or **SPDX** emitted per build; versioned with the image **digest**; consultable in **Grafana** and **`execute`**-able via OSV in MCP.
- **Image signing:** **Cosign**; keys in **Vault** or K8s **Sealed**/**External** secrets.
- **Deploy by digest** — Helm `values` pin **@sha256** for Clawql and **golden** child images.

**OPA Gatekeeper Enforcement**
Cluster-wide admission control included in the unified Helm chart.

- Enforces distroless base, signed images only, no root containers, no privileged pods, approved registries.
- Rejects non-compliant images at admission time with clear violation messages.
- Audit and dry-run modes supported.

**Uptime Kuma + `schedule()` Tool**

Bundled service (`uptime-kuma:3001` + ingress `status.clawql.local`)

- Create/edit/delete synthetic monitors via natural language or Ouroboros workflows.
- Supports HTTP, TCP, Ping, Docker, keyword, JSON, and SSL certificate checks.
- Failures trigger `notify()` to Slack and audit events.
- Auto-generates public or team status pages.

_Natural Language Example:_ “Schedule synthetic monitoring for Paperless, Onyx, and ClawQL MCP every 60 seconds with status page at status.clawql.local”

_All components are part of the single unified Helm chart._

---

## Slide 32 — Observability Stack

### Observability Stack

_Full metrics, dashboards, distributed tracing, logs, and synthetic monitoring — all self-hosted inside the ClawQL cluster._

**Uptime Kuma — Synthetic Monitoring & Status Pages**

- First-class integration with the new `schedule()` MCP tool.
- Rich checks and beautiful status pages.

**Prometheus + Grafana — Metrics & Dashboards**

- Prometheus scrapes all ClawQL services, Ouroboros, document pipeline, Onyx, and Flink.
- Pre-built Grafana dashboards included in the Helm chart:
  - MCP tool usage, latency, and error rates
  - Document pipeline throughput and OCR quality
  - Onyx index freshness and query performance
  - Golden Image + OPA Gatekeeper health

**OpenTelemetry (OTel) — Distributed Tracing & Logs**

- OTel Collector receives traces and logs from every component.
- Automatic instrumentation for MCP tools, Ouroboros 5-phase loop, document pipeline (with Merkle correlation), Onyx searches, and **OSV-Scanner** job completion when tagged.

**Istio + Kiali + Jaeger/Tempo — Mesh-Native View**

- **Istio** service metrics (request rate, 5xx, **mTLS** handshake failures) to **Prometheus**; **access logs** to **Loki** or your sink.
- **Kiali** (`kiali.clawql.local`) — topology, health, **virtual service** and **destination rule** validation, and **Istio**-level retries/timeouts in one UI.
- **Jaeger** or **Grafana Tempo** — end-to-end traces: **MCP** → **Clawql** → **mesh** hop → **Onyx** → **Flink** — with **W3C** and **B3** context propagated from **Istio** and app sidecars.
- **Security scans** (CI + **CronJob** **OSV**) as **Grafana** annotations: correlate **CVE** spikes with a bad **digest** push.

**Single Pane of Glass**

`grafana.clawql.local` — unified view with embedded Uptime Kuma status pages, Prometheus dashboards, and OTel traces.

**Natural Language Control**

_“Set up monitoring for the full document pipeline and alert on Slack if OCR success rate drops below 95%”_

_All observability containers are built via the Golden Image Pipeline and enforced by OPA Gatekeeper._

---

## Slide 33 — Incident Management

### Incident Management

_PagerDuty integration — automatic, context-rich escalation from the full observability stack._

**PagerDuty as a Bundled Provider**

- Full OpenAPI spec (`providers/pagerduty.json`) — works with core `search` + `execute` tools.
- Auth via `CLAWQL_PAGERDUTY_TOKEN` (API v2 integration key) stored in Kubernetes Secrets.

**Automated Incident Triggers**

| Source                           | Trigger Condition                | Incident Includes                                               |
| -------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| Uptime Kuma                      | Monitor down > 30s               | Status page link, check history, graph                          |
| Prometheus Alertmanager          | Any firing alert                 | Grafana link, runbook, labels                                   |
| OpenTelemetry                    | High error/latency spans         | Trace ID, correlated Merkle root                                |
| Ouroboros                        | Retry budget exhausted           | Seed ID, failed phase, evaluation log                           |
| ClawQL Audit                     | Security or integrity events     | OPA violations, Merkle mismatches                               |
| **OSV-Scanner** / **Trivy** (CI) | New **Critical** on `main` image | **Digest**, **SBOM** link, **Grafana** annotation, **`notify`** |

**Natural Language & Ouroboros Control**

_“Escalate the current Q1 invoice workflow failure to PagerDuty P1 with Merkle root and Onyx citations”_

**Rich Context Automatically Attached**

- Grafana + Uptime Kuma links
- Onyx citations and `knowledge_search_onyx` results
- Obsidian vault recall links
- Merkle tree root + proof-of-integrity
- Full trace IDs

_Fully integrated into the unified Helm chart — one `values.yaml` entry enables everything._

---

## Slide 34 — Local Hardware Requirements

### Local Hardware & Docker Desktop Requirements

_Realistic sizing for running the complete ClawQL stack on one machine._

**Recommended Configurations**

| Scenario                     | Host Machine Specs      | Docker Desktop Allocation              | Idle RAM | Peak RAM (OCR / Onyx) | Notes                     |
| ---------------------------- | ----------------------- | -------------------------------------- | -------- | --------------------- | ------------------------- |
| **Minimum** (dev, Onyx off)  | 16 GB RAM, 6+ cores     | 8–12 GB RAM, 4–6 CPUs, 100 GB disk     | 4–7 GB   | 10–12 GB              | Basic testing             |
| **Recommended** (full stack) | **32 GB RAM, 8+ cores** | **16–24 GB RAM, 8 CPUs**, 200+ GB disk | 10–14 GB | 20–28 GB              | Daily production-like use |
| **Future-Proof**             | 64 GB RAM, 12+ cores    | 32 GB RAM, 10–12 CPUs                  | 14–18 GB | 30+ GB                | Large archives            |

**Key Resource Consumers**

- **Onyx + Flink:** ~10–16 GB (largest sustained)
- **Stirling-PDF + Tika + Gotenberg:** Heavy CPU/RAM spikes during OCR and batch conversions
- **Paperless + isolated DBs:** Moderate steady usage

**Docker Desktop Tips**

- Allocate **≤ 75%** of host RAM for headroom.
- Use built-in Grafana dashboards to monitor real usage.
- Tune per-service resources in Helm `values.yaml`.
- Set `CLAWQL_ENABLE_ONYX=false` temporarily to reduce usage by ~10 GB.

**Recommendation for most developers**

On a modern 32 GB / 8-core machine, allocate 16–24 GB RAM + 8 CPUs to Docker Desktop for a smooth full-stack experience.

---

## Slide 35 — Section Divider: ClawQL-Web3 & On-Chain Layer

# 06 — ClawQL-Web3 Public Edition

_Agent-native fork: x402 micropayments, on-chain execution, optional Fabric anchoring, and unified Graph + Chainlink providers — same core as the regulated fork._

---

## Slide 36 — ClawQL-Web3 Executive Overview & Vision

### ClawQL-Web3 Executive Overview & Vision

**ClawQL-Web3** is the public, agent-native edition. It exposes a discoverable, payable MCP endpoint for tokenized lending, RWA origination, P2P capital formation, and on-chain capital-markets flows — with agents paying autonomously via **x402 / MPP** micropayments in stablecoins.

It is a clean, non-regulated fork of the same core that powers private **SeeTheGreens / ClawQL lending** workstreams. **100% code share** — including optional **Hyperledger Fabric** when you enable it.

**Core thesis:** Agents are economic actors. They need reliable, auditable, payable tools that bridge off-chain enterprise knowledge with on-chain truth under durable memory and hybrid public/private provenance.

**2026 alignment:** The Graph x402 subgraph / gateway patterns, Chainlink CRE + x402, Fabric on Kubernetes, and broad x402 adoption for machine-payable APIs.

**One platform. Two markets. Zero compromises.** Public agents pay per use; usage can subsidize the regulated fork.

---

## Slide 37 — ClawQL-Web3-Specific Capabilities

### ClawQL-Web3-Specific Capabilities

- **Public MCP endpoint** — Auto-discoverable; clients receive the full tool manifest (including Fabric when enabled).
- **Smart / agentic wallet layer** — Coinbase AgentKit + **ERC-4337**; on-demand wallets, session budgets, policy limits (e.g. max spend per loan), Merkle-anchored proofs.
- **IPFS pinning + multi-chain anchoring** — Pin documents, summaries, Merkle roots; **CCIP** anchoring to Ethereum, Base, Solana, and other supported networks.
- **x402 / MPP micropayments** — Native 402-style payment flows; pay per tool call, Graph query, CRE workflow, or loan step autonomously.
- **Lightweight Fabric mode** — Single-node or anchoring-only for public instances.

All of the above inherits the shared core (MCP, Ouroboros, Obsidian, Onyx, document stack, and so on).

---

## Slide 38 — Hyperledger Fabric — First-Class Optional Layer

### Hyperledger Fabric — First-Class Optional Permissioned Ledger Layer

**Toggle:** `CLAWQL_ENABLE_FABRIC` (default off). When on, deploys as a **Helm sub-chart** (peers, orderers, CouchDB, CA, chaincode).

**Principles**

- **Non-breaking & no drift** — Same `search` + `execute` model; shows up as a bundled provider (`providers/fabric/openapi.yaml` + ABIs) like everything else.
- **Hybrid public/private** — Public Web3 can use lightweight or anchoring-only Fabric; the regulated fork can run full multi-org consortia with private channels.
- **In-process paths** — Calls run through the GraphQL projection and Ouroboros like The Graph and Chainlink.

- **Zero trust between forks** — Regulated instances never expose private channel data to public agent endpoints.

**Shared benefits**

- Tamper-evident provenance for Merkle outputs.
- Permanent memory synergy — e.g. `fabric_query_provenance` → `memory_ingest` with citations.
- Ouroboros: Execute can drive chaincode; Evaluate can check on-ledger state.
- Observability: transaction IDs in LangFuse, Prometheus, OpenTelemetry.

**Why Fabric is a natural fit (beyond RWA and CCIP)**
Grok’s synthesis matches the product direction: ClawQL already commits **Merkle** roots, **Onyx**-backed retrievals, and **Ouroboros** step outputs to Postgres — **Fabric** adds a **multi-party, tamper-evident ledger** for **regulatory-grade provenance** without replacing self-hosting. **Together**, internal Merkle trees = fast cryptographic audit; **Fabric** = **durable, consortium-visible** **anchors** and **private channels** for **who did what, when, with which knowledge, and what the outcome was**.

**What you typically record on-ledger (hashes + refs — not raw PII)**

- **Merkle roots** and **Seed** ids; **Evaluate** pass/fail and key metrics.
- **Document pipeline lifecycle** — per-step **content hashes** (Tika **extract** → Gotenberg **convert** → Stirling **redact** → Paperless **import**) with **timestamps** and **workload identity** (service account / org).
- **Onyx** — attestation rows such as _“citation from Confluence at T with score X”_ (hashes of **trimmed** citation payloads, not full bodies).
- **`memory_ingest` frontmatter** — **Fabric tx ids**, **block** height or **channel** seq, for cross-check with `fabric_query_provenance` and `memory_recall`.

**MCP-native integration (ecosystem + gateway)**

- Same **`search` + `execute`** surface: bundle **`providers/fabric/openapi.yaml`** (or a **REST** façade to gRPC) like **GitHub** or **Onyx**. Optional **Keyhole**-style **Fabric REST gateway** or **Express** shim — the **OpenAPI** spec is what ClawQL merges; implementation is **yours**.
- **Community MCP** servers (**hlf-mcp**, “Fabric Agent Suite”-class tools) prove the **pattern**; ClawQL **standardizes** on **one** **executor registry** and **Ouroboros** so you do not maintain **separate** agent wiring for every chaincode.
- **Dedicated gateway pod** (optional) in **`clawql`**: sidecar or **Solo** service that only translates **signed** `execute` payloads to **peer** `invoke` — **Istio mTLS** from **Clawql** → **gateway** → **peer**.

**Kubernetes & supply chain**

- **Helm sub-chart** (our chart) for **peers, orderers, CAs, CouchDB**; orgs already using **Hyperledger Bevel**, **hlf-k8s**, or similar can **adopt the same** network layout and **import** the **Clawql** `values` **patches** — _verify compatibility_ with your org’s **Fabric** version.
- **Istio** **mTLS** for **Clawql → Fabric** and **peer ↔ peer** where your threat model says “encrypt everything east-west.”
- **OSV-Scanner** + **Trivy** + **SBOM** on **peer/orderer** **images** in the **same Golden Image** gates as the rest of the stack.

**Trade-offs (be explicit)**

- **Ops** — More **stateful** pods, **endorsement** policy, and **Channel** **ops**; **mitigation**: one **Helm** release, **Istio**, and **Grafana**/**Kiali** **already** in the same story.
- **Performance** — Anchor **high-value** steps only (not every Cuckoo hit) — **Cuckoo** already **dedupes** noise; **Seeds** define **“commit to Fabric on these milestones only.”**
- **Chaincode** — Start with **log-only** contracts (**append-only** event stream); evolve to **policy** **enforcement** and **PDCs** in later **phases** (see next slide in **reg + roadmap** table).

---

## Slide 39 — New MCP Tools — Fabric (Auto-Registered)

### New MCP Tools — Fabric (Auto-Registered via search + execute)

**When Fabric is enabled:**

- `fabric_submit_provenance` — Merkle root, seed, selective citations (Onyx, Graph/Chainlink, Paperless, IPFS) to a channel.
- `fabric_query_provenance` — Permissioned audit history (pairs with `memory_recall`).
- `fabric_rwa_register` — Tokenized asset metadata (Paperless id, IPFS CID, Chainlink PoR, Merkle proof, legal-perfection fields).
- `fabric_chaincode_invoke` — General chaincode calls.
- `fabric_anchor_merkle` — Public commitment of private state (e.g. via CCIP where configured).
- Discovery: `fabric_channel_list`, `fabric_consortium_status`.

**Illustrative chaincode or gateway `operationId`s** (name to match your `openapi.yaml` / ABI binding)

- `recordWorkflowStep` / `logDocumentHash` — append **Merkle** or **per-file** **SHA-256** with **Ouroboros** **phase** and **org** id.
- `verifyMerkleProof` — on-ledger check against a **stated** root; **Evaluate** can call this before `notify` **greenlights**.
- `attestOnyxRetrieval` — **hash** of **enterpriseCitations** **rows** + **query** id + **time** (no raw Confluence **HTML**).
- **`notify()`** and **`memory_ingest`** do not replace Fabric — they **include** **txid** + **channel** in Slack and the **vault** when a commit **succeeds** (templated, redacted messages).

**ClawQL-Agent (LangGraph)** — **checkpoint** ids and **long-run** state can be **attested** on-ledger in **advanced** deployments (org policy permitting), alongside **Merkle**-backed runbooks in **Obsidian**.

GraphQL projection keeps responses small for `memory_ingest` and token efficiency.

---

## Slide 40 — Fabric in ClawQL-Web3 (Public Fork)

### Fabric in ClawQL-Web3 (Public / Agent-Native Fork)

- **Lightweight mode** — Single-node or peer-only; public agents see cryptographic commitments (Merkle roots, tx ids, proofs), not private payloads.
- **RWA transparency** — After a CCIP-funded leg, `fabric_rwa_register` + IPFS can form a public verification story while sensitive data remains on regulated channels.
- **Agent policy enforcement** — Chaincode can enforce spend rules on ERC-4337 wallets or trigger reflection / escalation paths.
- **x402 settlement** — Fabric channels for enterprise-style billing next to public stablecoin settlement.
- **Edge workers** — Lightweight test-net consortia from laptops.
- **Public anchoring** — `fabric_anchor_merkle` → **CCIP** for immutable public commitments.

---

## Slide 41 — Fabric in the Regulated Fork + Shared Benefits

### Fabric in SeeTheGreens / ClawQL-MCP (Regulated) + Shared Benefits

**Regulated fork**

- Full **multi-org** consortia (credit unions, banks, servicers). **Private channels** isolate borrower data; **shared** channels support syndication and repurchase.
- **Compliance spine** — Ouroboros steps can emit Fabric transactions; critical private data hashes and references land on-ledger.
- **Reporting** — Chaincode and exports for exam-ready Merkle proofs and snapshots where applicable.
- **RWA lifecycle** — KYC/AML, collateral, servicing events tied to on-ledger workflows.

**Shared with the public fork**

- End-to-end tamper evidence; Ouroboros + Fabric synergy; unified Helm + CouchDB, Raft orderers, automated chaincode lifecycle, OPA Gatekeeper policies in hardened installs.

### Use cases — how Fabric + ClawQL fit together (matrix)

| Use case                      | **Fabric** adds…                                                                                                 | ClawQL uses…                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Document provenance**       | Immutable log of **PDF/artifact** hashes, **version**, **redaction** event **refs**                              | Stirling / Paperless, **Merkle**, `fabric_submit_provenance` / `logDocumentHash`           |
| **Compliance & AI audit**     | **Tamper-proof** record of **AI** decisions + **Onyx** citations (hashed)                                        | Ouroboros, **Merkle**, `knowledge_search_onyx`, `memory_ingest`, `fabric_query_provenance` |
| **Multi-org & supply chain**  | **Private** **channels** for partners; **shared** for syndication                                                | Channels + **Onyx** **permission** model; **Flink** freshness                              |
| **Smart contract automation** | **Chaincode** enforces “**if** **Evaluate** + **Merkle** + **policy** then **status** = accepted”                | Ouroboros **Execute** / **Evolve** + `fabric_chaincode_invoke`                             |
| **Assets & credentials**      | **Signed** document or **credential** **id** on-ledger                                                           | Gotenberg, Paperless, **OpenClaw** **approval** hooks, `fabric_rwa_register` (where RWA)   |
| **Agentic digital employees** | **Persistent** **workload** **id** and **key** **milestones** attested; optional **NATS** → chaincode **events** | **Clawql-Agent** **checkpoints**, **Obsidian** runbooks, **NATS** (see roadmap)            |

### Phased roadmap (suggested)

| Phase        | **Goal**                                                | **Concrete**                                                                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MVP**      | **Trust** in **Merkle** + **read-back** from **ledger** | **Helm** test net; **REST** **gateway** + **OpenAPI**; `fabric_submit_provenance` for **Merkle** + **Seeds**; `memory_ingest` with **txid**; `notify` **includes** “anchored to **ch X** at **T**”                                                                |
| **Medium**   | **Deeper** **Ouroboros** ↔ **chaincode**                | `Evaluate` **queries** **prior** **on-ledger** **outcome**; optional **Onyx** **citation** **attestation**; **exportable** **cryptographic** **proof** in **Vault** and **recall**                                                                                |
| **Advanced** | **Data** **plane** + **orchestration** **reactions**    | **PDCs** (private data collections) for **sensitive** **Onyx** **excerpts**; **chaincode** **events** → **NATS** **JetStream** → **start** or **continue** a **Clawql** **workflow**; full **Clawql-Agent** **action** attestation on **regulatory** **channels** |

_“Would you like sample **chaincode**, **Helm** **snippets**, or a **diagram**?”—those belong in **docs** and **separate** design notes; the **deck** **stays** the **narrative** **spine**._

---

## Slide 42 — The Graph Integration

### The Graph Integration (Subgraph + x402 Gateway)

**Bundled provider** (public Web3; optional in regulated hybrid deployments).

**Representative tool surface (names illustrative — wire to your subgraph manifest):**

- `thegraph_search_subgraphs` — Discover lending / RWA subgraphs.
- `thegraph_query` — GraphQL execution with ClawQL response trimming.
- `thegraph_schema_inspect` · `thegraph_ingest_to_memory` — Schema checks and durable recall.
- `thegraph_anchor_merkle` — Anchor summaries or Merkle artifices where appropriate.

**x402-native** — Per-query payment (GRT or stablecoin) for agent budgets.

**Value** — Live and historical on-chain data: loans, collateral, liquidations, TVL (Aave, Compound, Morpho, RWA programs).

**Synergy** — Ouroboros can call mid-flight for decisions; Onyx + vault memory keeps citations.

---

## Slide 43 — Chainlink Integration

### Chainlink Integration (CRE, Oracles, CCIP, Functions)

**Bundled provider.**

**Illustrative tools:**

- `chainlink_get_price_feed` / `chainlink_data_streams_query`
- `chainlink_functions_request`
- `chainlink_ccip_transfer` / `chainlink_ccip_message`
- `chainlink_proof_of_reserve` · `chainlink_cre_trigger`
- `chainlink_ingest_to_memory` · `chainlink_anchor_merkle`

**x402-native CRE** — Discover, trigger, and pay for verifiable off-chain and cross-chain work.

**Combined** — The Graph (history and indexing) + Chainlink (prices, execution, CCIP) + Fabric (provenance) in **one** MCP and one orchestration model.

---

## Slide 44 — End-to-End Workflow: Agent Perspective (RWA + Fabric)

### End-to-End Workflow: Agent Perspective (Tokenized Lending with Fabric)

**Prompt (example):** _“Originate a $50k tokenized auto loan on Base. Pull live rates from Chainlink, historical defaults from The Graph, cross-check Onyx + a Fabric private channel, run the document pipeline, decide, CCIP-fund, anchor with Merkle + Fabric, and notify.”_

**Invisible Ouroboros (12+ steps, illustrative):**

1. Interview → Seed (acceptance criteria, risk budget).
2. Execute: `chainlink_*`, `thegraph_query`, `knowledge_search_onyx`, `fabric_query_provenance`, document tools, policy checks.
3. `chainlink_ccip_transfer` or equivalent funding path.
4. `fabric_rwa_register` + `fabric_submit_provenance` + Merkle root.
5. `fabric_anchor_merkle` → **CCIP** where public proof is required.
6. Evaluate → Evolve (retries, human gates if OpenClaw is in the path).
7. `memory_ingest` (tx ids, proofs, Onyx/Graph citations).
8. x402 settlement + `notify()` + IPFS pin.

**Recall** — Cross-session memory can pull vault notes that point back to on-ledger ids and Merkle paths.

---

## Slide 45 — Synergies with the Regulated Fork

### Synergies with SeeTheGreens / ClawQL Lending (Regulated Fork)

- **Same** Fabric chaincode and channel policy templates can span forks where business rules allow.
- **Regulated** = full consortia; **Public** = proof-oriented anchoring and transparency layers.
- **Defence** — Merkle proofs can combine on-chain collateral metrics, oracle outputs, and Fabric events.
- **Institutional memory** — Obsidian + `fabric_query_provenance` results compound as reusable runbooks.
- **Hybrid data** — Public Graph/Chainlink for market metrics; private Fabric for borrower-grade fields.

---

## Slide 46 — Security, Sovereignty & Compliance (Both Forks)

### Security, Sovereignty & Compliance (Both Forks)

- **Private / regulated** — Air-gapped options, SOC2/HIPAA-style packaging goals, **multi-org Fabric** where required.
- **Public Web3** — Policy-enforced agent wallets, Merkle + optional Fabric-anchored actions, rate limits, and pay-per-call economics.
- **Zero-trust** — No accidental bleed between public endpoints and private channels; endorsement policies in Fabric.
- **Key material** — Kubernetes secrets; no silent exfil in tool JSON.
- **Fabric** — Signed chaincode, hardened images, private channels, exportable audit proofs.

---

## Slide 47 — Business Model & Network Effects

### Business Model & Network Effects

- **Revenue** — x402/MPP, RWA and workflow fees, **Fabric channel / consortium** services, and professional services around regulated installs.
- **Subsidy** — Public usage and templates can fund regulated feature depth while **one** core code line stays maintainable.
- **Moat** — Durable memory + Merkle + (optional) Fabric + unified Graph/Chainlink provider story.
- **Network effects** — More agents and subgraphs → better data for everyone → stronger regulated and public workflows.

---

## Slide 48 — Why This Matters — Differentiation

### Why This Matters — Differentiation

ClawQL-Web3 with optional Fabric is built so agents can:

- **Discover and pay** for tools (MCP + x402).
- **Read and act on-chain** via The Graph + Chainlink under the same executor model as the rest of ClawQL.
- **Keep memory and audit** via Obsidian + Merkle + optional permissioned provenance.
- **Serve both** public agent economies and private regulated consortia **without forking the core product**.

_This is category-defining infrastructure for agentic capital formation._

---

## Slide 49 — Section Divider: Roadmap & Vision

# 07 — Roadmap, Pilots & Vision (2026)

_What’s built, what’s being built, Web3 + Fabric rollout, and where the ecosystem is going._  
_(Core platform + intelligence: **§01–§04**; **§06** = ClawQL-Web3 / Fabric / Graph / Chainlink; **§07** = Roadmap; **§08** = Defense in depth & security operations — **slides 68–79** + `../security/clawql-security-defense-in-depth.md`.)_

---

## Slide 50 — Real-World Demo: Tokenized Lending (Web3 + Fabric + Graph + Chainlink)

### Real-World Demo: Tokenized lending in one Cursor or OpenClaw session

_Example only — map chains, DEXs, and tool names to your `providers/` and deployment manifests._

1. **Goal** in natural language: originate and fund a position on a target L2; attach enterprise policy and, where allowed, private-channel provenance.
2. `chainlink_get_price_feed` / `chainlink_data_streams_query` for live collateral, FX, and rate context.
3. `thegraph_query` / `thegraph_search_subgraphs` for pool history, defaults, and comparable on-chain book.
4. `knowledge_search_onyx` for internal memos; `fabric_query_provenance` when a regulated private channel is in play.
5. **Document path** — Tika → Gotenberg → Stirling → Paperless for KYC / collateral packs as required.
6. Ouroboros **Evaluate / Evolve** until acceptance criteria, risk caps, and policy checks pass.
7. `chainlink_ccip_transfer` (or your funding / bridge op) to fund the on-chain position.
8. `fabric_rwa_register` + `fabric_submit_provenance` with Merkle root and CIDs to IPFS.
9. `fabric_anchor_merkle` (→ **CCIP** where a public attestation is required).
10. `memory_ingest` — on-chain and Fabric transaction ids, proofs, and trimmed citations.
11. x402 / MPP settlement; optional final IPFS pin of a disclosure bundle.
12. `notify()` with redacted summary + safe links to Slack or OpenClaw.

Same **Interview → Seed → Execute → Evaluate → Evolve** spine as the invoice batch demo — the execute layer simply includes Web3 and Fabric tools alongside the existing stack.

---

## Slide 51 — Helm & Fabric / Web3 Configuration (Operator Notes)

### Helm & Fabric / Web3 — **`values.yaml` touchpoints (illustrative)**

```yaml
# Excerpt — not exhaustive; see chart README for your release.
clawql:
  web3:
    x402:
      enabled: true
  fabric:
    enabled: true
    # CLAWQL_ENABLE_FABRIC — Wire env from chart:
    channel: "clawql-provenance"
  agentWallets:
    policy:
      maxSpendPerLoan: "50000" # USD or stablecoin units — your enum
      erc4337: true
security:
  osvScanner:
    enabled: true
    # CronJob schedule + target image ref / lockfile path
  goldenImage:
    trivy: { blockOn: ["CRITICAL", "HIGH"] }
    osv: { blockOn: ["CRITICAL"] }
  vault:
    injector: true
    addr: "https://vault:8200"
istio:
  enabled: true
  profile: "ambient" # or "default" (sidecar)
  mtls: "STRICT"
kiali:
  enabled: true
```

- Toggle Fabric via **`CLAWQL_ENABLE_FABRIC` / chart `fabric.enabled`**; image pulls, CA, peer, orderer, and CouchDB come from the **Fabric sub-chart**.
- **x402 / MPP** block — payment receiver, price list per tool, and 402 response templates; pair with the public HTTP MCP transport.
- **OSV-Scanner** + **Trivy** — schedules, **SBOM** paths, and **admission** **Kyverno** / **OPA** hooks live next to `goldenImage` in the same `values` tree.
- **Istio** + **Kiali** — one namespace-level mesh toggle; **Ambient** recommended for new clusters; **mTLS** mode **STRICT** for prod overlays.
- **Channel names** (Fabric) and mesh **AuthZ** (Istio) for regulated vs. public modes belong in version-controlled **Helm** values, not in prompts.

---

## Slide 52 — Architecture — Textual Block Diagram

### Architecture (text) — full stack in one pass

- **Client** — Cursor, Claude, OpenClaw, or any MCP client; optional x402 client wallet.
- **MCP** — `search` / `execute` / memory / Ouroboros; GraphQL response trimming; **OSV-Scanner**-style ops when the spec is merged.
- **Bundled providers** — GitHub, Cloud, Paperless, Onyx, **The Graph** OpenAPI, **Chainlink** OpenAPI, **Fabric** (if enabled) — all merged like any other `providers/*/openapi.yaml`.
- **Data** — Onyx + Flink, Paperless, MinIO, Obsidian vault, Postgres, Redis, NATS.
- **On-chain (optional fork)** — L2s / L1s; **CCIP**; **GRT** / stablecoin; **Merkle** + **IPFS** + **Fabric** provenance.
- **Supply chain** — **Trivy** + **OSV-Scanner** + **SBOM** in CI; **Cosign**; **Vault**-stored attestations; **Grafana** annotations on bad digests.
- **Mesh (optional)** — **Istio** **mTLS** east-west; **Kiali** graph; **ingress** / **EgressGateway** for controlled north-south and **CVE** feed egress.

---

## Slide 53 — Public Web3 vs. Regulated Fork (Comparison)

### Comparison — **ClawQL-Web3 (public)** vs. **SeeTheGreens / ClawQL-MCP (regulated)**

| Dimension               | ClawQL-Web3 (public)         | Regulated fork                           |
| ----------------------- | ---------------------------- | ---------------------------------------- |
| **Fabric**              | Lightweight / anchoring      | Multi-org, private channels              |
| **Exposure**            | Proofs, tx ids, Merkle, IPFS | Full servicing + compliance workflows    |
| **Payments**            | x402 / MPP per tool call     | Invoicing, channels, internal settlement |
| **Agent wallets**       | ERC-4337 + policy limits     | Often human-gated; policy via OpenClaw   |
| **The Graph/Chainlink** | Primary price / history path | Plus internal-only feeds where allowed   |

Same `search` + `execute` and same Helm chart; differences are **config and channel policy**, not a second codebase.

---

## Slide 54 — Pilot Readiness (Q2 2026) — Checklist

### Pilot readiness (target **Q2 2026**)

- [ ] Public MCP + x402 receiver tested end-to-end on a staging chain.
- [ ] At least one **RWA** or lending template exercised through Ouroboros (happy path + Evolve).
- [ ] **Fabric** optional path: one channel, one chaincode, provenance write + read + `memory_ingest`.
- [ ] **The Graph** + **Chainlink** tools wired in `providers/` with test credentials and non-prod oracles.
- [ ] Onyx + document pipeline in loop with Merkle and audit export for stakeholders.
- [ ] **Trivy** + **OSV-Scanner** + **SBOM** in **Golden Image** CI; **no Critical** on `main` **digest**; **`execute`** smoke scan from MCP in staging.
- [ ] **Istio** **mTLS** **STRICT** between **Clawql** / **Onyx** / **Paperless** / **Tika** / **Stirling**; **Kiali** shows **no** plaintext service pairs in prod namespaces.
- [ ] **Vault** (or **OpenBao**) injector tested for at least one rotating secret; **Istio** `AuthorizationPolicy` for Vault **Service** only from **Clawql** and **CI** SAs.
- [ ] **Jaeger** / **Tempo** trace from **MCP** tool call through **Istio** to **Onyx** with sub-**500ms** p99 mesh overhead budget (tune in staging).
- [ ] OpenClaw or equivalent approval gate for any production spend.

---

## Slide 55 — Ecosystem Pointers (References)

### Ecosystem & references (both forks)

| Resource      | Link / path                                         |
| ------------- | --------------------------------------------------- |
| **Docs**      | https://docs.clawql.com                             |
| **Core repo** | `danielsmithdevelopment/ClawQL` on GitHub           |
| **npm (MCP)** | `clawql-mcp`                                        |
| **Contact**   | **Daniel Smith** — danielsmithdevelopment@gmail.com |

- **ClawQL-Web3** and **ClawQL-MCP / SeeTheGreens** are positioning labels on the same core — confirm landing URLs and public MCP endpoint hostnames in your go-live checklist.

---

## Slide 56 — Real-World Demo: The Complete Workflow (Document + Onyx)

### Real-World Demo: The Complete Workflow

_One Cursor message. Everything else is automatic._

You type in Cursor: _“Take the Q1 invoices from my Paperless consume folder, extract text and metadata, convert any Office files to PDF, merge everything, run high-accuracy OCR, redact all SSNs and credit card numbers, cross-reference against our Q1 pricing decisions and flag any discrepancies, import to Paperless tagged ‘Q1-2026-invoices’ with correspondent ‘IRS’, file GitHub issues for any pricing gaps, and notify #finance on Slack when done.”_

**Routing:**
Multi-step complex task with knowledge retrieval + document processing + GitHub filing detected → routes silently to Ouroboros.

**Interview:**
Task fully specified. Seed created in Postgres. Criteria: Onyx ≥ 3 results, OCR > 0.95, zero PII patterns, Paperless import confirmed, GitHub issues filed for all flagged items.

**Onyx:**
`knowledge_search_onyx('Q1 pricing decisions 2025')` returns 7 ranked chunks from Confluence and Slack with citations. GraphQL projection trims to chunk text + citation URL.

**Tika:**
14 files analyzed: 9 PDFs, 3 Word docs, 2 Excel files. Office files flagged for Gotenberg.

**Gotenberg:**
3 Word docs + 2 Excel files → PDF via LibreOffice. Cuckoo filter: not seen before. Proceeds.

**Stirling:**
14 PDFs merged → 1 document. OCR run. OCR’d text cross-referenced against Onyx pricing results — 3 line items flagged. PII redacted. Merkle tree: 6 leaf hashes (including Onyx leaf), root computed.

**Evaluate:**
OCR confidence 0.97 ✓, zero PII ✓, Onyx returned 7 results ✓, Merkle root stored ✓. Proceeding.

**Paperless:**
Imported as document #5102 with tags and correspondent. Onyx index push: document now searchable enterprise-wide via `knowledge_search_onyx`.

**GitHub:**
3 pricing discrepancy issues filed — #201, #202, #203 — each with Onyx citation link and Paperless doc reference.

**Vault:**
`memory_ingest()` writes rich summary: doc ID, Merkle root, Onyx citations, discrepancies, GitHub issues, OCR score, wikilinks to pricing policy history.

**notify():**
Posts to #finance: “✅ Q1 invoice batch complete. Doc #5102 archived. 3 pricing discrepancies → GitHub #201–203. Merkle: a3f9… | Onyx citations attached.”

**What the user sees in Cursor:** _“Done. 14 files processed, merged, OCR’d, PII redacted, cross-referenced against Q1 pricing policy — 3 discrepancies found and filed as GitHub issues — archived as doc #5102 in Paperless, and #finance has been notified on Slack.”_

---

## Slide 57 — Development Roadmap

### Development Roadmap

_What’s being built — ordered by dependency, not priority._

**IN PROGRESS — Supply-Chain Hardening (Trivy · OSV-Scanner · SBOM · Cosign)**
**Golden Image** pipeline: **Trivy** + **OSV-Scanner** on every merge; **CycloneDX/SPDX** **SBOM**; **Cosign** sign; **Kyverno** / **OPA** admit; optional **Merkle** of attestation. **Istio** (Ambient) + **Kiali** + **Jaeger**/Tempo in `values` overlays for staging.

**IN PROGRESS — Ouroboros TypeScript Port**
Full Interview → Seed → Execute → Evaluate → Evolve loop embedded in ClawQL pod. In-process tool executor registry. Seeds and logs to shared Postgres. Onyx calls handled through the same executor registry as all other providers.

**IN PROGRESS — Tika + Gotenberg Spec Bundling**
Fetch/generate OpenAPI specs from running instances. Save as `providers/tika.json` and `providers/gotenberg.json`. Wire into the bundled `providers/` registry and merged `all-providers` load.

**SHIPPED — Onyx bundle + `knowledge_search_onyx` ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118), [#144](https://github.com/danielsmithdevelopment/ClawQL/issues/144))**
`providers/onyx/openapi.yaml`, optional **`knowledge_search_onyx`**, test stubs + stdio / Streamable HTTP / gRPC **`listTools`** parity. **`memory_ingest`** **`enterpriseCitations`** for vault-safe trails ([#130](https://github.com/danielsmithdevelopment/ClawQL/issues/130)). Ingestion op **`onyx_ingest_document`** ([#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120)).

**NEXT — Flink Connector Pipeline Deployment**
Deploy Flink job manager and task manager into the `clawql` namespace. Configure connector jobs to keep Onyx index fresh from Slack, Confluence, Drive, Jira, GitHub, and other sources. Flink `jobmanager:8081` internal only.

**NEXT — notify() Tool Implementation**
New MCP tool wrapping Slack `chat.postMessage` (+ ephemeral, file upload). Updated to include Onyx citation links and Paperless document links in standard workflow completion templates.

**NEXT — Self-Hosted Spec Fetch Config**
`STIRLING_BASE_URL`, `PAPERLESS_BASE_URL`, `TIKA_BASE_URL`, `GOTENBERG_BASE_URL`, `ONYX_BASE_URL` in `fetch-provider-specs`. Runtime base URL injection for all self-hosted providers.

**NEXT — Merged Default Updates**
Unconfigured installs use the full `all-providers` merge. Custom merge: `CLAWQL_BUNDLED_PROVIDERS=…` (IDs) or `CLAWQL_SPEC_PATHS=…` only — no other implicit default.

**PLANNED — Cuckoo Filter Integration**
In ingestion path, Ouroboros Execute phase, Tika/Gotenberg output checks, and Onyx knowledge retrieval cache. `CLAWQL_CUCKOO_*` env vars.

**PLANNED — Merkle Tree Integration**
Per-step hashing in Ouroboros — including Onyx retrieval steps as leaves. Root stored in Postgres. Optional `proofOfIntegrity` GraphQL endpoint. `CLAWQL_MERKLE_*` env vars.

**PLANNED — Hybrid memory.db (sqlite-vec)**
SQLite + sqlite-vec vector sidecar alongside Obsidian vault. Works alongside Onyx — vault covers session-level runbooks and decisions, Onyx covers live enterprise index queries. Tracked in GitHub issues #68–#72.

**PLANNED — Unified Helm Chart Finalization**
`charts/clawql-full-stack` with all **12+** services including Onyx, Flink, **OSV-Scanner** jobs, optional **Istio**/**Kiali**, `values.yaml`, `CLAWQL_BUNDLED_OFFLINE=1`, `CLAWQL_ENABLE_ONYX=true`, resource limits, init jobs.

**PLANNED — Docker Image Rebuild + K8s Rollout**
Include new providers, Ouroboros TS port, Onyx + Flink configs, Cuckoo + Merkle integrations. Roll out to `clawql` namespace. Zero new pods for Ouroboros.

**FUTURE — Docs + Case Studies Update**
New docs.clawql.com case study for the knowledge-augmented document pipeline. Updated bundled-specs page with 9-provider table. `knowledge_search_onyx` tool reference documentation.

**FUTURE — Additional Onyx Connectors via Flink**
New data sources become new Flink connector jobs — no ClawQL code changes required. Future connectors: Postal (email), additional internal systems, custom data sources via `CLAWQL_SPEC_PATH`.

**Ecosystem 2026 (Q2–Q4) —** Web3, Fabric, Graph, Chainlink, supply-chain & mesh (**OSV-Scanner**, **Istio**, **Kiali**) (same core; flags + Helm values)

- **In progress** — **OSV-Scanner** + **Trivy** + **SBOM** in **Golden Image** CI; optional **Istio** (Ambient) + **Kiali** + **Jaeger**/Tempo in chart `values` overlays; **Vault** injector path hardening; NATS, ClawQL-Agent, OpenClaw; **Fabric** / **The Graph** / **Chainlink** / **x402** where the fork or env enables them.
- **Next** — **Fabric** **MVP** path: test net + `providers/fabric` **OpenAPI** + **Merkle/Seed** anchoring + `memory_ingest` **txid**; **lightweight** (single-node / anchoring) and **public**-fork **read-only** commitments; **Graph/Chainlink** tool hardening; **RWA** template packs.
- **Planned** — **Fabric** **medium** tier: Ouroboros-**aware** `Evaluate` ↔ **ledger** queries; Onyx **attestations**; proofs in **Vault**; **multi-org** consortia onboarding; **Edge** + Fabric test peers. **PDCs** + **NATS** ↔ **chaincode** **events** in **roadmap/ advanced**.
- **Future** — Level-4-style autonomy with Fabric-enforced spend / policy; optional **Channel-as-a-Service** marketplace for consortia.
- **Target** — public MCP + **lending / RWA** + Fabric-optional templates: **Q2 2026** pilot window (see **slide 54 — Pilot Readiness**).

---

## Slide 58 — Design Principles

### Design Principles

_Seven principles (six core + one for hybrid trust) that guide the ecosystem._

**01 — Conversational & Invisible**
Users speak naturally in Cursor. They do not need to name **Istio**, **OSV-Scanner**, or **Kiali** — Ouroboros, Seeds, Cuckoo, Merkle, Onyx, Flink, and MCP details stay out of the way unless the user _asks_ for a security or mesh operation. ClawQL’s job is to make complex automation feel like a simple conversation; unnecessary operational jargon in the main path is a design failure.

**02 — Local-First & Private**
Every service — including Onyx and Flink — runs in your Kubernetes cluster. Documents and company knowledge never leave your machine. No cloud dependencies. No SaaS subscriptions. No per-user or per-query limits. `CLAWQL_BUNDLED_OFFLINE=1` ensures no outbound spec fetches at runtime. Your data and your company’s knowledge are yours.

**03 — Self-Improving & Verifiable**
Ouroboros retries and adjusts automatically (Evolve phase). Merkle trees make every workflow — including Onyx knowledge retrieval — auditable. **Trivy** + **OSV-Scanner** + **SBOM** in the **Golden Image** make **supply chain** state **verifiable** at a digest level; Cuckoo filters prevent duplicate work. Citation links + **Merkle** + **signed** images = **defense in depth**.

**04 — Context-Efficient by Design**
`search()` returns only relevant operation slices — not full specs. `execute()` responses are trimmed by the GraphQL projection layer. `memory_recall()` returns ranked pages — not the whole vault. `knowledge_search_onyx` returns ranked chunks with citations — not your entire enterprise index. Every design decision keeps the AI’s context window clean and signal-rich regardless of data volume.

**05 — Extensible by Default**
Adding a new service is adding a new OpenAPI spec to `providers/`. Ouroboros discovers and orchestrates it automatically. Onyx: new data sources = new Flink jobs. **Istio** mesh **profiles** and **Kiali** **wizards** (Ambient vs **sidecar**) are **config**, not a fork. **OSV-Scanner** and **Trivy** are **pluggable** in **CI** and the **MCP** merge list.

**06 — Memory-Continuous**
`memory_ingest` after every significant workflow means future sessions — in any thread, with any assistant — can `memory_recall` the full history of what was processed, decided, and why. Onyx-retrieved company knowledge is ingested into the vault alongside workflow results, making enterprise knowledge permanently recallable without re-querying the live index. Plans and knowledge from Monday are available in Cursor on Friday. No re-explaining, ever.

**07 — Hybrid Public / Private Trust (Web3 + Fabric)**
The same `search` + `execute` surface and Helm chart can run **ClawQL-Web3** (public, x402, anchoring) and **SeeTheGreens / ClawQL-MCP** (regulated, private Fabric channels) without code drift — only configuration, policy, and network boundaries change. **Public verifiable commitments** and **private borrower-grade data** coexist; neither fork relies on the other for secrets.

---

## Slide 59 — Why ClawQL Wins

### Why ClawQL Wins

_What ClawQL does that no other MCP server, document tool, or enterprise search platform does today._

The market has MCP servers, document tools, memory products, enterprise search, and siloed Web3 stacks. ClawQL unifies **API + documents + Onyx + Obsidian** with **Ouroboros** and, when enabled, **MCP + x402**, **The Graph**, **Chainlink**, and **Fabric** in **one** executor and **one** chart — with optional on-chain and permissioned-ledger steps under the same audit model.

**vs. Other MCP Servers**

- Most MCP servers wrap one API. ClawQL ships 9 providers as defaults and accepts any OpenAPI spec
- No other MCP server has a durable cross-session memory system (Obsidian vault + hybrid sqlite-vec)
- No other MCP server embeds a structured workflow engine (Ouroboros) with automatic retry and Merkle verification
- No other MCP server integrates enterprise semantic knowledge search (Onyx) inside the same tool executor registry — so knowledge retrieval and action-taking happen in the same workflow
- Cuckoo filter deduplication in ClawQL prevents redundant operations — not found in any competitor

**vs. Document Automation Tools**

- n8n, Zapier, Make: visual workflow builders requiring explicit node configuration. ClawQL is natural language
- Stirling-PDF alone: just PDF manipulation. ClawQL adds Tika (extraction), Gotenberg (conversion), Paperless (archive), Onyx (live enterprise knowledge cross-reference), and AI orchestration in one platform
- No document tool on the market has a cryptographic Merkle audit trail per processing step
- No document tool can cross-reference processed content against live enterprise knowledge during the same workflow — ClawQL does this in the Stirling step before Paperless archival
- ClawQL’s document pipeline is self-hosted and private — no SaaS data exposure

**vs. Enterprise Search Platforms**

- Glean, Guru, Notion AI: cloud-hosted, subscription-based, per-seat pricing. Onyx inside ClawQL is self-hosted and open source — zero per-query or per-seat cost
- Enterprise search tools return answers. ClawQL returns answers AND acts on them — filing GitHub issues, processing documents, sending Slack notifications, all in the same automated workflow
- No enterprise search platform feeds retrieval results into a document processing pipeline and archives the output in a single automated step
- Chain **`knowledge_search_onyx`** → **`memory_ingest`** with **`enterpriseCitations`** (or redacted **`toolOutputs`**) so enterprise hits stay recallable via **`memory_recall`** without silent auto-append or full JSON dumps

**vs. Purely On-Chain or DeFi-Only Tooling**

- ClawQL adds **enterprise context** (Onyx, documents, private Fabric channels) in the same loop as **Graph/Chainlink** market data and execution — not a separate dapp stack.

**vs. Other Agent Frameworks**

- **LangGraph / AutoGen / CrewAI**-style orchestration is powerful but usually lacks a **unified** MCP+API surface, a **self-hosted** knowledge plane, and optional **provenance** (Merkle + Fabric) in one productized chart.

**vs. Enterprise-Blockchain Suites**

- Traditional permissioned-ledger products rarely expose **MCP** + **x402**-style agent payrails or **The Graph/Chainlink** in the same tool path as your document and search stack. ClawQL keeps **one** core; toggles and channels separate regulated from public.

**vs. Cobbled “Platform Engineering” (scan + mesh + RAG) stacks**

- Teams that stitch **Trivy** in one repo, **Istio** in another, **vector DB** in a third, and **MCP** nowhere still lack **Ouroboros** + **Onyx** + **Merkle** + **OSV-Scanner**-as-**`execute`** in **one** chart. ClawQL is the **productized** self-hosted bundle: same **`search` / `execute`** for **APIs**, **documents**, **knowledge**, and **vuln** **operations**, with **optional** **Istio** and **Kiali** as **first-class** infrastructure choices — not a blog post and five Helm charts.

---

## Slide 60 — ClawQL-Agent: The Intelligent Agent Layer

### ClawQL-Agent

_The production-grade agent runtime built on LangGraph that turns ClawQL’s MCP tools into persistent digital employees._

ClawQL-Agent is the dedicated agent layer that sits on top of the core ClawQL MCP server. It combines LangChain for tool abstractions, LangGraph for stateful multi-agent orchestration, and LangFuse for full observability — while treating every ClawQL tool (`search`, `execute`, `knowledge_search_onyx`, `memory_ingest`, `memory_recall`, `notify`, etc.) as native, first-class tools with full type safety and GraphQL projection.

**Core Architecture**

- **LangGraph Backbone:** Persistent checkpointing backed by Postgres, Redis, and NATS JetStream so agents survive restarts, failures, and long-running executions across days or weeks.
- **ClawQL Tool Integration:** Automatic registration of all MCP tools and any OpenAPI provider as LangGraph tools with structured schemas, error recovery, and retry logic.
- **Ouroboros Hybrid Engine:** LangGraph nodes can delegate complex structured workflows to full Ouroboros 5-phase loops (Interview → Seed → Execute → Evaluate → Evolve) while LangGraph handles dynamic planning, branching, and multi-agent coordination.
- **LangFuse Observability:** Complete tracing, evaluation datasets, prompt versioning, cost tracking, and performance analytics. Self-hosted LangFuse instance is included in the unified Helm chart.

**Key Capabilities**

- Long-running, interruptible, stateful workflows that maintain context across sessions.
- Multi-agent collaboration patterns (supervisor + specialist agents) sharing the same Onyx knowledge layer and Obsidian memory vault.
- Built-in reflection nodes that feed directly into Ouroboros Evaluate/Evolve phases.
- Role-based persistent identity with scoped memory vaults for each digital employee.

**Deployment**

Added via `helm upgrade` as an optional but recommended deployment in the same namespace. Reuses existing ClawQL infrastructure (Postgres, Redis, MinIO, NATS). No new external services required.

`npm install clawql-agent` · Private repo: `danielsmithdevelopment/ClawQL-Agent`

---

## Slide 61 — OpenClaw: The User Interaction Gateway

### OpenClaw

_The secure, beautiful frontend and governance layer for ClawQL + ClawQL-Agent._

OpenClaw serves as the primary human interface for non-developer users and provides centralized governance, monitoring, and approval workflows for digital employees.

**Core Features**

- Modern chat interface with streaming responses, threaded conversations, and direct integration with Cursor-style natural language.
- Workflow template gallery and one-click “Deploy Digital Employee” for common roles (Finance, DevOps, Compliance, etc.).
- Human-in-the-loop approval flows with full context, Onyx citations, Merkle proofs, and LangFuse traces before high-stakes actions.
- Real-time operational dashboard: active agents, workflow status, document pipeline throughput, Onyx query performance, and NATS event streams.
- Comprehensive audit UI: searchable Merkle-verified logs, Obsidian vault explorer, citation browser, and compliance export tools.
- Role-based access control that respects Onyx permission models.

**Technical Integration**

- React + TypeScript frontend communicating via gRPC, HTTP, and NATS JetStream to ClawQL and ClawQL-Agent.
- Embedded LangFuse dashboards for real-time evaluation and observability.
- Fully contained in the unified Helm chart with ingress at `openclaw.clawql.local`.

**Positioning**
OpenClaw makes ClawQL-Agent accessible to the entire organization while giving platform teams and compliance officers complete visibility and control. It bridges invisible orchestration with visible, governed execution.

---

## Slide 62 — LangChain + LangGraph + LangFuse Deep Integration

### LangChain + LangGraph + LangFuse Integration

_The modern agent stack that supercharges ClawQL’s production foundation._

**LangChain**

Tool abstraction and prompt management layer. Every ClawQL MCP tool is automatically wrapped as a fully typed LangChain Tool with Pydantic validation, automatic error handling, and seamless integration with any additional custom tools.

**LangGraph**

The central execution runtime:

- Stateful, checkpointed graphs with durable persistence.
- Pre-built templates for digital employee roles and common enterprise workflows.
- Supervisor + specialist multi-agent patterns with dynamic routing.
- Native support for parallel tool execution and conditional branching.

**LangFuse**

Enterprise-grade observability platform:

- End-to-end distributed tracing for every tool call, LLM reasoning step, and graph traversal.
- Automated evaluation pipelines scoring outcomes against acceptance criteria.
- Prompt management, versioning, and A/B testing.
- Cost governance and budget enforcement per agent or workflow.

**Unified Execution Flow**

Natural language input (Cursor or OpenClaw) → ClawQL routing layer → LangGraph planner → ClawQL MCP tools + Ouroboros structured loops → LangFuse tracing → NATS events → `memory_ingest` + OpenClaw updates.

_This integration gives ClawQL the flexible reasoning power of modern agent frameworks while retaining its hardened, local-first, auditable foundation._

---

## Slide 63 — Event-Driven Architecture with NATS JetStream

### Event-Driven Architecture with NATS JetStream

_The lightweight, high-performance nervous system enabling 24/7 coordination._

NATS JetStream has been added to the unified Helm chart as the primary event bus and durable streaming platform.

**Core Use Cases**

- Task queuing and load balancing across cluster pods and edge workers.
- Real-time agent-to-agent communication and workflow handoffs.
- Durable LangGraph checkpointing and state synchronization.
- Publication of Ouroboros phase completions, audit events, and Merkle root updates.
- **Advanced:** **Fabric** **chaincode** **events** (filtered) → **JetStream** **subjects** → **start** or **continue** **Ouroboros** **workflows** (pattern in **slide 41** **roadmap**).
- Reactive triggering from Flink/Onyx changes or external webhooks.
- Edge worker synchronization and completion signaling.

**Implementation Details**

- Single lightweight NATS deployment with JetStream enabled.
- Standardized subject hierarchy (`clawql.workflow.>`, `clawql.agent.>`, `clawql.document.>`, `clawql.edge.>`).
- Configurable retention, replication, and consumer policies via Helm values.
- Full monitoring exposed to Prometheus and Grafana.

**Why NATS JetStream**

Lower operational complexity and resource usage than Kafka while delivering the durability, ordering guarantees, and request/reply patterns needed for reliable autonomous agents. Perfectly aligned with ClawQL’s production-hardened, self-hosted philosophy.

---

## Slide 64 — Edge Worker Mode: Laptop Contributions

### Edge Worker Mode

_Optional pooled laptop participation that extends cluster capacity without compromising reliability._

ClawQL now supports “Edge Worker” mode for developer laptops and powerful local machines. Laptops run a lightweight ClawQL-Agent instance that participates opportunistically while keeping the central cluster as the source of truth.

**How Edge Mode Works**

1. Laptop runs `clawql-agent --mode=edge --connect-to=cluster`.
1. Registers with NATS JetStream as a best-effort worker in specific queues.
1. Pulls low-priority or burstable tasks (heavy OCR batches, local document testing, dev workflows).
1. Executes using local resources (GPU acceleration if available, local Tika/Stirling instances if desired).
1. Pushes completed artifacts to central MinIO, memory notes to shared Obsidian vault (with conflict-free merge), and full Merkle proofs + LangFuse traces back to the cluster.
1. Disconnects gracefully on sleep/shutdown; central cluster requeues any unfinished work.

**Governance & Safety**

- Central policy engine decides which task types can run on edge devices.
- All actions remain fully audited via Merkle trees, LangFuse traces, and Onyx citations.
- Sensitive data never leaves the organization (encrypted streams + token isolation).

**Use Cases**

- Developers accelerating heavy local document pipelines.
- Burst capacity during large enterprise imports.
- “Bring your own compute” for cost-conscious teams.

_This mode strengthens the local-first ethos while production workloads remain on reliable Kubernetes infrastructure._

---

## Slide 65 — Highly Autonomous Digital Employees

### Highly Autonomous Digital Employees

_From reactive tools to persistent, goal-oriented teammates that operate 24/7/365._

ClawQL + ClawQL-Agent + OpenClaw creates persistent digital employees that go far beyond simple agents.

**Characteristics of a ClawQL Digital Employee**

- **Persistent Identity:** Own scoped Obsidian vault, role prompt, performance history, and dedicated NATS subscription.
- **Goal-Oriented:** Accepts high-level objectives (“Own all Q1 invoice processing”) and decomposes them using LangGraph + Ouroboros.
- **Proactive:** Monitors events (new documents, Slack mentions, Onyx changes) and initiates workflows without constant human prompting.
- **Self-Correcting:** Full reflection loops + Ouroboros Evolve + LangGraph retries and backtracking.
- **Auditable & Safe:** Every decision, knowledge retrieval, and action is Merkle-verified and visible in OpenClaw.
- **Collaborative:** Works seamlessly with other digital employees and human teammates via shared Onyx knowledge and Slack `notify()`.

_Current Autonomy Level: 2–3 (highly supervised execution with strong proactive elements inside well-defined domains)._
_Roadmap Target: Level 4 (highly autonomous within role, with human oversight only on strategy and exceptions)._

**Real-World Example**

A Finance Digital Employee wakes on new Paperless documents at 3 AM, runs Onyx cross-reference against pricing policy, processes the full pipeline, files GitHub issues for discrepancies, posts a summary to Slack, ingests the complete outcome to the vault — and only escalates when confidence drops or policy thresholds are breached.

_This is the practical path to agentic workforce transformation — private, verifiable, and built on your own infrastructure._

---

## Slide 66 — Autonomy & Agent Roadmap (summary)

### Autonomy, Edge, and ClawQL-Agent (summary)

_This slide is a **short** companion to **slide 57** — the detailed work queue (core + **Web3/Fabric/Graph/Chainlink** + **Trivy/OSV/Istio/Kiali**) lives there; this list tracks **ClawQL-Agent** and **OpenClaw** specifically._

- **In progress** — NATS, ClawQL-Agent (LangGraph + LangFuse), OpenClaw (approvals, dashboards), Edge Worker.
- **Next** — Digital-employee templates (Finance, DevOps, Compliance), hybrid sqlite-vec, stronger reflection.
- **Planned** — Level-3-style autonomy, LangFuse eval loops, compliance packaging; global NATS ideas.
- **Future** — Level-4 goals with human ratification; community template marketplace.

For **Fabric, x402, RWA, supply-chain gates, mesh rollout, Q2 2026 pilots** — use **slides 57**, **54**, and **28** (Helm + Vault).

---

## Slide 67 — Vision: The ClawQL Autonomous Workforce + Agentic Capital Formation

### Vision: private workforce + public capital OS

**ClawQL Ecosystem = Private Autonomous Workforce (regulated) + Public Agent-Native Capital OS (Web3).**  
Agents can originate, fund, service, and **prove** tokenized RWAs with **enterprise knowledge**, **on-chain** data and execution, and **optional Fabric** provenance — all under **durable memory** and **x402**-style pay-per-call economics where enabled.

- **ClawQL + ClawQL-Agent + OpenClaw** — natural language, persistent digital employees, governed execution, 24/7 event-driven work (NATS, Edge).
- **ClawQL-Web3 + The Graph + Chainlink + (optional) Fabric** — the same `search` / `execute` story extended to market data, oracles, CCIP, and permissioned audit when you turn the flags on.
- **Result** — institutional knowledge that does not die, workflows that do not forget, audit trails for compliance **and** on-chain attestation where you need them.

_ClawQL is the **operating system** for **sovereign lending and agentic capital formation** in the agent economy — not just another agent framework._

---

## Slide 68 — Section Divider: Defense in Depth & Security Operations

# 08 — Defense in Depth & Security Operations

_Threat modeling, immutability, supply chain, zero trust, recovery, and how ClawQL maps to each layer. **Full** reference: [`docs/security/clawql-security-defense-in-depth.md`](../security/clawql-security-defense-in-depth.md)._

---

## Slide 69 — The Security Challenge in Self-Hosted + Our Goal

### The security challenge (self-hosted / on-prem)

Attackers chain application bugs, supply-chain compromise, and misconfiguration, then install persistence: backdoors, miners, and data exfiltration. Mutable infrastructure drifts; footholds are easy to miss; industry reporting often shows **long dwell time** (on the order of **hundreds of days** before discovery).

**ClawQL** runs the same risks as any rich **Kubernetes** stack. Defense is **layered**, not a single product: **IaC**, **signed** images, **Istio** mTLS, admission **policy** (Kyverno/OPA), **Trivy** + **OSV-Scanner** + **SBOM**, **HashiCorp Vault** (or OpenBao), **Falco**-class runtime signals, and **Merkle** + **`audit`** for workload-level **evidence** in the app plane.

### Our goal (defense in depth)

- Make stealthy persistence **noisy** or **structurally hard**: observable deltas vs a **signed** baseline, not “silent craft on the disk for months.”
- **Reduce MTTD and MTTR**: recover by **redeploying** from known-good **immutable** images and **IaC**, not by hand-tuning compromised nodes.

---

## Slide 70 — Threat Modeling: STRIDE + Process

### Threat modeling

Model **threats and mitigations** before you lock architecture—then re-run the exercise when you change **Helm** values, add **providers**, or rotate **Istio** or **Flink** topology.

**STRIDE (examples in the `clawql` namespace)**

| Code | Class                  | ClawQL-oriented example                                                                             |
| ---- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| S    | Spoofing               | Stolen `kube` credentials; unauthenticated use of the HTTP **MCP** transport                        |
| T    | Tampering              | Mutating a running **pod** filesystem; forged **Merkle** or **Onyx** citation chain                 |
| R    | Repudiation            | “No one signed off on that **Seed**” — counter with **Postgres** + **Merkle** + optional **Fabric** |
| I    | Information disclosure | PII in logs; **Onyx** used without **permission** enforcement                                       |
| D    | Denial of service      | **Flink**/**Tika** overload; retry storms through the mesh                                          |
| E    | Elevation of privilege | **privileged** `values.yaml`; **Clawql** **container** running as root                              |

**Six steps:** (1) scope & assets, (2) enumerate STRIDE + **MITRE ATT&CK** where useful, (3) likelihood × impact, (4) mitigations, (5) test in staging, (6) repeat on each major **change ticket**.

---

## Slide 71 — Three Foundational Principles (Mapped to ClawQL)

### 1. Zero trust

- Do not assume “inside the VLAN = safe.” Re-authenticate and enforce policy at **Istio** and **K8s** **RBAC** boundaries; short-lived credentials from **Vault** where possible.
- In **ClawQL**: **Istio** mTLS, **Kiali** to find plaintext service pairs, **Onyx** source **permissions** at retrieval time, and **`search` + `execute`** to avoid dumping full specs into the model (lean context).

### 2. Immutability

- **No** `apt install` in production **pods**—rebuild, sign, roll.
- In **ClawQL**: **Golden Image** (Trivy, OSV, **Cosign**), **Merkle** for **Ouroboros** outputs, `values.yaml` + Git as the only allowed steering wheel.

### 3. Least privilege

- One **K8s** **ServiceAccount** and **one** set of **provider** tokens per function; no shared kubeconfig with **cluster-admin** on a developer **laptop** for prod.

---

## Slide 72 — Golden Images, IaC, and Signed Provenance (ClawQL)

### Golden images and admission

- Trivy + **OSV-Scanner** + **SBOM**; **merge gates** for Critical/High per `policy` (as you define it); **distroless** / **Chainguard**-style bases; optional read-only root where the workload allows.
- **Kyverno/OPA**: no **hostPath** secrets, no `privileged: true` by default, only **signed** images per your registry policy.

### IaC

- One **Helm** (or Argo/Flux) definition per environment; all **ClawQL** toggles (`CLAWQL_BUNDLED_OFFLINE`, Istio, Flink, Onyx, Fabric) in a single **reviewed** **PR**.

### Organisational: signed git + build provenance

- YubiKey-signed **git** where policy requires; **SLSA** / **Sigstore** for the **build**; **Merkle** in **ClawQL** = runtime **integrity** of **orchestrated** **workflows** (complements image signing).

---

## Slide 73 — Identity, SSO, MFA, and YubiKey (What ClawQL Consumes)

**ClawQL** is not an **IdP**; it is deployed **next to** your **SSO** / **RBAC** / **Vault** model.

- **SSO (OIDC/OAuth)** for **Grafana**, **Kiali**, **OpenClaw**, **PagerDuty**—central **revocation** on identity compromise.
- **Phishing-resistant MFA** (FIDO2, **YubiKey**) for **admin** and **break-glass**; avoid TOTP-only for the highest-stakes access.
- **Git** **signing** (GPG/SSH on YubiKey) if **CI** **policy** enforces it.
- **Workloads**: **K8s** `ServiceAccount`; **Istio** workload identity; **Vault**-issued or **rotated** **tokens** for **Onyx** / **Slack** and other **OpenAPI** providers.

---

## Slide 74 — Vault, mTLS, Network, and DNS (Cluster Controls)

- **HashiCorp Vault** / **OpenBao** — static and dynamic secrets, optional **Istio**-protected data paths, per-team namespaces — see **slide 28** (Helm).
- **Istio** mTLS end-to-end; **Kiali** validates that peer **authentication** is enforced; **Envoy** access logs to **Loki** or your log stack.
- **NetworkPolicy** (and optionally **Cilium** for eBPF): default **deny**, explicit allow; optionally restrict **egress** from the **OSV-Scanner** / build jobs to known CVE-DB and registry hosts.
- **DNS** (often under-scoped in threat models): monitor for **tunneling** and odd **TXT**/lookup patterns; use **Istio** `ServiceEntry` to limit **outbound** destinations from **`execute`**.

---

## Slide 75 — K8s/Container Hardening + Workstations + Runtime

**In-cluster:** admission (**Kyverno/OPA**), **PSA** **restricted** where the workload allows, **readOnlyRootFilesystem** where possible, `seccomp` and **AppArmor** or Pod Security policies per your baseline.

**Runtime:** **Falco** (eBPF) for container/Kubernetes syscall anomalies; pair with **Trivy/OSV** in CI and **Grafana** alerts. **FIM** on any remaining mutable nodes if you are not 100% cattle on bare metal.

**Workstation:** full-disk **encryption** (FDE), **EDR** or equivalent, no standing **local** **admin** on the dev team laptop, **MDM**; **YubiKey** for **SSO** and **git** signing. **A stolen kubeconfig** with **cluster-admin** to prod is a **process** problem, not something **ClawQL** can “fix” in the pod.

---

## Slide 76 — Vulnerability Tiers, Supply Chain, and Logging

| Severity           | Response (typical)                     | In ClawQL + CI                                                        |
| ------------------ | -------------------------------------- | --------------------------------------------------------------------- |
| Critical (≈9.0–10) | P1; block deploy to prod               | Trivy/OSV gate; fail pipeline; annotate **Grafana** for `main@digest` |
| High (≈7.0–8.9)    | Patch in days; owner waiver in writing | Same gates or staging-only override per policy; **`notify` →** ticket |
| Medium / Low       | Backlog, SLAs                          | Tracked; scheduled upgrades                                           |

WORM or append-only log sinks for long-lived audit; **SIEM** correlation of **Falco**, **Istio**, **K8s** audit, and **ClawQL**’s **`audit`** and **Merkle**-linked **Ouroboros** events when you wire them.

---

## Slide 77 — Backup, Key Ceremony, and Incident Response (PICERL)

**3-2-1+** backups: **Postgres** (ClawQL, Paperless, etc.), **MinIO** objects, **Obsidian** PVC, **Vault**/state where applicable. **Isolated** backup **credentials**; test **restore** on a **schedule** (e.g. quarterly). Use **S3** Object **Lock** / WORM for regulated off-site if required.

**Key ceremony** for **unseal** (Shamir), **Cosign** / **HSM** roots, and any **M-of-N** org policy—rehearse **annually** with a **tabletop** cold start.

| PICERL                      | In practice (ClawQL-aware)                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| **P**reparation             | Runbooks, Uptime Kuma, **PagerDuty** provider, on-call rota                                 |
| **I**dentify                | Kiali + SIEM + Falco + `audit` with **Merkle**/Seed id                                      |
| **C**ontain                 | Revoke **Vault** leases, tighten **NetPol**, take suspect workload out of the mesh          |
| **E**radicate / **R**ecover | **Redeploy** from **signed** digest via **IaC**; restore data from tested backups if needed |
| **L**essons                 | Blameless postmortem (e.g. **within 72h** for SEV-1)                                        |

**ClawQL** advantage in IR: tie incidents to **Ouroboros** **Seeds** and **Onyx** **citation** trails so you know **which** **workflows** were in flight.

---

## Slide 78 — End-to-End: Secure Lifecycle + Supply-Chain Attack Table

**Lifecycle (Clawql inside the full stack):** (optional) signed **git** → **CI** (Trivy, **OSV-Scanner**, **SBOM**, **Cosign**) → **signed** **image@digest** → **Helm**/GitOps deploy with **Istio** + **NetworkPolicy** → **Vault**-issued **runtime** secrets to **Clawql** → **MCP** + **Ouroboros** + **Merkle** + **Falco** + **Grafana** → on incident: **isolate**, **redeploy** from **IaC** only.

| Phase               | Without defense in depth        | With the stack (incl. ClawQL)                                                                                             |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Supply chain        | Compromised dependency in image | **SBOM** + scan **gates**; admission rejects unsigned                                                                     |
| Run in K8s          | RCE, shell in container         | **Falco**+**Istio mTLS**; no **privileged** by default                                                                    |
| Lateral movement    | Stolen long-lived **secrets**   | **Vault** leases, **Istio** L7+egress policy                                                                              |
| Persistence on node | Backdoor survives **reboot**    | **Replace** **node** / rescheduled **pods** from **IaC**; **Merkle**+**Clawql** = detect **app**-level **workflow** drift |

---

## Slide 79 — Security Ops, References, and the Full Document

- **Ongoing** work: key rotation, **Falco** tuning, **Istio** upgrades, **quarterly** IR **tabletop** with a supply-chain or **kube**-credential **scenario** (see labs in the reference doc).
- Pointers: **NIST** SP 800-207, **CISA** Zero Trust, **CIS** Kubernetes benchmark, **MITRE ATT&CK**, **SLSA**, **Sigstore**, **NIST** CSF 2.0 — all expanded in [`../security/clawql-security-defense-in-depth.md`](../security/clawql-security-defense-in-depth.md) with **discussion** **questions** and **hands-on** **lab** ideas.
- **Engineering audit trail:** [`../security/clawql-security-defense-deliverables.md`](../security/clawql-security-defense-deliverables.md) — control → **status** → **issue** → **Helm/CI/docs** artifact matrix ([#164](https://github.com/danielsmithdevelopment/ClawQL/issues/164)).
- **ClawQL**-specific: `search`/`execute` to keep the **MCP** context lean; **Merkle** + **Seeds** + `audit`; optional **Fabric** for **consortium**-grade **receipts**; **Onyx** for **knowledge** governance at the **source** systems.

---

## Slide 80 — Closing

# ClawQL Ecosystem

**Ready for production pilots.** Public MCP + lending / RWA + **optional Fabric** on a **Q2 2026** track (see **slides 50–55**, **57**). **Security** **defense in depth** (slides **68–79** + [`../security/clawql-security-defense-in-depth.md`](../security/clawql-security-defense-in-depth.md)).

### The AI-Orchestrated API, Document & Enterprise Knowledge Automation + Web3 / Fabric

- One core; **two go-to-markets** (public Web3, regulated) without code drift.
- Natural language from API calls to documents to Onyx to **on-chain and permissioned-ledger** steps in one Ouroboros loop.
- **9+** bundled provider families, **12+** runtime services, one Helm story (**Trivy** + **OSV-Scanner** + **SBOM** in the **Golden Image** pipeline; **optional Istio** + **Kiali**; **Vault**; **Fabric** sub-chart when enabled).
- **Engineering status (shipped vs in-flight):** **[deliverables matrix](../security/clawql-security-defense-deliverables.md)** ([#164](https://github.com/danielsmithdevelopment/ClawQL/issues/164)) — does **not** replace this vision; it **audits** what is already in **Git** vs what is **tracked** for the rest of the pipeline (e.g. filesystem **OSV** + **Trivy** in **CI** today; **SBOM** / **Cosign** / image-level gates per **#156** (narrowed: CI + publish + docs), **#132**; MCP OSV / Helm rescan / audit hooks **#202**–**#204**).
- Cross-session **Obsidian** memory + **Merkle** (and **Fabric** when on) for recall and audit; **supply-chain** and **zero-trust** as **first-class** concerns.
- **Local-first**; your cluster, your keys, your mesh policy, your scan gates.

**GET STARTED**

| Resource                                | Link                                                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation                           | https://docs.clawql.com                                                                                                                                                            |
| Defense in depth (reference)            | [`../security/clawql-security-defense-in-depth.md`](../security/clawql-security-defense-in-depth.md) (slides **68–79**)                                                            |
| Defense in depth (deliverables / audit) | [`../security/clawql-security-defense-deliverables.md`](../security/clawql-security-defense-deliverables.md) ([#164](https://github.com/danielsmithdevelopment/ClawQL/issues/164)) |
| GitHub                                  | danielsmithdevelopment/ClawQL                                                                                                                                                      |
| npm (MCP)                               | `clawql-mcp`                                                                                                                                                                       |
| Kubernetes                              | https://docs.clawql.com/kubernetes                                                                                                                                                 |
| Helm Chart                              | https://docs.clawql.com/helm                                                                                                                                                       |
| Case Studies                            | https://docs.clawql.com/case-studies                                                                                                                                               |
| Contact                                 | **Daniel Smith** — danielsmithdevelopment@gmail.com                                                                                                                                |

_Local. Private. Powerful. Production-ready. **Knowledge-augmented.** **Security-hardened** (Trivy, OSV-Scanner, optional Istio; **Golden Image** + **SBOM** + **Cosign** in the full-stack story — see [deliverables matrix](../security/clawql-security-defense-deliverables.md) for **shipped vs roadmap**). On-chain where you choose. **Enterprise- and agent-trusted**._

---

_April 2026 · danielsmithdevelopment/ClawQL · docs.clawql.com_
