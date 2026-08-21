# Docs Index

This directory is organized by purpose so operational guides, product docs, and long-form materials are easier to find.

## How to use this library

| Doc type                   | Examples                                                                                                                                                 | Status language                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Ground truth**           | [modularization-implementation-status.md](design/modularization-implementation-status.md), CHANGELOG, RELEASE_NOTES                                      | ✅ / 🚧 / 📋 only                    |
| **Getting started**        | [docs.clawql.com/getting-started](https://docs.clawql.com/getting-started), [getting-started-for-teams.md](getting-started/getting-started-for-teams.md) | What to run today                    |
| **Public roadmap**         | [clawql-vision-roadmap.md](vision/clawql-vision-roadmap.md)                                                                                              | Phases + honest table                |
| **Reference architecture** | [clawql-modularization-v2.md](vision/clawql-modularization-v2.md), [operator-target-architecture.md](design/operator-target-architecture.md)             | 📋 target; inline 🚧 where partial   |
| **Historical**             | [clawql-modularization.md](vision/clawql-modularization.md) (v1.9)                                                                                       | Fixed date — not for delivery claims |

## Core Product Docs

- **ClawQL Vision & Roadmap** (**start here** — public edition, honest shipped vs planned status, phased delivery): [`vision/clawql-vision-roadmap.md`](vision/clawql-vision-roadmap.md) — [`/vision/roadmap`](https://docs.clawql.com/vision/roadmap)
- **ClawQL Master enablement guide** (v2.1 — historical unified index; public hub is Architecture): [`vision/clawql-master-enablement-guide.md`](vision/clawql-master-enablement-guide.md) — redirects to [`/architecture`](https://docs.clawql.com/architecture)
- **ClawQL Modularization v2.1** (package boundaries companion; public hub is Architecture): [`vision/clawql-modularization-v2.md`](vision/clawql-modularization-v2.md) — redirects to [`/architecture`](https://docs.clawql.com/architecture)
- **ClawQL IDP Platform** (July 2026 — eight-vendor pipeline, umbrella Helm, observability, OpenClaw runbooks): [`vision/clawql-idp-platform.md`](vision/clawql-idp-platform.md) — [`/vision/idp-platform`](https://docs.clawql.com/vision/idp-platform)
- **ClawQL IDP GTM** (standalone IDP motion — market, positioning, landing brief, sales tables): [`vision/clawql-idp-gtm.md`](vision/clawql-idp-gtm.md) — [`clawql.com/idp/gtm`](https://clawql.com/idp/gtm)
- **ClawQL GTM playbook** (zero → shared tenancy — Cloudflare→AWS hybrid, phases, unit economics, GPU staging, risk register): [`gtm/clawql-gtm-playbook.md`](gtm/clawql-gtm-playbook.md)
- **Immutable releases — hybrid decentralized GitHub alternative** (Layer 0: `clawql-release`, Arweave, Radicle, Rift, release manifest): [`vision/clawql-hybrid-decentralized-github-alternative.md`](vision/clawql-hybrid-decentralized-github-alternative.md) — [`/vision/immutable-releases`](https://docs.clawql.com/vision/immutable-releases)

## Contributing

- **Contributor Technical Specification** (Plugin contracts, Effect-TS patterns, architecture rules, vertical/provider guides, CI): [`contributing/clawql-contributor-technical-specification.md`](contributing/clawql-contributor-technical-specification.md) — [`/contributing/technical-specification`](https://docs.clawql.com/contributing/technical-specification)

## Architecture

- **Zero-Trust Agentic Fabric** (Agentic Gateway · Regional Hubs · Dedicated Virtual Gateways · Edge swarm): [`architecture/zero-trust-agentic-fabric.md`](architecture/zero-trust-agentic-fabric.md) — [`/architecture/agentic-fabric`](https://docs.clawql.com/architecture/agentic-fabric)
- **Enterprise Ontology** (open versioned schema · OKF · kinetic `@kinetic` · Git vs R2): [`architecture/enterprise-ontology.md`](architecture/enterprise-ontology.md) — [`/architecture/enterprise-ontology`](https://docs.clawql.com/architecture/enterprise-ontology) — [ADR 0009](adr/0009-enterprise-ontology.md) — CLI: [`ontology/cli.md`](ontology/cli.md) (`clawql ontology lint` / `generate`) — **essay (B-7 proof):** [Memory Finds. Ontology Decides.](https://pragmaticvectors.com/posts/memory-finds-ontology-decides/) · draft [`gtm/pragmaticvectors/memory-finds-ontology-decides.md`](gtm/pragmaticvectors/memory-finds-ontology-decides.md) — **memory_recall structured filters:** [`specs/memory/memory-recall-structured-filter-v0.1.md`](specs/memory/memory-recall-structured-filter-v0.1.md) · [site](https://docs.clawql.com/specs/memory/memory-recall-structured-filter) — **legal domain pack:** [`specs/ontology/legal-domain-v0.1.md`](specs/ontology/legal-domain-v0.1.md) · [site](https://docs.clawql.com/specs/ontology/legal-domain) — **essay gap closure:** [`ontology/essay-gap-closure.md`](ontology/essay-gap-closure.md) — **`.cq*` extensions:** [ADR 0010](adr/0010-cq-file-extensions.md) · [`specs/cq-extensions/`](specs/cq-extensions/) — **Command Deck builder UX:** [`architecture/command-deck-ontology-builder-ux.md`](architecture/command-deck-ontology-builder-ux.md)
- **Token efficiency — twelve compounding layers** (Code Mode through fine-tuning flywheel): [`architecture/clawql-token-efficiency.md`](architecture/clawql-token-efficiency.md) — [`/architecture/token-efficiency`](https://docs.clawql.com/architecture/token-efficiency) — pairs with Ontology (Tier‑1 enabler) and [OKF decision rationale](memory/okf-decision-rationale.md)
- **Modularization implementation status** (ground truth — packages, shims, MCP flow, Effect/plugin status, July 2026): [`design/modularization-implementation-status.md`](design/modularization-implementation-status.md)
- **Shipped 7.0 capabilities** — auth, PageIndex, Presidio, Tier 1 Compose: [Getting started](https://docs.clawql.com/getting-started) · [MCP clients](https://docs.clawql.com/mcp-clients)
- **ClawQL plugin model** (memory/documents/automation as plugins, MCP tools, third-party extensions): [`design/clawql-plugin-model.md`](design/clawql-plugin-model.md) — [`/plugins`](https://docs.clawql.com/plugins)
- **Operator target architecture** (full operator roadmap — NL ops, verticals): [`design/operator-target-architecture.md`](design/operator-target-architecture.md)
- **Plugin registry** (shipped vs planned plugins, MCP tool ownership, enable flags): [`reference/clawql-plugin-registry.md`](reference/clawql-plugin-registry.md) — [`/plugins`](https://docs.clawql.com/plugins)
- **Plugins hub** (one page per plugin — core, memory, documents, bundled providers, …): [`plugins/README.md`](plugins/README.md) — [`/plugins`](https://docs.clawql.com/plugins)
- **Effect-TS + plugin rearchitecture plan** (Layer composition, plugin checklist): [`design/effect-ts-modularization-rearchitecture-plan.md`](design/effect-ts-modularization-rearchitecture-plan.md)
- **ClawQL Modularization v1.9** (companion — **historical** package matrix, May 2026; do not use for 7.0 delivery claims): [`vision/clawql-modularization.md`](vision/clawql-modularization.md) — package delivery epic [#306](https://github.com/danielsmithdevelopment/ClawQL/issues/306)
- ClawQL ecosystem (vision deck — core loop, hybrid memory, pipeline, Onyx, Ouroboros, infra, roadmap): [`clawql-ecosystem.md`](clawql-ecosystem.md)
- Feature tiers (always on / default-on opt-out / default-off opt-in): `readme/configuration.md` § **Feature tiers** — diagram: [`readme/images/clawql-feature-tiers.png`](readme/images/clawql-feature-tiers.png)
- MCP tools and operator guides: [`mcp/mcp-tools.md`](mcp/mcp-tools.md), [`mcp/external-ingest.md`](mcp/external-ingest.md), [`mcp/cache-tool.md`](mcp/cache-tool.md), [`mcp/enterprise-mcp-tools.md`](mcp/enterprise-mcp-tools.md), [`mcp/notify-tool.md`](mcp/notify-tool.md), [`mcp/hitl-label-studio.md`](mcp/hitl-label-studio.md), [`mcp/langfuse-eval-ouroboros.md`](mcp/langfuse-eval-ouroboros.md), [`mcp/onyx-knowledge-tool.md`](mcp/onyx-knowledge-tool.md), [`mcp/schedule-synthetic-checks.md`](mcp/schedule-synthetic-checks.md)
- Memory and vault: [`memory/memory-obsidian.md`](memory/memory-obsidian.md), [`memory/okf.md`](memory/okf.md) (OKF **v0.2** trust signals — shipped), [`memory/okf-decision-rationale.md`](memory/okf-decision-rationale.md) (`type: decision` AIF-inspired template), [`memory/memory-db-schema.md`](memory/memory-db-schema.md), [`memory/memory-db-hybrid-implementation.md`](memory/memory-db-hybrid-implementation.md), [`memory/hybrid-memory-backends.md`](memory/hybrid-memory-backends.md), [`memory/vector-search-design.md`](memory/vector-search-design.md), [`memory/lifelong-guided-traversal.md`](memory/lifelong-guided-traversal.md) (P2 plan — MAPF-inspired warm-start recall); structural code graph: [`plugins/codegraph.md`](plugins/codegraph.md)
- Ouroboros library (evolutionary loop — shipped): [`ouroboros/clawql-ouroboros.md`](ouroboros/clawql-ouroboros.md)
- **ClawQL payments** (Stripe + x402 + MPP, plan entitlements, WORM audit): [`payments/clawql-payments.md`](payments/clawql-payments.md); Cloudflare Wallets prep: [`payments/cloudflare-wallets.md`](payments/cloudflare-wallets.md); accounting/tax: [`payments/accounting-and-tax.md`](payments/accounting-and-tax.md)
- **clawql-inference** (gateway, export/finetune, payments integration): [`inference/clawql-inference.md`](inference/clawql-inference.md); PorTAL flywheel intentions: [`inference/portal-flywheel.md`](inference/portal-flywheel.md); **training pipeline** (SFT/DPO/GRPO/SPIN · Harvey LAB flywheel): [`inference/clawql-inference-training-pipeline.md`](inference/clawql-inference-training-pipeline.md)
- **mcp-grpc-transport 1.0** (MCP 2026-07-28 stateless gRPC): [`packages/mcp-grpc-transport`](../packages/mcp-grpc-transport/README.md)
- **MCP API Adapter** (✅ in-repo `0.6.0` — npm **not published yet**; any MCP → OpenAPI + GraphQL + `/mcp` + gRPC + `/ws` + gen-cli; QR + `/mcp-ui` planned): docs site [`/mcp/mcp-api-adapter`](https://docs.clawql.com/mcp/mcp-api-adapter) · [`design/mcp-api-adapter.md`](design/mcp-api-adapter.md) · user guide [`mcp/mcp-api-adapter.md`](mcp/mcp-api-adapter.md) · package [`packages/mcp-api-adapter`](../packages/mcp-api-adapter/README.md) · example [`examples/mcp-api-adapter`](../examples/mcp-api-adapter/README.md) · essay [Eight surfaces, one catalog](https://pragmaticvectors.com/posts/mcp-api-adapter/) · [`/mcp-ui` draft](mcp/mcp-ui.md) (draft [`gtm/pragmaticvectors/mcp-api-adapter.md`](gtm/pragmaticvectors/mcp-api-adapter.md)) · [Protocol Fabric](gtm/protocol-fabric.md) · fabric loop [`design/protocol-fabric-loop-benchmark.md`](design/protocol-fabric-loop-benchmark.md) · smoke [`scripts/dev/smoke-mcp-api-adapter.sh`](../scripts/dev/smoke-mcp-api-adapter.sh) / [`scripts/dev/smoke-protocol-fabric-loop.sh`](../scripts/dev/smoke-protocol-fabric-loop.sh)
- **ClawQL Streams** (📋 draft — event-driven autonomous agents, WORM + NATS + DO/K8s): docs site [`/streams/clawql-streams`](https://docs.clawql.com/streams/clawql-streams) · [`streams/clawql-streams.md`](streams/clawql-streams.md) · Durable Objects runtime [`/streams/clawql-durable-objects`](https://docs.clawql.com/streams/clawql-durable-objects) · [`streams/clawql-durable-objects.md`](streams/clawql-durable-objects.md) · celld integration [`/streams/clawql-celld`](https://docs.clawql.com/streams/clawql-celld) · [`streams/clawql-celld.md`](streams/clawql-celld.md) · **clawql-cellrt** (📋 draft — ClawQL-owned Rust + Wasmtime runtime, monorepo `crates/`) [`/streams/clawql-cellrt`](https://docs.clawql.com/streams/clawql-cellrt) · [`streams/clawql-cellrt.md`](streams/clawql-cellrt.md) · **clawql-tee** (📋 draft — SEV-SNP/TDX attestation) [`/streams/clawql-tee`](https://docs.clawql.com/streams/clawql-tee) · [`streams/clawql-tee.md`](streams/clawql-tee.md) · **air-gap QR audit** [`/streams/clawql-tee-airgap-audit`](https://docs.clawql.com/streams/clawql-tee-airgap-audit) · [`streams/clawql-tee-airgap-audit.md`](streams/clawql-tee-airgap-audit.md)
- **clawql-government** (📋 draft — bond/program outcome accountability, Arweave baselines, FOIA vault): docs site [`/government/clawql-government`](https://docs.clawql.com/government/clawql-government) · [`government/clawql-government.md`](government/clawql-government.md) · industry [`clawql.com/industries/government`](https://clawql.com/industries/government/)
- **QR stream transport** (📋 draft — mcp-api-adapter 7th surface + Streams `qr` source + election module): [`/streams/clawql-qr-stream-transport`](https://docs.clawql.com/streams/clawql-qr-stream-transport) · [`streams/clawql-qr-stream-transport.md`](streams/clawql-qr-stream-transport.md)
- **DAOS Unified Architecture v2.7** (**vision / roadmap** — NSV, SGDOP, model fingerprinting not shipped): [`ouroboros/daos-unified-architecture-specification-v2.7.md`](ouroboros/daos-unified-architecture-specification-v2.7.md) — [`/ouroboros/daos`](https://docs.clawql.com/ouroboros/daos)
- **DAOS coordination layer** (**vision / roadmap** — transport + NATS handoff, NSV/SGDOP, Diversity Dividends): [`ouroboros/daos-coordination-layer-specification.md`](ouroboros/daos-coordination-layer-specification.md) — [`/ouroboros/specification`](https://docs.clawql.com/ouroboros/specification)
- **DAOS build plan v2.7.1** (**vision / roadmap** — P0–P3 implementation contract): [`ouroboros/daos-build-plan-v2.7.1.md`](ouroboros/daos-build-plan-v2.7.1.md) — [`/ouroboros/build-plan`](https://docs.clawql.com/ouroboros/build-plan)

## Getting Started and README Splits

- `readme/getting-started.md`
- `getting-started/agent-setup.md` — desktop, Cursor iOS Cloud Agents, local Seatbelt sandbox
- `getting-started/cloud-agent-e2e-r2-memory.md` — verified Cloud Agent + R2 memory sync e2e checklist
- `getting-started/local-provider-vault.md` — ~/.ClawQL secrets vault + memory home
- `getting-started/getting-started-for-teams.md` — **teams:** Helm, vault sync (R2/S3/GCS), Packer golden hosts, observability
- `getting-started/custom-sources.md` — URL/CLI custom sources (7.0)
- `design/clawql-desktop-macos.md` — ClawQL Desktop (macOS Electron app)
- `getting-started/clawql-init-walkthrough-spec.md` — Executor comparison; Phases 1–2b shipped in 7.0.0
- `readme/configuration.md`
- `readme/deployment.md`
- `readme/benchmarks.md`
- `readme/development.md`
- `skills/README.md` (tool workflow playbooks)

## Deployment and Platform Operations

- **Deployment & Operations Guide** (shipped Helm paths): [`deployment/clawql-deployment-operations-guide.md`](deployment/clawql-deployment-operations-guide.md) — [`/deployment/operations-guide`](https://docs.clawql.com/deployment/operations-guide)
- **Operator scaffold (opt-in CRD + reconcile):** [`deployment/clawql-operator-helm.md`](deployment/clawql-operator-helm.md) ([#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255))
- **Operator target architecture** (full CRD / tiers roadmap): [`design/operator-target-architecture.md`](design/operator-target-architecture.md)
- **IDP document pipeline hub** (eight bundled vendors): [`providers/idp-pipeline.md`](providers/idp-pipeline.md) — [`/learn/document-pipeline`](https://docs.clawql.com/learn/document-pipeline)
- **IDP umbrella Helm chart** (`charts/clawql-idp`, full profile): [`deployment/clawql-idp-helm.md`](deployment/clawql-idp-helm.md)
- **IDP observability bundle** (Grafana + trace/metrics guide, #252): [`observability/README.md`](observability/README.md)
- **Slack-first IDP runbook** (OpenClaw, #256): [`openclaw/slack-first-idp-runbook.md`](openclaw/slack-first-idp-runbook.md)
- **Agent PR → Argo CD pipeline** (GitOps contract, #258): [`gitops/agent-pr-argocd-pipeline.md`](gitops/agent-pr-argocd-pipeline.md)
- **Hosted live bootstrap** (Pulumi profiles + Argo CD + `.cqw`): [`deployment/hosted-live-bootstrap.md`](deployment/hosted-live-bootstrap.md) · [`infra/pulumi`](../infra/pulumi/) · [`deployment/gitops`](../deployment/gitops/) · [`deployment/workflows`](../deployment/workflows/)
- **Docling onboarding** ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)): [`providers/docling-onboarding.md`](providers/docling-onboarding.md)
- **pdf-inspector onboarding** (Firecrawl local PDF route): [`providers/pdf-inspector-onboarding.md`](providers/pdf-inspector-onboarding.md)
- **LangExtract onboarding** ([#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)): [`providers/langextract-onboarding.md`](providers/langextract-onboarding.md)
- **Fine-tuned classifier runbook**: [`runbooks/fine-tuned-classifier.md`](runbooks/fine-tuned-classifier.md)

- **Personal agent (Hermes/Ornith + Cline/Nemotron)** on Mac Mini: [`homelab/personal-agent-hermes-cline.md`](homelab/personal-agent-hermes-cline.md) — orchestrator/executor pairing, ATR scopes, dual MLX ports, WORM hooks (not the multi-channel OpenClaw path)
- `openclaw/using-openclaw-with-clawql.md` — **full guide:** OpenClaw CLI + ClawQL MCP (install, `openclaw mcp set`, HTTP/stdio, validation, remote); website **`/openclaw`**
- `openclaw/clawql-bootstrap.md` — register ClawQL in OpenClaw, env matrix, smoke checklist ([#226](https://github.com/danielsmithdevelopment/ClawQL/issues/226))
- `openclaw/openclaw-idp-skill-profile.md` — **OpenClaw IDP** canonical tools, provider matrix, workflow contract ([#227](https://github.com/danielsmithdevelopment/ClawQL/issues/227))
- `openclaw/slack-first-idp-runbook.md` — Slack + OpenClaw end-to-end IDP workflow ([#256](https://github.com/danielsmithdevelopment/ClawQL/issues/256))
- `deployment/helm.md` § **NATS JetStream deep dive** — optional in-cluster event backbone, subject conventions, ops ([#127](https://github.com/danielsmithdevelopment/ClawQL/issues/127)); website **`/nats-jetstream`**
- **Roadmap tracking (GitHub):** [epic #259](https://github.com/danielsmithdevelopment/ClawQL/issues/259) (checklist **#241–#258**); in-repo plans: [`roadmap/gap-closure-plan-prioritized-2026.md`](roadmap/gap-closure-plan-prioritized-2026.md), [`roadmap/idp-master-requirements-matrix.md`](roadmap/idp-master-requirements-matrix.md); Argo / **`workflow`** [ADR 0004](adr/0004-argo-cd-workflows-clawql-pipelines.md), [design](design/workflow-tool-argo.md), [#239](https://github.com/danielsmithdevelopment/ClawQL/issues/239)
- `deployment/deploy-cloud-run.md`
- `deployment/deploy-k8s.md`
- `deployment/helm.md`
- `deployment/external-secrets-operator-install.md` — **External Secrets Operator** (pinned **2.4.1**) + Vault KV → Kubernetes `Secret` sync for MCP provider env
- `deployment/docker-desktop-istio-observability.md` (Istio on Docker Desktop: Prometheus, Grafana, Tempo, Kiali, OTel Collector — beginner guide per tool)
- `grafana/README.md` + `grafana/clawql-core-observability.json` — bundled Grafana dashboard for ClawQL **`/metrics`**; **IDP bundle:** [`observability/README.md`](observability/README.md) + `clawql-idp-observability.json`; OpenClaw / embed follow-ups → [#225](https://github.com/danielsmithdevelopment/ClawQL/issues/225), ecosystem [#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128) (shipped slice [#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210))
- `deployment/tailscale-and-headscale-for-clawql.md` (beginner guide: managed Tailscale + self-hosted Headscale, MagicDNS, ClawQL env — [#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206), [#211](https://github.com/danielsmithdevelopment/ClawQL/issues/211), [#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213); website **`/tailscale`**)
- `deployment/headscale-tailnet.md` + `deployment/headscale-acls-clawql.hujson` (Headscale runbook + least-privilege ACL starter — [#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206), [#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213))
- `providers/google-apis-lookup.md`
- `providers/aws-apis-lookup.md`, `providers/aws-onboarding.md`

## Security

- Security index and quick links: `security/README.md`
- **Privacy filter (planned):** local ~1.5B sparse MoE masking before extraction — [#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245)
- **LangExtract extraction:** schema-enforced, character-grounded extraction + HTML viz — [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246) — [`langextract-onboarding.md`](providers/langextract-onboarding.md)
- **HITL Label Studio extensions (planned):** pre-annotations + vertical config packs — [#247](https://github.com/danielsmithdevelopment/ClawQL/issues/247) (extends shipped [#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228))
- **HITL multi-reviewer RBAC:** CE vs Enterprise matrix + dual-project two-person pattern — [#249](https://github.com/danielsmithdevelopment/ClawQL/issues/249) (shipped in [`mcp/hitl-label-studio.md`](mcp/hitl-label-studio.md#14-multi-reviewer-rbac-ce-vs-enterprise))
- **Golden image pipeline** (CI → scan → push → sign → deploy enforcement): `security/golden-image-pipeline.md` — plus **public GHCR packages** requirement for **`docker pull`** / Kyverno: top-level **`docker/README.md`** § **GHCR visibility**
- Defense-in-depth reference guide: `security/clawql-security-defense-in-depth.md`
- **Defense-in-Depth Security Guide** (condensed deployment reference — what you deploy): [`security/clawql-defense-in-depth-security-guide.md`](security/clawql-defense-in-depth-security-guide.md) — [`/security/defense-in-depth`](https://docs.clawql.com/security/defense-in-depth)
- Deliverables matrix (shipped vs partial vs planned): `security/clawql-security-defense-deliverables.md`
- npm publish hardening: `security/npm-supply-chain.md`
- Image signature enforcement at deploy (Kyverno / policy): `security/image-signature-enforcement.md`

## Benchmarks and Case Studies

- Benchmarks: `benchmarks/`
- Case studies: `case_studies/`

## Architecture / ADR / Design

- ADRs: `adr/` — includes [**0010 `.cq*` file extensions**](adr/0010-cq-file-extensions.md) (`.cqm` / `.cqe` / `.cqw` / `.cqk` — post-OKF); [**0009 Enterprise Ontology**](adr/0009-enterprise-ontology.md) (open versioned schema, OKF memory, kinetic governance — not Palantir lock-in); [**0006 Golden host images (Packer)**](adr/0006-golden-host-images-packer.md) (managed tier VM bootstrap + team vault seeding); [**0002 Multi-protocol supergraph**](adr/0002-multi-protocol-supergraph.md) (native GraphQL + gRPC merged via **`CLAWQL_GRAPHQL_SOURCES`** / **`CLAWQL_GRPC_SOURCES`**; epic [#178](https://github.com/danielsmithdevelopment/ClawQL/issues/178)); [**0003 Tempo + Dragonfly for local ops**](adr/0003-tempo-dragonfly-local-operations.md) (Istio Docker Desktop lab: **Tempo-only** traces; **`clawql-mcp`**: **Dragonfly-only** Redis-protocol brokers); [**0004 Argo Workflows + Argo CD providers**](adr/0004-argo-cd-workflows-clawql-pipelines.md) (shipped **`workflow`** + **`argocd`** tools; roadmap [`roadmap/argo-workflows-cd-provider.md`](roadmap/argo-workflows-cd-provider.md), [#239](https://github.com/danielsmithdevelopment/ClawQL/issues/239))
- Design docs: [`design/effect-ts-modularization-rearchitecture-plan.md`](design/effect-ts-modularization-rearchitecture-plan.md) (Effect-TS + modularization + plugins), [`design/mcp-api-adapter.md`](design/mcp-api-adapter.md) (📋 MCP tools → OpenAPI on-ramp over gRPC), [`design/clawql-banking-vertical.md`](design/clawql-banking-vertical.md) (📋 neobank / BaaS vertical; KYC outside payments), [`design/OPENAPI_TO_GRAPHQL_UPSTREAM.md`](design/OPENAPI_TO_GRAPHQL_UPSTREAM.md), [`design/graphql-mesh-node-compatibility.md`](design/graphql-mesh-node-compatibility.md); archived drafts: [`design/archive/`](design/archive/); vector / recall design notes live under **`memory/`** (e.g. [`memory/vector-search-design.md`](memory/vector-search-design.md)); **`.cq*` format specs:** [`specs/cq-extensions/`](specs/cq-extensions/)

## Content Collections

- Posts: `posts/`
- Recipes: `recipes/`
- Presentations: [`presentations/`](presentations/) — canonical deck: [`presentations/clawql-slides.md`](presentations/clawql-slides.md); archived transcripts: [`presentations/archive/`](presentations/archive/)
- Announcements: `announcements/` — **7.2.0 drafts:** [`announcements/announcement-drafts-v7.2.0.md`](announcements/announcement-drafts-v7.2.0.md); **7.1.0 drafts:** [`announcements/announcement-drafts-v7.1.0.md`](announcements/announcement-drafts-v7.1.0.md); **7.0.0 drafts:** [`announcements/announcement-drafts-v7.0.0.md`](announcements/announcement-drafts-v7.0.0.md); release checklist: [`release/v7.2.0-checklist.md`](release/v7.2.0-checklist.md)
- Zero-Trust Agentic Fabric: [`architecture/zero-trust-agentic-fabric.md`](architecture/zero-trust-agentic-fabric.md)
- Security references: `security/` — reference [`security/clawql-security-defense-in-depth.md`](security/clawql-security-defense-in-depth.md) and engineering matrix [`security/clawql-security-defense-deliverables.md`](security/clawql-security-defense-deliverables.md) ([#164](https://github.com/danielsmithdevelopment/ClawQL/issues/164))
- Roadmaps: `roadmap/` — prioritized gap closure: [`roadmap/gap-closure-plan-prioritized-2026.md`](roadmap/gap-closure-plan-prioritized-2026.md) ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)–[#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251)); **IDP master requirements matrix**: [`roadmap/idp-master-requirements-matrix.md`](roadmap/idp-master-requirements-matrix.md); **epic checklist** [#241](https://github.com/danielsmithdevelopment/ClawQL/issues/241)–[#258](https://github.com/danielsmithdevelopment/ClawQL/issues/258) → [#259](https://github.com/danielsmithdevelopment/ClawQL/issues/259)
- Integrations: `integrations/` — MCP chokepoint / Panguard + Helm **`mcpProxy`**: [`integrations/panguard-kubernetes.md`](integrations/panguard-kubernetes.md), [`integrations/panguard-http-grpc-bridge.md`](integrations/panguard-http-grpc-bridge.md); JWT ATR binding: [`security/mcp-proxy-jwt-atr.md`](security/mcp-proxy-jwt-atr.md) ([#272](https://github.com/danielsmithdevelopment/ClawQL/issues/272))
- GTM: [`gtm/clawql-gtm-playbook.md`](gtm/clawql-gtm-playbook.md) (bootstrap playbook); [`gtm/pragmaticvectors/`](gtm/pragmaticvectors/) (PV essay drafts); **MCP OpenAPI on-ramp positioning:** [`gtm/mcp-api-adapter-positioning.md`](gtm/mcp-api-adapter-positioning.md); **Protocol Fabric:** [`gtm/protocol-fabric.md`](gtm/protocol-fabric.md)
- Backlog notes: `backlog/` (active); satisfied test mirrors: [`backlog/archive/`](backlog/archive/)
- Workflows: `workflows/`
- Website operations notes: `website/`
