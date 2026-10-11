## clawql-mcp 8.0.0

**npm:** [`clawql-mcp@8.0.0`](https://www.npmjs.com/package/clawql-mcp/v/8.0.0) (publish on tag `v8.0.0`)  
**Full changelog:** [CHANGELOG.md#800---2026-10-03](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#800---2026-10-03)  
**Release date:** 2026-10-03 (prep; tag when checklist clears)  
**Since:** `v7.2.0` (2026-08-04) — **~1878 commits**, **~262 merge PRs**

---

## Headline

**ClawQL 8.0.0** is a **semver-major** with three operator-visible hard breaks:

1. **Bundled OpenAPI catalog is available but not loaded by default**
2. **`ProviderPlugin` only** — legacy `Plugin` bridge removed ([#999](https://github.com/danielsmithdevelopment/ClawQL/pull/999))
3. **Tool-scope enforcement default off** — Panguard proxy is opt-in; boot warns if none active

On top of that, 8.0 ships skills-unified search, Agent Seer scenarios, Managed Edge Gateway / enterprise control plane, payments/Effect hardening, **Effect v4.0.0** cutover (singular `effect` + `@effect/opentelemetry`; `Context.Service` / `Result` / Schema v4), `clawql-web` / `clawql-data` / MCP UI, **`clawql-observability`** LGTM+/Faro, **`clawql-network`** / **`clawql-analytics`**, audit/TEE wedge, meta-ontology + ExtractBench, **Streams celld**, **Fast Decision** + unified capability lifecycle, inference gateway ladder (`/v1`→`/mcp`→`/memory`→`/decision`→`/events`), operation-risk + execute pause/resume, toolkits + self-serve Stripe, product-surface purge (PageIndex/CodeGraph out), repo layout (`apps/` / `manifests/`), security status page, Learn/docs wave, workspace **`0.1.0`** first-publish policy, OpenBench B-7, and Protocol Fabric / personal-agent surfaces.

**ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI.**

**Supply-chain payoff (measured):** vs pre-purge `578e7e77`, the default `clawql-mcp` image at trim tip `d6b432e1` ships **10 fewer** Syft SBOM packages and **2 fewer** Trivy CRITICAL+HIGH+MEDIUM CVEs (~**7.4 MB** smaller compressed) after the PageIndex + CodeGraph purge — see [`8.0.0-payoff-measurement.md`](../releases/8.0.0-payoff-measurement.md).

→ Migration: [`docs/getting-started/migrate-to-8.0.md`](../getting-started/migrate-to-8.0.md) · Announcements: [`docs/announcements/announcement-drafts-v8.0.0.md`](../announcements/announcement-drafts-v8.0.0.md) · Prior: [`RELEASE_NOTES_v7.2.0.md`](RELEASE_NOTES_v7.2.0.md) · Checklist: [`docs/release/v8.0.0-checklist.md`](v8.0.0-checklist.md)

---

## Breaking changes (read first)

### 1. Bundled providers: default empty

|                                         | **7.2.0**                      | **8.0.0**                                                    |
| --------------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| No provider env / instance `providers`  | Auto-load pack **`default`**   | **Empty** catalog (native GraphQL/gRPC only when configured) |
| Helm                                    | `provider: default`            | `providers.pack: none` (set **`default`** to restore)        |
| `CLAWQL_ENABLE_GOOGLE\|AWS\|CLOUDFLARE` | Cloud add-ons on default stack | **Deprecated** for stack selection                           |

```bash
export CLAWQL_PROVIDER=default
# or
export CLAWQL_INSTANCE_SPEC='{"providers":{"pack":"default"}}'
```

```yaml
providers:
  pack: default
```

Boot stderr includes **`BREAKING (8.0.0)`** when the catalog is empty.

### 2. Plugin interface: `ProviderPlugin` only ([#999](https://github.com/danielsmithdevelopment/ClawQL/pull/999))

Phase-2 `Plugin` / `onRegister` / `beforeCallTool` and `legacyPluginToProviderPlugin` are **removed**. Out-of-tree plugins must rewrite to `ProviderPlugin` / `StandaloneSkillPlugin` — **no soft landing**.

→ [`docs/getting-started/migrate-to-8.0.md`](../getting-started/migrate-to-8.0.md) · Spec: [`docs/design/clawql-core-plugin-architecture.md`](../design/clawql-core-plugin-architecture.md)

### 3. Enforcement default off

Bare install does **not** compose a blocking enforcement provider. Opt in:

```bash
export CLAWQL_PANGUARD_PROXY_PLUGIN=1
export CLAWQL_PANGUARD_IN_PROCESS=1
# intentional ungated lab only:
# export CLAWQL_ALLOW_NO_ENFORCEMENT=1
```

Boot emits a **SECURITY WARNING** when zero blocking `pre-execute` hooks are active.

### 4. Plugin composition: instance / tier first

Without `CLAWQL_INSTANCE_SPEC`, composition uses **`CLAWQL_TIER`** (default **`standard`**) and **ignores** bare `CLAWQL_ENABLE_*`. Helm still injects instance JSON from chart `enable*` values.

### 5. Deep workspace importers

`clawql-auth` / `clawql-payments` drop sync/Promise façades (Effect-only public API). Typical `clawql-mcp` npm consumers are unaffected.

### 6. Product surface purge (PageIndex / CodeGraph / hybrid defaults)

**Removed:** `pageindex_*`, `codegraph_*` / `clawql-codegraph`, `CLAWQL_MEMORY_RECALL_HYBRID` master, `CLAWQL_MEMORY_VAULT_RANKER=bm25`. Default IDP converters = **Docling only**. Agent `ouroboros_*` / `clawql_think` default **off**.

→ [`docs/getting-started/migrate-to-8.0.md`](../getting-started/migrate-to-8.0.md) · [`docs/releases/8.0.0-purge-inventory-spec-v0.1.md`](../releases/8.0.0-purge-inventory-spec-v0.1.md)

---

## What’s new since the Sep 7 refresh (through #1197)

| Area                              | What landed                                                                                                                                                                                                                 | PRs                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Effect v4**                     | Production cutover to `effect@4.0.0` + `@effect/opentelemetry@4.0.0`; `Context.Service` / `Result` / Schema v4; platform folded into `effect`; closes [#1034](https://github.com/danielsmithdevelopment/ClawQL/issues/1034) | [#1197](https://github.com/danielsmithdevelopment/ClawQL/pull/1197)                                                                                                                                                                                                                                                                                                                                                         |
| **Fast Decision**                 | GLiNER2/Decide calibrated classifier; held-out suites through v0.6; frontier adjudication GHA; productionTrusted gates                                                                                                      | [#1119](https://github.com/danielsmithdevelopment/ClawQL/pull/1119)–[#1149](https://github.com/danielsmithdevelopment/ClawQL/pull/1149) wave                                                                                                                                                                                                                                                                                |
| **Capability lifecycle**          | Three-bucket `execute()` reachability; default-on MCP gate (`CLAWQL_CAPABILITY_LIFECYCLE=0` opt-out)                                                                                                                        | [#1119](https://github.com/danielsmithdevelopment/ClawQL/pull/1119), [#1121](https://github.com/danielsmithdevelopment/ClawQL/pull/1121)                                                                                                                                                                                                                                                                                    |
| **Inference gateway ladder**      | `/v1` → `/mcp` → `/memory` → `/decision` → `/events`; crypto-shred erase; System One decision façade                                                                                                                        | [#1183](https://github.com/danielsmithdevelopment/ClawQL/pull/1183), [#1196](https://github.com/danielsmithdevelopment/ClawQL/pull/1196)                                                                                                                                                                                                                                                                                    |
| **Risk / HITL**                   | Operation risk from spec (`allow`/`mandate`/`block`); execute pause/resume for mandates                                                                                                                                     | [#1185](https://github.com/danielsmithdevelopment/ClawQL/pull/1185), [#1187](https://github.com/danielsmithdevelopment/ClawQL/pull/1187)                                                                                                                                                                                                                                                                                    |
| **Purge / trim**                  | CodeGraph + PageIndex purge; hybrid BM25/master out; ouroboros tools opt-in; OTEL-only instrumentation clarity                                                                                                              | [#1184](https://github.com/danielsmithdevelopment/ClawQL/pull/1184), [#1186](https://github.com/danielsmithdevelopment/ClawQL/pull/1186), [#1191](https://github.com/danielsmithdevelopment/ClawQL/pull/1191)–[#1193](https://github.com/danielsmithdevelopment/ClawQL/pull/1193)                                                                                                                                           |
| **Toolkits / Stripe / sources**   | Toolkits packaging; self-serve Stripe checkout; sources propose                                                                                                                                                             | [#1188](https://github.com/danielsmithdevelopment/ClawQL/pull/1188)–[#1190](https://github.com/danielsmithdevelopment/ClawQL/pull/1190)                                                                                                                                                                                                                                                                                     |
| **Bursty Streams / AWS celld**    | BurstWatch (Istio/Karpenter/leases); §13 dry-run; celld evidence matrix; WORM honesty                                                                                                                                       | [#1053](https://github.com/danielsmithdevelopment/ClawQL/pull/1053), [#1071](https://github.com/danielsmithdevelopment/ClawQL/pull/1071), [#1121](https://github.com/danielsmithdevelopment/ClawQL/pull/1121)–[#1138](https://github.com/danielsmithdevelopment/ClawQL/pull/1138)                                                                                                                                           |
| **Dashboard / payments / MCP UI** | Topology wire + live smoke; x402 payer; customer provisioning; Stripe catalog ensure; MCP UI starters; ChatGPT MCP extensions                                                                                               | [#1052](https://github.com/danielsmithdevelopment/ClawQL/pull/1052), [#1074](https://github.com/danielsmithdevelopment/ClawQL/pull/1074), [#1076](https://github.com/danielsmithdevelopment/ClawQL/pull/1076)–[#1083](https://github.com/danielsmithdevelopment/ClawQL/pull/1083), [#1112](https://github.com/danielsmithdevelopment/ClawQL/pull/1112), [#1181](https://github.com/danielsmithdevelopment/ClawQL/pull/1181) |
| **Repo layout / docs**            | `apps/` + `manifests/` move; docs/www 8.0 content refresh; stale-docs audit                                                                                                                                                 | [#1048](https://github.com/danielsmithdevelopment/ClawQL/pull/1048), [#1084](https://github.com/danielsmithdevelopment/ClawQL/pull/1084), [#1085](https://github.com/danielsmithdevelopment/ClawQL/pull/1085), [#1113](https://github.com/danielsmithdevelopment/ClawQL/pull/1113)                                                                                                                                          |

---

## What’s new since the first 8.0.0 prep PR (post-#982 / through #999)

| Area                            | What landed                                                                                | PRs                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ProviderPlugin architecture** | Hard break, skills MCP tools, dynamic compose, Agent Seer scenarios, enforcement boot warn | [#999](https://github.com/danielsmithdevelopment/ClawQL/pull/999)                                                                                                                                                                                                          |
| **Observability**               | LGTM+ Phase 1 + CI smoke; Faro JWT Worker proxy; provider registry design                  | [#993](https://github.com/danielsmithdevelopment/ClawQL/pull/993), [#994](https://github.com/danielsmithdevelopment/ClawQL/pull/994), [#995](https://github.com/danielsmithdevelopment/ClawQL/pull/995)                                                                    |
| **MCP UI / demos**              | PixelDrop smart-upload demo + `/mcp-ui` template                                           | [#997](https://github.com/danielsmithdevelopment/ClawQL/pull/997)                                                                                                                                                                                                          |
| **WebMCP**                      | Core source adapter + diagram sources                                                      | [#984](https://github.com/danielsmithdevelopment/ClawQL/pull/984), [#985](https://github.com/danielsmithdevelopment/ClawQL/pull/985)                                                                                                                                       |
| **Audit / TEE**                 | Merkle+audit npm wedge, WORM host dual-write, simulated TEE                                | [#980](https://github.com/danielsmithdevelopment/ClawQL/pull/980), [#981](https://github.com/danielsmithdevelopment/ClawQL/pull/981), [#986](https://github.com/danielsmithdevelopment/ClawQL/pull/986), [#987](https://github.com/danielsmithdevelopment/ClawQL/pull/987) |
| **Auth host + docs**            | Auth host wiring; public auth docs; blog methodology landing                               | [#977](https://github.com/danielsmithdevelopment/ClawQL/pull/977), [#990](https://github.com/danielsmithdevelopment/ClawQL/pull/990), [#989](https://github.com/danielsmithdevelopment/ClawQL/pull/989)                                                                    |
| **Harness**                     | Executor comparison harness                                                                | [#988](https://github.com/danielsmithdevelopment/ClawQL/pull/988)                                                                                                                                                                                                          |

---

## What’s new since the Aug 31 refresh (through #1036)

| Area                              | What landed                                                                                                                                           | PRs                                                                                                                                                                                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Network**                       | `clawql-network` spec v0.1 — Headscale/Tailscale/DERP/init CLI, Effect network state                                                                  | [#1024](https://github.com/danielsmithdevelopment/ClawQL/pull/1024)                                                                                                                                                                                                               |
| **Analytics**                     | `clawql-analytics` PostHog/docs pageview adapter                                                                                                      | [#992](https://github.com/danielsmithdevelopment/ClawQL/pull/992)                                                                                                                                                                                                                 |
| **Ontology / ExtractBench**       | Meta-ontology three-layer; ExtractBench wire + Arm A prep; legal-entity structured recall                                                             | [#963](https://github.com/danielsmithdevelopment/ClawQL/pull/963), [#1018](https://github.com/danielsmithdevelopment/ClawQL/pull/1018), [#1020](https://github.com/danielsmithdevelopment/ClawQL/pull/1020), [#1023](https://github.com/danielsmithdevelopment/ClawQL/pull/1023)  |
| **Agents / PV**                   | `clawql-agents` follow-on; PV anything-to-MCP bridge                                                                                                  | [#967](https://github.com/danielsmithdevelopment/ClawQL/pull/967), [#911](https://github.com/danielsmithdevelopment/ClawQL/pull/911)                                                                                                                                              |
| **Audit / observability publish** | Audit phase 4 publish; observability Phase 5 security dashboards; `0.1.0` versioning resets                                                           | [#1007](https://github.com/danielsmithdevelopment/ClawQL/pull/1007), [#1013](https://github.com/danielsmithdevelopment/ClawQL/pull/1013), [#1017](https://github.com/danielsmithdevelopment/ClawQL/pull/1017)                                                                     |
| **Auth / security docs**          | clawql.com auth audit; Security sidebar; OSV supply-chain docs                                                                                        | [#991](https://github.com/danielsmithdevelopment/ClawQL/pull/991), [#1021](https://github.com/danielsmithdevelopment/ClawQL/pull/1021), [#1026](https://github.com/danielsmithdevelopment/ClawQL/pull/1026)                                                                       |
| **Demos**                         | PixelDrop iPhone HEIC verified                                                                                                                        | [#998](https://github.com/danielsmithdevelopment/ClawQL/pull/998)                                                                                                                                                                                                                 |
| **Harness**                       | `clawql-harness@0.1.0` workspace alignment                                                                                                            | [#1019](https://github.com/danielsmithdevelopment/ClawQL/pull/1019)                                                                                                                                                                                                               |
| **Effect everywhere**             | `*Live` / `*Layer` in every package; Effect v4 RC spike docs                                                                                          | [#1031](https://github.com/danielsmithdevelopment/ClawQL/pull/1031), [#1035](https://github.com/danielsmithdevelopment/ClawQL/pull/1035)                                                                                                                                          |
| **Learn / 8.0 docs**              | Discoverability (Learn sidebar, Plugins, `/archive`); payments/Panguard; Streams + optional tools; IDP labs; migrate-to-8 site audit; NATS IDP + KEDA | [#1025](https://github.com/danielsmithdevelopment/ClawQL/pull/1025)–[#1032](https://github.com/danielsmithdevelopment/ClawQL/pull/1032), [#1028](https://github.com/danielsmithdevelopment/ClawQL/pull/1028), [#1036](https://github.com/danielsmithdevelopment/ClawQL/pull/1036) |
| **Workspace semver**              | Independent `0.1.0` first-publish policy (not lockstep `8.0.0` on every `clawql-*`)                                                                   | [#1017](https://github.com/danielsmithdevelopment/ClawQL/pull/1017), [#1019](https://github.com/danielsmithdevelopment/ClawQL/pull/1019) + [`clawql-workspace-package-versioning.md`](docs/release/clawql-workspace-package-versioning.md)                                        |

---

## What’s new since the Sep 2 refresh (through #1047)

| Area                     | What landed                                                                              | PRs                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Security status**      | `/security/status` scan-history evidence page; CI publish; `SECURITY.md`                 | [#1033](https://github.com/danielsmithdevelopment/ClawQL/pull/1033)                                                                      |
| **Effect v4 Stage 0**    | Spike inventory + try-RC CI workflow (no runtime bump)                                   | [#1037](https://github.com/danielsmithdevelopment/ClawQL/pull/1037)                                                                      |
| **Docs polish**          | Mobile content padding; live `/archive` pages                                            | [#1039](https://github.com/danielsmithdevelopment/ClawQL/pull/1039), [#1040](https://github.com/danielsmithdevelopment/ClawQL/pull/1040) |
| **Streams celld v0.4.0** | Lab 5 local smoke; Helm `celld` stack + example values; streams onboarding CLI           | [#1041](https://github.com/danielsmithdevelopment/ClawQL/pull/1041), [#1042](https://github.com/danielsmithdevelopment/ClawQL/pull/1042) |
| **celld AgentSessionDO** | Embed `streams-slim`; MCP search/execute + memory fetch; adapter REST fetch; audit → LTX | [#1043](https://github.com/danielsmithdevelopment/ClawQL/pull/1043)–[#1047](https://github.com/danielsmithdevelopment/ClawQL/pull/1047)  |

---

## What’s new (full 7.2.0 → 8.0.0 operator truths)

### Gateway / edge / enterprise

- Dedicated VG Managed Edge Gateway boot (#748)
- Edge Phase 1 + 2 (IDP proxy origin, Pulumi binding) (#843, #869)
- Helm `managedGateway` hardening (#870)
- Enterprise control plane (#849)
- **Inference gateway ladder** — `/v1`→`/mcp`→`/memory`→`/decision`→`/events` (#1183, #1196)
- Operation-risk-from-spec + execute pause/resume (#1185, #1187)
- Self-serve Stripe checkout + toolkits packaging (#1189, #1190)

### Web / data / MCP UI

- **`clawql-web`** — `web_search` / `web_fetch` (#854+)
- **`clawql-data`** — DuckDB `data_*` tools
- MCP UI HTMX playground (#912, #970+) + PixelDrop (#997)

### Payments / auth / Effect

- Credits HATEOAS auth gate (#842); hosted P2P/compensation off by default (#847)
- Effect-everywhere credits/auth (#851)
- OAuth AS + ID-JAG (#942, #961)

### Skills / plugins / Seer

- Unified search ranks operations **and** skills
- `skills_list` / `skills_get`; dynamic horizontal plugin Layers
- Agent Seer §9 scenario synthesis

### Observability / audit

- **`clawql-observability@0.1.0`** — first npm release: LGTM+ through Phase 5 (Faro, registry, Alloy, query, host wiring, Langfuse/Panguard, security sensors, alerting)
- **`clawql-merkle` + `clawql-audit`** wedge + WORM dual-write
- **`clawql-tee`** simulated TEE

### Network / analytics / ontology

- **`clawql-network@0.1.0`** — Headscale/Tailscale/DERP/init CLI (#1024)
- **`clawql-analytics@0.1.0`** — PostHog/docs pageview adapter (#992)
- Meta-ontology three-layer + ExtractBench wire (#963, #1018, #1023)
- Legal-entity structured recall (#1020)

### OpenBench / agents / fabric

- OpenBench B-7 suite + advanced Phase 1 packs
- Personal agent / Harvey Lab / `clawql-agents` (#967)
- PV anything-to-MCP (#911)
- Streams + Protocol Fabric site (#962, #966)
- **Streams celld v0.4.0** — Lab 5 + Helm stack; AgentSessionDO MCP/adapter/audit-LTX path (#1041–#1047)
- IDP NATS agent bridge; WebMCP provenance
- Learn wave for 8.0 migration (#1025–#1032, #1036); site audit (#1028)

### Docs / Learn (8.0 migration)

- Learn sidebar: Plugins, Streams, optional MCP tools, payments/Panguard, IDP labs
- Security section + OSV supply-chain docs (#1021, #1026)
- **Security status page** — `/security/status` scan-history evidence (#1033)
- [`docs/getting-started/migrate-to-8.0.md`](docs/getting-started/migrate-to-8.0.md) linked from site audit (#1028)

### Standalone npm (this tag)

| Package                                       | Version   | Notes                                                       |
| --------------------------------------------- | --------- | ----------------------------------------------------------- |
| `clawql-mcp`                                  | **8.0.0** | Gateway consumer surface                                    |
| `mcp-grpc-transport`                          | **1.0.0** | Major vs npm **0.2.0**                                      |
| `mcp-api-adapter`                             | **0.1.0** | First registry publish                                      |
| `clawql-ouroboros`                            | **0.1.1** | Aligns with npm (monorepo catch-up)                         |
| `clawql-merkle` / `clawql-audit`              | **0.1.0** | Audit wedge; prefer wedge workflow if OIDC-gated            |
| `clawql-core`, `clawql-api`, `clawql-auth`, … | **0.1.0** | First publish for each (were in-tree `8.0.0` lockstep only) |
| `clawql-observability`                        | **0.1.0** | LGTM+ Phases 1–5                                            |
| `clawql-network` / `clawql-analytics`         | **0.1.0** | Network mesh CLI; docs analytics adapter                    |
| `clawql-harness`                              | **0.1.0** | Bench / scenario harness                                    |

Full policy: [`docs/release/clawql-workspace-package-versioning.md`](clawql-workspace-package-versioning.md).

---

## Upgrade (7.2.0 → 8.0.0)

```bash
npm install clawql-mcp@8.0.0
# or
npx -p clawql-mcp@8.0.0 clawql-mcp

# Restore 7.x default API stack if you need it
export CLAWQL_PROVIDER=default

# Opt in enforcement (recommended for production MCP)
export CLAWQL_PANGUARD_PROXY_PLUGIN=1
export CLAWQL_PANGUARD_IN_PROCESS=1

helm upgrade --install clawql ./manifests/charts/clawql-mcp \
  --set image.tag=8.0.0 \
  --set providers.pack=default
```

### Behavioral notes (not additional majors)

- **`/graphql`** is skipped when the catalog stub has no OpenAPI servers (empty default is healthz-safe).
- Vectors remain mandatory for memory (shipped in **7.2.0**).
- **Post-8.0.0 evidence headers (memory / eval):** retrieved section bodies now carry identity metadata for agents — code chunks as `// file: path`, markdown as `### {doc} · §{n} · {heading} · ~{pct}% through document` (`read_around` + pageindex-ab harness). Prevents “which file exports…?” failures when the path lived only in the section id.
- Auth default remains **`noAuth`**; credits HATEOAS gate applies when `CLAWQL_AUTH_MODE=apiKey|oidc` (or explicit require flag).
- `managedGateway.networkPolicy.enabled: true` only when `managedGateway.enabled=true` (default **off**).

---

## Helm

| Chart                              | Chart version | appVersion |
| ---------------------------------- | ------------- | ---------- |
| `manifests/charts/clawql-mcp`      | `0.8.0`       | `8.0.0`    |
| `manifests/charts/clawql-operator` | `0.3.0`       | `8.0.0`    |
| `manifests/charts/clawql-idp`      | `0.2.0`       | `8.0.0`    |

---

## Out of scope for 8.0.0

- Reverting empty-by-default providers or reintroducing the legacy `Plugin` bridge (intentional majors).
- Soft-landing Helm `providers.pack: default` while npm stays empty (intentionally aligned empty).
- Full separate registry publish of every `clawql-*` package if OIDC linking still blocks (`clawql-mcp` remains the consumer surface; audit wedge has its own workflow).
- Reconciling legacy **`clawql-ouroboros@0.1.1`** on npm vs monorepo line beyond aligning in-tree to **0.1.1** (see [`clawql-workspace-package-versioning.md`](clawql-workspace-package-versioning.md)).

---

## Release checklist

See [`docs/release/v8.0.0-checklist.md`](v8.0.0-checklist.md).
