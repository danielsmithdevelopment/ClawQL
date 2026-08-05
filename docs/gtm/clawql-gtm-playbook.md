# ClawQL Go-To-Market Playbook

**Zero to Shared Tenancy: A Realistic Bootstrap Path**

| Field         | Value                                                                                                                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Version**   | June 2026                                                                                                                                                                                                                                                         |
| **Alignment** | [ClawQL IDP Platform](../vision/clawql-idp-platform.md) (v2 / July 2026 refresh)                                                                                                                                                                                  |
| **Audience**  | Founders · operators · finance · GTM                                                                                                                                                                                                                              |
| **Related**   | [IDP GTM landing brief](../vision/clawql-idp-gtm.md) · [Public IDP GTM](https://clawql.com/idp/gtm) · [MCP API adapter positioning](./mcp-api-adapter-positioning.md) · [Defense-in-depth](../security/clawql-comprehensive-defense-in-depth-mcp-k3s-may-2026.md) |

> Internal strategy document. Do not distribute externally without review. Canonical path: `docs/gtm/clawql-gtm-playbook.md`.

---

## Snapshot

| Metric                    | Target                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| **Bootstrap burn**        | ~$8–35/mo — Cloudflare-only launch; AWS provisioned on first IDP customer                  |
| **Full fleet break-even** | ~10–12 Shared + 1 Dedicated (with Ornith node) — ~$1,500–1,800/mo infra                    |
| **Gross margin target**   | ≥60% at 3 Dedicated + 20 Shared                                                            |
| **Deployment model**      | Cloudflare → AWS hybrid — Developer/Teams on Cloudflare edge; IDP tiers on EKS + Karpenter |

---

## Strategic context

This playbook covers ClawQL's path from zero customers to a sustainable shared-tenancy hosted business. It is grounded in the actual resource requirements of the ClawQL stack — not generic SaaS benchmarks — and reflects the architecture decisions in the IDP Platform document.

### What makes ClawQL different from a standard SaaS GTM

Most SaaS GTM playbooks assume lightweight compute. ClawQL is not a lightweight product. The full stack — Elasticsearch, Onyx, Gotenberg with Chromium, Stirling-PDF, Nextcloud, and the ClawQL metadata store — requires genuine memory-optimized infrastructure from day one. Consequences:

- **Higher bootstrap burn than typical SaaS** — and a much higher barrier to replication for competitors.
- **Infrastructure cost scales predictably** — Elasticsearch and Onyx are the memory ceiling; adding tenants beyond that ceiling requires a node upgrade, not a rearchitecture.

The original GTM draft estimated bootstrap burn at ~$220/month based on a 4 vCPU / 32 GB node. That node cannot run the full ClawQL stack. The corrected bootstrap node is an AWS **r7i.2xlarge** (8 vCPU / 64 GB) at **~$279–280/month** on a 1-year no-upfront reserved instance. All financial models in this document use corrected figures.

### Core GTM assumptions

| Assumption                | Detail                                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary deployment target | AWS `us-east-1`. GCP `us-central1` is a viable alternative at similar cost.                                                                                                                               |
| Bootstrap infrastructure  | Cloudflare Workers + R2 + KV + D1 for Developer/Teams (near-zero cost). `r7i.2xlarge` for first IDP customer (on demand, not upfront).                                                                    |
| Document storage          | Cloudflare R2 — $0.015/GB/month, zero egress fees. S3-compatible API; no rewrite required.                                                                                                                |
| Kubernetes distribution   | K3s single-node at bootstrap; scales to multi-node as tenants grow.                                                                                                                                       |
| Archive layer             | ClawQL-native (Nextcloud + Postgres + Onyx). No Paperless-ngx in hosted stack (GPL-3.0 incompatible with SaaS distribution).                                                                              |
| Observability             | LGTM+ (Loki, Grafana, Tempo, Mimir + Prometheus) from day one on IDP.                                                                                                                                     |
| Tenant isolation          | Kubernetes namespace per tenant with ResourceQuotas. Dedicated Onyx index per tenant.                                                                                                                     |
| Pricing model             | 14-day free trial (no credit card). Developer $29/mo, Teams $99/mo (Cloudflare). Shared $299/mo, Dedicated $599/mo, Enterprise $3,500+/mo (AWS). No free hosted tier — self-hosted is the zero-cost path. |

---

## Infrastructure architecture and cost model

ClawQL uses a hybrid infrastructure model: lower tiers (Developer, Teams) run on Cloudflare's global edge at near-zero cost per tenant; IDP tiers (Shared, Dedicated, Enterprise) run on AWS EKS with Karpenter. The customer-facing endpoint is identical regardless of backend — a routing Worker at `gateway.clawql.app` dispatches based on the tenant's active tier.

This split exists because Developer and Teams need only the MCP gateway, memory vault, semantic cache, and audit trail — all of which map to Workers + R2 + KV + D1. They have no need for GPU, Kubernetes, Onyx, or Nextcloud. Running them on AWS would pay for unused capacity.

### Tier-to-infrastructure mapping

| Tier                                                    | Infrastructure stack                                                                                                                                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Developer ($29/mo) / Teams ($99/mo)                     | Cloudflare Workers (MCP gateway, routing, audit). R2 (vault). KV (Layer 5 semantic cache). D1 (tenant metadata, audit log, cache index). Zero AWS dependency. ~$0.10–0.50/month infra per tenant at normal usage.       |
| Shared ($299) / Dedicated ($599) / Enterprise ($3,500+) | AWS EKS + Karpenter (reserved + spot). Full IDP pipeline (Tika, Gotenberg, Stirling-PDF, Docling, LangExtract). Nextcloud, Onyx, Postgres, Coneshare, ClawQL Inference Gateway, vLLM GPU node. R2 for documents. LGTM+. |

### Cloudflare stack: Developer and Teams

| ClawQL component                   | Cloudflare primitive                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| MCP gateway (`search` + `execute`) | Workers — TypeScript, stateless, zero cold start on paid plan, global edge.                                                     |
| Token efficiency Layers 1–5        | Workers handle Layers 1–3 natively. KV serves Layer 5. Layer 4 (prompt caching) via provider API regardless of Worker location. |
| Agent memory vault                 | R2 for documents ($0.015/GB/mo, zero egress Worker↔R2). D1 for metadata index.                                                  |
| Audit trail                        | D1 — `correlation_id`, `tenant_id`, model, timestamp. 5 GB free tier covers many thousands of tenants at normal usage.          |
| Tenant metadata + routing          | D1 — tier, plugin bundles, feature flags, usage.                                                                                |
| Semantic cache (Layer 5)           | KV — embeddings as values; similarity lookup in Worker before model call.                                                       |
| Request queuing                    | Cloudflare Queues (replaces SQS for lower tiers).                                                                               |
| Front door routing                 | Routing Worker: auth → D1 tier lookup → native (Developer/Teams) or proxy to AWS EKS (Shared+). Endpoint never changes.         |

**Critical advantage:** every `memory_ingest` / `memory_recall` on Developer/Teams stays inside Cloudflare's network — no internet egress. On AWS, the same pattern incurs ~$0.09/GB egress.

#### Cloudflare tier cost model

| Cost item                           | Cost                          | Notes                                                     |
| ----------------------------------- | ----------------------------- | --------------------------------------------------------- |
| Workers paid plan                   | $5/mo flat                    | Entire account, all tenants. First 10M requests included. |
| Workers overage                     | $0.30/million                 | 100k MCP calls/mo ≈ $0.                                   |
| R2 storage                          | $0.015/GB/mo                  | Zero egress within Cloudflare.                            |
| R2 Class A ops                      | $4.50/million writes          | Negligible at Dev/Teams volume.                           |
| KV reads                            | $0.50/million after free tier | 10M free reads/day.                                       |
| D1 storage                          | Free up to 5 GB               | Metadata + audit for hundreds of tenants.                 |
| Cloudflare Queues                   | $0.40/million messages        | Negligible at lower tier volumes.                         |
| **Total per 50 Developer tenants**  | **~$10–20/mo**                | Entire Cloudflare account vs ~$860+/mo minimum on AWS.    |
| **Total per 200 Developer tenants** | **~$25–45/mo**                | Near-zero marginal cost per additional tenant.            |

> **Durable Objects caution:** $0.15/million requests and $0.20/GB-month storage can surprise at scale. Prefer R2 + D1 for agent memory (write once, read occasionally) unless strong consistency on concurrent writes is required.

### AWS stack: Shared, Dedicated, Enterprise

Unchanged from the Karpenter architecture. Full IDP pipeline, Onyx, Nextcloud, Coneshare VDR, and vLLM GPU — none of which run on Workers.

| Instance                         | vCPU / RAM    | On-demand /mo | 1yr reserved /mo        |
| -------------------------------- | ------------- | ------------- | ----------------------- |
| r7i.2xlarge (bootstrap)          | 8 / 64 GB     | $386          | **$280** — IDP baseline |
| r7i.4xlarge (2–4 shared)         | 16 / 128 GB   | $772          | $559                    |
| r7i.8xlarge (6–8 shared)         | 32 / 256 GB   | $1,544        | $1,118                  |
| g6.xlarge (Qwen3.6-27B L4)       | 4 / 24 GB GPU | $386          | ~$280 Savings Plan      |
| g6e.xlarge (Ornith 35B MoE L40S) | 4 / 48 GB GPU | $763          | ~$580 Savings Plan      |

### Revised bootstrap monthly burn

| Cost item                      | Monthly          | Notes                               |
| ------------------------------ | ---------------- | ----------------------------------- |
| Cloudflare Workers paid        | $5               | All Developer/Teams tenants.        |
| R2 storage (all tiers)         | ~$3–30           | Scales with document volume.        |
| r7i.2xlarge 1yr reserved       | $280             | Only when first IDP customer signs. |
| EBS gp3 200 GB                 | $16              | OS, K3s, Postgres, Onyx indexes.    |
| EKS control plane              | $73              | When EKS is active.                 |
| Qwen3.6-27B GPU (L4, deferred) | ~$280            | When sovereign LLM required.        |
| LGTM+                          | $0               | Self-hosted on IDP node.            |
| **Cloudflare-only launch**     | **~$8–35/mo**    | Validate PMF before AWS.            |
| **First IDP customer**         | **~$380–410/mo** | r7i.2xlarge + EBS.                  |
| **Full fleet (with GPU)**      | **~$660–700/mo** | Add GPU when needed.                |

Launching Cloudflare-first is not only cost optimization — it is the correct GTM sequence. Developer/Teams customers onboard before any AWS spend. The first Shared subscription ($299/mo) more than covers spinning up the AWS node.

### Routing Worker: seamless tier transitions

| Step                               | What happens                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| 1. Request at `gateway.clawql.app` | Nearest Worker globally; ~5–15 ms TTFB.                                        |
| 2. Auth + tenant resolve           | Token validated; tier + plugin bundles from KV/D1.                             |
| 3. Route                           | Developer/Teams: native R2/KV/D1. Shared+: proxy to regional EKS gateway.      |
| 4. Tier upgrade                    | D1 updated; next request proxies to AWS. Endpoint, auth, vault unchanged.      |
| 5. Vault continuity                | Same R2 buckets/credentials from Worker and EKS — **no migration on upgrade**. |

### Revised overall economics (Cloudflare tiers)

| Scenario                                                            | Revenue/mo | Infra/mo | Gross margin |
| ------------------------------------------------------------------- | ---------- | -------- | ------------ |
| 50 Developer (CF only)                                              | $1,450     | ~$20     | ~99%         |
| 50 Developer + 10 Teams (CF only)                                   | $2,440     | ~$35     | ~99%         |
| + First Shared IDP (AWS on)                                         | $2,739     | ~$400    | ~85%         |
| 1 Shared + 1 Dedicated + 50 Dev + 10 Teams                          | $3,338     | ~$420    | ~87%         |
| Full fleet: 3 Dedicated + 20 Shared + 100 Dev + 20 Teams + Qwen GPU | $9,555     | ~$1,050  | ~89%         |

Cloudflare lower tiers run at ~99% gross margin. AWS IDP cost amortizes across a revenue base that was already profitable.

---

## Phase 1 — Zero customers (bootstrap foundation)

**Goal:** production-ready infrastructure with minimized burn. Ship nothing until the stack is observable, secure, and reproducible from a Helm chart.

### Day 1: Cloudflare setup (~2 hours, ~$5/mo)

1. Cloudflare account; Workers paid plan ($5/mo). R2 bucket `clawql-vault-prod`. D1 `clawql-tenants`. KV `clawql-semantic-cache`.
2. Deploy routing Worker to `gateway.clawql.app`: auth, D1 tier lookup, native Dev/Teams handling, IDP proxy stub (`upgrade required` until AWS exists).
3. R2 structure: `tenant-{id}/vault/`. CORS for browser agent clients.
4. Seed D1 schema: `tenant_id`, `tier`, `plugin_bundles`, `created_at`, `feature_flags`. Internal test tenant.
5. E2E verify: MCP `search`/`execute`, `memory_ingest`→R2, `memory_recall`←R2 (zero egress), audit in D1, semantic cache on KV.

### When first IDP customer signs: AWS setup

6. Provision `r7i.2xlarge` in `us-east-1`, Ubuntu 24.04 LTS, 200 GB gp3 EBS.
7. Install K3s with `--disable traefik`; deploy ingress-nginx.
8. Deploy ClawQL Helm chart: `ENABLE_ONYX=true`, `ENABLE_CONESHARE=true`, `ENABLE_PAPERLESS=false`, `ENABLE_ISTIO=false` (enable Istio before customer #1 — see security baseline). Configure R2 credentials (same bucket, IDP tenant prefix).
9. Update routing Worker: IDP proxy for the new tenant.
10. Full pipeline smoke: pdf-inspector → Docling → Stirling-PDF → LangExtract → Nextcloud/R2 → Onyx → Coneshare link.

### Namespace structure

| Namespace        | Contents                                                        |
| ---------------- | --------------------------------------------------------------- |
| `infrastructure` | Postgres, Elasticsearch, LGTM+, cert-manager, ingress-nginx.    |
| `clawql-core`    | MCP server, job queue, Ouroboros workers, audit store.          |
| `pipeline`       | Tika, Gotenberg, Stirling-PDF — stateless; scale independently. |
| `archive`        | Nextcloud, Onyx, Coneshare.                                     |
| `internal-dev`   | Mirrors prod with relaxed limits.                               |
| `tenant-[name]`  | One namespace per paying customer.                              |

### LGTM+ first, not last

Loki, Grafana, Tempo, Mimir, Prometheus before customer traffic:

- **Operational** — Gotenberg OOM, ES heap climb, stalled batches.
- **Sales** — live ingestion throughput/latency dashboards build enterprise trust.
- **Support** — traces instead of guesses.

### Security baseline before first customer

- TLS everywhere (cert-manager + Let's Encrypt on ingress-nginx).
- Istio mTLS before customer #1 (~1 GB RAM overhead worth it for enterprise sales).
- HashiCorp Vault in `infrastructure`; per-tenant secret namespaces before provisioning.
- ResourceQuotas on all tenant namespaces from day one.
- Prefer per-tenant R2 buckets (simplest CISO story); if shared bucket, enforce strict prefix isolation at the Worker.
- Cosign-signed images via Golden Image Pipeline; admission policy on K3s.

### Build vs buy at bootstrap

| Capability                   | Decision                                                              |
| ---------------------------- | --------------------------------------------------------------------- |
| Document processing pipeline | **Ship** — Tika + Gotenberg + Stirling-PDF via Helm.                  |
| Authentication               | **Buy** — Keycloak or Clerk; Nextcloud SSO via SAML/OIDC.             |
| Billing                      | **Buy** — Stripe; webhooks → tenant provisioning.                     |
| Customer portal              | **Defer** — Nextcloud + Grafana initially; branded portal in Phase 3. |
| Email / notifications        | **Buy** — Resend or Postmark.                                         |
| Status page                  | **Buy** — Instatus or Upptime.                                        |

---

## Phase 2 — 0 → 1 customer (founder-led sales)

**Goal:** first paying customer at Dedicated ($599/mo). Cover infra burn. Validate ICP, onboarding, and pipeline reliability.

### Ideal customer profile (ICP)

| Dimension          | Target                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Industry           | Legal, financial services, M&A advisory, healthcare administration, compliance-heavy SaaS.             |
| Company size       | 20–200 employees.                                                                                      |
| Current pain       | Manual invoices/contracts/compliance docs; DocSend/Intralinks + separate OCR; SaaS data exposure fear. |
| Budget signal      | $500–$2,000/mo SaaS document tooling; $2M+ annual revenue.                                             |
| Technical maturity | At least one developer or technical ops person.                                                        |
| Data sensitivity   | PII, financial records, or confidential deal docs — pays for isolation.                                |

### Problem-first outreach

| Vertical           | Opening line                                                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M&A / Legal        | "Your team is probably spending 3–5 hours per deal manually redacting and distributing due diligence documents. We automate that end-to-end, including the data room, with a cryptographic audit trail." |
| Financial services | "Every invoice your AP team touches manually is a compliance risk and a delay. We process, redact PII, archive, and route for approval automatically — with a verifiable audit trail per document."      |
| Healthcare admin   | "Your document vendor has access to patient records. We process everything in your own tenant — nothing leaves your environment."                                                                        |
| Compliance SaaS    | "You're building audit trails manually. We generate a Merkle-verified cryptographic record for every processing step, automatically."                                                                    |

**Free pilot:** provision `tenant-alpha`; let the prospect run ~100 of their own documents through the full pipeline. Seeing their documents processed in ~60 seconds closes faster than any demo.

### Provisioning tenant alpha

11. `kubectl create namespace tenant-alpha`
12. ResourceQuota: 12Gi memory, 4 CPU.
13. Dedicated R2 bucket `clawql-tenant-alpha-docs`; Nextcloud external storage → bucket.
14. Dedicated Onyx index namespace — no cross-tenant bleed.
15. Vault namespace `vault/tenant-alpha/` for Nextcloud, R2, Coneshare secrets.
16. Ingress: `tenant-alpha.clawql.app` → namespace services.
17. Smoke: 10 docs — OCR, redaction, Onyx search, Coneshare link.

### Onboarding checklist

- **Technical:** pipeline smoke passed; LGTM+ scoped to namespace; Stripe active; Coneshare → customer Slack.
- **Customer-facing:** Nextcloud creds; Grafana read-only URL; status page; email support SLA.

### Phase 2 unit economics

| Item                       | Value                                           |
| -------------------------- | ----------------------------------------------- |
| Bootstrap burn (Qwen only) | ~$860–$1,000/mo — no Ornith until 5+ customers  |
| Customer #1 revenue        | $599/mo Dedicated                               |
| Break-even                 | Month 1 with single Dedicated (Qwen-only fleet) |
| Gross margin at 1D+4S      | ~53% with Qwen-only; Ornith deferred            |

Do **not** discount Dedicated to close #1 — $599 anchors Shared math. Offer 30–60 day pilots instead.

---

## Phase 3 — 1 → N customers (shared tenancy engine)

**Goal:** shared tenancy that compounds margins; migrate K3s bootstrap → EKS + Karpenter.

### Shared workers vs per-tenant state

| Tier                                                      | Tenant density impact                                                                                 |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Shared, stateless workers (Tika, Gotenberg, Stirling-PDF) | Zero per-tenant cost. Rate-limited queue enforces fairness. Scales with throughput, not tenant count. |
| Shared, tenant-scoped state (Elasticsearch, Postgres)     | Near-zero marginal cost. One cluster; index/schema per tenant.                                        |
| Strictly per-tenant (Onyx, Nextcloud)                     | Real constraint — ~4 GB Onyx + ~2 GB Nextcloud ≈ **~6 GB reserved memory per tenant**.                |

Marginal cost of tenant #7 is reserved-pool memory for Onyx + Nextcloud, not a free worker slot. Processing scales on the spot pool.

### Migrating to EKS + Karpenter

| Pool                         | What runs                                                       | Why                    |
| ---------------------------- | --------------------------------------------------------------- | ---------------------- |
| Reserved (on-demand r7i)     | ES, per-tenant Onyx/Nextcloud, Postgres, ClawQL core, Coneshare | Stateful / always-on   |
| Spot (mixed c7i/m7i/r7i/c6i) | Tika, Gotenberg, Stirling, Flink, Argo Workflow pods            | Bursty, retry-friendly |

Spot equivalent of r7i.2xlarge capacity ≈ $115–150/mo vs $386 on-demand. Argo Workflows retries handle interruptions.

### Corrected shared tenancy economics

| Scenario                   | Revenue/mo | Infra/mo       | Gross margin                        |
| -------------------------- | ---------- | -------------- | ----------------------------------- |
| Baseline shared infra only | $0         | ~$180 reserved | —                                   |
| + 1 Dedicated              | $599       | ~$280          | 53%                                 |
| + 1 Dedicated + 6 Shared   | $1,493     | ~$340          | 77%                                 |
| + 1 Dedicated + 10 Shared  | $2,089     | ~$410          | 80%                                 |
| + 1 Dedicated + 15 Shared  | $2,834     | ~$510          | 82%                                 |
| Scale: 2nd reserved node   | —          | +~$280/mo step | Margin dips, recovers as node fills |

Density on one reserved node ≈ **15–20 shared tenants** (Onyx+Nextcloud memory), not the original 4–6 estimate.

### Tenant isolation at scale

- **Elasticsearch:** index-level ACL — credentials only query `tenant-a-*`.
- **Postgres:** schema-per-tenant + RLS; queries always scope `tenant_id`.
- **Processing workers:** stateless — no held state between tenants.
- **Istio AuthorizationPolicy:** default-deny; explicit allow within tenant namespace only.

### Noisy neighbor (ClawQL-specific)

| Vector                          | Solution                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| Gotenberg / Chromium CPU        | Per-tenant conversion queue `max-concurrency=2` in Argo; Karpenter scales spot with cap. |
| Stirling-PDF OCR on large PDFs  | Step timeout 120s; chunked DAG steps.                                                    |
| Onyx re-index after bulk upload | Flink jobs scoped to tenant's own Onyx instance.                                         |
| ES heap under concurrent query  | JVM heap 50% of reserved allocation; index circuit breakers; Grafana per-tenant load.    |
| Spot pool exhaustion            | On-demand burst NodePool fallback.                                                       |

### Scaling reserved-pool capacity

18. Alert reserved memory at 75%; plan at 80%.
19. Karpenter provisions additional reserved capacity when Onyx/Nextcloud pods pending (auto or manually approved at small scale).
20. New tenant instances bin-pack onto new node; existing stateful pods undisturbed.
21. Spot pool auto-scales from pending Argo pods.

### Upsell: Shared → Dedicated

| Trigger                               | Action                                                           |
| ------------------------------------- | ---------------------------------------------------------------- |
| Hitting document quota                | Proactive upgrade email (e.g. toward higher volume / Dedicated). |
| Complex cross-document Onyx workflows | Demo Dedicated full allocation + priority Argo queue.            |
| Data residency / EU                   | Enterprise entry — second EKS region, Argo CD dual-cluster.      |
| High-volume Coneshare shares          | Analytics review → enhanced watermarking / Business features.    |

---

## LLM fleet and inference strategy

Sovereign multi-model fleet; no external LLM API calls on Dedicated+ sovereign path. Fine-tune only where reliability gains are clear.

| Model / role                                        | GTM relevance                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Qwen3.6-27B** (fine-tuned) — core document worker | Primary for document processing, PII redaction, Onyx, archive, Coneshare. Fine-tuned on Langfuse tool traces. Sovereignty claim rests here (shared L4). |
| **Ornith 1.0 35B MoE** — coding specialist (as-is)  | MIT; DeepReinforce; June 25, 2026. No fine-tune — scaffold behavior is the value. Prefer LangGraph.                                                     |
| **Phi-4 14B** (lightly fine-tuned) — utility        | Metadata, vault indexing, summarization, Onyx pre-process. Offloads Qwen.                                                                               |
| **Gemma 4 31B** — diversity only                    | Hermes MoA fan-out when NSV drops; no fine-tune investment.                                                                                             |

Independent validation: NousResearch Hermes MoA (June 19, 2026) showed ensemble gains vs single frontier models. ClawQL Agent Coordination is **drift-triggered** (NSV/SGDOP; ensemble when `combined_drift` > 0.3), not always-on — cost-appropriate.

### No dedicated orchestrator (cost)

Original DAOS included Mistral Devstral 2 (123B, ~240 GB VRAM, $3k–5k/mo GPU). Removed until Enterprise revenue amortizes it. Gateway policy + Ouroboros DAG + Argo Workflows orchestrate at near-zero marginal cost; fine-tuned Qwen fills the gap.

### Revised infra cost with GPU fleet

| Component                     | Cost/mo           | Notes                       |
| ----------------------------- | ----------------- | --------------------------- |
| EKS reserved pool             | ~$560–700         | r7i; scales with tenants    |
| Spot processing pool          | ~$50–150          | Near-zero between workloads |
| Qwen3.6-27B (L4 g6.xlarge SP) | ~$360             | Shared across tenants       |
| Ornith 35B MoE (L40S g6e SP)  | ~$763             | coding-specialist only      |
| Phi-4 14B                     | $0–360            | $0 if co-located            |
| Cloudflare R2 + EKS CP        | ~$88–123          | R2 + $73 EKS                |
| **Total (separate Phi-4)**    | **~$1,821–2,096** | Full fleet                  |
| **Total (co-located Phi-4)**  | **~$1,461–1,736** | Preferred if VRAM allows    |

Ornith is the largest single line item but low invocation frequency early — consider spot after 30 days of Langfuse measurement.

### Fine-tuning flywheel

Production calls → WORM call store (`operation`, `document_type`, `model`, `tier`, `cost`, `verdict`, `verdict_source`). Passed → training candidates; failed + human correction → supervised examples; cache hits excluded.

```bash
clawql inference export --verdict passed --scrub-pii presidio --format openai-jsonl
clawql inference finetune register --tier frugal
```

Every export writes a TrainingLineage WORM manifest. No manifest → no production registration. After Unsloth QLoRA on RTX 5090, merged NVFP4 registers as Frugal in `tier-map.json`; PAL routes automatically.

**Substrate prep (mandatory order):** refusal ablation → desperation-direction ablation → custom policy via LoRA + PorTAL. Policy last = dominant behavioral control.

### Break-even with full GPU fleet

| Scenario                            | Revenue/mo        | Infra/mo      | Gross margin                   |
| ----------------------------------- | ----------------- | ------------- | ------------------------------ |
| 1 Dedicated + 0 Shared (full fleet) | $599              | ~$1,500–1,736 | Negative — fleet not justified |
| 1 Dedicated + 5 Shared              | $1,344            | ~$1,500–1,736 | Breakeven zone                 |
| 1 Dedicated + 10 Shared             | $2,089            | ~$1,600–1,800 | ~15–23%                        |
| 1 Dedicated + 20 Shared             | $3,579            | ~$1,800–2,000 | ~45–50%                        |
| 3 Dedicated + 20 Shared             | $5,577            | ~$1,900–2,100 | ~62–66%                        |
| Ornith on spot (low usage)          | Save ~$450–600/mo | —             | +~8–15% margins                |

**Bootstrap recommendation:** defer Ornith until 5+ paying customers; route coding to Qwen via fallback. Launch burn ~$860–1,000/mo (no Ornith).

### Staged GPU deployment

| Stage                     | GPU fleet                                                                   |
| ------------------------- | --------------------------------------------------------------------------- |
| Bootstrap (0–1)           | Qwen3.6-27B on L4 only; coding via fallback. ~$860–1,000/mo.                |
| Early scale (2–5)         | Add Phi-4 (co-locate if possible). Measure Ornith demand. ~$1,000–1,400/mo. |
| Growth (5+)               | Ornith on L40S if justified, else spot burst. ~$1,500–1,800/mo.             |
| Scale (10+, 3+ Dedicated) | Evaluate Qwen3.6-35B-A3B MoE; margins → 60–66%.                             |

---

## Pricing model

Two axes: hosting model (self-hosted / shared / dedicated) and **plugin bundle** activation. MCP+memory customers pay far less than full IDP+GPU customers.

Live page: [clawql.com/pricing](https://clawql.com/pricing). This section is strategic rationale and unit economics.

### Plugin bundles

| Bundle                                 | What activates                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Core** (all tiers)                   | MCP gateway, memory vault, Obsidian-backed memory, Onyx, LGTM+ scoping, audit, cache.                                                                              |
| **IDP** (Shared+)                      | Tika, Gotenberg, Stirling-PDF; Nextcloud + Postgres archive; `run_idp_pipeline`, `classify_document`, `extract_document`.                                          |
| **VDR** (Shared+)                      | Coneshare — links, expiry, password, email verify, page analytics, watermarking, file requests, webhooks.                                                          |
| **Sovereign AI** (Dedicated+)          | Fine-tuned Qwen via vLLM in tenant boundary; Istio egress block; Presidio; weight integrity at startup.                                                            |
| **Sovereign Security Pack** (+$200/mo) | Kata VM isolation, weight integrity, WORM Merkle + Cosign Git, Panguard ATR fail-closed, YubiKey-signed infra, Presidio pre-log redaction, monthly posture report. |

### Tier structure

| Tier        | Price                 | Hosting                | Primary use case                                                             |
| ----------- | --------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| Self-hosted | $0                    | Customer hardware      | Full features, no license fee; self-managed bundles.                         |
| Developer   | $29/mo                | Cloudflare             | MCP + memory; unlimited executions. Launch before broad developer marketing. |
| Teams       | $99/mo                | Cloudflare             | Same core for ~5 users; still no IDP/GPU.                                    |
| Shared      | $299/mo ($250 annual) | Multi-tenant managed   | Hosted MCP + vault + IDP; shared compute.                                    |
| Dedicated   | $599/mo ($500 annual) | Single-tenant          | Compliance isolation; Sovereign AI; SSO/RBAC.                                |
| Enterprise  | From $3,500/mo        | Dedicated + custom SLA | HITL, multi-region, vertical adapters, on-call.                              |

> Live pricing may show Self-hosted / Shared / Dedicated first. Developer/Teams ($29–99) should ship before broad developer marketing. **Unlimited executions on every tier** — no caps, no overage, no meter. Self-hosted remains the permanent zero-cost path.

### Tier feature matrix (summary)

| Feature             | Self-hosted    | Shared $299 | Dedicated $599     |
| ------------------- | -------------- | ----------- | ------------------ |
| MCP gateway         | ✓              | ✓           | ✓                  |
| Hosted HTTP MCP     | Self-managed   | ✓           | ✓                  |
| Agent memory vault  | Self-managed   | ✓           | ✓                  |
| Onyx                | Self-managed   | ✓           | ✓                  |
| IDP pipeline        | Self-managed   | ✓ managed   | ✓ managed          |
| Coneshare VDR       | Self-managed   | ✓ managed   | ✓ managed          |
| Sovereign LLM       | BYO            | ✗           | ✓                  |
| Isolation           | N/A            | Shared      | Full single-tenant |
| SSO / RBAC          | Self-managed   | ✗           | ✓                  |
| Merkle audit        | ✓              | ✓           | ✓                  |
| Support             | Community      | Email       | Priority email     |
| Security Pack       | Self-implement | +$200       | +$200              |
| HITL (Label Studio) | Self-managed   | ✗           | Enterprise only    |

### Sovereign Security Pack ($200/mo)

| Control                         | Business meaning                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Desperation direction ablation  | Removes reward-hacking direction under failure pressure; models resign gracefully. Unique to open-weight sovereign fleet. |
| Kata Container VM isolation     | Hardware VM boundaries for agent workloads.                                                                               |
| Model weight integrity          | SHA-256 + Cosign at container startup.                                                                                    |
| WORM Merkle audit logs          | Tamper-evident roots + Cosign-signed Git commits.                                                                         |
| Panguard ATR fail-closed        | Unreachable trust boundary → all tool calls fail.                                                                         |
| YubiKey-signed infrastructure   | Hardware-backed Git signatures for Helm changes.                                                                          |
| Presidio pre-log redaction      | Structural Fluent Bit stage — not per-service config.                                                                     |
| Monthly security posture report | Scans, Merkle verification, Panguard violations, NSV/SGDOP anomalies.                                                     |

### Competitive pricing benchmark

| Capability vs competitor                | Cost comparison                                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP vs executor.sh                      | executor.sh Team $150/mo + 250k cap + $0.20/1k overage. ClawQL Developer $29/mo unlimited + memory + eight efficiency layers + security depth. |
| IDP vs Hyperscience / ABBYY             | Hyperscience $0.50–1.50/page → tens of thousands/mo at volume. ABBYY $40k–$100k/yr. ClawQL Dedicated + IDP $599/mo flat.                       |
| VDR vs Intralinks / Datasite / Ansarada | Intralinks $10k–$200k+/yr + per-page. Ansarada ~$3,069/mo for 5 GB. ClawQL Shared includes Coneshare at $299/mo.                               |
| Semantic search                         | Algolia/Coveo/Glean $500–2,000/mo. Onyx included in managed tiers.                                                                             |
| Full replacement stack                  | executor.sh + ABBYY + Intralinks + Glean ≈ $8k–15k+/mo. ClawQL Dedicated + Security Pack $799/mo.                                              |

### Pricing validation checklist

- Review pricing quarterly against infra and fine-tune adapters.
- Launch Developer/Teams before broad developer marketing.
- Track Shared→Dedicated upgrades (isolation, compliance, Sovereign AI signals).
- Track Security Pack attach rate.
- Track IDP vs pure-MCP usage on Shared; consider Shared-Core if IDP unused.
- NRR target > 100% via pack attaches, upgrades, vertical adapters.

---

## Product-led growth

Complex product → PLG for Starter/Business (and Developer/Teams); founder-led for Dedicated/Enterprise.

### No free hosted tier

| Entry path                             | Who                                                                   |
| -------------------------------------- | --------------------------------------------------------------------- |
| 14-day free trial (no CC)              | Default hosted entry — full Developer experience.                     |
| Self-hosted (Apache 2.0, free forever) | Zero cost + full control; feeder into hosted when ops overhead bites. |

A permanent free hosted tier attracts non-payers and burns support. If $29/mo fails after a full trial, a free tier will not convert them either.

### Interactive demo (top of funnel)

22. Land on clawql.app — headline: AI-orchestrated document processing; self-hosted or managed; no SaaS data exposure.
23. "Try with your document" — PDF/DOCX/image; no signup.
24. pdf-inspector → Docling → Stirling-PDF; show Markdown, metadata, stages live.
25. Onyx-style semantic preview.
26. Sample Coneshare link + engagement analytics.
27. "Start Your Free Trial" CTA — 14 days Developer; no CC.

Demo runs in sandboxed namespace with 5-minute TTL; documents deleted after session — state clearly for compliance-conscious prospects.

### Content / SEO pillars

| Search category                 | Content angle                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------- |
| Self-hosted document management | Paperless-ngx alternatives, self-hosted DMS, open-source document processing. |
| VDR alternatives                | DocSend/Intralinks alternatives; VDR without per-deal pricing.                |
| AI document processing          | Invoice processing, PII redaction, LLM document pipeline self-hosted.         |
| MCP / agent tooling             | MCP document tools, Claude document processing, agent document pipeline.      |

---

## Competitive intelligence

ClawQL competes across four markets. Each needs a different conversation.

### Market 1: MCP gateway — executor.sh

Closest direct competitor to the MCP gateway layer. YC-backed, MIT, well-built for **one** thing. ClawQL does eight.

Benchmark evidence (frugal DeepSeek; graders require real `tool:clawql_*` evidence): search-first-discovery, vault memory under token pressure, audit trail, Panguard policy-deny — on **1.0** vs off **0.0**. Ledger: [`docs/benchmarks/openbench-results-ledger.md`](../benchmarks/openbench-results-ledger.md). Runs: `30872913516`, `30872437811`.

| Dimension                               | Comparison                                                                                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token efficiency                        | executor.sh = Layer 1 only. ClawQL Layers 1–8 compound.                                                                                                                                   |
| Measured reduction                      | Layer 1 alone ~99.8% input reduction (Avian/GCP/Jira/Cloudflare patterns). Layers 2–8 cut output, prose, cache, history, routing cost.                                                    |
| Agent memory                            | executor.sh: none. ClawQL: vault + Obsidian + semantic recall.                                                                                                                            |
| Semantic search                         | executor.sh: none. ClawQL: Onyx 40+ connectors.                                                                                                                                           |
| Security                                | executor.sh: host-side secrets + tool allow/block + basic audit. ClawQL adds Kata, weight integrity, WORM Merkle, Panguard fail-closed, YubiKey infra, Presidio pre-log, posture reports. |
| IDP / VDR / sovereign LLM / multi-model | executor.sh: none. ClawQL: full stack.                                                                                                                                                    |
| Pricing                                 | executor.sh $150/mo metered. ClawQL Developer $29 unlimited.                                                                                                                              |
| Adoption                                | executor.sh 2.6k+ stars / YC — only current lead; time + architecture education.                                                                                                          |

**Positioning line:** executor.sh is a stateless tool router. ClawQL is a stateful agent operating system.

### Market 1b: LiteLLM — March 2026 migration

LiteLLM (~40k stars, YC) is a larger inference-proxy competitor. March 2026 supply-chain compromise (malicious dependency → credential harvesting) is a concrete migration trigger. June–July 2026: undisclosed provider-side activation interventions (Claude Fable 5 ML-query degradation; Claude Code steganographic timezone signals) require provider-controlled serving — eliminated by ClawQL sovereign LLM on Dedicated/Enterprise.

**ClawQL trust model:** TypeScript-native; CycloneDX SBOM; Cosign images; Layer 0 Arweave-anchored release manifest; `clawql doctor --smoke` verifies binary hash at startup.

**Beyond routing:** WORM call store → fine-tune flywheel; Layer 5 semantic cache (embedding similarity); outcome-driven escalation; payment rails (x402, MPP, Stripe). Honest gap: LiteLLM still leads on raw provider breadth.

### Market 2: IDP vendors

IDP and API integration are sold as separate categories. Invoice extraction ≠ invoice automation. ABBYY, Hyperscience, Rossum, Kofax stop at extraction/handoff. ClawQL closes the loop (validate against live APIs + evidence chain).

| Competitor                  | Notes                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hyperscience                | FedRAMP High, gov focus, $0.50–1.50/page, long PS. Win: hours vs months, flat price, full pipeline. Gap: degraded scans / handwriting at extreme volume. |
| ABBYY Vantage               | 150+ skills, languages, ~$40–100k/yr + PS. Win: flat price, VDR, sovereignty, memory. Gap: pre-trained skill library depth.                              |
| AWS Textract / Google DocAI | Cheap per page, no sovereignty/VDR/orchestration. Answer: Textract extracts; ClawQL orchestrates the platform.                                           |
| Tungsten (Kofax)            | FedRAMP High ATO Mar 2026. Federal buyers need FedRAMP — factual boundary until ClawQL certifies.                                                        |

### Market 3: VDR vendors

Per-page VDR meters indexing events. Example: residential brokerage 80 deals/quarter → ~$80k/yr indexing alone; ClawQL Shared TCO ~$21–28k with Coneshare `deal_id` + WORM `correlation_id` provenance.

| Competitor          | Notes                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Intralinks (SS&C)   | Per-page + per-user + setup; $10k–$200k+/yr. Win: Coneshare in Shared $299. Gap: 25+ years M&A relationships.      |
| Datasite (Merrill)  | $25k–$200k+ per deal; up to $720k/yr. Same win + pipeline. Gap: brand in large advisory.                           |
| Ansarada            | ~$3,069/mo for 5 GB; strong UX. Win: upstream pipeline + flat price. Gap: Coneshare UX maturity as standalone VDR. |
| DocSend / Papermark | Sharing/tracking, not full VDR. DocSend graduates are natural targets.                                             |

### Market 4: Vertical industries

#### Real estate (Command + Google Drive)

| Pain                             | ClawQL solution                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| Command CRM ↔ Drive disconnected | MCP to both; Onyx indexes Drive; grounded answers cross-referenced to deal contacts. |
| No persistent deal memory        | `memory_ingest` / `memory_recall` across sessions and teammates.                     |
| Ad-hoc Drive links               | Coneshare: expiry, password, page analytics, watermarking.                           |
| Manual TC document processing    | IDP classify/extract for signatures, dates, routing.                                 |

Entry: Shared $299 or Teams $99 (MCP + memory + Onyx without full IDP). Most brokerages need semantic memory over existing tools more than Gotenberg.

#### Software / technology teams

Natural home for Developer/Teams. Pain: multiple AI clients, no shared memory, ungoverned tool calls.

| Pain                             | ClawQL solution                           |
| -------------------------------- | ----------------------------------------- |
| Separate tool configs per client | One MCP gateway; tools configured once.   |
| No engineering memory            | Obsidian vault across sessions.           |
| Scattered docs                   | Onyx over Notion/Confluence/Slack/GitHub. |
| Ungoverned tool calls            | Audit trail + Panguard ATR.               |

OpenBench: Panguard policy-deny and search-first-discovery 1.0 vs 0.0 (run `30872913516`). Every Dev/Teams adopter is a future Shared/Dedicated conversion when docs or compliance arrive.

### Security objections in sales

| Objection                    | Response                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Model tampering?             | SHA-256 + Cosign at startup; desperation-direction ablation before deploy.                                                               |
| Can't send docs to cloud AI? | Sovereign LLM in tenant boundary; Istio egress block; Presidio before model.                                                             |
| Audit logs altered?          | Merkle roots in WORM + Cosign Git; verification on read.                                                                                 |
| Compromised mid-processing?  | Kata VM isolation; Panguard fail-closed.                                                                                                 |
| Covert provider steering?    | No closed-model provider on Dedicated/Enterprise sovereign path.                                                                         |
| vs executor.sh security?     | Kata, WORM Merkle, Panguard, YubiKey, Presidio, posture reports — [defense-in-depth](https://docs.clawql.com/security/defense-in-depth). |
| SOC 2 / FedRAMP?             | Controls present; audit in progress. Typical 12–18 months post-controls.                                                                 |

### Competitor comparison one-pager

| Capability               | ClawQL vs the field                                                    |
| ------------------------ | ---------------------------------------------------------------------- |
| Persistent agent memory  | Built-in vault; no adjacent competitor has cross-session agent memory. |
| MCP gateway + efficiency | Eight compounding layers + memory + Onyx vs executor.sh Layer 1 only.  |
| Full IDP pipeline        | Tika → Gotenberg → Stirling → archive → Onyx, one Helm chart.          |
| Cryptographic audit      | WORM Merkle + Cosign; others have logs.                                |
| Sovereign LLM            | Fine-tuned Qwen + egress block + Presidio + weight integrity — unique. |
| VDR                      | Coneshare from Shared; no per-deal fees.                               |
| Defense-in-depth         | Public architecture docs; model-substrate threat model.                |
| Pricing                  | Flat subscription; no per-page / per-deal / execution meters.          |

---

## Benchmark service (managed eval + fine-tune)

Three deliverables from one engagement: scored report, labeled training dataset with provenance, optional PorTAL adapter registered in customer `tier-map.json`.

Scale AI labels; Confident AI evals; Unsloth trains. Nobody runs the full loop as one managed engagement. Gateway unlock: `clawql-inference` already writes WORM traces — benchmarks, export, PorTAL, PAL registration reuse that chokepoint.

| Tier                        | Price             | Deliverable                                                                                           |
| --------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| Tier 1: Benchmark report    | $2,000–5,000 flat | OpenBench suite; scored report + run IDs; no dataset.                                                 |
| Tier 2: Benchmark + dataset | $5,000–10,000     | + scrubbed JSONL + TrainingLineage; OKF v0.2 filters (`--okf-verified human --okf-status current`).   |
| Tier 3: Full loop           | $10,000–20,000    | + PorTAL adapter, per-base alignment, Frugal registration. Portable task-latent across base upgrades. |

**PorTAL:** task-latent (expensive, once) + per-base alignment (cheap refit). Maintenance refit $500–1,000 — not a new full engagement.

**Scope notes:** OpenBench suite version pinned in engagement letter; Tier 1 = 3–5 days; Tier 2 = 1–2 weeks; Tier 3 = 2–4 weeks; customer must run `clawql-inference` for the engagement; optional HF publication under Apache 2.0.

Reference dataset: `openbench-traces/clawql-v1` on Hugging Face.

---

## Metrics and success benchmarks

### OpenBench A/B (current)

Claims supported by live GitHub Actions (DeepSeek frugal; hardened graders). See ledger for full table. Highlights:

- Ouroboros oscillation escape: on 1.0 / off 0.0 (78s vs 167s) — runs `30863572642`, `30866904277`, `30872913519`
- Vault memory under token pressure: 1.0 / 0.0 — `30872437811`
- Memory-dependent continuation: 1.0 / 0.333 — `30872913516`
- Search-first, execute-verify, audit, Panguard, cache handoff, schedule dry-run, pageindex, hybrid recall, external ingest, codegraph-guided edit: on 1.0 / off 0.0 (various runs)

Most cells are n=1; confidence rises with more trials.

### Infrastructure health (weekly)

| Metric                 | Target / alert                  |
| ---------------------- | ------------------------------- |
| Node memory            | Alert 75%; plan 80%; never 90%. |
| Elasticsearch heap     | Alert 70%; scale 85%.           |
| Gotenberg queue depth  | Alert if >50 for >5 minutes.    |
| Onyx index lag (Flink) | Alert if >60s.                  |
| R2 growth              | Track weekly per tenant.        |
| Pipeline error rate    | Alert if >1% docs fail.         |

### Business metrics (monthly)

| Metric                     | Target                                                        |
| -------------------------- | ------------------------------------------------------------- |
| MRR                        | Absolute + MoM %                                              |
| Gross margin               | ≥60% steady state; <50% = pricing or efficiency problem       |
| NRR                        | >100%                                                         |
| Free-to-paid               | >8% (industry median 3–5%)                                    |
| Time to first value        | <10 minutes to first `memory_ingest` + `memory_recall`        |
| Support tickets / customer | Rising ratio → onboarding/docs gaps                           |
| LTV/CAC                    | >3:1 (e.g. Shared $299 × 12 ≈ $3,588 LTV → CAC under ~$1,196) |

**RPE:** ~$130k revenue/employee is capital-efficiency benchmark for small teams; at early Shared MRR, prioritize learning over RPE until first hire.

---

## Development environment: N5 Pro NAS + Cloudflare

NAS (TrueNAS Scale) = **dev only** for AWS-side IDP. Cloudflare work uses Wrangler on a laptop. NAS is never production for any tier.

| Parameter        | Recommendation                                  |
| ---------------- | ----------------------------------------------- |
| ZFS ARC cap      | `vfs.zfs.arc.max = 20 GB`                       |
| VM RAM           | 60 GB (leave ~16 GB host + ARC)                 |
| VM vCPUs         | 6 of 12 physical                                |
| VM OS            | Ubuntu 24.04 LTS (parity with AWS)              |
| K3s / Helm       | Identical to production feature flags           |
| Document storage | Local NFS or MinIO in dev; R2 endpoint for prod |
| Paperless-ngx    | Optional **dev-only** compatibility tests       |

### Workflow

**Cloudflare (Developer/Teams):**

28. `npm install -g wrangler`; authenticate.
29. `wrangler dev` for routing Worker, MCP, vault ops (local R2/KV/D1 emulation).
30. Staging Worker `gateway-staging.clawql.app` before production.
31. No NAS required.

**NAS VM (IDP):**

32. Validate Helm on 60 GB / 6 vCPU; 30-day soak with synthetic docs.
33. First IDP customer → `r7i.2xlarge` 1yr RI ($280/mo); avoid on-demand for prod.
34. R2 credentials on K3s (same bucket, IDP prefix).
35. Deploy Helm; smoke; update routing Worker proxy.
36. Keep NAS warm 30 days post-launch; then CI/CD or load-test.

---

## Critical GTM checklist

### Phase 1 exit — Cloudflare (launch first)

- [ ] Routing Worker on `gateway.clawql.app` (auth, lookup, native, IDP stub)
- [ ] R2 per-tenant prefix; ingest/recall E2E
- [ ] D1 audit with `tenant_id` + `correlation_id`
- [ ] KV semantic cache write/hit path
- [ ] Stripe webhooks → D1 tenant creation
- [ ] Unlimited executions (no Worker-side execution meter)
- [ ] Status page live; X/Twitter handle in footer fixed

### Phase 1 exit — AWS (on first IDP customer)

- [ ] Full pipeline smoke (pdf-inspector → … → Coneshare)
- [ ] LGTM+ dashboards live
- [ ] Istio mTLS between services
- [ ] Routing Worker proxies IDP tenants to K3s ingress
- [ ] R2 IDP prefix isolated from Dev/Teams
- [ ] Per-tenant Onyx; no search bleed
- [ ] ResourceQuotas on all namespaces

### Phase 2 exit — before first paid customer

- [ ] Developer tier + 14-day trial (no CC) via Stripe trial API
- [ ] Pricing page: unlimited executions; no free hosted tier; self-hosted as zero-cost path; Dev/Teams visible
- [ ] Interactive demo (sandboxed Worker; no signup)
- [ ] Provisioning runbooks (CF + AWS)
- [ ] Support SLA (email)
- [ ] Contract + DPA reviewed
- [ ] Teams→Shared upgrade path tested; R2 vault continuity confirmed

### Phase 3 entry — before shared tenants

- [ ] ≥5 Dev/Teams customers active 30+ days; Langfuse traces accumulating
- [ ] First IDP customer live 30 days without pipeline incident
- [ ] EKS + Karpenter NodePools (reserved + spot) tested
- [ ] Istio Ambient + AuthorizationPolicies
- [ ] Argo CD / Workflows / Events (R2 upload triggers)
- [ ] Per-tenant processing queues + stage concurrency; Docling/LangExtract separate from Gotenberg
- [ ] Stage timeouts: Stirling 120s, Docling 180s, LangExtract 60s/chunk
- [ ] Reserved-pool memory baseline known
- [ ] Tenant offboarding runbook (namespace, Onyx, Nextcloud, R2, ES index, PG schema)
- [ ] Pricing reviewed: Shared **$299/mo** viable at 15–20 tenants per reserved node

---

## Risk register

| Risk                                      | Likelihood | Impact  | Mitigation                                                                         |
| ----------------------------------------- | ---------- | ------- | ---------------------------------------------------------------------------------- |
| OOM from ES + per-tenant Onyx growth      | Medium     | High    | Quotas, heap caps, Onyx limits, 75% alert, Karpenter reserved growth               |
| Spot capacity shortage                    | Low–Med    | Medium  | On-demand burst NodePool; diversify families                                       |
| Gotenberg CPU saturation                  | Medium     | Medium  | Per-tenant concurrency=2; spot scale with cap                                      |
| Nextcloud AGPL scrutiny                   | Low–Med    | Medium  | Network/API access pattern; legal memo ready                                       |
| R2 Class A at high ingest                 | Low        | Low–Med | $4.50/M writes — model at 1M+/mo                                                   |
| EKS+Karpenter+Istio+Argo complexity       | Medium     | Medium  | Migrate only after Phase 2 revenue; GitOps for day-2                               |
| Fine-tune quality regression              | Low–Med    | Medium  | Argo Rollouts 10% canary; Langfuse quality gates; auto rollback                    |
| Insufficient Langfuse for training        | Medium     | Low     | 100–200 synthetic traces in dev; replace with real in 1–2 months                   |
| GPU spot interrupt on vLLM                | Low–Med    | Medium  | Savings Plan for prod inference; spot for training/dev                             |
| Competitor ships MCP-native IDP           | Low        | High    | Moat = full stack (VDR + Merkle + Onyx + fine-tune)                                |
| First customer churns before Shared built | Low–Med    | High    | 6-month Dedicated minimum; 10% annual prepay discount                              |
| TrueNAS instability                       | Medium     | Low     | NAS = IDP dev only; CF on laptop                                                   |
| Workers cold start                        | Low        | Low     | Paid plan (zero cold start)                                                        |
| D1 limits at high tenant count            | Low        | Medium  | Evaluate Hyperdrive→Postgres past ~500 tenants                                     |
| R2 misconfig cross-tenant vault           | Low        | High    | Prefix policy at Worker; no unscoping presigned URLs; isolation tests every deploy |

---

## Document control

|                 |                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------- |
| Status          | Canonical internal GTM playbook                                                              |
| Companion       | [`docs/vision/clawql-idp-gtm.md`](../vision/clawql-idp-gtm.md) (IDP landing/narrative brief) |
| Platform        | [`docs/vision/clawql-idp-platform.md`](../vision/clawql-idp-platform.md)                     |
| Confidentiality | Internal — June 2026                                                                         |
