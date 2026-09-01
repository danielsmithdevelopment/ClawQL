# ClawQL

**ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI.**

The Agentic Gateway is an MCP + OpenAI-compatible control plane for API discovery and execution with a token-efficient `search -> execute` workflow over **OpenAPI**, **Google Discovery**, and optional **native GraphQL** and **gRPC** sources (see **`CLAWQL_GRAPHQL_URL`** / **`CLAWQL_GRAPHQL_SOURCES`** / **`CLAWQL_GRPC_SOURCES`** in `.env.example` and [ADR 0002](docs/adr/0002-multi-protocol-supergraph.md)). GraphQL-only vendors (e.g. Linear) need no OpenAPI spec: use **`CLAWQL_PROVIDER=linear`** (bundled SDL under **`providers/linear/`** + **`LINEAR_API_KEY`**), or point **`CLAWQL_GRAPHQL_URL`** at their HTTP endpoint and auth headers, or load **`search`** from **`CLAWQL_GRAPHQL_SCHEMA_PATH`** / **`CLAWQL_GRAPHQL_INTROSPECTION_PATH`** (or per-source **`schemaPath`** / **`introspectionPath`**) when upstream introspection is disabled — without **`CLAWQL_SPEC_*`** / **`CLAWQL_PROVIDER`**, the default bundled REST specs are not loaded.

Enterprise topology: [Zero-Trust Agentic Fabric](docs/architecture/zero-trust-agentic-fabric.md) (Regional Hubs · Dedicated Virtual Gateways · Edge Gateways). GTM: [inference-first playbook](https://clawql.com/inference/gtm/).

## What You Get

Feature tiers (aligned with the [architecture diagram](docs/readme/images/clawql-feature-tiers.png) — details in [`docs/readme/configuration.md`](docs/readme/configuration.md#feature-tiers-architecture-diagram)):

- **ClawQL Core (always on — no opt-out):** `search`, `execute`, `audit`, `cache` — same band in the diagram; ring-buffer semantics for `audit` and LRU semantics for `cache` in [`docs/mcp/enterprise-mcp-tools.md`](docs/mcp/enterprise-mcp-tools.md) and [`docs/mcp/cache-tool.md`](docs/mcp/cache-tool.md).
- **Default on — opt out:** `memory_ingest` / `memory_recall`, and the **document** stack (`ingest_external_knowledge`, plus `knowledge_search_onyx` when `CLAWQL_ENABLE_ONYX=1`). Use `CLAWQL_ENABLE_MEMORY=0` or `CLAWQL_ENABLE_DOCUMENTS=0` to hide; vault path still required for real disk I/O on memory / ingest.
- **Default off — opt in:** `sandbox_exec` (**`CLAWQL_ENABLE_SANDBOX=1`**), `schedule`, `notify`, `knowledge_search_onyx` (needs `CLAWQL_ENABLE_ONYX=1` and documents on), `ouroboros_*` — see [`docs/mcp/mcp-tools.md`](docs/mcp/mcp-tools.md). When enabled, **`CLAWQL_SANDBOX_BACKEND`**: omit = bridge; **`auto`** = Seatbelt → Docker → bridge.
- Stdio and HTTP MCP server modes
- Bundled provider specs for offline lookup and multi-provider workflows

Primary package: `clawql-mcp` (**7.0.0** — Agentic Gateway entry; default stack, vault-first onboarding, opt-in operator scaffold — [`RELEASE_NOTES_v7.0.0.md`](RELEASE_NOTES_v7.0.0.md) · announcement drafts: [`docs/announcements/announcement-drafts-v7.0.0.md`](docs/announcements/announcement-drafts-v7.0.0.md))  
Repo: https://github.com/danielsmithdevelopment/ClawQL

### Container images on GHCR (Docker / Helm)

Prebuilt images live on **GitHub Container Registry** under **`ghcr.io/danielsmithdevelopment/`** (**`clawql-mcp`**, **`clawql-website`**, **`clawql-dashboard`**, **`clawql-panguard-mcp-bridge`**). They are **supposed to be public** so anyone can **`docker pull`** without credentials and Kubernetes defaults (Kyverno) can verify signatures. If **`docker pull`** returns **denied**, the registry package is still private — see **[`docker/README.md`](docker/README.md) § GHCR visibility** (checklist + **`make ghcr-packages-public`** for maintainers).

## Quick Start

Install:

```bash
npm install clawql-mcp
```

Run with a **slim** server (no bundled OpenAPI catalog loaded). Opt into the curated pack when you want it:

```bash
npx -p clawql-mcp clawql init --interactive   # vault-first onboarding
npx -p clawql-mcp clawql mcp-config           # MCP JSON for Cursor
# Optional curated pack (CF + GitHub + Slack + Linear + Notion + Onyx):
CLAWQL_INSTANCE_SPEC='{"providers":{"pack":"default"}}' npx -p clawql-mcp clawql-mcp
# Or: CLAWQL_PROVIDER=default npx -p clawql-mcp clawql-mcp
npx -p clawql-mcp clawql-mcp
```

For every bundled vendor plus Google top-50 and AWS top-50:

```bash
CLAWQL_PROVIDER=all-providers npx clawql-mcp
```

Then configure your MCP client (Cursor/Claude Desktop) to connect — or paste the [agent setup prompt](docs/getting-started/agent-setup-prompt.md) into your agent.

## Documentation Map

Top-level docs index: `docs/README.md`

### Start here

- **Zero-Trust Agentic Fabric:** `docs/architecture/zero-trust-agentic-fabric.md` — [`/architecture/agentic-fabric`](https://docs.clawql.com/architecture/agentic-fabric)
- Getting started: `docs/readme/getting-started.md`
- **Set up with your agent:** `docs/getting-started/agent-setup-prompt.md` · init walkthrough spec: `docs/getting-started/clawql-init-walkthrough-spec.md`
- Plugins hub: `docs/plugins/README.md` — [`/plugins`](https://docs.clawql.com/plugins)
- Configuration and env precedence: `docs/readme/configuration.md`
- Deployment and client config: `docs/readme/deployment.md` (Kubernetes list links **`docs/deployment/docker-desktop-istio-observability.md`** for Istio + Prometheus/Grafana/Tempo/Kiali/OTel on Docker Desktop)
- Benchmarks and case studies: `docs/readme/benchmarks.md`
- Development notes: `docs/readme/development.md`
- Tool workflow skills: `docs/skills/README.md`

### Core references

- **Modularization ground truth:** `docs/design/modularization-implementation-status.md`
- **Plugin model & registry:** `docs/design/clawql-plugin-model.md`, `docs/reference/clawql-plugin-registry.md`
- MCP tools and examples: `docs/mcp/mcp-tools.md`
- Workflow recipes: `docs/recipes/README.md`
- Memory and vault workflows: `docs/memory/memory-obsidian.md`
- Cache tool: `docs/mcp/cache-tool.md`
- Enterprise MCP notes (`audit` threat model, future metrics/governance): `docs/mcp/enterprise-mcp-tools.md`
- Slack notify tool: `docs/mcp/notify-tool.md`
- Onyx knowledge tool: `docs/mcp/onyx-knowledge-tool.md`
- Ouroboros package and integration: `docs/ouroboros/clawql-ouroboros.md`

### Deployments

- Docker: `docker/README.md`
- Cloud Run: `docs/deployment/deploy-cloud-run.md`
- Kubernetes: `docs/deployment/deploy-k8s.md`
- Helm chart (`clawql-mcp`): `docs/deployment/helm.md`
- **IDP umbrella chart (`clawql-idp`):** `docs/deployment/clawql-idp-helm.md` — full-stack profile via `values-idp-full.yaml`
- **IDP observability bundle:** `docs/observability/README.md` (Grafana dashboard + trace/metrics guide)
- **OpenClaw + Slack IDP runbook:** `docs/openclaw/slack-first-idp-runbook.md`
- **Agent PR → Argo CD GitOps:** `docs/gitops/agent-pr-argocd-pipeline.md`
- Tailscale / Headscale (beginner guide): `docs/deployment/tailscale-and-headscale-for-clawql.md` (website **`/tailscale`**)
- Headscale runbook + ACL starter: `docs/deployment/headscale-tailnet.md`, `docs/deployment/headscale-acls-clawql.hujson`

### IDP (intelligent document processing)

Eight bundled vendors (Nextcloud, Docling, Tika, Gotenberg, Stirling, Paperless, Onyx, Coneshare) compose via **`search`** / **`execute`** or optional MCP tools (**`run_idp_pipeline`**, **`classify_document`**, **`extract_document`**). Hub: `docs/providers/idp-pipeline.md` · matrix: `docs/roadmap/idp-master-requirements-matrix.md` · OpenClaw profile: `docs/openclaw/openclaw-idp-skill-profile.md`

### Security and supply chain

- Security overview and shipped controls: `docs/security/README.md`
- **Golden image pipeline** (CI → scan → push → sign → Kyverno enforcement): `docs/security/golden-image-pipeline.md`
- Defense in depth reference: `docs/security/clawql-security-defense-in-depth.md`
- Engineering deliverables matrix (shipped/partial/planned): `docs/security/clawql-security-defense-deliverables.md`
- Docker SBOM/sign/scan operator notes: `docker/README.md`
- npm publish hardening (pack → scan → publish, provenance): `docs/security/npm-supply-chain.md`
- Deploy-time image signature enforcement (admission / Kyverno): `docs/security/image-signature-enforcement.md`

### Providers and specs

- Provider matrix and presets: `providers/README.md`
- Google Discovery helpers: `docs/providers/google-apis-lookup.md`
- AWS top-50 preset: `docs/providers/aws-apis-lookup.md`, `docs/providers/aws-onboarding.md`

## Architecture (Short Version)

1. Agent calls `search` to discover relevant operations without loading entire specs into prompt context.
2. Agent calls `execute` with operation details.
3. For **OpenAPI/Discovery** operations: in **single-spec** mode, ClawQL prefers an internal OpenAPI-to-GraphQL path (REST fallback on failure); in **multi-spec** mode, **`execute`** uses **REST** per owning spec.
4. For **native** operations (when configured): **`execute`** calls **HTTP GraphQL** or **gRPC** unary directly — same **`search`** index, routed by operation metadata — see [ADR 0002](docs/adr/0002-multi-protocol-supergraph.md).

## Notes

- **Core** (`search`, `execute`, `audit`, `cache`) has **no opt-out** — no **`CLAWQL_ENABLE_*`** gate for those tools.
- A writable `CLAWQL_OBSIDIAN_VAULT_PATH` is required to read/write the vault for **`memory_*`** and bulk **`ingest_external_knowledge`**.
- For full environment variable details, see `.env.example` and `docs/mcp/mcp-tools.md`.
