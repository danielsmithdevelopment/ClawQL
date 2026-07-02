# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Docling Helm reference deployment + classifier** ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)): opt-in **`documentPipeline.docling`** (`quay.io/docling-project/docling-serve-cpu:v1.14.3`), **`DOCLING_BASE_URL`** wiring, **`docling.localhost`** ingress; MCP **`classify_document`** when **`CLAWQL_ENABLE_IDP_CLASSIFIER=1`**; reference classifier HTTP sample + **`docker/compose/docling-classifier.compose.yml`**; **`DEFAULT_IDP_PIPELINE`** Docling layout-parse hop.
- **LangExtract extraction layer** ([#246](https://github.com/danielsmithdevelopment/ClawQL/issues/246)): MCP **`extract_document`** when **`CLAWQL_ENABLE_LANGEXTRACT=1`** — grounded extractions via **`LANGEXTRACT_BASE_URL`** or local heuristic; reference Python sidecar (`deployment/samples/langextract-http/`), threat model, onboarding doc. Live-mode pip deps documented in sample README (no committed `requirements.txt` — OSV supply-chain gate).
- **Vault default provider secrets** ([#241](https://github.com/danielsmithdevelopment/ClawQL/issues/241)): default **`envFromSecret: clawql-provider-env`**, full IDP provider KV catalog, Helm **`secretSourcing.externalSecrets`**, expanded **`import-dotenv-to-vault`**, docs **[`docs/deployment/vault-provider-secrets.md`](docs/deployment/vault-provider-secrets.md)**.
- **Dashboard Vault UI for provider secrets** ([#242](https://github.com/danielsmithdevelopment/ClawQL/issues/242)): **Provider secrets** panel — friendly labels for all 15 provider keys, Vault **`clawql/providers`** read/write, Kubernetes Secret sync + rollout restart; Helm **`dashboard.vault.path: clawql/providers`**.
- **KEDA NATS JetStream worker** ([#257](https://github.com/danielsmithdevelopment/ClawQL/issues/257)): optional `nats.worker` Deployment + `nats.keda` ScaledObject for HITL resume consumer lag; bootstrap Job + `nats/cli.js` / `nats/bootstrap-cli.js` in **clawql-automation**; docs **[`docs/deployment/nats-keda-worker.md`](docs/deployment/nats-keda-worker.md)**.
- **IDP pipeline runner** ([#307](https://github.com/danielsmithdevelopment/ClawQL/issues/307)): MCP **`run_idp_pipeline`** when **`CLAWQL_ENABLE_IDP_PIPELINE=1`** — synchronous **`DEFAULT_IDP_PIPELINE`** execution with per-hop retries, Merkle snapshots, and **`onPipelineHop`** hook; docs **[`docs/mcp/idp-pipeline-runner.md`](docs/mcp/idp-pipeline-runner.md)**.
- **NATS JetStream workflow events** ([#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254), [#127](https://github.com/danielsmithdevelopment/ClawQL/issues/127)): opt-in publish (`CLAWQL_NATS_ENABLE_PUBLISH=1`) for HITL/workflow lifecycle; JetStream consumer (`CLAWQL_NATS_ENABLE_CONSUMER=1` + `CLAWQL_NATS_CONSUMER_RESUME_WORKFLOW=1`) resumes Argo workflows on `hitl.completed`; ConeShare viewer events on `clawql.document.*`.
- **Langfuse eval → Ouroboros** ([#250](https://github.com/danielsmithdevelopment/ClawQL/issues/250)): **`CLAWQL_ENABLE_LANGFUSE_EVAL=1`** + **`CLAWQL_ENABLE_OUROBOROS=1`** — **`POST /observability/langfuse/webhook`**, MCP **`ouroboros_propose_seed_revision_from_eval`**; default dry-run (`CLAWQL_LANGFUSE_EVAL_AUTO_APPLY` off); docs **[`docs/mcp/langfuse-eval-ouroboros.md`](docs/mcp/langfuse-eval-ouroboros.md)**.

### Documentation

- **`docs/mcp/langfuse-eval-ouroboros.md`**, IDP matrix #250 → Shipped.
- **HITL multi-reviewer RBAC** ([#249](https://github.com/danielsmithdevelopment/ClawQL/issues/249)): CE vs Enterprise capability matrix, ClawQL role mapping, CE workarounds, **dual-project two-person rule** pattern, Helm BYO Label Studio pointers — [`docs/mcp/hitl-label-studio.md`](docs/mcp/hitl-label-studio.md#14-multi-reviewer-rbac-ce-vs-enterprise).
- **`docs/deployment/nats-keda-worker.md`**, Helm `nats.worker` / `nats.keda` values, IDP matrix #257 → Shipped.
- **`docs/mcp/idp-pipeline-runner.md`**, IDP matrix #307 → Shipped, plugin registry + **`mcp-tools.md`** **`run_idp_pipeline`** row.
- HITL + workflow tool guides: NATS dual-path (sync webhook vs async consumer); `.env.example` NATS block.

## [6.4.0] - 2026-07-01

Minor release: **plugin Phase 2 (MCP registration)** for Memory, Documents, Automation (Argo **`workflow`** + **`argocd`**), Sandbox (Kata in-cluster), and Ouroboros; **eight-vendor IDP** merge (Docling, Nextcloud, ConeShare); full **Argo Workflows** control plane (wait, suspend/resume, cron, artifacts, notify-on-wait); **`loadSpec()` coalesce** for test stability. **No intentional MCP contract breaks** — same tool names and env gates; default **`all-providers`** merge is larger when documents are on. **`charts/clawql-mcp`** **Chart.version** **0.6.7** with **`appVersion` `6.4.0`**. Release notes: **[`RELEASE_NOTES_v6.4.0.md`](RELEASE_NOTES_v6.4.0.md)**.

### Added

- **Horizontal plugins via `onRegister`:** **`MemoryPlugin`**, **`DocumentsPlugin`**, **`AutomationPlugin`**, **`SandboxPlugin`**, **`OuroborosPlugin`** register MCP tools through **`PluginRegistry`** ([#448](https://github.com/danielsmithdevelopment/ClawQL/pull/448), [#449](https://github.com/danielsmithdevelopment/ClawQL/pull/449), [#452](https://github.com/danielsmithdevelopment/ClawQL/pull/452)).
- **Argo Workflows `workflow` MCP tool** ([#243](https://github.com/danielsmithdevelopment/ClawQL/issues/243), [#451](https://github.com/danielsmithdevelopment/ClawQL/pull/451)–[#459](https://github.com/danielsmithdevelopment/ClawQL/pull/459)): **`CLAWQL_ENABLE_WORKFLOW=1`**; submit / get / wait / list / logs / suspend / resume / delete / **`submit_cron`** / **`artifacts`**; Helm **`enableWorkflow`** + **`workflow.rbac`**; vault daily digest template under **`deployment/argo-workflows/`**; optional Slack notify on terminal **`wait`** ([#455](https://github.com/danielsmithdevelopment/ClawQL/pull/455)); HITL webhook auto-**`resume`** ([#458](https://github.com/danielsmithdevelopment/ClawQL/pull/458)).
- **Argo CD `argocd` MCP tool** ([#244](https://github.com/danielsmithdevelopment/ClawQL/issues/244), [#459](https://github.com/danielsmithdevelopment/ClawQL/pull/459)): **`CLAWQL_ENABLE_ARGO_CD=1`** — Application get/list/sync via Kubernetes CRD API; Helm **`argocd`** RBAC values; operator guide [`docs/mcp/argocd-tool.md`](docs/mcp/argocd-tool.md).
- **Sandbox Kata backend:** **`clawql-sandbox`** — in-cluster **`auto`** prefers **Kata** → Docker → bridge → Seatbelt; Helm **`sandboxKata`** RBAC ([#449](https://github.com/danielsmithdevelopment/ClawQL/pull/449)).
- **IDP collaboration:** bundled **nextcloud** + **coneshare** in default **`all-providers`** when documents on; **`CLAWQL_ENABLE_CONESHARE=1`** webhook path ([#434](https://github.com/danielsmithdevelopment/ClawQL/pull/434)).
- **Docling provider** ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248)): bundled **`docling`** in **`BUNDLED_DOCUMENT_VENDOR_IDS`**; **`DOCLING_BASE_URL`** / **`DOCLING_API_KEY`**; curated Docling Serve v1 OpenAPI.
- **Lending W-2 sample pack** ([#253](https://github.com/danielsmithdevelopment/ClawQL/issues/253)): Argo **`WorkflowTemplate`**, Label Studio config, OpenClaw prompt, synthetic fixture under **`deployment/samples/lending-w2/`**.
- **Ouroboros plugin glue** moved to **`packages/clawql-ouroboros/src/glue/`**; Postgres pool shutdown owned by plugin **`onTeardown`**.
- **CI / smoke:** Helm template assertions for workflow + Argo CD RBAC ([#456](https://github.com/danielsmithdevelopment/ClawQL/pull/456)); optional **kind** + Argo Workflows integration script ([#459](https://github.com/danielsmithdevelopment/ClawQL/pull/459)); Argo smoke runbook [`deployment/argo-workflows/SMOKE.md`](deployment/argo-workflows/SMOKE.md).

### Changed

- **`buildMcpPlugins()`** composes horizontal plugins from **`clawql-api-adapters.ts`**; **`tools.ts`** retains core tools + HITL only.
- **Default `all-providers` merge** includes **docling**, **nextcloud**, and **coneshare** when **`CLAWQL_ENABLE_DOCUMENTS`** is on (default).
- **In-cluster sandbox:** unset **`CLAWQL_SANDBOX_BACKEND`** defaults to **`auto`** (Kata-first) instead of bridge-only.
- **`resetClawqlApiForTests()`** runs plugin **`onTeardown`**; **`loadSpec()`** coalesces concurrent loads (Vitest teardown stability on Node 24/25).

### Fixed

- **Docker `npm ci`:** workspace **`package.json`** COPY layers for **`clawql-sandbox`** ([#449](https://github.com/danielsmithdevelopment/ClawQL/pull/449)).
- **Webhook rate limits** on ConeShare route ([#434](https://github.com/danielsmithdevelopment/ClawQL/pull/434)).
- **Helm CI:** workflow template assertions aligned with **`fullnameOverride`** ([#456](https://github.com/danielsmithdevelopment/ClawQL/pull/456)).

### Documentation

- **`docs/mcp/workflow-tool.md`**, **`docs/mcp/argocd-tool.md`**, **`docs/design/workflow-tool-argo.md`** (ADR 0004 blueprint aligned with shipped state, [#450](https://github.com/danielsmithdevelopment/ClawQL/pull/450)); plugin registry and configuration tiers updated for **`workflow`**, **`argocd`**, Kata sandbox, and shipped plugins.
- **`docs/providers/docling-onboarding.md`**, **`docs/runbooks/fine-tuned-classifier.md`**, **`deployment/samples/lending-w2/`** ([#248](https://github.com/danielsmithdevelopment/ClawQL/issues/248), [#253](https://github.com/danielsmithdevelopment/ClawQL/issues/253)); IDP matrix refresh ([#254](https://github.com/danielsmithdevelopment/ClawQL/issues/254) partial).
- IDP Platform + DAOS v2.7 documentation suite ([#445](https://github.com/danielsmithdevelopment/ClawQL/pull/445)).

## [6.3.0] - 2026-06-02

Minor release: **monorepo modularization phases 2–9** — workspace packages **`clawql-core`**, **`clawql-api`**, **`clawql-memory`**, **`clawql-documents`**, **`clawql-automation`** with thin **`src/`** shims; **`search`/`execute`** on Effect-TS via **`createClawQLApi()`**; **`PanguardProxyPlugin`**; plugin model + registry docs and **`/reference/plugins`** on docs.clawql.com. **No intentional MCP tool or env-flag breaks** — same **`search`**, **`execute`**, **`memory_*`**, optional tools behind existing **`CLAWQL_ENABLE_*`** gates. **`charts/clawql-mcp`** **Chart.version** **0.6.6** with **`appVersion` `6.3.0`**. Release notes: **[`RELEASE_NOTES_v6.3.0.md`](RELEASE_NOTES_v6.3.0.md)**.

### Added

- **Workspace packages (phases 2–9, [#306](https://github.com/danielsmithdevelopment/ClawQL/issues/306)):** **`clawql-core`** (audit, Merkle, Cuckoo, `Plugin` types), **`clawql-api`** (spec load/search, REST/GraphQL/gRPC execute, `createClawQLApi()`, provider registry), **`clawql-memory`** (vault, `memory.db`, ingest/recall, embeddings), **`clawql-documents`** (external ingest scaffold), **`clawql-automation`** (schedule worker + Slack notify). Ground truth: [`docs/design/modularization-implementation-status.md`](docs/design/modularization-implementation-status.md).
- **Effect-TS gateway path:** MCP **`search`** / **`execute`** delegate through **`getClawqlApi().run(Effect…)`** (`SearchService` / `ExecuteService` Layers) — [#401](https://github.com/danielsmithdevelopment/ClawQL/pull/401), [#423](https://github.com/danielsmithdevelopment/ClawQL/pull/423)–[#430](https://github.com/danielsmithdevelopment/ClawQL/pull/430).
- **`PanguardProxyPlugin`:** first-class **`mcp-proxy`** plugin with **`beforeCallTool`** chokepoint ([#308](https://github.com/danielsmithdevelopment/ClawQL/issues/308), [#272](https://github.com/danielsmithdevelopment/ClawQL/issues/272)).
- **Turborepo:** `turbo.json` + workspace build order for extracted packages.
- **Documentation:** plugin model, plugin registry, implementation-status sync across vision docs; docs site **[`/reference/plugins`](https://docs.clawql.com/reference/plugins)** ([#431](https://github.com/danielsmithdevelopment/ClawQL/pull/431)).

### Changed

- **Internal layout:** business logic moved into **`packages/*`**; **`src/tools.ts`** remains MCP registration transport; **`configureNotifyDeps`** wires automation notify from transport ([#430](https://github.com/danielsmithdevelopment/ClawQL/pull/430)).
- **Docker:** Dockerfiles copy workspace **`package.json`** files before **`npm ci`** for modularization builds.
- **Docs site:** information architecture revamp, hub pages, synced vision/enablement/modularization bodies ([#420](https://github.com/danielsmithdevelopment/ClawQL/pull/420)).

### Documentation

- **[`docs/design/clawql-plugin-model.md`](docs/design/clawql-plugin-model.md)** — horizontal packages becoming plugins.
- **[`docs/reference/clawql-plugin-registry.md`](docs/reference/clawql-plugin-registry.md)** — shipped vs planned plugin registry.
- Deployment guide, package READMEs, contributor spec, and memory docs aligned with phases 1–9 shipped state.

## [6.2.1] - 2026-05-19

Patch release: **`fetch-provider-specs`** hardening (Paperless `/api/schema/` validation, **Paperless-ngx ≥ 2.15** guidance, in-cluster HTTP diagnostics, **Gotenberg** pinned upstream OpenAPI when `/openapi.json` is absent), **Helm** Paperless default image **2.15.0** and removal of ineffective **`PAPERLESS_API_TOKEN`** injection into the Paperless container, **full bundled** **Tika**/**Gotenberg** OpenAPI surfaces, refreshed pinned public and live-fetched provider specs (**Onyx** `operationId` alignment for **`knowledge_search_onyx`** / Ouroboros ingest), **Istio** `*.localhost` provider VirtualServices when Stirling exists (not gated on full stack), **`execute`** multipart **`fileEncoding: base64`**, consolidated **dependency** and **OSV** updates, and **OpenTelemetry** **2.7.x** + OTLP exporter **0.218**. **`charts/clawql-mcp`** **Chart.version** **0.6.5** with **`appVersion` `6.2.1`**. Release notes: **[`RELEASE_NOTES_v6.2.1.md`](RELEASE_NOTES_v6.2.1.md)**.

### Fixed

- **`npm run fetch-provider-specs` (Paperless):** validate OpenAPI bodies (strip YAML `---`, detect `openapi: 3`), clearer errors when the cluster returns **302** or **Paperless before v2.15** (no `/api/schema/`), in-cluster `curl` reports HTTP status and no longer uses `-f` on empty 302 bodies.
- **Helm document pipeline:** default **Paperless** image tag **2.15.0** (first release exposing `/api/schema/`); stop injecting **`PAPERLESS_API_TOKEN`** into the Paperless pod (upstream does not consume that env var).
- **`execute` (multipart):** honor **`fileEncoding: base64`** with **`fileFileName`** / **`fileFilename`** for binary parts (MCP JSON tool args).
- **Supply chain (OSV):** bump **`brace-expansion`** override to **5.0.6** and **`ws`** to **8.20.1** (root + website/dashboard overrides).

### Added

- **Gotenberg spec pin:** when the live server has no `/openapi.json`, the fetch script downloads pinned **`docs/openapi.yaml`** (default Gotenberg **v7.10.0**; override **`GOTENBERG_OPENAPI_PIN_URL`**).

### Changed

- **Bundled OpenAPI:** **Tika** is a full JAX-RS surface spec for **2.9.x**; **Gotenberg** vendors upstream **v7.10.0** full OpenAPI (aligned with **v8** `/forms/*` routes). Refreshed **paperless**, **stirling**, **onyx**, **sentry**, **GitHub**, **Cloudflare**, and **Google discovery** artifacts from fetch scripts where applicable. **Onyx** upstream `operationId` values now drive **`knowledge_search_onyx`** (**`handle_send_search_message`**) and Ouroboros post-Paperless ingest (**`upsert_ingestion_doc`**); legacy **`onyx_send_search_message`** is still resolved when present in an older spec.
- **`scripts/kubernetes/local-k8s-docker-desktop.sh`:** apply provider **`*.localhost`** VirtualServices whenever **Stirling** is present (partial document stack), with comment clarifying Helm **providerIngress** vs Istio routing.
- **Dependencies:** consolidated Dependabot bumps (pg, graphql, yaml, vitest, eslint, tsx, typescript-eslint, `@grpc/proto-loader`, jose, GitHub Actions pins for CodeQL / Cosign / TruffleHog). **protobufjs** **7.6.0** (override + lock patch for `google-proto-files` nested copy). **OpenTelemetry** SDK/resources/trace **2.7.x** + OTLP HTTP exporter **0.218** (`resourceFromAttributes` / `defaultResource` in `otel-tracing.ts`). **@types/node** **25.x**. Zod pinned at **4.3.6** (MCP SDK tool schemas incompatible with **4.4.x** for now).

## [6.2.0] - 2026-05-12

Minor release: **MCP gRPC** defaults for large tool payloads (**`mcp-grpc-transport` `0.2.0`** — default **64 MiB** gRPC send/receive limits, **`callToolServerStreamingGrpc`** + helpers), **Helm** **`enableGrpc`** / **`grpcMaxMessageLength`**, REST **`execute`** query handling and HTTP body limits, and docs-site **Next.js 16.2.6** supply-chain alignment. **`charts/clawql-mcp`** **Chart.version** **0.6.4** with **`appVersion` `6.2.0`**. Release notes: **[`RELEASE_NOTES_v6.2.0.md`](RELEASE_NOTES_v6.2.0.md)**.

### Added

- **MCP gRPC defaults for heavy `execute`:** Helm **`enableGrpc: true`** and **`grpcMaxMessageLength`** (injects **`GRPC_MAX_MESSAGE_LENGTH`**); **`mcp-grpc-transport`** merges default **64 MiB** send/receive limits in **`maybeStartGrpcMcpServer`**. New **`callToolServerStreamingGrpc`** (+ helpers) for protobuf **`CallTool`** clients; **`scripts/dev/run-tika-parse-resume-once.ts`** defaults to **`CLAWQL_MCP_TRANSPORT=grpc`**.

### Documentation

- **GHCR — public image pulls:** **`docker/README.md` § GHCR visibility** now states GitHub’s published Packages API has **no container-visibility `PATCH`** (HTTP **404**); **Public** is set in Package settings / org defaults. Cross-links in **`docs/security/golden-image-pipeline.md`**, **`docs/security/image-signature-enforcement.md`**, **`README.md`**, **`docs/readme/deployment.md`**, **`docs/README.md`** index; **`make ghcr-packages-public`** documented as **GET**-only audit.

### Fixed

- **GHCR automation was a no-op:** GitHub’s **`github/rest-api-description`** OpenAPI lists **zero** **`PATCH`** routes under **`…/packages/`** for container packages — the old **`gh api --method PATCH … -f visibility=public`** steps always returned **HTTP 404**. Removed those steps from **[`.github/workflows/docker-publish.yml`](.github/workflows/docker-publish.yml)**; kept anonymous **`skopeo inspect`** gates. Repurposed **`scripts/github/set-clawql-ghcr-packages-public.sh`** to **GET** visibility and exit **1** unless every **`clawql-*`** container is **`public`**; dropped misleading **`GH_PACKAGES_VISIBILITY_TOKEN`** **`PATCH`** narrative from docs and CI hints.
- **REST `execute`:** only append **declared** OpenAPI query parameters (avoids oversized URLs / **414** on servers that reject undeclared query keys).
- **Streamable HTTP:** configurable JSON body size via **`CLAWQL_MCP_JSON_BODY_LIMIT`** for large MCP payloads.

### Changed

- **Helm:** **`enableGrpc`** defaults to **`true`**; **`grpcMaxMessageLength`** injects **`GRPC_MAX_MESSAGE_LENGTH`** for large tool results over gRPC MCP.
- **`execute` tooling:** REST-first for **`application/octet-stream`** upstreams; tool descriptions note gRPC where relevant.

### Dependency

- **`mcp-grpc-transport`** **`^0.2.0`** (streaming **`CallTool`** client helpers; default gRPC message size merge in **`maybeStartGrpcMcpServer`**).

## [6.1.0] - 2026-05-06

Minor release: defense-in-depth **Helm** (**HashiCorp Vault** subchart, **`secretSourcing`** guards, optional **env dashboard** + **Kyverno** image verification), **Panguard MCP bridge** at the edge (**optional JWT**, unary **gRPC** delegation), **Istio** desktop ingress **LoadBalancer** + **MCP** path routing, **egress** ServiceEntry allowlists, **Kata** / **gVisor** runtime class + **Kyverno** policy, **Gitleaks** + **TruffleHog** history scanning, optional **`CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE`** for Streamable HTTP (`src/server-http.ts`), and npm **11** / **Node 25** lockfile alignment for **`npm ci`**. **`charts/clawql-mcp`** **Chart.version** **0.6.3** with **`appVersion` `6.1.0`**. Release notes: **[`RELEASE_NOTES_v6.1.0.md`](RELEASE_NOTES_v6.1.0.md)**.

### Fixed

- **TruffleHog scheduled scan:** **`--exclude-paths`** must reference a filter **file** (`.github/trufflehog-exclude-paths.txt`); passing `^providers/` inline made TruffleHog try to open that path and exit **1** ([#304](https://github.com/danielsmithdevelopment/ClawQL/pull/304)).
- **CI / npm:** root **`package-lock.json`** includes the **`panguard-mcp-bridge`** workspace link for **`npm ci`** on **Node 25** / npm **11** ([#303](https://github.com/danielsmithdevelopment/ClawQL/pull/303)).

### Maintenance

- **GitHub — defense-in-depth / ops tracking:** Closed **[#155](https://github.com/danielsmithdevelopment/ClawQL/issues/155)** after refreshing the body to match shipped **Istio** (ambient/sidecar) + **Kiali** + local observability (`scripts/kubernetes/install-istio-docker-desktop.sh`); remaining work split to **[#296](https://github.com/danielsmithdevelopment/ClawQL/issues/296)** (non-lab single-install / umbrella + **[#255](https://github.com/danielsmithdevelopment/ClawQL/issues/255)**), **[#297](https://github.com/danielsmithdevelopment/ClawQL/issues/297)** (example L7 **`AuthorizationPolicy`**), **[#298](https://github.com/danielsmithdevelopment/ClawQL/issues/298)** (mesh day-two runbook). Closed **[#156](https://github.com/danielsmithdevelopment/ClawQL/issues/156)** (OSV + Trivy + Syft + golden-image publish path already shipped; follow-ups **#202–#204**). Closed **[#283](https://github.com/danielsmithdevelopment/ClawQL/issues/283)** (Gitleaks pre-commit + CI **`secret-scan`**, **`trufflehog-scheduled.yml`**, Harbor / SBOM docs). Closed **[#274](https://github.com/danielsmithdevelopment/ClawQL/issues/274)** (Kata / gVisor **`RuntimeClass`**, Kyverno **`runtimeClassPolicy`**, **`docs/security/runtime-class-containment.md`**).
- **GitHub — Panguard bridge:** Closed **[#292](https://github.com/danielsmithdevelopment/ClawQL/issues/292)** (optional JWT / ATR-shaped claim gate at **`clawql-panguard-mcp-bridge`**) and **[#293](https://github.com/danielsmithdevelopment/ClawQL/issues/293)** (unary **gRPC** delegation + sanitized stdio env + **`e2e-direct-shim`** / **`spawnSync`** integration path), completing the **[#272](https://github.com/danielsmithdevelopment/ClawQL/issues/272)** MCP proxy / **Panguard** bridge follow-ups.

### Security

- **Secret scanning:** mandatory **Gitleaks** job **`secret-scan`** in **`.github/workflows/ci.yml`**, **`.pre-commit-config.yaml`**, and **`.gitleaks.toml`**; **`.github/workflows/trufflehog-scheduled.yml`** for git history (**`providers/`** excluded via **`.github/trufflehog-exclude-paths.txt`**). **Harbor** / private-registry consumption guidance in **`docs/security/golden-image-pipeline.md`** and **`docs/security/README.md`** ([#283](https://github.com/danielsmithdevelopment/ClawQL/issues/283)).
- **npm supply chain:** **`ip-address`** pinned to **10.1.1** (overrides + lockfile) for OSV advisory **GHSA-v2v4-37r5-5v8g**.
- **Panguard MCP bridge — optional JWT gate:** **`packages/panguard-mcp-bridge/src/jwt-gate.ts`** behind **`CLAWQL_MCP_JWT_ENABLED`** (JWKS, PEM public key, or **HS256** for dev/tests only; **`iss`/`aud`**; **`CLAWQL_MCP_JWT_ATR_CLAIM`** default **`atr`** for a minimal ATR-shaped claim). MCP **HTTP**: path middleware, **401** with JSON-RPC **-32001**; **gRPC**: **`ServerInterceptor`**, **`UNAUTHENTICATED`**, **`grpc.health.v1.Health`** skipped (**`jose`** + **`@grpc/grpc-js`** on the bridge package). Tests **`jwt-gate.test.ts`**; docs **`docs/security/mcp-proxy-jwt-atr.md`** (bridge section) and **`packages/panguard-mcp-bridge/README.md`** ([#292](https://github.com/danielsmithdevelopment/ClawQL/issues/292)).

### Added

- **Helm bundled env dashboard (Vault-first):** optional **`dashboard`** workload + **Ingress** (local **`http://clawql.localhost`** on docker-desktop overlay), **Kyverno** **`verifyImages`** entry for **`ghcr.io/.../clawql-dashboard`**, **`CLAWQL_DASHBOARD_*`** env for in-cluster Vault/exec wiring; bundled docs UI host **`http://docs.localhost`**; **`scripts/kubernetes/smoke-localhost-uis.sh`**, **`npm run import-dotenv-to-vault`**, and website guide **`/dashboard-kubernetes`** ([#302](https://github.com/danielsmithdevelopment/ClawQL/pull/302)).
- **Helm `mcpProxy`:** optional MCP edge **Deployment** (**`nginx`** or **`custom`**), **Service** (HTTP + gRPC), optional **PrometheusRule** SLO; **`clawql-panguard-mcp-bridge`** image (**`docker/panguard-mcp-bridge/Dockerfile`**, **`packages/panguard-mcp-bridge`**), example **`values-mcp-proxy-panguard-bridge.example.yaml`**, CI/docker-publish smoke for the bridge. **`mcp-grpc-transport`:** gRPC **`Session`** path for per-session delegate tools. Docs: **`docs/security/mcp-proxy-jwt-atr.md`**, **`docs/integrations/panguard-http-grpc-bridge.md`**, **`docs/integrations/panguard-kubernetes.md`** ([#272](https://github.com/danielsmithdevelopment/ClawQL/issues/272)).
- **`clawql-panguard-mcp-bridge` unary gRPC MCP + integration E2E:** with **`ENABLE_GRPC`**, one shared inner **`stdio`** client delegates unary MCP on the **`McpServer`** while sessions keep their own **`stdio`** client; **`maybeStartGrpcMcpServer`** accepts optional **`interceptors`** from the JWT gate; shutdown closes the unary inner client. **`envForStdioChild`** sanitizes shim subprocess env (**`getDefaultEnvironment()`** + allowlist so **Vitest** / **`NODE_OPTIONS`** do not leak into **`npx`** / shim spawns). **`CLAWQL_BRIDGE_DIRECT_SHIM`** skips **Panguard** for CI-style chains (**documented**, non‑prod). **`scripts/e2e-direct-shim.mjs`** exercises **HTTP → bridge → direct shim → upstream** under plain **Node**; **`gateway-integration.test.ts`** runs it with **`spawnSync`** (Vitest + nested stdio was unreliable); **`npm run test:e2e -w panguard-mcp-bridge`**. Streamable **`client.close()`** is raced with a **5s** timeout so the process exits; then **`closeAllConnections`** / **`process.exit(0)`**. **`docs/integrations/panguard-http-grpc-bridge.md`** updated ([#293](https://github.com/danielsmithdevelopment/ClawQL/issues/293)).
- **Helm `istio.egressAllowlist`:** optional **ServiceEntry** allowlist for HTTPS egress (optional **Gateway**/**VirtualService** via **`istio-egressgateway`**); **`install-istio-docker-desktop.sh`** and docker-desktop Istio values aligned ([#275](https://github.com/danielsmithdevelopment/ClawQL/issues/275)).
- **Runtime containment:** **`security.kata`** (MCP **`runtimeClassName`**) and **`kyverno.runtimeClassPolicy`** (namespace-tier **Kata** vs **gVisor** **`ClusterPolicy`**); **`docs/security/runtime-class-containment.md`** ([#274](https://github.com/danielsmithdevelopment/ClawQL/issues/274)).

### Documentation

- **Helm `vault` vs secrets manager ([#161](https://github.com/danielsmithdevelopment/ClawQL/issues/161)):** Chart header + Obsidian **`vault`** comments, **`deployment`** template note, **`charts/clawql-mcp/README.md`**, **`docs/deployment/helm.md`**, security docs — distinguish Obsidian memory mounts from **HashiCorp Vault**.
- **Vault-backed env injection:** Helm **`envFromSecrets`** merges multiple Secret refs into **`Deployment.envFrom`** for External Secrets / VSO → ClawQL env.
- **Bundled HashiCorp Vault + default guard:** Chart depends on **`hashicorp/vault`** (**`hashicorpvault`** subchart alias — RFC 1123-safe names); **`secretSourcing.requireVaultBackedSecrets=true`** requires **`envFromSecret`** or **`envFromSecrets`** unless overridden (desktop overlay disables both for labs).
- **External Secrets + Vault KV:** **`docs/deployment/external-secrets-operator-install.md`**, **`external-secrets-vault-cluster-secret-store.yaml`**, **`vault-external-secrets-kubernetes-auth.yaml`**, **`vault-kubernetes-auth-tokenreview-rbac.yaml`**, **`vault-policy-clawql-eso-read.hcl`**.
- **Istio `AuthorizationPolicy` for Vault:** **`vault-istio-authorizationpolicy.yaml`**, ambient waypoint variant, **`make verify-vault-policy`** + **`scripts/kubernetes/verify-vault-policy.sh`**.
- **Roadmap / IDP:** **`docs/roadmap/gap-closure-plan-prioritized-2026.md`**, **`docs/roadmap/idp-master-requirements-matrix.md`**, **`docs/adr/0004-argo-cd-workflows-clawql-pipelines.md`** (optional workflow MCP + Argo), **`docs/roadmap/argo-workflows-cd-provider.md`**, **`docs/openclaw/openclaw-idp-skill-profile.md`** — ties to epic **[#259](https://github.com/danielsmithdevelopment/ClawQL/issues/259)** (merge **[#260](https://github.com/danielsmithdevelopment/ClawQL/pull/260)**).
- **Docs site:** home + **Learn** refactors — **`HomeMarketingSections`**, **`LearnCardSections`**, **`docs-site-card-data`**, **`ReferenceResourceCard`**, slimmer **Resources** / **Navigation** (same merge).

### Changed

- **Local desktop north-south (Istio):** On **docker-desktop** / **rancher-desktop** / **docker-for-desktop** kube contexts, **`install-istio-docker-desktop.sh`** uses **`Service/clawql-mcp-ingress` `type: LoadBalancer`** (maps to **localhost**) and skips **`hostNetwork`**, because **`hostNetwork`** binds inside the Kubernetes VM and host browsers saw **connection refused** on **127.0.0.1:80**. **`CLAWQL_ISTIO_GATEWAY_HOST_NETWORK`** is **auto** when unset (**hostNetwork** on other contexts). Stale **`ingress-nginx`** is uninstalled when Istio owns routes (**`CLAWQL_LOCAL_K8S_REMOVE_STALE_INGRESS_NGINX_WITH_ISTIO`**, default **`1`**). VirtualServices under **`docker/istio/docker-desktop/`**; **`svc/clawql-mcp-http`** stays **ClusterIP** via Helm **`--set`** (no **`kubectl patch`** on **`spec.type`**). See **`docker/README.md`**.
- **Istio `clawql.localhost` + MCP:** **`clawql-docs-ui-localhost`** routes **`/mcp`**, **`/graphql`**, and **`/healthz`** to **`clawql-mcp-http:8080`** before the docs-site catch-all so **`http://clawql.localhost/mcp`** does not hit Next.js (**404** on Cursor SSE fallback).
- **Cursor MCP URL (Docker Desktop macOS):** **`.cursor/mcp.json.example`** defaults **`http://127.0.0.1/mcp`** when **`localhost` → `::1`** leaves nothing on **[::1]:80**; **`scripts/kubernetes/smoke-mcp-http-istio-gateway.sh`** + **`make smoke-mcp-http-istio-gateway`** verify Streamable **`POST /mcp`** through Envoy.
- **`values-docker-desktop.yaml`:** **`hashicorpVault.enabled: false`** and **`secretSourcing.requireVaultBackedSecrets: false`** for single-node **`make local-k8s-up`** ergonomics.
- **`make helm-lint`:** uses **`values-lint.yaml`** and **`--set envFromSecret=…`** so templates satisfy **`secretSourcing`** during CI validation.
- **`make local-k8s-up` install time:** default **`CLAWQL_LOCAL_K8S_FULL_STACK=1`** keeps the full **`values-docker-desktop.yaml`** stack; **`helm --wait`** defaults to **45m** (override **`CLAWQL_HELM_TIMEOUT`**). Opt-in quick path: **`CLAWQL_LOCAL_K8S_FULL_STACK=0`** passes Helm **`--set`** to turn off **Onyx, Flink, document pipeline, NATS, and provider Ingress** and shortens the default **`helm --wait`** to **8m**.
- **Local Kubernetes (`make local-k8s-up`) — prod parity:** **`values-docker-desktop.yaml`** enables **Ingress** for MCP at **`http://clawql-mcp.localhost/mcp`** (same **hostname + `/mcp`** pattern as production behind **Ingress / Gateway**; **TLS** only in prod). **`svc/clawql-mcp-http`** stays **LoadBalancer** for **gRPC** / diagnostics (**`kubectl get svc`** for **`EXTERNAL-IP`**). **`.cursor/mcp.json.example`** uses the Ingress URL. **`CLAWQL_ISTIO_MCP_HTTP_SERVICE_CLUSTERIP`** defaults to **0**; set **`=1`** for optional **Istio** gateway MCP on **`http://localhost/mcp`**. **Compose** still uses **`http://localhost:8080/mcp`**.
- **Helm `--wait` reliability (full stack unchanged):** Flink **TaskManager** no longer mounts read-only **`flink-conf.yaml`** (conflicts with Flink 1.19 entrypoint); TM/JM memory **process** sizes raised to satisfy Flink’s minimum fractions; Onyx API gets **`NUM_RETRIES_ON_STARTUP=120`** for slow Vespa/OpenSearch on cold single-node clusters (avoids **`Could not connect to a document index`** during **`setup_onyx`**).
- **Local Kubernetes — Istio + Rancher Desktop:** **`scripts/kubernetes/lib/select-local-k8s-context.sh`** and **`rancher-rdctl.sh`** (Lima / **istio-cni** lab fixes), wait for **Kyverno** before Istio Helm, **`install-istio-docker-desktop.sh`** / **`local-k8s-docker-desktop.sh`** hardening (**ambient** vs **sidecar**, optional gateway **NodePort**), **`values-docker-desktop.yaml`** tuning and MCP **Service**/**Deployment** mesh annotations; **Makefile** drops default MCP port-forward; small **`src/server-http.ts`** path for gateway probes ([#271](https://github.com/danielsmithdevelopment/ClawQL/pull/271)).
- **Streamable HTTP (optional):** set **`CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE=1`** to prefer JSON responses for **`StreamableHTTPServerTransport`** (helps some MCP clients / proxies); default unchanged.

## [6.0.0] - 2026-05-03

Major release: **Helm** broker paths migrate to **Dragonfly** only (**breaking** values + object names); **`sandbox_exec`** is **opt-in**; Docker Desktop **Istio** lab uses **Grafana Tempo** (optional **Loki**); **`audit`** exposes **Prometheus** metrics and optional **Loki** push; **Learn** docs on **docs.clawql.com**; optional **Label Studio HITL**; **`GET /metrics`**, **OTLP** traces, and Prometheus scrape wiring. Release notes: **[`RELEASE_NOTES_v6.0.0.md`](RELEASE_NOTES_v6.0.0.md)**; upgrade guide for brokers: [**ADR 0003**](docs/adr/0003-tempo-dragonfly-local-operations.md). **`charts/clawql-mcp`** **Chart.version** **0.6.x** with **`appVersion` `6.0.0`**.

### Changed

- **Docker Desktop Istio observability:** removed the Istio sample **Jaeger** addon; **Grafana Tempo** is the sole trace backend when **`CLAWQL_ISTIO_INSTALL_HEAVY_OBSERVABILITY_ADDONS=1`**. **`CLAWQL_ISTIO_INSTALL_LOKI_TEMPO=0`** skips **Helm Loki** only (Tempo and the OTel collector remain). Deleted **`docker/istio/docker-desktop/otel-collector-jaeger-only.yaml`**.

### Breaking

- **Helm `clawql-mcp` — Dragonfly only, values rename:** **`stores.redis`** → **`stores.dragonfly`** and **`onyx.redis`** → **`onyx.dragonfly`**. Kubernetes names change (**`*-redis`** → **`*-dragonfly`** for shared store; **`onyx-cache`** → **`onyx-dragonfly`** for Onyx). Redis OSS is **not** an in-chart option (**AGPL/RSAL** posture + prefer **Dragonfly** **Apache 2.0** and throughput for broker workloads). **`redis://…`** env URLs remain (**RESP** / Celery naming). See [**ADR 0003**](docs/adr/0003-tempo-dragonfly-local-operations.md). Migrate custom **`values`** / **`--set`** accordingly; expect a one-time replacement of those Deployments/Services on **`helm upgrade`**.

- **`sandbox_exec`:** the MCP tool is registered only when **`CLAWQL_ENABLE_SANDBOX=1`** (same **default off — opt in** band as **`schedule`**, **`notify`**, **`ouroboros_*`** in the [feature tiers diagram](docs/readme/images/clawql-feature-tiers.png)). Previously **`sandbox_exec`** was always listed; restore visibility by setting the flag (still configure **`CLAWQL_SANDBOX_BACKEND`**, bridge URL + token, Docker, or Seatbelt as before) ([#207](https://github.com/danielsmithdevelopment/ClawQL/issues/207)).

### Documentation

- **OpenClaw + ClawQL:** **`docs/openclaw/using-openclaw-with-clawql.md`** (full guide — concepts, install, HTTP/stdio, **`openclaw mcp set`** JSON, env, validation, remote, IDP pointer, troubleshooting); website **`/openclaw`** (Navigation, sitemap); cross-links from **`docs/openclaw/clawql-bootstrap.md`**, **`docs/readme/deployment.md`**, **`docs/clawql-ecosystem.md`**, **`website/src/app/deployment/page.mdx`**, **`website/src/app/mcp-clients/page.mdx`** ([#226](https://github.com/danielsmithdevelopment/ClawQL/issues/226)).
- **OpenClaw bootstrap:** **`docs/openclaw/clawql-bootstrap.md`** — **Hands-on sequence** (smoke → **`npm run start:http`** → OpenClaw URL **`/mcp`** → first prompt; stdio alternative); **`npm install -g openclaw`** + **`openclaw mcp set`** JSON for HTTP **`url`** vs stdio **`command`/`args`** (OpenClaw **2026.x** CLI); clarify **`openclaw-mcp`** npm vs **`clawql-mcp`** ([#226](https://github.com/danielsmithdevelopment/ClawQL/issues/226)).
- **Grafana follow-up ([#225](https://github.com/danielsmithdevelopment/ClawQL/issues/225)):** **`docs/grafana/README.md`** — post-[#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210) tracking, OpenClaw/Agent deliverable table, GitOps note; **`docs/openclaw/clawql-bootstrap.md`** — observability section + manual checklist row + Related issues link.
- **Grafana — ClawQL Core Observability:** **`docs/grafana/clawql-core-observability.json`** (importable dashboard for native-protocol **`/metrics`**), **`docs/grafana/README.md`** (Prometheus scrape requirement, Istio dashboard IDs, OpenClaw handoff → [#128](https://github.com/danielsmithdevelopment/ClawQL/issues/128)), **`docs/deployment/docker-desktop-istio-observability.md`** (Grafana step 6 — import) ([#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210)).
- **Tailscale / Headscale (beginners):** **`docs/deployment/tailscale-and-headscale-for-clawql.md`** (managed Tailscale vs Headscale, concepts, MagicDNS, **`CLAWQL_MCP_URL`**, Kubernetes vs tailnet DNS, troubleshooting; **regulatory context** — HIPAA / SOC 2 / GDPR / CCPA **control themes**, not legal advice), website route **`/tailscale`** (**`website/src/app/tailscale/page.mdx`**), **Navigation**, **Resources**, and **sitemap** wiring; cross-links from **`headscale-tailnet.md`**, **`deployment/page.mdx`**, **`docs/README.md`**, **`docs/readme/deployment.md`**, **`docs/clawql-ecosystem.md`**, **`README.md`**, **`.env.example`**, **`docs/readme/getting-started.md`** ([#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206), [#211](https://github.com/danielsmithdevelopment/ClawQL/issues/211), [#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213)).
- **Headscale tailnet runbook:** **`docs/deployment/headscale-tailnet.md`** (topology, firewall, MagicDNS **`*.clawql.local`**, enrollment outline, **`CLAWQL_MCP_URL`** / **`BASE_URL`** alignment, validation checklist, public MCP URL deprecation after cutover), least-privilege starter ACL **`docs/deployment/headscale-acls-clawql.hujson`**, index link in **`docs/README.md`**, cross-links from **`docs/readme/deployment.md`**, **`docs/clawql-ecosystem.md`** (service map vs tailnet DNS), **`.env.example`**, **`README.md`** (deployments map), **`website/src/app/deployment/page.mdx`** ([#206](https://github.com/danielsmithdevelopment/ClawQL/issues/206), [#213](https://github.com/danielsmithdevelopment/ClawQL/issues/213)).
- **Tailnet MCP URLs + env hygiene:** **`docs/readme/deployment.md`** (private Tailscale MagicDNS **`url`**, **`CLAWQL_MCP_URL`** for workflows only, aligning **`*_BASE_URL`** with tailnet hosts), **`docs/readme/configuration.md`** (dotenv load order, **`CLAWQL_*`** vs legacy aliases), **`.env.example`** cross-links ([#195](https://github.com/danielsmithdevelopment/ClawQL/issues/195), [#211](https://github.com/danielsmithdevelopment/ClawQL/issues/211)).
- **Observability:** **`docs/readme/deployment.md`**, **`docs/mcp/mcp-tools.md`** (See also), **`docs/mcp/enterprise-mcp-tools.md`** (regulated deployments), **`.env.example`**, **`docs/adr/0002-multi-protocol-supergraph.md`** (#191 row), **`website/src/app/deployment/page.mdx`** — **`GET /metrics`** (**`prom-client`**) plus optional **`GET /healthz`** **`nativeProtocolMetrics`** ([#191](https://github.com/danielsmithdevelopment/ClawQL/issues/191)).
- **ClawQL Learn (docs site):** **`/learn`** how-to guides (including **OpenClaw with ClawQL** at **`/learn/openclaw-and-clawql`**), per-page TOC, sitemap, Navigation, WebMCP path hints ([#238](https://github.com/danielsmithdevelopment/ClawQL/issues/238)).

### Added

- **Docker Desktop Istio lab — Loki + Tempo:** **`scripts/kubernetes/install-istio-docker-desktop.sh`** installs **Grafana Tempo** (Helm **`clawql-tempo`**) whenever heavy observability addons are on, and **Grafana Loki** when **`CLAWQL_ISTIO_INSTALL_LOKI_TEMPO`** is not **`0`**. **`docker/istio/docker-desktop/otel-collector.yaml`** forwards OTLP traces to **Tempo** only (no Istio sample **Jaeger**). Values: **`docker/istio/docker-desktop/loki-values-docker-desktop.yaml`**, **`tempo-values-docker-desktop.yaml`**. Docs: **`docs/deployment/docker-desktop-istio-observability.md`**, **`docker/README.md`**, **`docs/grafana/README.md`**, website **`/docker-desktop-observability`**.

- **`audit` observability:** Prometheus aggregates **`clawql_audit_append_total`**, **`clawql_audit_ring_entries_dropped_total`**, **`clawql_audit_clear_total`**, **`clawql_audit_buffer_entries`** on **`GET /metrics`**; optional **`CLAWQL_LOKI_PUSH_URL`** (+ bearer / tenant / job / timeout) fires a non-blocking Loki **`/loki/api/v1/push`** per **`audit.append`**. Docs: **`docs/mcp/mcp-tools.md`**, **`docs/mcp/enterprise-mcp-tools.md`**, **`docs/readme/configuration.md`**, **`.env.example`**, website **`/learn/audit-tool-and-observability`**.

- **Bundled OpenAPI providers — pregenerated GraphQL:** committed **`introspection.json`** and **`schema.graphql`** where **`npm run pregenerate-graphql`** succeeds for **`tika`**, **`gotenberg`**, **`paperless`**, **`stirling`**, **`jira`**, **`github`**, **`n8n`**, and **`sentry`** ([#125](https://github.com/danielsmithdevelopment/ClawQL/issues/125)).

- **Ouroboros default executor — optional Onyx ingest after Paperless:** With **`CLAWQL_OUROBOROS_ONYX_AFTER_PAPERLESS`** and seed **`metadata.onyx_ingest_after_paperless`**, append **`execute`** on **`onyx::onyx_ingest_document`** after a successful Paperless step whose JSON **`result`** includes a document **`id`**; optional **`CLAWQL_ONYX_CC_PAIR_ID`** ([#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120)).

- **HITL / Label Studio (optional):** MCP **`hitl_enqueue_label_studio`** (**`CLAWQL_ENABLE_HITL_LABEL_STUDIO=1`**) posts tasks to Label Studio **`/api/projects/{id}/import`**; Streamable HTTP **`POST /hitl/label-studio/webhook`** ingests reviewer payloads into **`memory_ingest`** (or **`audit`** when the vault is unavailable). Env: **`CLAWQL_LABEL_STUDIO_URL`**, **`CLAWQL_LABEL_STUDIO_API_TOKEN`**, **`CLAWQL_HITL_WEBHOOK_TOKEN`** (required for webhook when **`NODE_ENV=production`**). Docs: **`docs/mcp/hitl-label-studio.md`**, **`docs/mcp/mcp-tools.md`**, **`docs/openclaw/clawql-bootstrap.md`**; Helm **`enableHitlLabelStudio`** ([#228](https://github.com/danielsmithdevelopment/ClawQL/issues/228)).

- **Helm / Kustomize — Prometheus scrape `clawql-mcp-http` `/metrics`:** **`metrics.prometheusScrapeAnnotations`** on **`charts/clawql-mcp`** (default **enabled** — **`prometheus.io/*`** on the MCP **Service** for Istio sample Prometheus **`kubernetes-service-endpoints`**); optional **`metrics.serviceMonitor`** (**`monitoring.coreos.com/v1`**) for Prometheus Operator; **`service.annotations`** merge; **`docker/kustomize/base/service-mcp-http.yaml`** annotations for parity. Docs: **`charts/clawql-mcp/README.md`**, **`docs/deployment/helm.md`**, **`docs/grafana/README.md`** ([#210](https://github.com/danielsmithdevelopment/ClawQL/issues/210)).

- **Docker Desktop Istio follow-ups:** **`local-k8s-docker-desktop.sh`** patches **`svc/clawql-mcp-http`** to **`ClusterIP`** when the Istio ingress gateway is installed (**`CLAWQL_ISTIO_MCP_HTTP_SERVICE_CLUSTERIP`**, default **`1`**); **`scripts/kubernetes/smoke-grpcurl-istio-gateway-mcp.sh`** + **`make smoke-grpcurl-istio-gateway-mcp`** for **`grpcurl`** **`grpc.health.v1.Health/Check`** on **`localhost:50051`** ([#155](https://github.com/danielsmithdevelopment/ClawQL/issues/155)).

- **Prometheus (`GET /metrics`, core):** **`prom-client`** OpenMetrics exposition for native GraphQL/gRPC merge gauges and execute counters per **`sourceLabel`**; same signals as optional JSON on **`GET /healthz`**. Disable the HTTP route with **`CLAWQL_DISABLE_HTTP_METRICS=1`** only when necessary ([#191](https://github.com/danielsmithdevelopment/ClawQL/issues/191)).

- **Optional OTLP traces (Tempo / OTLP backends):** **`CLAWQL_ENABLE_OTEL_TRACING=1`** with **`OTEL_EXPORTER_OTLP_ENDPOINT`** or **`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`** registers OTLP HTTP export and **`mcp.tool.<name>`** spans for MCP handlers (including **`ouroboros_*`**); OpenTelemetry packages load only when the flag is set ([#160](https://github.com/danielsmithdevelopment/ClawQL/issues/160)).

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

- **Docs:** **Feature tiers** aligned with the architecture diagram — **ClawQL Core** (`search`, `execute`, `audit`, `cache`, no opt-out), **default on — opt out** (vault memory, Documents stack), **default off — opt in** (schedule, notify, Onyx wrapper, Ouroboros; Sandbox bridge–gated `sandbox_exec`) — in **`docs/readme/configuration.md`**, plus cross-links from **`README.md`**, **`docs/mcp/mcp-tools.md`**, **`docs/README.md`**, **`.env.example`**, **`docs/mcp/onyx-knowledge-tool.md`**, and the website **Concepts** / **Tools** pages.
- **`memory_ingest` / `memory_recall`:** register by default; set **`CLAWQL_ENABLE_MEMORY=0`** to opt out. **Helm:** **`enableMemory: true`** (default); when **`false`**, the chart injects **`CLAWQL_ENABLE_MEMORY=0`**. Docs: **[`docs/mcp/mcp-tools.md`](docs/mcp/mcp-tools.md)**, **[`docs/mcp/cache-tool.md`](docs/mcp/cache-tool.md)**, **[`README.md`](README.md)**, **`.env.example`**, **[`charts/clawql-mcp/README.md`](charts/clawql-mcp/README.md)**.
- **Document stack opt-out:** **`CLAWQL_ENABLE_DOCUMENTS=0`** (default on when unset) omits bundled **tika**, **gotenberg**, **paperless**, **stirling**, and **onyx** from the default **`all-providers`** merge; unregisters **`ingest_external_knowledge`**; **`knowledge_search_onyx`** requires both **`CLAWQL_ENABLE_ONYX=1`** and documents enabled. **`CLAWQL_BUNDLED_PROVIDERS=…`** can still list document vendors explicitly. **Helm:** **`enableDocuments: true`** by default; set **`false`** to inject **`CLAWQL_ENABLE_DOCUMENTS=0`**. See **[`docs/mcp/mcp-tools.md`](docs/mcp/mcp-tools.md)**, **[`src/provider-registry.ts`](src/provider-registry.ts)** (`BUNDLED_DOCUMENT_VENDOR_IDS`).
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

- **Docs:** **[`docs/design/graphql-mesh-node-compatibility.md`](docs/design/graphql-mesh-node-compatibility.md)** — Node **25** regression in **`@omnigraph/json-schema`** (`getUnionTypeComposers`: `Cannot set property input … only a getter`) when building GraphQL from the **full** bundled **`providers/slack/openapi.json`** (minimal Slack fixture in tests avoids it). Upstream: **[ardatan/graphql-mesh#9447](https://github.com/ardatan/graphql-mesh/issues/9447)**.
- **Onyx bundled provider + optional `knowledge_search_onyx`** ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)): `providers/onyx/openapi.yaml` (`onyx_send_search_message` → Onyx `POST /search/send-search-message`), merged as **`onyx`** in **`all-providers`**. Base URL **`ONYX_BASE_URL`**, auth **`ONYX_API_TOKEN`** / **`CLAWQL_ONYX_API_TOKEN`** (Bearer). When **`CLAWQL_ENABLE_ONYX=true`**, registers MCP tool **`knowledge_search_onyx`** (wrapper over **`execute`**). See **`providers/README.md`**, **`.env.example`**, guide **[`docs/mcp/onyx-knowledge-tool.md`](docs/mcp/onyx-knowledge-tool.md)**, and **[`docs/mcp/mcp-tools.md`](docs/mcp/mcp-tools.md)** (§ **`knowledge_search_onyx`**).
- **`clawql-ouroboros`** workspace package (`packages/clawql-ouroboros`): TypeScript **Seed** (Zod), **Wonder / Reflect**, **EvolutionaryLoop**, **ConvergenceCriteria**, **InMemoryEventStore**, **`ouroborosMcpTools`** (`mcp-hooks` entry), **`startSeedsPoller`** (`poller` entry). Documented in **[`docs/ouroboros/clawql-ouroboros.md`](docs/ouroboros/clawql-ouroboros.md)** with examples. Docs site: **`/ouroboros`**. **npm:** expanded **[`packages/clawql-ouroboros/README.md`](packages/clawql-ouroboros/README.md)** (standalone use, install paths, export table, limitations), **`LICENSE`** (Apache-2.0) in package **`files`**, **`homepage`** → **`https://docs.clawql.com/ouroboros`**, richer **`keywords`** / **`description`**. **Published** **`clawql-ouroboros@0.1.0`** to **`https://www.npmjs.com/package/clawql-ouroboros`**.
- **Optional Ouroboros MCP tools on `clawql-mcp`** ([#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141), [#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142)): **`CLAWQL_ENABLE_OUROBOROS=1`** registers **`ouroboros_create_seed_from_document`**, **`ouroboros_run_evolutionary_loop`**, **`ouroboros_get_lineage_status`** (from **`clawql-ouroboros/mcp-hooks`**). Workspace dependency **`clawql-ouroboros`**. Optional **`CLAWQL_OUROBOROS_DATABASE_URL`** → Postgres table **`clawql_ouroboros_events`**; otherwise in-memory **`EventStore`**. Documented in **[`docs/mcp/mcp-tools.md`](docs/mcp/mcp-tools.md)** and **`.env.example`**. Optional integration coverage: **`src/ouroboros/postgres-event-store.integration.test.ts`** (runs when **`CLAWQL_OUROBOROS_DATABASE_URL`** is set; otherwise **`describe.skipIf`**).
- **Optional MCP `notify` tool** ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)): when **`CLAWQL_ENABLE_NOTIFY=1`**, registers **`notify`** — a typed wrapper around Slack **`chat.postMessage`** (same stack as **`execute`** on **`chat_postMessage`**). Requires the Slack OpenAPI in the loaded spec and a bot token (**`CLAWQL_SLACK_TOKEN`**, …). Surfaces Slack **`ok: false`** JSON as a tool error. Documented in **[`docs/mcp/notify-tool.md`](docs/mcp/notify-tool.md)** (guide + examples), **[`docs/mcp/mcp-tools.md`](docs/mcp/mcp-tools.md)**, docs site page **`/notify`** (`website/src/app/notify/page.mdx`), and **[`README.md`](README.md)**. Remaining **`alert()`** scope: **[#150](https://github.com/danielsmithdevelopment/ClawQL/issues/150)**.
- **`memory_ingest` `toolOutputsFile`:** optional server-side read of a UTF-8 file path (allowlisted via **`CLAWQL_MEMORY_INGEST_FILE_ROOTS`**, default process **`cwd`**; **`CLAWQL_MEMORY_INGEST_FILE_MAX_BYTES`**, **`CLAWQL_MEMORY_INGEST_FILE=0`** to disable) so very large log or slide-deck text does not need to be embedded in MCP tool JSON. Documented in **[`docs/mcp/mcp-tools.md`](docs/mcp/mcp-tools.md)**, **[`docs/memory/memory-obsidian.md`](docs/memory/memory-obsidian.md)**, **[`docs/integrations/cursor-vault-memory.md`](docs/integrations/cursor-vault-memory.md)**, the **clawql-vault-memory** skill, and the **Tools** page on the docs site.
- **Test-only Onyx REST stub:** **`CLAWQL_TEST_ONYX_FETCH_STUB`**, optional **`CLAWQL_TEST_ONYX_FETCH_BODY`**, **`CLAWQL_TEST_ONYX_FETCH_HTTP_OK`** in **`src/rest-operation.ts`**; stdio **`callTool("knowledge_search_onyx")`** coverage in **`src/server.test.ts`** ([#144](https://github.com/danielsmithdevelopment/ClawQL/issues/144)). **Streamable HTTP** and **gRPC** **`listTools`** include **`knowledge_search_onyx`** when **`CLAWQL_ENABLE_ONYX=1`**: **`src/server-http.test.ts`**, **`src/grpc-onyx-parity.test.ts`**.
- **`memory_ingest` + Onyx citations ([#130](https://github.com/danielsmithdevelopment/ClawQL/issues/130)):** optional **`enterpriseCitations`** array (capped) stored as a vault Markdown block; helpers in **`src/enterprise-citations.ts`** (`extractEnterpriseCitationsFromOnyxSearchJson`, **`enterpriseCitationsFromOnyxSearchToolText`**). Docs: **`docs/mcp/mcp-tools.md`**, **`docs/mcp/onyx-knowledge-tool.md`**, **`docs/memory/memory-obsidian.md`**.
- **Onyx ingestion API in bundle ([#120](https://github.com/danielsmithdevelopment/ClawQL/issues/120)):** **`POST /onyx-api/ingestion`** as **`onyx_ingest_document`** in **`providers/onyx/openapi.yaml`** for post-Paperless **`execute`** workflows; guide §5 in **`docs/mcp/onyx-knowledge-tool.md`**.

### Changed

- **`vitest.config.ts`:** resolve **`graphql`** to **`index.js`** (not **`index.mjs`**) under Vitest so **`graphql-compose`** and **`@omnigraph/json-schema`** share one **`GraphQLDirective`** class — fixes **`server-http`** and other tests that build in-process GraphQL ([#138](https://github.com/danielsmithdevelopment/ClawQL/issues/138)).
- **`src/notify-graphql-path.test.ts`:** use **`src/test-utils/fixtures/minimal-slack-chat-postmessage.json`** so the GraphQL path stays green on **Node 25** (full **`providers/slack/openapi.json`** still triggers **`@omnigraph/json-schema`** — see **[`docs/design/graphql-mesh-node-compatibility.md`](docs/design/graphql-mesh-node-compatibility.md)**). Full-Slack GraphQL tests tracked in **[#151](https://github.com/danielsmithdevelopment/ClawQL/issues/151)**.
- **`npm run fetch-provider-specs`:** optional **`ONYX_BASE_URL`** (and **`ONYX_API_TOKEN`** / **`CLAWQL_ONYX_API_TOKEN`** for authenticated **`/openapi.json`**) refreshes **`providers/onyx/openapi.yaml`** ([#143](https://github.com/danielsmithdevelopment/ClawQL/issues/143)); upstream output can be large — trim before committing if CI regresses.
- **`charts/clawql-mcp`:** **`enableOnyx`** / **`onyxBaseUrl`** ([#118](https://github.com/danielsmithdevelopment/ClawQL/issues/118)); **`enableOuroboros`** / **`ouroborosDatabaseUrl`** ([#141](https://github.com/danielsmithdevelopment/ClawQL/issues/141), [#142](https://github.com/danielsmithdevelopment/ClawQL/issues/142)). Chart **0.4.0** (**`appVersion` 4.1.0**). **`docs/deployment/helm.md`** and **`charts/clawql-mcp/README.md`** updated.
- **`notify` / Slack `chat_postMessage` default `execute` fields** ([#77](https://github.com/danielsmithdevelopment/ClawQL/issues/77)): default projection now includes **`error`** and **`warning`** so Slack **`ok:false`** bodies are not dropped before **`notify`** surfaces **`error` + `slack`**. Expanded **`src/clawql-notify.test.ts`** (mocked **`node-fetch`** on multi-spec REST, **`thread_ts`** form body, empty **`channel`/`text`**). Future test work: **[`docs/backlog/archive/notify-tool-test-backlog.md`](docs/backlog/archive/notify-tool-test-backlog.md)**.

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

- **Enterprise `audit` tool ([#89](https://github.com/danielsmithdevelopment/ClawQL/issues/89)):** optional MCP tool when **`CLAWQL_ENABLE_AUDIT=1`** — in-process ring buffer (`append` / `list` / `clear`); not on disk. Design: **[docs/mcp/enterprise-mcp-tools.md](docs/mcp/enterprise-mcp-tools.md)**. **Helm:** **`charts/clawql-mcp`** adds **`enableAudit`** (default **`false`**) → **`CLAWQL_ENABLE_AUDIT=1`**.

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
- **`docs/mcp/cache-tool.md`**: canonical **`cache`** vs **`memory_*`**, LRU semantics, env vars, multi-replica; cross-links from **`docs/mcp/mcp-tools.md`**, **`docs/memory/memory-obsidian.md`**, **`docs/integrations/cursor-vault-memory.md`**, **`docs/deployment/deploy-k8s.md`**; website routes **`/cache`** and **`/tools`** (`website/src/app/cache`, `website/src/app/tools`) and nav/sitemap updated.
- **`docs/deployment/deploy-k8s.md`**: TLS/mTLS/mesh and observability notes for port **50051**; gRPC tracking remains on [#67](https://github.com/danielsmithdevelopment/ClawQL/issues/67).
- **`docs/mcp/mcp-tools.md`**: optional tool flags table + pointer to `clawql-optional-flags.ts`.

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

- **MCP `ingest_external_knowledge` ([#40](https://github.com/danielsmithdevelopment/ClawQL/issues/40)):** stub tool + **`CLAWQL_EXTERNAL_INGEST=1`** opt-in for roadmap JSON (no network I/O). Documents how future bulk imports into the vault would align with **`memory_ingest`** / **`memory_recall`** / **`memory.db`**. See **[`docs/mcp/external-ingest.md`](docs/mcp/external-ingest.md)**.
- **Vault provider index ([#38](https://github.com/danielsmithdevelopment/ClawQL/issues/38)):** after successful **`memory_ingest`**, **`updateProviderIndexPage`** writes **`_INDEX_{Provider}.md`** under the recall scan root (default **`Memory/_INDEX_ClawQL.md`**) with **`[[wikilinks]]`** to scanned notes. **Content fingerprint** in an HTML comment skips rewrites when the list is unchanged (avoids NFS/git noise). Disable with **`CLAWQL_MEMORY_INDEX_PAGE=0`**; set **`CLAWQL_MEMORY_INDEX_PROVIDER`** for the label/filename. Module: **`src/memory-provider-index.ts`**.
- **Hybrid `memory_recall` (issues [#26](https://github.com/danielsmithdevelopment/ClawQL/issues/26), [#28](https://github.com/danielsmithdevelopment/ClawQL/issues/28)):** pluggable **vector backends** — **`CLAWQL_VECTOR_BACKEND=sqlite`** stores float32 vectors in **`vault_chunk.embedding`** (sql.js; in-process cosine KNN), or **`postgres`** stores vectors in **Postgres + pgvector** (`clawql_memory_chunk_vector`, cosine via `<=>`) using **`CLAWQL_VECTOR_DATABASE_URL`**. Same OpenAI-compatible **`/embeddings`** pipeline (**`CLAWQL_EMBEDDING_*`**). Dependency: **`pg`** for the Postgres backend.
- **Issue [#28](https://github.com/danielsmithdevelopment/ClawQL/issues/28) (operator / MCP):** **[`docs/memory/memory-db-hybrid-implementation.md`](docs/memory/memory-db-hybrid-implementation.md)** §7 now lists **`CLAWQL_VECTOR_*`**, **`CLAWQL_EMBEDDING_*`**, **`CLAWQL_MEMORY_VECTOR_*`**, optional **`CLAWQL_MCP_LOG_TOOLS`** (shape-only logging for **`memory_ingest`** / **`memory_recall`**), and **reserved** **`CLAWQL_CUCKOO_*`** (pending [#25](https://github.com/danielsmithdevelopment/ClawQL/issues/25)). **`.env.example`** documents the same.

### Changed

- **CI & supply chain:** ESLint + Prettier for `src/` and selected docs; Vitest **coverage** in CI; GitHub Actions pinned to commit SHAs; **Dependabot** for npm and GitHub Actions; **CodeQL** (JavaScript/TypeScript) on push/PR + weekly; weekly **`npm audit --audit-level=high`** (manual dispatch supported). **`npm audit fix`** applied so the audit job starts green. **Layout:** lint and **ShellCheck + actionlint** run in parallel; the **test matrix** waits for both (**fail early**); matrix **`fail-fast: true`** cancels remaining Node versions on first failure; **ESLint / Prettier** use restored caches in CI; **CodeQL** stays in its own workflow so **scheduled** scans do not run the full matrix.
- **Dependencies (major):** TypeScript 6, ESLint 10, Zod 4, Express 5 (aligned with **`@modelcontextprotocol/sdk`**), Prettier 3.8, **`@graphql-mesh/utils`** and **graphql** patch bumps; **GitHub Actions** pinned to **checkout** v6, **setup-node** v6, **codeql-action** v4; dev **`@types/node`** 22. MCP **`execute`** tool args use **`z.record(z.string(), z.unknown())`** for Zod 4.
- **Docs:** **[`docs/memory/memory-obsidian.md`](docs/memory/memory-obsidian.md)**, **[`docs/memory/vector-search-design.md`](docs/memory/vector-search-design.md)**, **[`docs/memory/memory-db-hybrid-implementation.md`](docs/memory/memory-db-hybrid-implementation.md)**, and **[`docs/memory/memory-db-schema.md`](docs/memory/memory-db-schema.md)** now describe **`memory_recall`** as hybrid (lexical + optional OpenAI-compatible embeddings + wikilinks), **`vault_chunk`** vectors when enabled, and distinguish **shipped** vault vectors from **future** spec **`search`** semantics.
- **Hybrid memory architecture:** **[`docs/memory/hybrid-memory-backends.md`](docs/memory/hybrid-memory-backends.md)** documents SQLite-as-default beside vault files, optional Postgres for scale, versioned **`clawql_pg_schema_migrations`**, and hooks for future **Cuckoo** / **Merkle** data. **`embeddingVectorDimension()`** lives in **`memory-embedding.ts`**; stdio + HTTP entrypoints register **Postgres pool shutdown** on **`SIGINT`/`SIGTERM`**.
- **Vector backend parity:** with **`postgres`**, embeddings default to **dual-write** into **`vault_chunk.embedding`** (opt out with **`CLAWQL_MEMORY_VECTOR_DUAL_WRITE=0`**). **`memory_recall`** tries **pgvector** first, then in-process ranking over **`memory.db`** BLOBs when present. **SQLite `memory.db` is still optional** (`CLAWQL_MEMORY_DB=0` or no vault disables it entirely).
- **`effectiveVectorBackend()`:** **`CLAWQL_VECTOR_BACKEND=postgres`** without **`CLAWQL_VECTOR_DATABASE_URL`** now **falls back to SQLite vectors** (with a one-time warning) instead of disabling embeddings. **[`docs/memory/hybrid-memory-backends.md`](docs/memory/hybrid-memory-backends.md)** documents tradeoffs (sqlite vs postgres, dual-write, fallback).

## [3.0.1] - 2026-04-16

### Fixed

- **Packaging:** `npm run build` now removes **`dist/`** before **`tsc`**, so deleted source files do not leave stale **`dist/*.js`** in the published tarball (fixes stray artifacts from the 3.0.0 refactor).

## [3.0.0] - 2026-04-16

### Breaking

- **Unified GraphQL only ([#34](https://github.com/danielsmithdevelopment/ClawQL/issues/34)):** The standalone **`clawql-graphql`** npm binary and split-process deployment using **`GRAPHQL_URL`** are removed. Single-spec **`execute`** always uses in-process OpenAPI→GraphQL; **`clawql-mcp-http`** exposes **`/graphql`** on the same port as **`/mcp`**. Docker Compose, Kubernetes, and Cloud Run templates deploy **one** workload. Remove any second GraphQL container/service and unset **`GRAPHQL_URL`**, **`CLAWQL_COMBINED_MODE`**, and **`CLAWQL_GRAPHQL_EXTERNAL_URL`** if you had added them during the migration period.

### Added

- **`memory.db`** (SQLite via **sql.js**) colocated with the vault: **`vault_document`**, **`vault_chunk`** (`paragraph_v1` chunking contract), and **`wikilink_edge`** rows; rebuilt after successful **`memory_ingest`**, merged into **`memory_recall`** wikilink traversal when enabled. Operator reference: **`docs/memory/memory-db-schema.md`**.

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

- Full MCP surface documented (**`docs/mcp/mcp-tools.md`** and README cross-links); ClawQL Parity v1 marked complete for unified MCP vs ClawQL-Agent.

## [1.0.2] - 2026-04-06

- `execute`: default output fields for GitHub pulls; honor `fields` on REST and multi-spec paths (git `4f80846` and related PRs).

## [1.0.1] - 2026-04-06

- Patch release on npm between 1.0.0 and 1.0.2.

## [1.0.0] - 2026-03-26

- Initial public publish of **`clawql-mcp`**.
