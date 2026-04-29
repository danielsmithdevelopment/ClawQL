# Docs Index

This directory is organized by purpose so operational guides, product docs, and long-form materials are easier to find.

## Core Product Docs

- ClawQL ecosystem (vision deck — core loop, hybrid memory, pipeline, Onyx, Ouroboros, infra, roadmap): [`clawql-ecosystem.md`](clawql-ecosystem.md)
- Feature tiers (always on / default-on opt-out / default-off opt-in): `readme/configuration.md` § **Feature tiers** — diagram: [`readme/images/clawql-feature-tiers.png`](readme/images/clawql-feature-tiers.png)
- Tool reference: `mcp-tools.md`
- External ingest: `external-ingest.md`
- Memory and vault: `memory-obsidian.md`, `memory-db-schema.md`, `memory-db-hybrid-implementation.md`, `hybrid-memory-backends.md`
- Core in-process tools: `cache-tool.md` (LRU session cache), `enterprise-mcp-tools.md` (`audit` ring buffer)
- Optional tools: `notify-tool.md`, `onyx-knowledge-tool.md`, `schedule-synthetic-checks.md`
- Ouroboros: `clawql-ouroboros.md`

## Getting Started and README Splits

- `readme/getting-started.md`
- `readme/configuration.md`
- `readme/deployment.md`
- `readme/benchmarks.md`
- `readme/development.md`
- `skills/README.md` (tool workflow playbooks)

## Deployment and Platform Operations

- `deployment/deploy-cloud-run.md`
- `deployment/deploy-k8s.md`
- `deployment/helm.md`
- `deployment/docker-desktop-istio-observability.md` (Istio on Docker Desktop: Prometheus, Grafana, Jaeger, Kiali, OTel Collector — beginner guide per tool)
- `grafana/README.md` + `grafana/clawql-core-observability.json` — bundled Grafana dashboard for ClawQL **`/metrics`**; OpenClaw notes → [#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128) ([#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210))
- `deployment/tailscale-and-headscale-for-clawql.md` (beginner guide: managed Tailscale + self-hosted Headscale, MagicDNS, ClawQL env — [#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206), [#211](https://github.com/danielsmithdevelopment/ClawQL/issues/211), [#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213); website **`/tailscale`**)
- `deployment/headscale-tailnet.md` + `deployment/headscale-acls-clawql.hujson` (Headscale runbook + least-privilege ACL starter — [#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206), [#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213))
- `providers/google-apis-lookup.md`

## Security

- Security index and quick links: `security/README.md`
- **Golden image pipeline** (CI → scan → push → sign → deploy enforcement): `security/golden-image-pipeline.md`
- Defense-in-depth reference guide: `security/clawql-security-defense-in-depth.md`
- Deliverables matrix (shipped vs partial vs planned): `security/clawql-security-defense-deliverables.md`
- npm publish hardening: `security/npm-supply-chain.md`
- Image signature enforcement at deploy (Kyverno / policy): `security/image-signature-enforcement.md`

## Benchmarks and Case Studies

- Benchmarks: `benchmarks/`
- Case studies: `case_studies/`

## Architecture / ADR / Design

- ADRs: `adr/` — includes [**0002 Multi-protocol supergraph**](adr/0002-multi-protocol-supergraph.md) (native GraphQL + gRPC merged via **`CLAWQL_GRAPHQL_SOURCES`** / **`CLAWQL_GRPC_SOURCES`**; epic [#178](https://github.com/danielsmithdevelopment/ClawQL/issues/178))
- Design docs: `vector-search-design.md`, `OPENAPI_TO_GRAPHQL_UPSTREAM.md`, `graphql-mesh-node-compatibility.md`

## Content Collections

- Posts: `posts/`
- Recipes: `recipes/`
- Presentations: `presentations/`
- Announcements: `announcements/`
- Security references: `security/` — reference [`security/clawql-security-defense-in-depth.md`](security/clawql-security-defense-in-depth.md) and engineering matrix [`security/clawql-security-defense-deliverables.md`](security/clawql-security-defense-deliverables.md) ([#164](https://github.com/danielsmithdevelopment/ClawQL/issues/164))
- Roadmaps: `roadmap/`
- Integrations: `integrations/`
- Backlog notes: `backlog/`
- Workflows: `workflows/`
- Website operations notes: `website/`
