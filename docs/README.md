# Docs Index

This directory is organized by purpose so operational guides, product docs, and long-form materials are easier to find.

## Core Product Docs

- ClawQL ecosystem (vision deck — core loop, hybrid memory, pipeline, Onyx, Ouroboros, infra, roadmap): [`clawql-ecosystem.md`](clawql-ecosystem.md)
- Feature tiers (always on / default-on opt-out / default-off opt-in): `readme/configuration.md` § **Feature tiers** — diagram: [`readme/images/clawql-feature-tiers.png`](readme/images/clawql-feature-tiers.png)
- MCP tools and operator guides: [`mcp/mcp-tools.md`](mcp/mcp-tools.md), [`mcp/external-ingest.md`](mcp/external-ingest.md), [`mcp/cache-tool.md`](mcp/cache-tool.md), [`mcp/enterprise-mcp-tools.md`](mcp/enterprise-mcp-tools.md), [`mcp/notify-tool.md`](mcp/notify-tool.md), [`mcp/hitl-label-studio.md`](mcp/hitl-label-studio.md), [`mcp/onyx-knowledge-tool.md`](mcp/onyx-knowledge-tool.md), [`mcp/schedule-synthetic-checks.md`](mcp/schedule-synthetic-checks.md)
- Memory and vault: [`memory/memory-obsidian.md`](memory/memory-obsidian.md), [`memory/memory-db-schema.md`](memory/memory-db-schema.md), [`memory/memory-db-hybrid-implementation.md`](memory/memory-db-hybrid-implementation.md), [`memory/hybrid-memory-backends.md`](memory/hybrid-memory-backends.md), [`memory/vector-search-design.md`](memory/vector-search-design.md)
- Ouroboros library: [`ouroboros/clawql-ouroboros.md`](ouroboros/clawql-ouroboros.md)

## Getting Started and README Splits

- `readme/getting-started.md`
- `readme/configuration.md`
- `readme/deployment.md`
- `readme/benchmarks.md`
- `readme/development.md`
- `skills/README.md` (tool workflow playbooks)

## Deployment and Platform Operations

- `openclaw/using-openclaw-with-clawql.md` — **full guide:** OpenClaw CLI + ClawQL MCP (install, `openclaw mcp set`, HTTP/stdio, validation, remote); website **`/openclaw`**
- `openclaw/clawql-bootstrap.md` — register ClawQL in OpenClaw, env matrix, smoke checklist ([#226](https://github.com/danielsmithdevelopment/ClawQL/issues/226))
- `openclaw/openclaw-idp-skill-profile.md` — **OpenClaw IDP** canonical tools, provider matrix, workflow contract ([#227](https://github.com/danielsmithdevelopment/ClawQL/issues/227))
- `deployment/helm.md` § **NATS JetStream deep dive** — optional in-cluster event backbone, subject conventions, ops ([#127](https://github.com/danielsmithdevelopment/ClawQL/issues/127)); website **`/nats-jetstream`**
- **Roadmap tracking (GitHub):** [epic #259](https://github.com/danielsmithdevelopment/ClawQL/issues/259) (checklist **#241–#258**); in-repo plans: [`roadmap/gap-closure-plan-prioritized-2026.md`](roadmap/gap-closure-plan-prioritized-2026.md), [`roadmap/idp-master-requirements-matrix.md`](roadmap/idp-master-requirements-matrix.md); Argo / **`workflow`** [ADR 0004](adr/0004-argo-cd-workflows-clawql-pipelines.md), [#239](https://github.com/danielsmithdevelopment/ClawQL/issues/239)
- `deployment/deploy-cloud-run.md`
- `deployment/deploy-k8s.md`
- `deployment/helm.md`
- `deployment/docker-desktop-istio-observability.md` (Istio on Docker Desktop: Prometheus, Grafana, Tempo, Kiali, OTel Collector — beginner guide per tool)
- `grafana/README.md` + `grafana/clawql-core-observability.json` — bundled Grafana dashboard for ClawQL **`/metrics`**; OpenClaw / embed follow-ups → [#225](https://github.com/danielsmithdevelopment/ClawQL/issues/225), ecosystem [#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128) (shipped slice [#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210))
- `deployment/tailscale-and-headscale-for-clawql.md` (beginner guide: managed Tailscale + self-hosted Headscale, MagicDNS, ClawQL env — [#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206), [#211](https://github.com/danielsmithdevelopment/ClawQL/issues/211), [#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213); website **`/tailscale`**)
- `deployment/headscale-tailnet.md` + `deployment/headscale-acls-clawql.hujson` (Headscale runbook + least-privilege ACL starter — [#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206), [#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213))
- `providers/google-apis-lookup.md`

## Security

- Security index and quick links: `security/README.md`
- **Privacy filter (planned):** local ~1.5B sparse MoE masking before extraction — [#245](https://github.com/danielsmithdevelopment/ClawQL/issues/245)
- **LangExtract extraction (planned):** schema-enforced, character-grounded extraction + HTML viz — [#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)
- **HITL Label Studio extensions (planned):** pre-annotations + vertical config packs — [#247](https://github.com/danielsmithdevelopment/ClawQL/issues/247) (extends shipped [#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228))
- **Golden image pipeline** (CI → scan → push → sign → deploy enforcement): `security/golden-image-pipeline.md`
- Defense-in-depth reference guide: `security/clawql-security-defense-in-depth.md`
- Deliverables matrix (shipped vs partial vs planned): `security/clawql-security-defense-deliverables.md`
- npm publish hardening: `security/npm-supply-chain.md`
- Image signature enforcement at deploy (Kyverno / policy): `security/image-signature-enforcement.md`

## Benchmarks and Case Studies

- Benchmarks: `benchmarks/`
- Case studies: `case_studies/`

## Architecture / ADR / Design

- ADRs: `adr/` — includes [**0002 Multi-protocol supergraph**](adr/0002-multi-protocol-supergraph.md) (native GraphQL + gRPC merged via **`CLAWQL_GRAPHQL_SOURCES`** / **`CLAWQL_GRPC_SOURCES`**; epic [#178](https://github.com/danielsmithdevelopment/ClawQL/issues/178)); [**0003 Tempo + Dragonfly for local ops**](adr/0003-tempo-dragonfly-local-operations.md) (Istio Docker Desktop lab: **Tempo-only** traces; **`clawql-mcp`**: **Dragonfly-only** Redis-protocol brokers); [**0004 Argo Workflows + Argo CD providers (proposed)**](adr/0004-argo-cd-workflows-clawql-pipelines.md) (optional agent-driven pipelines; post-6.0.0 — roadmap [`roadmap/argo-workflows-cd-provider.md`](roadmap/argo-workflows-cd-provider.md), [#239](https://github.com/danielsmithdevelopment/ClawQL/issues/239))
- Design docs: [`design/OPENAPI_TO_GRAPHQL_UPSTREAM.md`](design/OPENAPI_TO_GRAPHQL_UPSTREAM.md), [`design/graphql-mesh-node-compatibility.md`](design/graphql-mesh-node-compatibility.md); vector / recall design notes live under **`memory/`** (e.g. [`memory/vector-search-design.md`](memory/vector-search-design.md))

## Content Collections

- Posts: `posts/`
- Recipes: `recipes/`
- Presentations: `presentations/`
- Announcements: `announcements/`
- Security references: `security/` — reference [`security/clawql-security-defense-in-depth.md`](security/clawql-security-defense-in-depth.md) and engineering matrix [`security/clawql-security-defense-deliverables.md`](security/clawql-security-defense-deliverables.md) ([#164](https://github.com/danielsmithdevelopment/ClawQL/issues/164))
- Roadmaps: `roadmap/` — prioritized gap closure: [`roadmap/gap-closure-plan-prioritized-2026.md`](roadmap/gap-closure-plan-prioritized-2026.md) ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)–[#251](https://github.com/danielsmithdevelopment/ClawQL/issues/251)); **IDP master requirements matrix**: [`roadmap/idp-master-requirements-matrix.md`](roadmap/idp-master-requirements-matrix.md); **epic checklist** [#241](https://github.com/danielsmithdevelopment/ClawQL/issues/241)–[#258](https://github.com/danielsmithdevelopment/ClawQL/issues/258) → [#259](https://github.com/danielsmithdevelopment/ClawQL/issues/259)
- Integrations: `integrations/` — MCP chokepoint / Panguard + Helm **`mcpProxy`**: [`integrations/panguard-kubernetes.md`](integrations/panguard-kubernetes.md), [`integrations/panguard-http-grpc-bridge.md`](integrations/panguard-http-grpc-bridge.md); JWT ATR binding: [`security/mcp-proxy-jwt-atr.md`](security/mcp-proxy-jwt-atr.md) ([#272](https://github.com/danielsmithdevelopment/ClawQL/issues/272))
- Backlog notes: `backlog/`
- Workflows: `workflows/`
- Website operations notes: `website/`
