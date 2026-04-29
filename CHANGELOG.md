# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Breaking

- **`sandbox_exec`:** the MCP tool is registered only when **`CLAWQL_ENABLE_SANDBOX=1`** (same **default off — opt in** band as **`schedule`**, **`notify`**, **`ouroboros_*`** in the [feature tiers diagram](docs/readme/images/clawql-feature-tiers.png)). Previously **`sandbox_exec`** was always listed; restore visibility by setting the flag (still configure **`CLAWQL_SANDBOX_BACKEND`**, bridge URL + token, Docker, or Seatbelt as before) ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207)).

### Documentation

- **Grafana — ClawQL Core Observability:** **`docs/grafana/clawql-core-observability.json`** (importable dashboard for native-protocol **`/metrics`**), **`docs/grafana/README.md`** (Prometheus scrape requirement, Istio dashboard IDs, OpenClaw handoff → [#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)), **`docs/deployment/docker-desktop-istio-observability.md`** (Grafana step 6 — import) ([#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210)).
- **Tailscale / Headscale (beginners):** **`docs/deployment/tailscale-and-headscale-for-clawql.md`** (managed Tailscale vs Headscale, concepts, MagicDNS, **`CLAWQL_MCP_URL`**, Kubernetes vs tailnet DNS, troubleshooting; **regulatory context** — HIPAA / SOC 2 / GDPR / CCPA **control themes**, not legal advice), website route **`/tailscale`** (**`website/src/app/tailscale/page.mdx`**), **Navigation**, **Resources**, and **sitemap** wiring; cross-links from **`headscale-tailnet.md`**, **`deployment/page.mdx`**, **`docs/README.md`**, **`docs/readme/deployment.md`**, **`docs/clawql-ecosystem.md`**, **`README.md`**, **`.env.example`**, **`docs/readme/getting-started.md`** ([#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206), [#211](https://github.com/danielsmithdevelopment/ClawQL/issues/211), [#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213)).
- **Headscale tailnet runbook:** **`docs/deployment/headscale-tailnet.md`** (topology, firewall, MagicDNS **`*.clawql.local`**, enrollment outline, **`CLAWQL_MCP_URL`** / **`BASE_URL`** alignment, validation checklist, public MCP URL deprecation after cutover), least-privilege starter ACL **`docs/deployment/headscale-acls-clawql.hujson`**, index link in **`docs/README.md`**, cross-links from **`docs/readme/deployment.md`**, **`docs/clawql-ecosystem.md`** (service map vs tailnet DNS), **`.env.example`**, **`README.md`** (deployments map), **`website/src/app/deployment/page.mdx`** ([#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206), [#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213)).
- **Tailnet MCP URLs + env hygiene:** **`docs/readme/deployment.md`** (private Tailscale MagicDNS **`url`**, **`CLAWQL_MCP_URL`** for workflows only, aligning **`*_BASE_URL`** with tailnet hosts), **`docs/readme/configuration.md`** (dotenv load order, **`CLAWQL_*`** vs legacy aliases), **`.env.example`** cross-links ([#195](https://github.com/danielsmithdevelopment/ClawQL/issues/195), [#211](https://github.com/danielsmithdevelopment/ClawQL/issues/211)).
- **Observability:** **`docs/readme/deployment.md`**, **`docs/mcp-tools.md`** (See also), **`docs/enterprise-mcp-tools.md`** (regulated deployments), **`.env.example`**, **`docs/adr/0002-multi-protocol-supergraph.md`** (#191 row), **`website/src/app/deployment/page.mdx`** — **`GET /metrics`** (**`prom-client`**) plus optional **`GET /healthz`** **`nativeProtocolMetrics`** ([#191](https://github.com/danielsmithdevelopment/ClawQL/issues/191)).

### Added

- **Bundled OpenAPI providers — pregenerated GraphQL:** committed **`introspection.json`** and **`schema.graphql`** where **`npm run pregenerate-graphql`** succeeds for **`tika`**, **`gotenberg`**, **`paperless`**, **`stirling`**, **`jira`**, **`github`**, **`n8n`**, and **`sentry`** ([#125](https://github.com/danielsmithdevelopment/ClawQL/issues/125)).

- **Ouroboros default executor — optional Onyx ingest after Paperless:** With **`CLAWQL_OUROBOROS_ONYX_AFTER_PAPERLESS`** and seed **`metadata.onyx_ingest_after_paperless`**, append **`execute`** on **`onyx::onyx_ingest_document`** after a successful Paperless step whose JSON **`result`** includes a document **`id`**; optional **`CLAWQL_ONYX_CC_PAIR_ID`** ([#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120)).

- **HITL / Label Studio (optional):** MCP **`hitl_enqueue_label_studio`** (**`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`**) posts tasks to Label Studio **`/api/projects/{id}/import`**; Streamable HTTP **`POST /hitl/label-studio/webhook`** ingests reviewer payloads into **`memory_ingest`** (or **`audit`** when the vault is unavailable). Env: **`CLAWQL_LABEL_STUDIO_URL`**, **`CLAWQL_LABEL_STUDIO_API_TOKEN`**, **`CLAWQL_HITL_WEBHOOK_TOKEN`** (required for webhook when **`NODE_ENV=production`**). Docs: **`docs/hitl-label-studio.md`**, **`docs/mcp-tools.md`**, **`docs/openclaw/clawql-bootstrap.md`**; Helm **`enableHitlLabelStudio`** ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)).

- **Helm / Kustomize — Prometheus scrape `clawql-mcp-http` `/metrics`:** **`metrics.prometheusScrapeAnnotations`** on **`charts/clawql-mcp`** (default **enabled** — **`prometheus.io/*`** on the MCP **Service** for Istio sample Prometheus **`kubernetes-service-endpoints`**); optional **`metrics.serviceMonitor`** (**`monitoring.coreos.com/v1`**) for Prometheus Operator; **`service.annotations`** merge; **`docker/kustomize/base/service-mcp-http.yaml`** annotations for parity. Docs: **`charts/clawql-mcp/README.md`**, **`docs/deployment/helm.md`**, **`docs/grafana/README.md`** ([#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210)).

- **Docker Desktop Istio follow-ups:** **`local-k8s-docker-desktop.sh`** patches **`svc/clawql-mcp-http`** to **`ClusterIP`** when the Istio ingress gateway is installed (**`CLAWQL_ISTIO_MCP_HTTP_SERVICE_CLUSTERIP`**, default **`1`**); **`scripts/kubernetes/smoke-grpcurl-istio-gateway-mcp.sh`** + **`make smoke-grpcurl-istio-gateway-mcp`** for **`grpcurl`** **`grpc.health.v1.Health/Check`** on **`localhost:50051`** ([#155](https://github.com/danielsmithdevelopment/ClawQL/issues/155)).

- **Prometheus (`GET /metrics`, core):** **`prom-client`** OpenMetrics exposition for native GraphQL/gRPC merge gauges and execute counters per **`sourceLabel`**; same signals as optional JSON on **`GET /healthz`**. Disable the HTTP route with **`CLAWQL_DISABLE_HTTP_METRICS=1`** only when necessary ([#191](https://github.com/danielsmithdevelopment/ClawQL/issues/191)).

- **Optional OTLP traces (Jaeger-ready):** **`CLAWQL_ENABLE_OTEL_TRACING=1`** with **`OTEL_EXPORTER_OTLP_ENDPOINT`** or **`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`** registers OTLP HTTP export and **`mcp.tool.<name>`** spans for MCP handlers (including **`ouroboros_*`**); OpenTelemetry packages load only when the flag is set ([#160](https://github.com/danielsmithdevelopment/ClawQL/issues/160)).

- **Native protocol metrics per source:** when **`CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS=1`**, **`GET /healthz`** **`nativeProtocolMetrics`** includes **`graphqlBySource`** and **`grpcBySource`** (merge gauges and cumulative execute counters per GraphQL/gRPC **`sourceLabel`**), alongside existing aggregate fields ([#191](https://github.com/danielsmithdevelopment/ClawQL/issues/191)).

- **`sandbox_exec`:** **`CLAWQL_ENABLE_SANDBOX=1`** registers the tool; **`CLAWQL_SANDBOX_BACKEND=auto`** enables **Seatbelt** → **Docker** → **bridge**; **unset** **`CLAWQL_SANDBOX_BACKEND`** = bridge path when executing. Responses include **`backend`** ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207)).

## [5.0.0] - 2026-04-27

Major release: **ADR 0002** native **GraphQL** + **gRPC** on the merged **`search` / `execute`** surface; **Core** MCP tools (**`audit`**, **`cache`**) always registered; golden-image **CI** + **Kyverno** defaults (**Helm 0.5.x**); supply-chain and security docs. Bugfixes: [#167](https://github.com/danielsmithdevelopment/ClawQL/issues/167), [#168](https://github.com/danielsmithdevelopment/ClawQL/issues/168).

### Fixed

- **Cloudflare `execute` auth:** **`mergedAuthHeaders("cloudflare")`** supports **Global API Key** pairs (**`X-Auth-Email`** + **`X-Auth-Key`**) via **`CLOUDFLARE_EMAIL`** / **`CLAWQL_CLOUDFLARE_EMAIL`** and **`CLOUDFLARE_API_KEY`** / **`CLAWQL_CLOUDFLARE_GLOBAL_API_KEY`** / **`CLOUDFLARE_GLOBAL_API_KEY`**; explicit **`CLOUDFLARE_API_TOKEN`** / **`CLAWQL_CLOUDFLARE_API_TOKEN`** still take precedence over **`CLAWQL_BEARER_TOKEN`** ([#168](https://github.com/danielsmithdevelopment/ClawQL/issues/168)).
- **Ouroboros default engines evaluator:** provider evidence for acceptance criteria no longer uses a whole-payload substring match (so text like **`goal`** cannot “cover” Cloudflare); inference uses **`operationId`**, merged **`label::`** prefixes, and path-style heuristics ([#167](https://github.com/danielsmithdevelopment/ClawQL/issues/167)).

### Breaking

- **`audit` MCP tool:** **`CLAWQL_ENABLE_AUDIT`** and Helm **`enableAudit`** removed — **`audit`** is always registered ([#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)). Delete obsolete env / chart keys; **`listTools`** always includes **`audit`**.
- **`cache` MCP tool:** **`CLAWQL_ENABLE_CACHE`** and Helm **`enableCache`** removed — **`cache`** is always registered ([#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75)). Delete obsolete env / chart keys; **`listTools`** always includes **`cache`**.
- **`charts/clawql-mcp`:** value keys **`enableAudit`** and **`enableCache`** removed (Core tools are not configurable via Helm); **`appVersion`** **`5.0.0`** with **`clawql-mcp`** major (Helm **`Chart.version`** **0.5.x**—see **`charts/clawql-mcp/Chart.yaml`**).
- **`clawql-ouroboros` / MCP `ouroboros_*` tools:**
  - **`maxGenerations`** no longer produces a converged-success outcome when convergence gates are unsatisfied — runs end **exhausted** (`converged: false`) instead of a false-positive converged state.
  - **Convergence gates:** evaluation / approval checks block **all** convergence exits (similarity, stagnation, oscillation); **`final_approved: false`** prevents convergence.
  - **Executor routing:** route hints from **`brownfield_context.context_references`** execute as a **sequence** (multi-route), not only the first match.
  - **Evaluator:** provider-aware acceptance criteria are evaluated **per criterion**, with improved provider inference (for example, **`repos/list-commits`** maps to GitHub).

- **`charts/clawql-mcp` (0.5.3):** **`kyverno.imageSignaturePolicy.enabled`** defaults to **`true`** — the chart renders a **`ClusterPolicy`** unless disabled. Install **[Kyverno](https://kyverno.io/)** before **`helm upgrade`**, or pass **`--set kyverno.imageSignaturePolicy.enabled=false`** on clusters that do not use Kyverno yet.

- **`make local-k8s-up` / `scripts/kubernetes/local-k8s-docker-desktop.sh`:** installs **Kyverno** and **enforces Cosign** for **`ghcr.io/danielsmithdevelopment/clawql-mcp*`** and **`clawql-website*`** in the **`clawql`** release namespace (**`values-docker-desktop.yaml`**). **`CLAWQL_LOCAL_K8S_BUILD_IMAGE=1`** and **`CLAWQL_LOCAL_K8S_BUILD_UI_IMAGE=1`** are **rejected**. **Helm 3** is **required** for every install path (including **`CLAWQL_LOCAL_K8S_INSTALLER=kustomize`**). Default UI image is **GHCR** (not a local **`docker build`**).

### Changed

- **Docs:** **Feature tiers** aligned with the architecture diagram — **ClawQL Core** (`search`, `execute`, `audit`, `cache`, no opt-out), **default on — opt out** (vault memory, Documents stack), **default off — opt in** (schedule, notify, Onyx wrapper, Ouroboros; Sandbox bridge–gated `sandbox_exec`) — in **`docs/readme/configuration.md`**, plus cross-links from **`README.md`**, **`docs/mcp-tools.md`**, **`docs/README.md`**, **`.env.example`**, **`docs/onyx-knowledge-tool.md`**, and the website **Concepts** / **Tools** pages.
- **`memory_ingest` / `memory_recall`:** register by default; set **`CLAWQL_ENABLE_MEMORY=0`** to opt out. **Helm:** **`enableMemory: true`** (default); when **`false`**, the chart injects **`CLAWQL_ENABLE_MEMORY=0`**. Docs: **[`docs/mcp-tools.md`](docs/mcp-tools.md)**, **[`docs/cache-tool.md`](docs/cache-tool.md)**, **[`README.md`](README.md)**, **`.env.example`**, **[`charts/clawql-mcp/README.md`](charts/clawql-mcp/README.md)**.
- **Document stack opt-out:** **`CLAWQL_ENABLE_DOCUMENTS=0`** (default on when unset) omits bundled **tika**, **gotenberg**, **paperless**, **stirling**, and **onyx** from the default **`all-providers`** merge; unregisters **`ingest_external_knowledge`**; **`knowledge_search_onyx`** requires both **`CLAWQL_ENABLE_ONYX=1`** and documents enabled. **`CLAWQL_BUNDLED_PROVIDERS=…`** can still list document vendors explicitly. **Helm:** **`enableDocuments: true`** by default; set **`false`** to inject **`CLAWQL_ENABLE_DOCUMENTS=0`**. See **[`docs/mcp-tools.md`](docs/mcp-tools.md)**, **[`src/provider-registry.ts`](src/provider-registry.ts)** (`BUNDLED_DOCUMENT_VENDOR_IDS`).
- **`charts/clawql-mcp`:** **`docs/deployment/helm.md`** and **`charts/clawql-mcp/README.md`** aligned with Core tools and optional flags.
- **MCP `Implementation.version`:** reads **`clawql-mcp`** **`package.json`** at runtime (**`src/npm-version.ts`**) for stdio / HTTP / gRPC transports.

### Documentation

- **Golden image pipeline (E2E + enforcement):** new **[`docs/security/golden-image-pipeline.md`](docs/security/golden-image-pipeline.md)** — **`repo-supply-chain`** → single **OCI** build (**MCP** + **website**) → **Trivy** → **`skopeo copy`** → **Cosign** → **`imagetools`** promotion; **Kyverno + Helm** default admission; limits table. Linked from **`docs/security/README.md`**, **`docs/README.md`**, **`README.md`**, **`docs/readme/deployment.md`**, **`docker/README.md`**, **`docs/deployment/helm.md`**, **`docs/security/image-signature-enforcement.md`**, and the website **Security**, **Deployment**, and **Helm** pages.

- **Image signature enforcement at deploy:** **[`docs/security/image-signature-enforcement.md`](docs/security/image-signature-enforcement.md)** explains why **Cosign in CI** is not enough by itself, and documents **Kyverno `verifyImages`** (keyless / GitHub Actions issuer + subject regex) plus digest-first Helm guidance. **Helm:** **`ClusterPolicy`** is **on by default** (chart **0.5.3**); **`make local-k8s-up`** installs **Kyverno** on Docker Desktop (**#132** / matrix row **19**).

- **Defense in depth — deliverables matrix:** **[`docs/security/clawql-security-defense-deliverables.md`](docs/security/clawql-security-defense-deliverables.md)** maps **`clawql-security-defense-in-depth.md`** controls to **shipped / partial / planned / customer** status, **GitHub issues**, and **Helm / CI / docs** artifacts ([#164](https://github.com/danielsmithdevelopment/ClawQL/issues/164)). Linked from the reference guide header/footer, **`docs/README.md`**, slides **79–80** (resource table + explicit “shipped vs roadmap” pointer). Slide **vision** (Golden Image, **SBOM**, **Cosign**, full stack) is **unchanged**; the matrix **adds** an auditable backlog beside the narrative.

### Added

- **ADR 0002 — Multi-protocol supergraph:** **[`docs/adr/0002-multi-protocol-supergraph.md`](docs/adr/0002-multi-protocol-supergraph.md)** — **clawql-mcp 5.0.0** targets first-class **GraphQL** + **gRPC** only; Postgres / Redis / SQLite / NATS / Fabric / The Graph / x402 remain backlog under epic **[#178](https://github.com/danielsmithdevelopment/ClawQL/issues/178)** (label **`supergraph`**).
- **`src/spec-kind.ts`:** **`SpecKind`** union and **`normalizeOperationId`** / **`sanitizeOperationSegment`** (`kind__provider__operation`) — foundation for [#181](https://github.com/danielsmithdevelopment/ClawQL/issues/181).
- **Native GraphQL + gRPC:** **`CLAWQL_GRAPHQL_SOURCES`** (JSON array: HTTP introspection → merged operations; **`execute`** POSTs to each endpoint), **`CLAWQL_GRAPHQL_URL`** / **`CLAWQL_GRAPHQL_NAME`** / **`CLAWQL_GRAPHQL_HEADERS`** (single-endpoint shortcut for GraphQL-only APIs such as Linear—no OpenAPI spec env), and **`CLAWQL_GRPC_SOURCES`** (JSON array: **`@grpc/proto-loader`** + unary **`@grpc/grpc-js`** clients). **`shouldLoadNativeProtocolsOnlyMode()`** skips bundled REST defaults when only native sources are configured. **`Operation.protocolKind`** / **`nativeGraphQL`** / **`nativeGrpc`**; merged in **`loadSpec`** alongside OpenAPI/Discovery (or stub shell); **`execute`** dispatches before REST / OpenAPI→GraphQL.
- **GraphQL index without live introspection:** per-source **`schemaPath`** / **`introspectionPath`**, or **`CLAWQL_GRAPHQL_SCHEMA_PATH`** / **`CLAWQL_GRAPHQL_INTROSPECTION_PATH`** with **`CLAWQL_GRAPHQL_URL`**, load SDL or saved introspection JSON when HTTP introspection is blocked; **`endpoint`** remains the **`execute`** POST target.
- **Bundled GraphQL-only provider Linear:** **`linear`** in **`BUNDLED_PROVIDERS`** — vendored SDL from Linear’s MIT-licensed SDK (**`providers/linear/schema.graphql`**), **`CLAWQL_PROVIDER=linear`** or **`CLAWQL_BUNDLED_PROVIDERS=…,linear`** / **`all-providers`**; auth **`LINEAR_API_KEY`** / **`CLAWQL_LINEAR_API_KEY`**; refresh SDL via **`npm run fetch-linear-schema`**.
- **`registerSpecCacheShutdownHooks`** — **`SIGINT`** / **`SIGTERM`** invoke **`resetSpecCache`** (closes native gRPC channels).
- **`CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS=1`** — optional **`nativeProtocolMetrics`** object on **`GET /healthz`** (merge counts + execute ok/err counters).
- **Release-hardening test coverage for `clawql-ouroboros`:**
  - new suites for `InMemoryEventStore`, `mcp-hooks`, and `startSeedsPoller`,
  - expanded `ConvergenceCriteria` coverage for approval, stagnation-gate, and oscillation-gate scenarios,
  - expanded default-engine coverage for mixed-route execution and provider-evidence edge cases.

- **`charts/clawql-mcp` (0.5.2–0.5.3):** Kyverno **`ClusterPolicy`** (**`templates/kyverno-clusterpolicy-cosign.yaml`**); **`enabled`** default **true** as of **0.5.3**; **`matchReleaseNamespaceOnly`** for Docker Desktop (**`values-docker-desktop.yaml`**). **`scripts/kubernetes/local-k8s-docker-desktop.sh`** installs **Kyverno** (Helm chart pin **`CLAWQL_KYVERNO_CHART_VERSION`**, default **3.7.2**), rejects unsigned local image env vars, pulls signed **`ghcr.io/.../clawql-website`**, and applies the policy on the Kustomize path via **`helm template --show-only`**. **`make helm-lint`** templates with policy on and off.

- **Golden image / supply chain (GitHub Actions):** [`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml) runs **`repo-supply-chain`** (**OSV-Scanner**, **Trivy** fs, **Syft** CycloneDX artifact — aligned with CI **`supply-chain`**), then **one BuildKit** OCI layout export (`tar=false`) + **Trivy** (**HIGH** / **CRITICAL**, pinned **`ghcr.io/aquasecurity/trivy:0.59.1`**) **before any GHCR write**; **`skopeo copy`** pushes **that same OCI layout** (no second build), then **Cosign** and **`docker buildx imagetools create`** for **`latest`** / **`nightly`** / **`nightly-YYYYMMDD`** (**`id-token: write`** for OIDC). **npm** publish guidance: **[`docs/security/npm-supply-chain.md`](docs/security/npm-supply-chain.md)** ([#156](https://github.com/danielsmithdevelopment/ClawQL/issues/156)). [`.github/workflows/ci.yml`](.github/workflows/ci.yml) **`supply-chain`** uploads a **Syft** **CycloneDX JSON** artifact (**`sbom-cyclonedx-repository`**, image **`anchore/syft:v1.19.0`**). Operator notes: **`docker/README.md`** (verify / artifacts); matrix rows **5**, **8–10** in **[`docs/security/clawql-security-defense-deliverables.md`](docs/security/clawql-security-defense-deliverables.md)**.
- **CI:** **`supply-chain`** job runs **[OSV-Scanner](https://google.github.io/osv-scanner/)** (`ghcr.io/google/osv-scanner`, **`osv-scanner.toml`**) on the repo (recursive lockfile / manifest scan) and **[Trivy](https://github.com/aquasecurity/trivy)** filesystem **`vuln`** scan (**HIGH** / **CRITICAL**, **`.trivyignore`**); both gate **`test`** (and optional Ouroboros Postgres) on green.
- **Supply-chain hygiene:** npm **`overrides`** for transitive **`hono`** / **`vite`** / **`postcss`** / **`path-to-regexp`** (from MCP SDK + Vitest), **`clawql-ouroboros`** **`uuid@14`**, website **`postcss`** / **`fast-xml-parser`** overrides; **`bun.lock`** pinned **`yaml@1.10.3`** for swagger/oas stacks. **`GHSA-q4gf-8mx6-v5v3`** (Next.js ≥16.2.3) is documented in **`osv-scanner.toml`** / **`.trivyignore`** — docs site stays on **Next 16.1.7** + **`@opennextjs/cloudflare@1.18.x`** until MDX **`metadata`** exports work with Next **16.2+**.

## [4.1.0] - 2026-04-24

### Added

- **Docs:** **[`docs/graphql-mesh-node-compatibility.md`](docs/graphql-mesh-node-compatibility.md)** — Node **25** regression in **`@omnigraph/json-schema`** (`getUnionTypeComposers`: `Cannot set property input … only a getter`) when building GraphQL from the **full** bundled **`providers/slack/openapi.json`** (minimal Slack fixture in tests avoids it). Upstream: **[ardatan/graphql-mesh#9447](https://github.com/ardatan/graphql-mesh/issues/9447)**.
- **Onyx bundled provider + optional `knowledge_search_onyx`** ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)): `providers/onyx/openapi.yaml` (`onyx_send_search_message` → Onyx `POST /search/send-search-message`), merged as **`onyx`** in **`all-providers`**. Base URL **`ONYX_BASE_URL`**, auth **`ONYX_API_TOKEN`** / **`CLAWQL_ONYX_API_TOKEN`** (Bearer). When **`CLAWQL_ENABLE_ONYX=true`**, registers MCP tool **`knowledge_search_onyx`** (wrapper over **`execute`**). See **`providers/README.md`**, **`.env.example`**, guide **[`docs/onyx-knowledge-tool.md`](docs/onyx-knowledge-tool.md)**, and **[`docs/mcp-tools.md`](docs/mcp-tools.md)** (§ **`knowledge_search_onyx`**).
- **`clawql-ouroboros`** workspace package (`packages/clawql-ouroboros`): TypeScript **Seed** (Zod), **Wonder / Reflect**, **EvolutionaryLoop**, **ConvergenceCriteria**, **InMemoryEventStore**, **`ouroborosMcpTools`** (`mcp-hooks` entry), **`startSeedsPoller`** (`poller` entry). Documented in **[`docs/clawql-ouroboros.md`](docs/clawql-ouroboros.md)** with examples. Docs site: **`/ouroboros`**. **npm:** expanded **[`packages/clawql-ouroboros/README.md`](packages/clawql-ouroboros/README.md)** (standalone use, install paths, export table, limitations), **`LICENSE`** (Apache-2.0) in package **`files`**, **`homepage`** → **`https://docs.clawql.com/ouroboros`**, richer **`keywords`** / **`description`**. **Published** **`clawql-ouroboros@0.1.0`** to **`https://www.npmjs.com/package/clawql-ouroboros`**.
- **Optional Ouroboros MCP tools on `clawql-mcp`** ([#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141), [#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142)): **`CLAWQL_ENABLE_OUROBOROS=1`** registers **`ouroboros_create_seed_from_document`**, **`ouroboros_run_evolutionary_loop`**, **`ouroboros_get_lineage_status`** (from **`clawql-ouroboros/mcp-hooks`**). Workspace dependency **`clawql-ouroboros`**. Optional **`CLAWQL_OUROBOROS_DATABASE_URL`** → Postgres table **`clawql_ouroboros_events`**; otherwise in-memory **`EventStore`**. Documented in **[`docs/mcp-tools.md`](docs/mcp-tools.md)** and **`.env.example`**. Optional integration coverage: **`src/ouroboros/postgres-event-store.integration.test.ts`** (runs when **`CLAWQL_OUROBOROS_DATABASE_URL`** is set; otherwise **`describe.skipIf`**).
- **Optional MCP `notify` tool** ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)): when **`CLAWQL_ENABLE_NOTIFY=1`**, registers **`notify`** — a typed wrapper around Slack **`chat.postMessage`** (same stack as **`execute`** on **`chat_postMessage`**). Requires the Slack OpenAPI in the loaded spec and a bot token (**`CLAWQL_SLACK_TOKEN`**, …). Surfaces Slack **`ok: false`** JSON as a tool error. Documented in **[`docs/notify-tool.md`](docs/notify-tool.md)** (guide + examples), **[`docs/mcp-tools.md`](docs/mcp-tools.md)**, docs site page **`/notify`** (`website/src/app/notify/page.mdx`), and **[`README.md`](README.md)**. Remaining **`alert()`** scope: **[#150](https://github.com/danielsmithdevelopment/ClawQL/issues/150)**.
- **`memory_ingest` `toolOutputsFile`:** optional server-side read of a UTF-8 file path (allowlisted via **`CLAWQL_MEMORY_INGEST_FILE_ROOTS`**, default process **`cwd`**; **`CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES`**, **`CLAWQL_MEMORY_INGEST_FILE=0`** to disable) so very large log or slide-deck text does not need to be embedded in MCP tool JSON. Documented in **[`docs/mcp-tools.md`](docs/mcp-tools.md)**, **[`docs/memory-obsidian.md`](docs/memory-obsidian.md)**, **[`docs/integrations/cursor-vault-memory.md`](docs/integrations/cursor-vault-memory.md)**, the **clawql-vault-memory** skill, and the **Tools** page on the docs site.
- **Test-only Onyx REST stub:** **`CLAWQL_TEST_ONYX_FETCH_STUB`**, optional **`CLAWQL_TEST_ONYX_FETCH_BODY`**, **`CLAWQL_TEST_ONYX_FETCH_HTTP_OK`** in **`src/rest-operation.ts`**; stdio **`callTool("knowledge_search_onyx")`** coverage in **`src/server.test.ts`** ([#144](https://github.com/danielsmithdevelopment/ClawQL/issues/144)). **Streamable HTTP** and **gRPC** **`listTools`** include **`knowledge_search_onyx`** when **`CLAWQL_ENABLE_ONYX=1`**: **`src/server-http.test.ts`**, **`src/grpc-onyx-parity.test.ts`**.
- **`memory_ingest` + Onyx citations ([#130](https://github.com/danielsmithdevelopment/ClawQL/issues/130)):** optional **`enterpriseCitations`** array (capped) stored as a vault Markdown block; helpers in **`src/enterprise-citations.ts`** (`extractEnterpriseCitationsFromOnyxSearchJson`, **`enterpriseCitationsFromOnyxSearchToolText`**). Docs: **`docs/mcp-tools.md`**, **`docs/onyx-knowledge-tool.md`**, **`docs/memory-obsidian.md`**.
- **Onyx ingestion API in bundle ([#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120)):** **`POST /onyx-api/ingestion`** as **`onyx_ingest_document`** in **`providers/onyx/openapi.yaml`** for post-Paperless **`execute`** workflows; guide §5 in **`docs/onyx-knowledge-tool.md`**.

### Changed

- **`vitest.config.ts`:** resolve **`graphql`** to **`index.js`** (not **`index.mjs`**) under Vitest so **`graphql-compose`** and **`@omnigraph/json-schema`** share one **`GraphQLDirective`** class — fixes **`server-http`** and other tests that build in-process GraphQL ([#138](https://github.com/danielsmithdevelopment/ClawQL/issues/138)).
- **`src/notify-graphql-path.test.ts`:** use **`src/test-utils/fixtures/minimal-slack-chat-postmessage.json`** so the GraphQL path stays green on **Node 25** (full **`providers/slack/openapi.json`** still triggers **`@omnigraph/json-schema`** — see **[`docs/graphql-mesh-node-compatibility.md`](docs/graphql-mesh-node-compatibility.md)**). Full-Slack GraphQL tests tracked in **[#151](https://github.com/danielsmithdevelopment/ClawQL/issues/151)**.
- **`npm run fetch-provider-specs`:** optional **`ONYX_BASE_URL`** (and **`ONYX_API_TOKEN`** / **`CLAWQL_ONYX_API_TOKEN`** for authenticated **`/openapi.json`**) refreshes **`providers/onyx/openapi.yaml`** ([#143](https://github.com/danielsmithdevelopment/ClawQL/issues/143)); upstream output can be large — trim before committing if CI regresses.
- **`charts/clawql-mcp`:** **`enableOnyx`** / **`onyxBaseUrl`** ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)); **`enableOuroboros`** / **`ouroborosDatabaseUrl`** ([#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141), [#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142)). Chart **0.4.0** (**`appVersion` 4.1.0**). **`docs/deployment/helm.md`** and **`charts/clawql-mcp/README.md`** updated.
- **`notify` / Slack `chat_postMessage` default `execute` fields** ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)): default projection now includes **`error`** and **`warning`** so Slack **`ok:false`** bodies are not dropped before **`notify`** surfaces **`error` + `slack`**. Expanded **`src/clawql-notify.test.ts`** (mocked **`node-fetch`** on multi-spec REST, **`thread_ts`** form body, empty **`channel`/`text`**). Future test work: **[`docs/backlog/notify-tool-test-backlog.md`](docs/backlog/notify-tool-test-backlog.md)**.

- **Node / CI:** `engines` **>=22**; workflows use **25** in `actions/setup-node` and test on **22 / 24 / 25** (Node 20 removed). **Docker** build: **`node:25-`** (`bookworm-slim` / `alpine`); **Distroless** image **`gcr.io/distroless/nodejs24-debian13`**. Bumped **docker/build-push-action**, **docker/metadata-action**, **docker/login-action**, and **docker/setup-buildx-action** to current majors so those steps no longer run on deprecated Node 20. (Node **26** is not published on `nodejs.org` dist or in distroless yet; adopt when available.)

## [4.0.0] - 2026-04-21

### Added

- **`CLAWQL_BUNDLED_PROVIDERS`:** merge only the requested bundled vendor ids and/or **`google`** (expands to the on-disk Google Cloud manifest). The explicit alternative to **`all-providers`**; no other “partial” default.
- **`execute`** on **`multipart/form-data`** operations: **`Buffer`/`Uint8Array`/`Blob`/`File`**, optional **`{field}FileName`** for filenames ([#124](https://github.com/danielsmithdevelopment/ClawQL/issues/124)).
- **`CLAWQL_PROVIDER_AUTH_JSON`:** single JSON env mapping merged **`specLabel`** → credentials (string Bearer/Token or header object), with **`google`** as catch-all for Google Cloud Discovery slugs. When set, **`Authorization`** in **`CLAWQL_HTTP_HEADERS`** is ignored so each provider can authenticate independently; other keys from **`CLAWQL_HTTP_HEADERS`** still apply. See **`src/auth-headers.ts`**.

### Changed

- The **only** built-in default merge (no `CLAWQL_SPEC_PATHS` / `CLAWQL_BUNDLED_PROVIDERS` / `CLAWQL_PROVIDER` that selects a merge) is **`all-providers`**. Custom subset = **`CLAWQL_BUNDLED_PROVIDERS=…`** (ids) or **`CLAWQL_SPEC_PATHS=…`**.

### Breaking

- **`default-multi-provider` merged preset removed** — use **`CLAWQL_BUNDLED_PROVIDERS=…`**, or **`CLAWQL_SPEC_PATHS=…`**, for a smaller merge. **`CLAWQL_PROVIDER=google`**, **`atlassian`**, **`all-providers`** remain.
- **`CLAWQL_GOOGLE_CLOUD_SPECS`** and **`CLAWQL_GOOGLE_TOP50_SPECS`** no longer select a merged spec by themselves. Use **`CLAWQL_PROVIDER=google`**, **`CLAWQL_BUNDLED_PROVIDERS=google`**, or **`CLAWQL_SPEC_PATHS=…`**. (Workflows such as `npm run workflow:gcp-multi` set **`CLAWQL_PROVIDER=google`**.)
- **Merged Google Cloud preset** is **`CLAWQL_PROVIDER=google`**. The old id **`google-top50`** is accepted as a **deprecated alias** in bundled provider groups and in **`CLAWQL_BUNDLED_PROVIDERS`**.
- **Standalone Google single-file `CLAWQL_PROVIDER`** is removed: use merged **`google`**, or **`CLAWQL_SPEC_PATH`** / **`CLAWQL_DISCOVERY_URL`** for a single Discovery doc.
- **Helm / deploy defaults** that used **`google-top50`** use **`all-providers`**, **`google`**, or explicit list env as documented in **`values.yaml` / `values-docker-desktop.yaml`**.

## [3.4.1] - 2026-04-19

### Documentation

- **Docs site (`docs.clawql.com`) agent discovery:** **`/.well-known/api-catalog`** (RFC 9727 Linkset; **`service-desc`**, **`service-doc`**, **`status`** → **`/api/health`**), **`/.well-known/openid-configuration`** and **`/.well-known/oauth-authorization-server`** (OAuth/OIDC; Google defaults + env overrides), **`/.well-known/oauth-protected-resource`** (RFC 9728), **`/.well-known/mcp/server-card.json`** (MCP Server Card), **`/.well-known/agent-skills/index.json`** (Agent Skills Discovery v0.2.0; build script + published **`SKILL.md`** artifacts). **WebMCP:** client registration via **`navigator.modelContext.registerTool`** (`WebMcpRegister` — navigate, page context, scroll to section).

## [3.4.0] - 2026-04-18

### Added

- **Enterprise `audit` tool ([#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)):** optional MCP tool when **`CLAWQL_ENABLE_AUDIT=1`** — in-process ring buffer (`append` / `list` / `clear`); not on disk. Design: **[docs/enterprise-mcp-tools.md](docs/enterprise-mcp-tools.md)**. **Helm:** **`charts/clawql-mcp`** adds **`enableAudit`** (default **`false`**) → **`CLAWQL_ENABLE_AUDIT=1`**.

- **Cuckoo observability ([#30](https://github.com/danielsmithdevelopment/ClawQL/issues/30)):** **`CLAWQL_CUCKOO_METRICS=1`** records rebuild stats and optional lookup verification vs **`vault_chunk`**; **`GET /healthz`** with **`CLAWQL_HEALTHZ_MEMORY_ARTIFACTS=1`** adds **`cuckooMetrics`** and **`cuckooFilterPersistedAt`** when Cuckoo is enabled.
- **`memory_ingest` / `_INDEX_*`:** each ingest section includes a **Provenance** block; new notes get **`clawql_ingest_created`** in frontmatter; provider hub **`_INDEX_{Provider}.md`** adds **Summary**, **By folder** (paths + wikilinks), and **All notes (A–Z)** ([#68](https://github.com/danielsmithdevelopment/ClawQL/issues/68)).
- **`memory_ingest`:** optional **`merkleSnapshotBefore`**, **`merkleSnapshot`**, **`merkleRootChanged`**, and **`cuckooMembershipReady`** in the JSON result when **`CLAWQL_MERKLE_ENABLED`** / **`CLAWQL_CUCKOO_ENABLED`** apply and **`memory.db`** sync succeeds after a non-skipped write.
- **`ingest_external_knowledge`:** real imports — **`documents[]`** for bulk Markdown ( **`dryRun`** defaults **`true`**; max 50 files ) and optional **`source: "url"`** + **`url`** when **`CLAWQL_EXTERNAL_INGEST_FETCH=1`**; vault lock + **`memory.db`** sync + **`_INDEX_`** after writes ([#40](https://github.com/danielsmithdevelopment/ClawQL/issues/40)). No payload still returns roadmap **`stub`**; optional **`merkleSnapshot`** / **`cuckooMembershipReady`** when the sidecar is warm.
- **HTTP `GET /healthz`:** when **`CLAWQL_HEALTHZ_MEMORY_ARTIFACTS=1`**, optional **`merkleSnapshot`**, **`cuckooMembershipArtifactsEnabled`**, and (with Cuckoo) **`cuckooMetrics`** / **`cuckooFilterPersistedAt`** (not enabled by default — keeps probes fast).

### Changed

- **Local k8s auth script:** **`scripts/kubernetes/k8s-docker-desktop-set-mcp-auth.sh`** replaces the misleading GitHub-only name; it syncs **GitHub + optional Cloudflare + Google** tokens into Secret **`clawql-github-auth`**. **`scripts/kubernetes/k8s-docker-desktop-set-github-token.sh`** remains as a thin wrapper. Docs: **`docker/README.md`**, **`README.md`**, **`website` `/kubernetes`**.

- **`ingest_external_knowledge` (URL mode):** responses are formatted for the vault — **JSON** pretty-printed, **HTML** converted to Markdown via **node-html-markdown**, plain text fenced; frontmatter gains **`clawql_external_ingest_kind`**.

### CI

- **Prettier autofix:** optional repository secret **`PRETTIER_AUTOFIX_TOKEN`** (PAT with repo **Contents** write) used for checkout/push so the post-autofix commit triggers a full **CI** run (pushes with **`GITHUB_TOKEN`** do not re-run workflows).

### Documentation

- **[`docs/website/website-caching.md`](docs/website/website-caching.md)** — edge/browser caching for **`docs.clawql.com`**: **`next.config.mjs`** `Cache-Control` ( **`s-maxage`** / **`stale-while-revalidate`** ) and **`public/_headers`** for static assets.
- **Case study:** **[`docs/case_studies/cloudflare-docs-site-mcp-workflow.md`](docs/case_studies/cloudflare-docs-site-mcp-workflow.md)** — end-to-end **`docs.clawql.com`** deploy using **`search`**, **`execute`**, **`memory_recall`**, **`memory_ingest`**; failures (Worker **`fs`**, token scopes), fixes, and insights. Website: **`/case-studies/cloudflare-docs-mcp`**.
- **Case study:** **[`docs/case_studies/vault-memory-github-session-2026-04.md`](docs/case_studies/vault-memory-github-session-2026-04.md)** — vault **`memory_ingest`** batch, GitHub triage, prioritization, shipping **`audit`** ([#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)). Website: **`/case-studies/vault-memory-github-session-2026-04`**.
- **[`docs/roadmap/knowledge-lake-roadmap.md`](docs/roadmap/knowledge-lake-roadmap.md)** — product/technical roadmap for **full GitHub repo** ingest (code, docs, issues, configs) and **Notion / Confluence / Linear / Jira** connectors on top of the vault + **`memory.db`** pipeline.

## [3.3.0] - 2026-04-17

### CI

- **Helm / Kustomize:** **`workflow-scripts`** installs Helm **v3.17.0** and runs **`make lint-k8s-manifests`** (**`helm-lint`** + **`kustomize-local-lint`**).

- **Docker publish** (`.github/workflows/docker-publish.yml`): **daily** at **06:00 UTC** and **`workflow_dispatch`** — builds `docker/Dockerfile`, pushes to **`ghcr.io/danielsmithdevelopment/clawql-mcp`** with tags **`latest`**, **`nightly`**, **`sha-*`**, and **`nightly-YYYYMMDD`** on scheduled runs; GHA BuildKit cache enabled; **multi-platform** **`linux/amd64`** + **`linux/arm64`** (Docker Desktop on Apple Silicon).

- **Prettier autofix** job on **same-repo pull requests**: when the **Lint & format** job fails, applies **`npm run format`** and pushes a single commit **`style: apply Prettier [prettier-autofix]`** if there are diffs. **Loop guards:** job runs only when `lint` failed; skips if the actor is **`github-actions[bot]`**; skips if **`[prettier-autofix]`** is already in **HEAD**; does not commit when Prettier makes no changes. **Fork PRs** are excluded (token cannot push to forks).

### Changed

- **Helm chart** **`charts/clawql-mcp`**: **`enableCache`** defaults to **`true`** (sets **`CLAWQL_ENABLE_CACHE=1`**) so the in-process **`cache`** tool is registered unless **`--set enableCache=false`**.

- **`make local-k8s-mcp-delete`:** removes **`deployment/clawql-mcp-http`** and **`svc/clawql-mcp-http`** in **`clawql`** so **Helm** can install after a prior **`kubectl apply`** / Kustomize deploy; **`local-k8s-docker-desktop.sh`** prints this hint when **`helm upgrade`** fails.

- **`make local-k8s-up`:** defaults to **Helm** (**`charts/clawql-mcp/values-docker-desktop.yaml`**). **`CLAWQL_LOCAL_K8S_INSTALLER=kustomize`** uses **`docker/kustomize/overlays/local`** (no Helm). **`vault.hostPath`** (Helm) / JSON patch (Kustomize) mount **`~/.ClawQL`**. **`CLAWQL_LOCAL_K8S_BUILD_IMAGE=1`** builds **`clawql-mcp:latest`** locally.
- **`memory_recall`:** when **`CLAWQL_MERKLE_ENABLED=1`**, JSON includes **`merkleSnapshot`**; when **`CLAWQL_CUCKOO_ENABLED=1`** and embeddings run, vector-ranked chunks are filtered by the Cuckoo membership filter with **`cuckooVectorChunksDropped`** ([#81](https://github.com/danielsmithdevelopment/ClawQL/issues/81)).
- **Developer tooling:** root **`npm run format`** / **`format:check`** now includes the docs site: **`npm run format --prefix website`** (Prettier on **`website/`** `mdx`/`ts`/`tsx`). **`.prettierignore`** no longer skips all of **`website/`**—only build artifacts (**`.next/`**, **`node_modules/`**, etc.). CI runs **`npm ci --prefix website`** before **`format:check`** so site Prettier plugins resolve.
- **Codegen:** **`pregenerate-graphql`** and **`pregenerate-google-top50-graphql`** use **`tsx`** (not Bun). Added **`npm run graphql`** → **`tsx src/graphql-proxy.ts`** for the standalone GraphQL proxy documented in the README.
- **`cache` tool:** storage is **in-process only** (no SQLite / no `CLAWQL_CACHE_DB_PATH`). Durable memory remains **`memory_ingest`** / **`memory_recall`**.
- **`cache` tool:** **LRU** eviction when **`CLAWQL_CACHE_MAX_ENTRIES`** is reached (default **10_000**); `get` / `set` move keys to most-recently-used.

### Added

- **Helm chart** **`charts/clawql-mcp`**: deploy **`clawql-mcp-http`** with configurable image (**GHCR** by default), Service (**LoadBalancer** / **ClusterIP**), optional **Ingress**, **`/vault`** via PVC or **`vault.hostPath`**, gRPC env toggles; **`values-docker-desktop.yaml`** for **`make local-k8s-up`**; **`make helm-lint`**. Docs: **`docs/deployment/helm.md`**; site: **`/helm`**.
- **Cuckoo filter + Merkle snapshot** for hybrid `memory.db` ([#25](https://github.com/danielsmithdevelopment/ClawQL/issues/25), [#37](https://github.com/danielsmithdevelopment/ClawQL/issues/37)): enable with **`CLAWQL_CUCKOO_ENABLED=1`** and **`CLAWQL_MERKLE_ENABLED=1`**; modules **`src/cuckoo-filter.ts`**, **`src/merkle-tree.ts`**, **`src/memory-artifacts.ts`**; helpers **`chunkIdMaybeInMemoryIndex`**, **`loadVaultMerkleSnapshotFromDb`**. Postgres migration **2** adds **`clawql_cuckoo_chunk_membership`** and **`clawql_vault_merkle`** when using **`CLAWQL_VECTOR_DATABASE_URL`**.
- **`cache` MCP tool** ([#75](https://github.com/danielsmithdevelopment/ClawQL/issues/75)): opt-in via **`CLAWQL_ENABLE_CACHE`**; operations **`set` / `get` / `delete` / `list` / `search`**; **in-process `Map` only** (not persisted — use **`memory_ingest`** / **`memory_recall`** for vault); **`CLAWQL_CACHE_MAX_VALUE_BYTES`** per value (default **1 MiB**). Implementation: [`src/clawql-cache.ts`](src/clawql-cache.ts).
- **`src/clawql-optional-flags.ts`**: Zod-validated optional feature flags (`ENABLE_GRPC`, `CLAWQL_EXTERNAL_INGEST`, planned **`CLAWQL_ENABLE_*`** for cache/schedule/notify/vision); **`src/external-ingest.ts`** uses the shared parser for **`CLAWQL_EXTERNAL_INGEST`**. See [#79](https://github.com/danielsmithdevelopment/ClawQL/issues/79).

### Documentation

- **`docs/deployment/helm.md`**: Helm install, values table, relationship to Kustomize.
- **`docs/benchmarks/archive/`**: short summaries + script links for archived workflow runs (formerly root `gcp-multi-test.md`, `multi-provider-test.md`, `TEST_RESULTS_2026-03-19.md`, and **`docs/JIRA_WORKFLOW_TOKEN_RESULTS_2026-03-19.md`**); benchmark stats JSON **`workflowOutput.source`** now points at the archive note.
- **`docs/cache-tool.md`**: canonical **`cache`** vs **`memory_*`**, LRU semantics, env vars, multi-replica; cross-links from **`docs/mcp-tools.md`**, **`docs/memory-obsidian.md`**, **`docs/integrations/cursor-vault-memory.md`**, **`docs/deployment/deploy-k8s.md`**; website routes **`/cache`** and **`/tools`** (`website/src/app/cache`, `website/src/app/tools`) and nav/sitemap updated.
- **`docs/deployment/deploy-k8s.md`**: TLS/mTLS/mesh and observability notes for port **50051**; gRPC tracking remains on [#67](https://github.com/danielsmithdevelopment/ClawQL/issues/67).
- **`docs/mcp-tools.md`**: optional tool flags table + pointer to `clawql-optional-flags.ts`.

## [3.2.3] - 2026-04-16

### Fixed

- **Kubernetes:** **`dev`** and **`prod`** Kustomize overlays were patching **`clawql-mcp-http`** with **HTTP only**, so **gRPC 50051** was missing from the Service. Overlays now publish **`grpc` / 50051** like **base** and **local**, so **`model_context_protocol.Mcp`** is reachable on the Service IP without **`kubectl port-forward`**.
- **`mcp-grpc-transport`:** decode **`google.protobuf.Struct`** when **`fields`** is a **`Map`** (not only a plain object), so **`CallTool`** tool arguments such as **`memory_recall`** `query` are not dropped on the server.
- **`mcp-grpc-transport`:** patch **`@grpc/proto-loader`** **`FileDescriptorProto`** output used for **`grpc.reflection.v1.ServerReflection`** so strict clients (**grpcurl**, **`jhump/protoreflect`**) resolve map entries, cross-package **`type_name`**, and well-known type dependencies correctly.

### Added

- **`scripts/dev/grpc-memory-recall.mjs`:** call **`memory_recall`** via **`model_context_protocol.Mcp/CallTool`** with **protobufjs**-encoded **`google.protobuf.Struct`** tool arguments (avoids losing nested **`Value`** fields when using **`@grpc/proto-loader`** serialization alone).
- **Tests:** **`src/grpc-memory-tools.test.ts`** exercises **`memory_ingest`** and **`memory_recall`** over gRPC **`CallTool`** (protobufjs request encoding, temp vault + minimal OpenAPI spec).
- **`packages/mcp-grpc-transport`:** **`proto-loader-reflection-patch`** module and tests (**`proto-loader-reflection-patch.test.ts`**, **`mcp-protobuf-struct.test.ts`**).
- **Documentation site (`website/`):** **`sitemap.xml`**, **`robots.txt`**, canonical site URL helper (**`NEXT_PUBLIC_SITE_URL`** / **`VERCEL_URL`**), richer page metadata for SEO, **gRPC and Kubernetes** reference card.

### Changed

- **Dependency:** **`mcp-grpc-transport`** **`^0.1.2`** (reflection descriptor patches; **protobufjs** for **`Struct`** tooling in scripts and tests).

### Documentation

- **`docs/deployment/deploy-k8s.md`**, **`docker/README.md`**, root **`README.md`**, **`packages/mcp-grpc-transport/README.md`**: document dual **http** + **grpc** Service ports and when port-forward is still useful.
- **Cursor:** **`.cursor/rules/clawql-vault-memory.mdc`**, **`.cursor/skills/clawql-vault-memory/`**, and **`docs/integrations/cursor-vault-memory.md`** — project rule, skill, and guide for **`memory_ingest`** / **`memory_recall`** in Cursor.

## [3.2.1] - 2026-04-17

### Fixed

- **Docker / Kubernetes:** the Distroless runtime copied **`node_modules`** but not **`packages/mcp-grpc-transport`**, so the workspace symlink **`node_modules/mcp-grpc-transport`** pointed at a missing path and **`clawql-mcp-http`** crashed with **`ERR_MODULE_NOT_FOUND`**. The Dockerfile now copies **`packages/mcp-grpc-transport`** next to **`node_modules`**.

## [3.2.0] - 2026-04-16

### Added

- **Optional gRPC MCP ([#67](https://github.com/danielsmithdevelopment/ClawQL/issues/67)):** depends on **[`mcp-grpc-transport`](https://www.npmjs.com/package/mcp-grpc-transport)** **`^0.1.0`** (also developed in [`packages/mcp-grpc-transport`](packages/mcp-grpc-transport)). When **`ENABLE_GRPC=1`**, **`clawql-mcp-http`** starts **`maybeStartGrpcMcpServer`** with a shared **`createRegisteredMcpServer`** factory so stdio, Streamable HTTP, and gRPC expose the same tools. Listens on **`GRPC_PORT`** (default **50051**): **`grpc.health.v1.Health`**, **`model_context_protocol.Mcp`**, **`mcp.transport.v1.Mcp.Session`**; optional **`ENABLE_GRPC_REFLECTION=1`**. See root **[README](README.md)** and **[`packages/mcp-grpc-transport/README.md`](packages/mcp-grpc-transport/README.md)**.
- **`mcp-grpc-transport` — `Mcp.Session` (JSON-RPC stream):** **`JsonRpcLine`** optional **`related_request_id`** / **`resumption_token`**; **`GrpcMcpSessionTransport`** supplies **`MessageExtraInfo.requestInfo.headers`** and **`authInfo`** when **`Authorization: Bearer`** is present; **`sessionId`** from **`mcp-session-id`** metadata.
- **`mcp-grpc-transport` — protobuf MCP parity:** **`CancelTask`**, list **pagination**, **`common.log_level`**, **`notifications/message`** → **`log_message`**, metadata routing hints, **`CallTool`** **`task_id`** / progress, **`dependent_requests`** helpers (**`runUnaryWithDependents`**, **`fulfillDependentRequests`**), etc.
- **Kustomize:** **`docker/kustomize/overlays/grpc-enabled/`** sets **`ENABLE_GRPC=1`** and uses **Kubernetes `grpc`** readiness/liveness probes on port **50051**.

### Changed

- **`clawql-mcp` dependency:** **`mcp-grpc-transport`** is **`^0.1.0`** from the npm registry (workspace-compatible for local **`npm install`** in this repo).

## [3.1.0] - 2026-04-16

### Added

- **MCP `ingest_external_knowledge` ([#40](https://github.com/danielsmithdevelopment/ClawQL/issues/40)):** stub tool + **`CLAWQL_EXTERNAL_INGEST=1`** opt-in for roadmap JSON (no network I/O). Documents how future bulk imports into the vault would align with **`memory_ingest`** / **`memory_recall`** / **`memory.db`**. See **[`docs/external-ingest.md`](docs/external-ingest.md)**.
- **Vault provider index ([#38](https://github.com/danielsmithdevelopment/ClawQL/issues/38)):** after successful **`memory_ingest`**, **`updateProviderIndexPage`** writes **`_INDEX_{Provider}.md`** under the recall scan root (default **`Memory/_INDEX_ClawQL.md`**) with **`[[wikilinks]]`** to scanned notes. **Content fingerprint** in an HTML comment skips rewrites when the list is unchanged (avoids NFS/git noise). Disable with **`CLAWQL_MEMORY_INDEX_PAGE=0`**; set **`CLAWQL_MEMORY_INDEX_PROVIDER`** for the label/filename. Module: **`src/memory-provider-index.ts`**.
- **Hybrid `memory_recall` (issues [#26](https://github.com/danielsmithdevelopment/ClawQL/issues/26), [#28](https://github.com/danielsmithdevelopment/ClawQL/issues/28)):** pluggable **vector backends** — **`CLAWQL_VECTOR_BACKEND=sqlite`** stores float32 vectors in **`vault_chunk.embedding`** (sql.js; in-process cosine KNN), or **`postgres`** stores vectors in **Postgres + pgvector** (`clawql_memory_chunk_vector`, cosine via `<=>`) using **`CLAWQL_VECTOR_DATABASE_URL`**. Same OpenAI-compatible **`/embeddings`** pipeline (**`CLAWQL_EMBEDDING_*`**). Dependency: **`pg`** for the Postgres backend.
- **Issue [#28](https://github.com/danielsmithdevelopment/ClawQL/issues/28) (operator / MCP):** **[`docs/memory-db-hybrid-implementation.md`](docs/memory-db-hybrid-implementation.md)** §7 now lists **`CLAWQL_VECTOR_*`**, **`CLAWQL_EMBEDDING_*`**, **`CLAWQL_MEMORY_VECTOR_*`**, optional **`CLAWQL_MCP_LOG_TOOLS`** (shape-only logging for **`memory_ingest`** / **`memory_recall`**), and **reserved** **`CLAWQL_CUCKOO_*`** (pending [#25](https://github.com/danielsmithdevelopment/ClawQL/issues/25)). **`.env.example`** documents the same.

### Changed

- **CI & supply chain:** ESLint + Prettier for `src/` and selected docs; Vitest **coverage** in CI; GitHub Actions pinned to commit SHAs; **Dependabot** for npm and GitHub Actions; **CodeQL** (JavaScript/TypeScript) on push/PR + weekly; weekly **`npm audit --audit-level=high`** (manual dispatch supported). **`npm audit fix`** applied so the audit job starts green. **Layout:** lint and **ShellCheck + actionlint** run in parallel; the **test matrix** waits for both (**fail early**); matrix **`fail-fast: true`** cancels remaining Node versions on first failure; **ESLint / Prettier** use restored caches in CI; **CodeQL** stays in its own workflow so **scheduled** scans do not run the full matrix.
- **Dependencies (major):** TypeScript 6, ESLint 10, Zod 4, Express 5 (aligned with **`@modelcontextprotocol/sdk`**), Prettier 3.8, **`@graphql-mesh/utils`** and **graphql** patch bumps; **GitHub Actions** pinned to **checkout** v6, **setup-node** v6, **codeql-action** v4; dev **`@types/node`** 22. MCP **`execute`** tool args use **`z.record(z.string(), z.unknown())`** for Zod 4.
- **Docs:** **[`docs/memory-obsidian.md`](docs/memory-obsidian.md)**, **[`docs/vector-search-design.md`](docs/vector-search-design.md)**, **[`docs/memory-db-hybrid-implementation.md`](docs/memory-db-hybrid-implementation.md)**, and **[`docs/memory-db-schema.md`](docs/memory-db-schema.md)** now describe **`memory_recall`** as hybrid (lexical + optional OpenAI-compatible embeddings + wikilinks), **`vault_chunk`** vectors when enabled, and distinguish **shipped** vault vectors from **future** spec **`search`** semantics.
- **Hybrid memory architecture:** **[`docs/hybrid-memory-backends.md`](docs/hybrid-memory-backends.md)** documents SQLite-as-default beside vault files, optional Postgres for scale, versioned **`clawql_pg_schema_migrations`**, and hooks for future **Cuckoo** / **Merkle** data. **`embeddingVectorDimension()`** lives in **`memory-embedding.ts`**; stdio + HTTP entrypoints register **Postgres pool shutdown** on **`SIGINT`/`SIGTERM`**.
- **Vector backend parity:** with **`postgres`**, embeddings default to **dual-write** into **`vault_chunk.embedding`** (opt out with **`CLAWQL_MEMORY_VECTOR_DUAL_WRITE=0`**). **`memory_recall`** tries **pgvector** first, then in-process ranking over **`memory.db`** BLOBs when present. **SQLite `memory.db` is still optional** (`CLAWQL_MEMORY_DB=0` or no vault disables it entirely).
- **`effectiveVectorBackend()`:** **`CLAWQL_VECTOR_BACKEND=postgres`** without **`CLAWQL_VECTOR_DATABASE_URL`** now **falls back to SQLite vectors** (with a one-time warning) instead of disabling embeddings. **[`docs/hybrid-memory-backends.md`](docs/hybrid-memory-backends.md)** documents tradeoffs (sqlite vs postgres, dual-write, fallback).

## [3.0.1] - 2026-04-16

### Fixed

- **Packaging:** `npm run build` now removes **`dist/`** before **`tsc`**, so deleted source files do not leave stale **`dist/*.js`** in the published tarball (fixes stray artifacts from the 3.0.0 refactor).

## [3.0.0] - 2026-04-16

### Breaking

- **Unified GraphQL only ([#34](https://github.com/danielsmithdevelopment/ClawQL/issues/34)):** The standalone **`clawql-graphql`** npm binary and split-process deployment using **`GRAPHQL_URL`** are removed. Single-spec **`execute`** always uses in-process OpenAPI→GraphQL; **`clawql-mcp-http`** exposes **`/graphql`** on the same port as **`/mcp`**. Docker Compose, Kubernetes, and Cloud Run templates deploy **one** workload. Remove any second GraphQL container/service and unset **`GRAPHQL_URL`**, **`CLAWQL_COMBINED_MODE`**, and **`CLAWQL_GRAPHQL_EXTERNAL_URL`** if you had added them during the migration period.

### Added

- **`memory.db`** (SQLite via **sql.js**) colocated with the vault: **`vault_document`**, **`vault_chunk`** (`paragraph_v1` chunking contract), and **`wikilink_edge`** rows; rebuilt after successful **`memory_ingest`**, merged into **`memory_recall`** wikilink traversal when enabled. Operator reference: **`docs/memory-db-schema.md`**.

## [2.0.0] - 2026-04-14

### Breaking

- **Default bundled API merge** (when no `CLAWQL_SPEC_PATH`, `CLAWQL_SPEC_URL`, `CLAWQL_DISCOVERY_URL`, `CLAWQL_SPEC_PATHS`, or `CLAWQL_PROVIDER` is set): the third merged vendor is now **GitHub** instead of **Jira**. Search hits and `operationId` availability change accordingly. The `default-multi-provider` preset matches this bundle. To approximate the previous mix or add Jira back, set **`CLAWQL_PROVIDER=all-providers`**, **`CLAWQL_PROVIDER=atlassian`**, and/or **`CLAWQL_SPEC_PATHS`** explicitly (see README and `.env.example`).

### Added

- **MCP tools** **`sandbox_exec`** (Cloudflare Sandbox via optional bridge Worker), **`memory_ingest`**, and **`memory_recall`** when **`CLAWQL_OBSIDIAN_VAULT_PATH`** is set (Obsidian vault; validated at startup when configured).
- **HTTP MCP**: CORS support for browser clients (`CLAWQL_CORS_ALLOW_ORIGIN`), Cloudflare Worker proxy notes, and related K8s/script alignment.
- **Per-vendor auth** for merged calls: prefer **`CLAWQL_GOOGLE_ACCESS_TOKEN`**, **`CLAWQL_CLOUDFLARE_API_TOKEN`**, and **`CLAWQL_GITHUB_TOKEN`** where applicable; **`GOOGLE_ACCESS_TOKEN`** is for Google Discovery slugs only (not mixed with other providers). **`CLAWQL_BEARER_TOKEN`** is scoped to GitHub, Cloudflare, Atlassian/Jira, and optional Tika/Gotenberg — not Slack, Sentry, n8n, or GCP slugs (see `.env.example` and **`src/auth-headers.ts`**).
- **ClawQL documentation site** under `website/` (branding, deployment notes).
- **Design docs** for future vector search (SQLite / Postgres backends).

### Changed

- **Centralized auth header** resolution for `execute` / REST paths (`auth-headers` helpers and tests).
- **Deploy templates**: Kubernetes starter and Cloud Run examples aligned with vault path and sandbox-related environment variables.

### Docs

- Full MCP surface documented (**`docs/mcp-tools.md`** and README cross-links); ClawQL Parity v1 marked complete for unified MCP vs ClawQL-Agent.

## [1.0.2] - 2026-04-06

- `execute`: default output fields for GitHub pulls; honor `fields` on REST and multi-spec paths (git `4f80846` and related PRs).

## [1.0.1] - 2026-04-06

- Patch release on npm between 1.0.0 and 1.0.2.

## [1.0.0] - 2026-03-26

- Initial public publish of **`clawql-mcp`**.
