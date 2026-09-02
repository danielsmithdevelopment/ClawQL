## clawql-mcp 8.0.0

**npm:** [`clawql-mcp@8.0.0`](https://www.npmjs.com/package/clawql-mcp/v/8.0.0) (publish on tag `v8.0.0`)  
**Full changelog:** [CHANGELOG.md#800---2026-09-02](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#800---2026-09-02)  
**Release date:** 2026-09-02 (prep; tag when checklist clears)  
**Since:** `v7.2.0` (2026-08-04) — **~1174 commits**, **~174 merge PRs**

---

## Headline

**ClawQL 8.0.0** is a **semver-major** with three operator-visible hard breaks:

1. **Bundled OpenAPI catalog is available but not loaded by default**
2. **`ProviderPlugin` only** — legacy `Plugin` bridge removed ([#999](https://github.com/danielsmithdevelopment/ClawQL/pull/999))
3. **Tool-scope enforcement default off** — Panguard proxy is opt-in; boot warns if none active

On top of that, 8.0 ships skills-unified search, Agent Seer scenarios, Managed Edge Gateway / enterprise control plane, payments/Effect hardening, `clawql-web` / `clawql-data` / MCP UI, **`clawql-observability`** LGTM+/Faro, **`clawql-network`** / **`clawql-analytics`**, audit/TEE wedge, meta-ontology + ExtractBench, a Learn/docs wave for 8.0 migration, workspace **`0.1.0`** first-publish policy, OpenBench B-7, and Protocol Fabric / personal-agent surfaces.

**ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI.**

→ Migration: [`docs/getting-started/migrate-to-8.0.md`](docs/getting-started/migrate-to-8.0.md) · Announcements: [`docs/announcements/announcement-drafts-v8.0.0.md`](docs/announcements/announcement-drafts-v8.0.0.md) · Prior: [`RELEASE_NOTES_v7.2.0.md`](RELEASE_NOTES_v7.2.0.md) · Checklist: [`docs/release/v8.0.0-checklist.md`](docs/release/v8.0.0-checklist.md)

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

→ [`docs/getting-started/migrate-to-8.0.md`](docs/getting-started/migrate-to-8.0.md) · Spec: [`docs/design/clawql-core-plugin-architecture.md`](docs/design/clawql-core-plugin-architecture.md)

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

| Area | What landed | PRs |
| ---- | ----------- | --- |
| **Network** | `clawql-network` spec v0.1 — Headscale/Tailscale/DERP/init CLI, Effect network state | [#1024](https://github.com/danielsmithdevelopment/ClawQL/pull/1024) |
| **Analytics** | `clawql-analytics` PostHog/docs pageview adapter | [#992](https://github.com/danielsmithdevelopment/ClawQL/pull/992) |
| **Ontology / ExtractBench** | Meta-ontology three-layer; ExtractBench wire + Arm A prep; legal-entity structured recall | [#963](https://github.com/danielsmithdevelopment/ClawQL/pull/963), [#1018](https://github.com/danielsmithdevelopment/ClawQL/pull/1018), [#1020](https://github.com/danielsmithdevelopment/ClawQL/pull/1020), [#1023](https://github.com/danielsmithdevelopment/ClawQL/pull/1023) |
| **Agents / PV** | `clawql-agents` follow-on; PV anything-to-MCP bridge | [#967](https://github.com/danielsmithdevelopment/ClawQL/pull/967), [#911](https://github.com/danielsmithdevelopment/ClawQL/pull/911) |
| **Audit / observability publish** | Audit phase 4 publish; observability Phase 5 security dashboards; `0.1.0` versioning resets | [#1007](https://github.com/danielsmithdevelopment/ClawQL/pull/1007), [#1013](https://github.com/danielsmithdevelopment/ClawQL/pull/1013), [#1017](https://github.com/danielsmithdevelopment/ClawQL/pull/1017) |
| **Auth / security docs** | clawql.com auth audit; Security sidebar; OSV supply-chain docs | [#991](https://github.com/danielsmithdevelopment/ClawQL/pull/991), [#1021](https://github.com/danielsmithdevelopment/ClawQL/pull/1021), [#1026](https://github.com/danielsmithdevelopment/ClawQL/pull/1026) |
| **Demos** | PixelDrop iPhone HEIC verified | [#998](https://github.com/danielsmithdevelopment/ClawQL/pull/998) |
| **Harness** | `clawql-harness@0.1.0` workspace alignment | [#1019](https://github.com/danielsmithdevelopment/ClawQL/pull/1019) |
| **Effect everywhere** | `*Live` / `*Layer` in every package; Effect v4 RC spike docs | [#1031](https://github.com/danielsmithdevelopment/ClawQL/pull/1031), [#1035](https://github.com/danielsmithdevelopment/ClawQL/pull/1035) |
| **Learn / 8.0 docs** | Discoverability (Learn sidebar, Plugins, `/archive`); payments/Panguard; Streams + optional tools; IDP labs; migrate-to-8 site audit; NATS IDP + KEDA | [#1025](https://github.com/danielsmithdevelopment/ClawQL/pull/1025)–[#1032](https://github.com/danielsmithdevelopment/ClawQL/pull/1032), [#1028](https://github.com/danielsmithdevelopment/ClawQL/pull/1028), [#1036](https://github.com/danielsmithdevelopment/ClawQL/pull/1036) |
| **Workspace semver** | Independent `0.1.0` first-publish policy (not lockstep `8.0.0` on every `clawql-*`) | [#1017](https://github.com/danielsmithdevelopment/ClawQL/pull/1017), [#1019](https://github.com/danielsmithdevelopment/ClawQL/pull/1019) + [`clawql-workspace-package-versioning.md`](docs/release/clawql-workspace-package-versioning.md) |

---

## What’s new (full 7.2.0 → 8.0.0 operator truths)

### Gateway / edge / enterprise

- Dedicated VG Managed Edge Gateway boot (#748)
- Edge Phase 1 + 2 (IDP proxy origin, Pulumi binding) (#843, #869)
- Helm `managedGateway` hardening (#870)
- Enterprise control plane (#849)

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
- IDP NATS agent bridge; WebMCP provenance
- Learn wave for 8.0 migration (#1025–#1032, #1036); site audit (#1028)

### Docs / Learn (8.0 migration)

- Learn sidebar: Plugins, Streams, optional MCP tools, payments/Panguard, IDP labs
- Security section + OSV supply-chain docs (#1021, #1026)
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

Full policy: [`docs/release/clawql-workspace-package-versioning.md`](docs/release/clawql-workspace-package-versioning.md).

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

helm upgrade --install clawql ./charts/clawql-mcp \
  --set image.tag=8.0.0 \
  --set providers.pack=default
```

### Behavioral notes (not additional majors)

- **`/graphql`** is skipped when the catalog stub has no OpenAPI servers (empty default is healthz-safe).
- Vectors remain mandatory for memory (shipped in **7.2.0**).
- Auth default remains **`noAuth`**; credits HATEOAS gate applies when `CLAWQL_AUTH_MODE=apiKey|oidc` (or explicit require flag).
- `managedGateway.networkPolicy.enabled: true` only when `managedGateway.enabled=true` (default **off**).

---

## Helm

| Chart                    | Chart version | appVersion |
| ------------------------ | ------------- | ---------- |
| `charts/clawql-mcp`      | `0.8.0`       | `8.0.0`    |
| `charts/clawql-operator` | `0.3.0`       | `8.0.0`    |
| `charts/clawql-idp`      | `0.2.0`       | `8.0.0`    |

---

## Out of scope for 8.0.0

- Reverting empty-by-default providers or reintroducing the legacy `Plugin` bridge (intentional majors).
- Soft-landing Helm `providers.pack: default` while npm stays empty (intentionally aligned empty).
- Full separate registry publish of every `clawql-*` package if OIDC linking still blocks (`clawql-mcp` remains the consumer surface; audit wedge has its own workflow).
- Reconciling legacy **`clawql-ouroboros@0.1.1`** on npm vs monorepo line beyond aligning in-tree to **0.1.1** (see [`clawql-workspace-package-versioning.md`](docs/release/clawql-workspace-package-versioning.md)).

---

## Release checklist

See [`docs/release/v8.0.0-checklist.md`](docs/release/v8.0.0-checklist.md).
