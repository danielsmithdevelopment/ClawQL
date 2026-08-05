# ClawQL Intelligent Document Processing Platform

**Version:** July 2026 (7.2.0+)  
**Tagline:** Sovereign • Modular • Production-Ready • Hosted & Self-Hosted

**Audience:** Investors · Developers & architects · Operators

**Related:** [IDP GTM strategy & landing brief](./clawql-idp-gtm.md) · [Public IDP GTM playbook](https://clawql.com/idp/gtm) · [IDP pipeline hub](../providers/idp-pipeline.md) · [Requirements matrix](../roadmap/idp-master-requirements-matrix.md) · [OpenClaw IDP skill profile](../openclaw/openclaw-idp-skill-profile.md) · [Token efficiency (12 layers)](../architecture/clawql-token-efficiency.md) · [OpenBench advanced specs](../benchmarks/openbench-advanced-specs.md) · [Master enablement guide](./clawql-master-enablement-guide.md) · [Deployment guide](../deployment/clawql-deployment-operations-guide.md)

---

## For Investors

Understand the market problem, business model, competitive differentiation, and the path to a hosted product.

## For Developers & Architects

Deep-dive into architecture decisions, token efficiency, component integrations, deployment topology, and the inference fleet.

---

## Executive Summary

ClawQL is a sovereign Intelligent Document Processing platform and MCP agent operating system. It replaces fragmented SaaS toolchains with a single AI-orchestrated pipeline — from document ingestion to secure external distribution — available both as a self-hosted deployment and as a fully managed hosted service.

Enterprises manage documents across dozens of disconnected tools while their AI agents operate without persistent memory, token efficiency, or semantic search over institutional knowledge. ClawQL collapses both problems: a **twelve-layer** token efficiency architecture for the agent layer, a full document processing pipeline for the document layer, and a sovereign multi-model inference fleet that keeps sensitive data inside the tenant boundary.

---

## The Problem

- Document workflows span 5–10+ SaaS products with separate billing, compliance postures, and data exposure points.
- AI agents have no persistent memory — every session starts from zero. Institutional context must be re-explained manually.
- Naive tool-calling approaches load full API specs into context windows: **2,556,000+ tokens** for three common providers combined.
- VDR incumbents charge $10,000–$200,000+/year with no pipeline integration. IDP vendors charge $0.50–1.50/page.
- No competitor provides a sovereign locally-running fine-tuned LLM with verifiable data sovereignty at the infrastructure layer.

---

## The ClawQL Solution

- **Twelve-layer token efficiency** reducing input tokens by ~99.8% on average at Layer 1. The nearest MCP gateway competitor implements one layer. Canonical detail: [`clawql-token-efficiency.md`](../architecture/clawql-token-efficiency.md).
- **End-to-end IDP pipeline:** ingest → convert → redact → archive → semantically index → share — one Helm chart.
- **Durable cross-session agent memory** (Markdown, local, portable). OKF v0.2 trust signals (`generated`, `verified`, `stale_after`, `status`, `superseded_by`) in vault entries. `memory_ingest` / `memory_recall` tools. See [`okf.md`](../memory/okf.md).
- **PorTAL** (Ramp Labs, Apache 2.0): Portable Task-specific Adapter Learning via `--format portal-bundle` in the flywheel export pipeline. See [`portal-flywheel.md`](../inference/portal-flywheel.md).
- **Sovereign multi-model inference fleet:** fine-tuned Qwen3.6-27B + Ornith 35B MoE + Phi-4 14B. Istio-enforced egress block. No tokens leave the tenant boundary.
- **Defense-in-depth security:** Kata container VM isolation, WORM Merkle audit logs, Panguard ATR fail-closed, model weight integrity verification. Documented at [defense-in-depth](https://docs.clawql.com/security/defense-in-depth).

---

## Business Value at a Glance

| Value Driver                | Detail                                                                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Token efficiency**        | Twelve compounding layers. ~99.8% average input reduction on Layer 1 alone. Layers 2–12 reduce output, prose, cache cost, repeated calls, history growth, per-task model cost, and flywheel training waste. |
| **Cost reduction**          | Replaces $8,000–15,000+/month incumbent stacks. ClawQL Dedicated + Sovereign Security Pack: **$799/month** maximum (indicative GTM).                                                                        |
| **Data sovereignty**        | Provable at the infrastructure layer. Istio AuthorizationPolicies enforce egress blocks — not only a contractual claim.                                                                                     |
| **Persistent agent memory** | Unique among IDP / VDR / MCP gateway competitors: cross-session vault memory with OKF trust signals.                                                                                                        |
| **AI readiness**            | MCP-native from day one. Improves as models improve. Token layers mean agent cost drops as usage scales.                                                                                                    |
| **VDR market entry**        | Coneshare delivers VDR capabilities at a fraction of incumbent pricing, with full pipeline integration.                                                                                                     |
| **Hosted revenue**          | Managed hosted plan creates recurring SaaS revenue on top of the open-source self-hosted core.                                                                                                              |

---

## Deployment Models

ClawQL is available in configurations that run identical pipeline logic.

| Model                           | Details                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Self-Hosted ($0)**            | Full OSS stack on your own infrastructure. All bundles self-managed via Helm. Apache 2.0 core. No license fee.           |
| **Managed Hosted**              | Shared multi-tenant (**$299/mo**) or Dedicated single-tenant (**$599/mo**). Fully managed. Tenant provisioned on signup. |
| **Enterprise (from $3,500/mo)** | Dedicated node, custom SLA, on-call, HITL, vertical fine-tune adapters, security review assistance, multi-region.        |

The GPL-3.0 Paperless-ngx dependency is **removed from the hosted stack**. The ClawQL-native archive layer (Nextcloud + Postgres + Onyx) replaces it. Self-hosted operators who prefer Paperless-ngx can enable it via feature toggle. See [Licensing Summary](#licensing-summary).

Plugin-bundle pricing detail (Developer/Teams/Starter/…): see [Hosted plan pricing](#hosted-plan-pricing-july-2026--plugin-bundles) and [IDP GTM](./clawql-idp-gtm.md).

---

## Platform Overview

ClawQL's IDP platform automates the full document lifecycle: ingestion, classification, extraction, enrichment, redaction, archiving, semantic indexing, and secure external sharing — unified under a single AI orchestration layer with twelve-layer token efficiency and persistent agent memory.

### Core Architecture Principles

- **Twelve-layer token efficiency:** Compounds across input, output, prose, caching, semantic deduplication, history, prompt trimming, model routing, structured-output hints, token budgets, optional prefill, and the fine-tune flywheel.
- **Local-first:** Processing runs in the operator's environment (self-hosted) or a dedicated tenant (hosted). No document data sent to external SaaS LLM APIs on Dedicated/Enterprise sovereign paths.
- **Specification-driven:** Every service exposes an OpenAPI (or GraphQL) surface loaded into ClawQL for uniform `search()` / `execute()`. The **`mcp-api-adapter`** package exposes every MCP tool as `POST /{toolName}` (+ GraphQL, `/mcp`, gRPC, `gen-cli`) so HTTP clients and Workers can call tools without speaking MCP wire protocol. Production paths may use gRPC directly.
- **Persistent memory:** Obsidian vault + `memory_ingest` / `memory_recall` for institutional knowledge across sessions.
- **Sovereign AI inference:** Fine-tuned model fleet via vLLM inside the tenant boundary; Istio egress block at the mesh layer.
- **Cryptographic integrity:** Merkle trees per step; WORM storage; Cosign-signed commits where configured.

### Component Map

| Component                    | Role in Platform                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------- |
| **ClawQL Core**              | MCP server, token-efficiency engine, AI orchestration (TypeScript, Apache 2.0)    |
| **ClawQL Inference Gateway** | Policy-driven model routing; `/v1/chat/completions`; NSV/SGDOP; Layer 8+          |
| **Apache Tika**              | Universal parsing and metadata (1,000+ formats)                                   |
| **Gotenberg**                | Document-to-PDF (LibreOffice + Chromium)                                          |
| **Stirling-PDF**             | PDF ops, PII redaction, OCR, Merkle audit generation                              |
| **ClawQL Archive Layer**     | Nextcloud + Postgres metadata + Onyx. GPL-free. Replaces Paperless-ngx on hosted. |
| **Onyx**                     | Semantic search + 40+ connectors                                                  |
| **Obsidian Vault**           | Durable cross-session agent memory (Markdown)                                     |
| **Nextcloud**                | Human file storage, collaboration, archive UI                                     |
| **Coneshare**                | Secure sharing, VDRs, engagement analytics (MIT)                                  |
| **Qwen3.6-27B (fine-tuned)** | Core document worker; vLLM NVFP4; L4 GPU                                          |
| **Ornith 1.0 35B MoE**       | Coding specialist; serve as-is (MIT, DeepReinforce AI)                            |
| **Phi-4 14B (fine-tuned)**   | Utility / memory worker                                                           |
| **Langfuse**                 | Trace capture, datasets, flywheel observability (LGTM+)                           |

---

## ClawQL Core: Orchestration and Agent Interface

**License:** Apache License 2.0.

ClawQL is a TypeScript MCP server published as `clawql-mcp` on npm. Agents discover and invoke operations across REST APIs, document workflows, and knowledge sources using two tools — keeping context lean while accessing the full pipeline through compounding token-efficiency layers.

### The Two-Tool Pattern

- **`search()`** — Discover operations by natural language across loaded specs.
- **`execute()`** — Invoke a specific operation; optional GraphQL / field projection trims responses (Layer 2).

A single agent prompt — _“Process Q1 invoices, redact PII, cross-reference our pricing knowledge base, archive, create a data room, notify Slack”_ — can drive the pipeline without custom integration code.

### Twelve-Layer Token Efficiency Architecture

Most agent frameworks reduce cost at one point in the lifecycle. ClawQL addresses **twelve** points. Layers 1–8 are the MCP/gateway stack described below; Layers 9–12 are inference-gateway extensions ([canonical reference](../architecture/clawql-token-efficiency.md)). The nearest MCP gateway competitor (executor.sh) implements Layer 1 only.

| Layer                                 | Mechanism and measured impact                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 Code Mode** (always on)           | Two-tool pattern. Full specs stay on the server. Input reduction **97–99.9%** per provider; ~**99.8%** average across Google Cloud, Jira, Cloudflare. |
| **2 Response trimming** (always on)   | Trim responses to fields the agent code depends on. Example: GKE list **421 → 76** tokens (~82%).                                                     |
| **3 Prose compression** (always on)   | Strip hedging filler; preserve code/paths/ids. ~50–80% prose reduction.                                                                               |
| **4 Prompt caching** (one-time setup) | Stabilized prefix enables provider cache reads (~10% of input price where supported).                                                                 |
| **5 Semantic cache** (on by default)  | Similar requests skip the model; writes always live and invalidate related caches.                                                                    |
| **6 History compression** (opt-in)    | Distill long transcripts for multi-hour sessions.                                                                                                     |
| **7 Final prompt trimming** (opt-in)  | 20–40% additional reduction on already-compressed prompts.                                                                                            |
| **8 Model routing** (gateway)         | Cheapest capable model per sub-task across the sovereign fleet.                                                                                       |
| **9 Structured output**               | Inference-gateway hints (default on).                                                                                                                 |
| **10 Token budget signaling**         | Derive budgets from `max_tokens` (default on).                                                                                                        |
| **11 Prefill opener**                 | Optional assistant prefill (default off).                                                                                                             |
| **12 Flywheel**                       | Export → fine-tune → frugal tier registration (PorTAL-compatible).                                                                                    |

Layers 1–3 are always on with zero configuration and deliver the large majority of day-one savings. On managed hosted plans, Layers 1–5 and Layer 8 are active by default where credentials allow.

### Universal API Adapter: `mcp-api-adapter`

`mcp-api-adapter` is a standalone TypeScript package that points at any MCP server and exposes **five** surfaces from the same tool catalog. No ClawQL install required. Works with stdio, Streamable HTTP, or gRPC MCP servers.

**Direction matters.** ClawQL Core goes **OpenAPI → MCP** (`search` / `execute`). `mcp-api-adapter` goes the other way: **MCP tools → REST / GraphQL / gRPC / IDE**. Complementary, not competing. Do not market it as an “OpenAPI gateway” — that phrase collides with Core’s inverse direction.

| Surface                | What you get                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| OpenAPI / REST         | `POST /{toolName}`; Swagger UI `/docs`; `x-clawql-grpc` extensions |
| GraphQL                | Per-tool mutations + GraphiQL `/graphiql`                          |
| Streamable HTTP `/mcp` | Re-export for IDE clients                                          |
| gRPC                   | `:50051` (forward or local `mcp-grpc-transport`)                   |
| `gen-cli`              | Thin zero-dependency Node CLI posting to REST                      |

```bash
npx mcp-api-adapter --mcp-url http://127.0.0.1:8080/mcp
npx mcp-api-adapter --stdio -- npx -y @modelcontextprotocol/server-everything
npx mcp-api-adapter --grpc-address 127.0.0.1:50051
```

Shipped line (indicative): **v0.5.1** current — Streamable HTTP `/mcp` re-export, `gen-cli`, gRPC content normalization for MCP SDK clients.

vs **mcpo** (open-webui): Python / stdio-centric / FastAPI-first. `mcp-api-adapter` is TypeScript-native, transport-agnostic on input, adds GraphQL and `/mcp` re-export. Complementary.

### Key Capabilities

- MCP transports: stdio, HTTP (Streamable), gRPC.
- Bundled provider specs: GitHub, Cloudflare, Slack, Sentry, n8n, Linear, Jira, Bitbucket, and document pipeline services.
- First-class tools: `memory_ingest` / `memory_recall`, `knowledge_search_onyx`, `sandbox_exec`, `ingest_external_knowledge`, `notify`, `cache`, `audit`, `run_idp_pipeline`, classify/extract/inspect when enabled.
- **Ouroboros** 5-phase loop for retryable multi-step workflows. Empirically: `ouroboros-oscillation-escape` scores **1.0** (~5 turns, ~78s) vs **0.0** (~167s thrash) on DeepSeek — runs `30863572642`, `30866904277`, `30872913519`.
- Cuckoo filters for dedup; Merkle trees for tamper-evident audit.
- Arweave-anchored Layer 0 release manifests + `clawql doctor --smoke` startup hash verification.
- Integration catalog mirroring to ClawQL-controlled Harbor/R2 before distribution.
- Env feature toggles for optional layers (Onyx, Web3 provenance, Paperless compatibility).
- Unified Helm charts managing the supporting services.

### Production Hardening

- Golden Image Pipeline: Trivy + OSV-Scanner, SBOM, Cosign on every build.
- Optional Istio service mesh (mTLS, L7 policy, Kiali).
- HashiCorp Vault for secrets / certificates.
- Kubernetes/Helm: HPA, rolling updates, health-driven healing.

---

## Document Processing Pipeline

```text
Nextcloud / Email / WebDAV
  → pdf-inspector / Tika
  → Gotenberg (as needed)
  → Docling (complex layouts)
  → Stirling-PDF (OCR + redact + Merkle)
  → ClawQL Archive (Nextcloud + Postgres + Onyx)
  → Coneshare (distribute)
```

All stages run as Kubernetes workers. Argo Workflows can enforce per-tenant concurrency so one batch cannot saturate the shared pool.

### Stage 0: pdf-inspector — Classification and Fast Extraction

**License:** MIT (Rust). Millisecond PDF classification (text / scanned / mixed); high-fidelity Markdown from native-text PDFs without model inference. Branches the Argo DAG.

### Stage 1: Apache Tika — Universal Format Parsing

**License:** Apache 2.0. 1,000+ MIME types; Office/email/HTML/archives/images; Tesseract for image inputs.

### Stage 2: Gotenberg — Document Conversion

**License:** MIT. Office/HTML/Markdown → PDF for uniform downstream processing.

### Stage 3: Docling — Layout Analysis

**License:** MIT (IBM Research). DocLayNet + TableFormer for multi-column, tables, forms, scanned pages. Tracked historically as [#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248).

### Stage 4: Stirling-PDF — Redaction and Audit

**License:** Open-core. PII redaction, Merkle roots to Postgres, OCR fallback. Sovereign Security Pack adds WORM + Cosign-signed commits.

### Stage 5: LangExtract — Schema-Enforced Field Extraction

**License:** Apache 2.0 (Google). Character-offset grounding + confidence; low-confidence → HITL. Tracked as [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246). MCP: `extract_document`.

### Stage 6: ClawQL Archive Layer

**License:** Assembled from Apache 2.0 / AGPL / MIT components — **no GPL dependency** on hosted.

| Paperless-ngx feature | ClawQL archive equivalent                          |
| --------------------- | -------------------------------------------------- |
| Consumption inbox     | Nextcloud folder watch + webhook → NATS / pipeline |
| Auto-tagging          | Nextcloud Automated Tagging + agent tags           |
| Correspondent / type  | Postgres metadata store (+ Onyx classification)    |
| Full-text search      | Nextcloud Elasticsearch + Onyx semantic            |
| OCR on import         | Stirling OCR upstream                              |
| REST API              | ClawQL MCP tools                                   |
| Archive UI            | Nextcloud browser + Onyx search UI                 |

Self-hosted operators may still enable Paperless-ngx via toggle; hosted defaults to the native layer.

### Pipeline Routing Summary

1. Document arrives (Nextcloud watch, R2 upload / Argo Events, or API).
2. pdf-inspector classifies.
3. **Text PDF:** Markdown → Stirling → optional LangExtract → archive.
4. **Scanned/complex PDF:** Docling → Stirling → optional LangExtract → archive.
5. **Office:** Tika → Gotenberg → Docling → Stirling → optional LangExtract → archive.
6. **Other:** Tika → Stirling as needed → optional LangExtract → archive.
7. All paths: Onyx index, vault update, Merkle root commit; Coneshare for external distribution.

---

## Knowledge Layer: Onyx

Semantic retrieval with citations across pipeline outputs + 40+ connectors. Real-time indexing (Flink where deployed). Permission-aware hybrid search. Exposed as `knowledge_search_onyx()`.

---

## Durable Agent Memory: Obsidian Vault

Plain Markdown vaults — portable, no license restrictions on data. `memory_ingest` / `memory_recall` with OKF v0.2 trust signals. Vaults can sync to Nextcloud for human review. Roadmap: deeper in-vault semantic recall (sqlite-vec) where not already covered by Memory Stack 2.0.

---

## Storage and Collaboration: Nextcloud

**License:** AGPL-3.0 (self-hosted); commercial licenses from Nextcloud GmbH. Entry point and delivery destination for processed files; WebDAV/REST for agents; Automated Tagging; Elasticsearch FTS; retention apps; guest ACLs.

---

## Secure Sharing and VDRs: Coneshare

**License:** MIT. Passworded / expiring links, VDRs, page-level analytics, watermarks, file requests, Slack/webhooks. Every deal room can carry a `deal_id` linked into the WORM trail. Viewer events can resume Argo / notify / update memory (NATS document consumers).

Investor note: targets Intralinks / Datasite / Ansarada economics with pipeline-native provenance those standalone VDRs lack.

---

## Security, Audit, and Resilience

Zero-trust posture: auditable steps, authenticated service boundaries, operator-controlled data. Hosted adds tenant isolation and managed KMS patterns.

### Security Architecture

- Optional Istio mTLS + AuthorizationPolicies + Kiali.
- HashiCorp Vault (per-tenant namespaces on hosted).
- Golden images: Trivy, OSV, SBOM, Cosign.
- **Two-layer sovereignty:** (1) processing inside tenant boundary; (2) open-weight models you control — no closed-provider activation steering / undisclosed PEFT between your app and weights.

### Audit and Integrity

- Merkle trees per step; roots in Postgres.
- Cuckoo filters for dedup at scale.
- `audit()` MCP tool for agent-accessible verification.
- ClawQL metadata store: who triggered, stages, timestamps, Merkle roots, redaction records, LangExtract offsets, HITL decisions.

### Model Substrate Security

Before registering fine-tuned adapters in `tier-map.json`, model prep runs: refusal ablation → desperation ablation → custom policy / LoRA / PorTAL alignment (order matters). Open-weight serving eliminates closed-API intervention surfaces.

### Prompt Integrity Monitoring

When closed APIs are used: Unicode normalization checks, date-separator anomalies, behavioral baseline drift probes. WORM entries include prompt/response hashes and integrity verdicts.

Roadmap (not claimed as shipped here): Hyperledger Fabric on-chain provenance for regulated industries.

---

## End-to-End Workflow Example

Instruction: _“Process Q1 invoices, redact PII, cross-reference pricing knowledge, archive, create a data room, notify the team.”_

1. Document arrives in Nextcloud (or email/WebDAV); webhook / watch fires.
2. Agent `execute`s Tika (or pdf-inspector branch) for detect/extract.
3. Gotenberg converts Office → PDF when needed.
4. Stirling OCR/redact + Merkle hashes.
5. Processed PDF → Nextcloud; Postgres records metadata + roots.
6. Tags + Onyx index.
7. `knowledge_search_onyx` for pricing cross-ref.
8. `memory_ingest` for decisions / citations / hashes.
9. Coneshare VDR link (expiry, password, watermark).
10. Viewer engagement → NATS / Ouroboros / Slack / vault follow-up.

Full cryptographic trail from step 1 through 10.

---

## Competitive Positioning, Pricing, and Verticals

### MCP Gateway: executor.sh — One Layer vs Twelve

| ClawQL capability               | executor.sh                                 |
| ------------------------------- | ------------------------------------------- |
| 12-layer token efficiency       | Layer 1 only                                |
| Layers 2–12                     | None                                        |
| Persistent vault memory         | None                                        |
| Onyx semantic search            | None                                        |
| Full IDP + Merkle audit         | None                                        |
| Coneshare VDR                   | None                                        |
| Sovereign LLM fleet             | None                                        |
| NSV/SGDOP ensemble coordination | None                                        |
| Defense-in-depth docs           | Secrets + basic policy; no equivalent depth |
| GitHub stars                    | Ahead on adoption timing — not capability   |

executor.sh is a **stateless tool router**. ClawQL is a **stateful agent operating system**.

### Hosted Plan Pricing (July 2026 — plugin bundles)

| Tier                    | Price          | Notes                                                                                             |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------- |
| Self-hosted             | $0             | Full OSS; self-managed                                                                            |
| Developer (planned)     | $29–99/mo      | Gateway + memory (+ Onyx on Teams); no IDP/GPU                                                    |
| Shared                  | $299/mo        | Full IDP + Onyx + VDR + vault                                                                     |
| Dedicated               | $599/mo        | Single-tenant; sovereign AI bundle; SSO/RBAC                                                      |
| Enterprise              | from $3,500/mo | SLA, HITL, vertical adapters, multi-region                                                        |
| Sovereign Security Pack | +$200/mo       | Kata, weight integrity, WORM Merkle, Panguard, YubiKey signing, Presidio pre-log, monthly posture |

> Indicative GTM numbers — validate against infrastructure cost modeling before launch. See also [clawql-idp-gtm.md](./clawql-idp-gtm.md) for Starter/Business ladder variants.

### Full Stack Replacement Value

Representative: 25 users, 25k docs/mo, VDR + compliance.

| Component       | Incumbent vs ClawQL Dedicated                                    |
| --------------- | ---------------------------------------------------------------- |
| IDP             | Hyperscience / ABBYY five–six figures → **included**             |
| VDR             | Intralinks/Datasite/Ansarada → **included**                      |
| Semantic search | Algolia/Coveo/Glean → **included**                               |
| Merkle audit    | Custom build → **included**                                      |
| Sovereign LLM   | Not available elsewhere → **included on Dedicated**              |
| **Total**       | $8k–15k+/mo incumbents vs **≤$799/mo** Dedicated + Security Pack |

### Verticals

**Real estate / Keller Williams Command + Drive:** MCP + memory + Onyx at Teams price; Coneshare for disclosure packages; classify/extract for TC workflows.

**Software / technology:** One gateway for GitHub/Linear/Jira/Sentry/Slack; vault for eng decisions; Onyx over Notion/Confluence; Panguard + audit for governed tool use. Competes with executor.sh Team while adding memory + security depth.

### Where Competitors Have Genuine Advantages

| Gap                             | Honest assessment                                                              |
| ------------------------------- | ------------------------------------------------------------------------------ |
| Certifications (SOC 2, FedRAMP) | Controls architecturally present; audit process remaining.                     |
| Pre-trained skill libraries     | ABBYY’s catalog is larger; ClawQL vertical adapters are deeper where shipped.  |
| M&A brand                       | Intralinks embedded in IB relationships — references required.                 |
| executor.sh DX / stars          | Strong developer experience; answer is Developer/Teams tier + memory/security. |

---

## Deployment Architecture

Hybrid: **Cloudflare edge** (Developer/Teams) → **AWS K3s** (first IDP customers) → **EKS + Karpenter** (scale). Customer endpoint: `gateway.clawql.app` Worker routes by tenant tier.

### Shared vs Per-Tenant Services

| Tier                            | Services                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------- |
| Shared cluster-wide (stateless) | Tika, Gotenberg, Stirling — one pool, fair queues                                |
| Shared with tenant scope        | ES (per-tenant index), Postgres (per-tenant schema), Argo, Istio policies, LGTM+ |
| Strictly per-tenant             | Onyx, Nextcloud, R2 bucket, Coneshare, Vault namespace                           |

Marginal cost per tenant is primarily Onyx + Nextcloud; workers scale with volume, not headcount of tenants.

### Path 1: Bootstrap — K3s on EC2

K3s on r7i.2xlarge; R2 per-tenant buckets; Istio sidecar; Argo CD from day one; Ouroboros/job queue → Argo Workflows at scale; ingress-nginx; LGTM+.

### Path 2: Scale — EKS + Karpenter + Istio Ambient + Argo Suite

- **Reserved pool:** stateful (Onyx, Nextcloud, Postgres, ES, core).
- **Spot pool:** Tika/Gotenberg/Stirling/Argo pods.
- **Istio Ambient** for ephemeral workers.
- **Argo CD / Workflows / Events / Rollouts** for GitOps, DAGs, R2 triggers, canaries.

Migration is incremental: same Helm charts, Argo CD on both clusters, no application rewrite.

### Self-Hosted Customer Deployments

Same Helm chart; feature flags (`ENABLE_ONYX`, `ENABLE_CONESHARE`, `ENABLE_ISTIO`, `ENABLE_ARGO`, `ENABLE_PAPERLESS` self-hosted only). Minimum viable: Tika + Gotenberg + Stirling + Nextcloud + Postgres on a single VM.

---

## Sovereign AI: Multi-Model Fleet

Hosted Dedicated/Enterprise run a sovereign fleet inside the tenant boundary. Harnesses call **one** OpenAI-compatible Gateway endpoint; routing, NSV/SGDOP, prompts, and Langfuse emission live in one place.

### Role-Based Models

| Model                  | Role                                                      |
| ---------------------- | --------------------------------------------------------- |
| Qwen3.6-27B FT (NVFP4) | Document worker — tool sequencing, Ouroboros, Merkle, VDR |
| Ornith 35B MoE (as-is) | Coding specialist — do **not** LoRA away self-scaffolding |
| Phi-4 14B FT           | Utility / memory / metadata                               |
| Gemma 4 31B            | NSV/SGDOP diversity only                                  |

Mistral Devstral 2 (123B) excluded from initial fleet on cost; reconsider when revenue justifies.

### Model Escalation vs Agent Coordination

- **Escalation:** Frugal → Standard → Frontier on outcome failure (never skip tiers); WORM-logged.
- **Coordination:** `combined_drift` > 0.3 → Hermes MoA fan-out with NSV/SGDOP — independent of escalation.

J-space / imaginary-direction hypotheses are research notes, not product claims. Contact: hello@clawql.com.

### Gateway Routing (summary)

Identity → preset → SGDOP → NSV → harness-aware Ornith selection → canonical system prompt → vLLM → Langfuse/Loki/Tempo. Policy YAML presets: `worker-tool-use`, `coding-specialist`, `utility-quick`, `moa-diversity`.

### Data Sovereignty Layer

Presidio before LLM; Istio egress block on vLLM pods; local vLLM; tenant-scoped Langfuse; WORM routing decisions in Merkle chain.

### Fine-Tuning / PorTAL Flywheel

WORM call store is the primary training source (`verdict`, `verdict_source`, exclude `cache_hit`). Export with Presidio scrub + TrainingLineage manifest. Train on RTX 5090 (Unsloth QLoRA) → NVFP4 → `finetune register` → Argo Rollouts canary. PorTAL task-latent + per-base alignment makes adapters portable across base models ([portal-flywheel.md](../inference/portal-flywheel.md)).

---

## OpenBench: Live A/B Benchmark Results

Claims are verified with live agent A/B on GitHub Actions using frugal DeepSeek via OpenRouter. Graders require real `tool:clawql_*` evidence.

See also: [openbench.md](../benchmarks/openbench.md) · [openbench-advanced-specs.md](../benchmarks/openbench-advanced-specs.md) (B-1…B-6 Phase 1 packs) · in-repo `openbench/`.

### Proven claims (indicative July 2026)

| Claim                              | Result                            | Run                                   |
| ---------------------------------- | --------------------------------- | ------------------------------------- |
| Ouroboros convergence              | on 1.0 (~78s) / off 0.0 (~167s)   | 30863572642, 30866904277, 30872913519 |
| Memory continuation (seed removed) | on 1.0 / off 0.333                | 30872913516                           |
| Token-budget constrained           | on 1.0 / off 0.0                  | 30872437811                           |
| Memory roundtrip                   | on 1.0 / off 0.0                  | 30872913516                           |
| Search-first discovery             | on 1.0 / off 0.0                  | 30872913516                           |
| Execute-verify loop                | on 1.0 / off 0.0                  | 30872913516                           |
| Audit checkpoints                  | on 1.0 / off 0.0                  | 30872437811                           |
| Policy-deny execute                | on 1.0 / off 0.0                  | 30872913516                           |
| Multi-provider workflow            | on 1.0 / off 0.75 (noisier later) | 30868287877                           |

Infrastructure timeouts (OpenCode hang, no tools) are noise, not claim failures. Most cells are n=1 — raise n≥3 before statistical confidence (advanced ledger Phase 1+).

### Reasoning Trace Protocol (RTP)

OpenBenchTrace (outer envelope) + RTP (inner reasoning structure) are complementary. NSV/SGDOP used for schema governance in RTP and runtime ensemble coordination in ClawQL — same math, two scales.

---

## Licensing Summary

| Component                | License & notes                                     |
| ------------------------ | --------------------------------------------------- |
| ClawQL Core              | Apache 2.0                                          |
| Coneshare                | MIT                                                 |
| Apache Tika              | Apache 2.0                                          |
| Gotenberg                | MIT                                                 |
| Stirling-PDF             | Open-core                                           |
| Nextcloud                | AGPL-3.0 (+ commercial options)                     |
| Onyx                     | Open-source core — review current repo terms        |
| Obsidian vault format    | Plain Markdown — open data                          |
| Paperless-ngx (optional) | GPL-3.0 — **self-hosted only**, not in hosted stack |

Hosted plan avoids GPL dependencies. Legal review of AGPL network clauses recommended for SaaS.

---

## Roadmap

### Near-term (1–3 months)

- Hosted beta: Developer/Teams on Cloudflare Workers; 14-day trial.
- Inference Gateway v1 + pdf-inspector Stage 0 + Docling + LangExtract + HITL Label Studio.
- Qwen3.6-27B ClawQL-general fine-tune v1 + Istio egress + Presidio.
- `mcp-api-adapter` 0.5.x line (shipped).
- OpenBench expansion — advanced Phase 1 packs landed; live cells next.

### Medium-term (3–6 months)

- Privacy filter [#245], document-type classifier, See The Greens vertical FT, observability [#252], Argo HITL suspend/resume [#254], HITL→few-shot feedback, Business/Enterprise hosted, EU multi-region.

### Longer-term (6–12 months)

- Vertical packs [#251], KEDA [#257], handwriting/ICR, chart/figure VLM, cross-document entity resolution, continuous active learning, Hyperledger Fabric provenance, white-label hosted.

---

## Frequently Asked Questions

### For Investors

**How does ClawQL generate revenue?** Managed hosted subscriptions (primary); commercial support for self-hosted (secondary). OSS core drives adoption and conversion.

**Why not DocSend / Intralinks alone?** Distribution-only. No redact/convert/semantic index/agent integration. ClawQL VDR is the last mile of a processing + provenance pipeline; unlimited VDRs within subscription vs per-deal five-figure fees.

**What is the moat?** (1) Pipeline depth across IDP + API integration; (2) MCP-native architecture; (3) WORM call-store flywheel + PorTAL; (4) Merkle / Arweave / `deal_id` evidence chains.

**Does OSS threaten hosted?** No — it is the growth engine and evaluation path.

### For Developers

**Can I use ClawQL without the full stack?** Yes — feature toggles; minimal Tika + Gotenberg + Stirling + Nextcloud is viable.

**How does Ouroboros handle failures?** Retryable phases; Evaluate/Evolve re-route or HITL via `notify`; Merkle commit on success only.

**How is the archive different from “just Nextcloud”?** Postgres metadata + Onyx semantic + MCP-queryable processing history on top of Nextcloud files.

---

_Confidential — July 2026. GTM figures are indicative until launch cost models are locked._
