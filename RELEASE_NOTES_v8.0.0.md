## clawql-mcp 8.0.0

**npm:** [`clawql-mcp@8.0.0`](https://www.npmjs.com/package/clawql-mcp/v/8.0.0) (publish on tag `v8.0.0`)  
**Full changelog:** [CHANGELOG.md#800---2026-08-26](https://github.com/danielsmithdevelopment/ClawQL/blob/main/CHANGELOG.md#800---2026-08-26)  
**Release date:** 2026-08-26  
**Since:** `v7.2.0` (2026-08-04) — **~785 commits**, **~114 merged PRs** (product + Dependabot)

---

## Headline

**ClawQL 8.0.0** is a **semver-major**: the bundled OpenAPI catalog is **available but not loaded by default**, plugin toggles are **instance/tier-first**, and the post-7.2.0 wave ships Managed Edge Gateway, enterprise control plane, payments/Effect hardening, `clawql-web` / `clawql-data`, MCP UI, OpenBench B-7, and Protocol Fabric / personal-agent surfaces.

**ClawQL provides the Agentic Gateway as the Foundational Platform for Auditable Production AI.** 7.x closed Memory Stack + IDP Partials; **8.0** makes opt-in the default and lands the gateway/credits/web fabric built on that line.

→ Announcement drafts: [`docs/announcements/announcement-drafts-v8.0.0.md`](docs/announcements/announcement-drafts-v8.0.0.md) · Prior: [`RELEASE_NOTES_v7.2.0.md`](RELEASE_NOTES_v7.2.0.md) · Checklist: [`docs/release/v8.0.0-checklist.md`](docs/release/v8.0.0-checklist.md)

---

## Breaking changes (read first)

### 1. Bundled providers: default empty

| | **7.2.0** | **8.0.0** |
| --- | --- | --- |
| No provider env / instance `providers` | Auto-load pack **`default`** | **Empty** catalog (native GraphQL/gRPC only when configured) |
| Helm | `provider: default` | `providers.pack: none` (set **`default`** to restore) |
| `CLAWQL_ENABLE_GOOGLE\|AWS\|CLOUDFLARE` | Cloud add-ons on default stack | **Deprecated** for stack selection |

**Migration (one-liner):**

```bash
export CLAWQL_PROVIDER=default
# or
export CLAWQL_INSTANCE_SPEC='{"providers":{"pack":"default"}}'
```

Helm:

```yaml
providers:
  pack: default
```

Boot stderr includes **`BREAKING (8.0.0)`** when the catalog is empty. Docs: [`docs/plugins/bundled-providers.md`](docs/plugins/bundled-providers.md).

### 2. Plugin composition: instance / tier first

Without `CLAWQL_INSTANCE_SPEC`, composition uses **`CLAWQL_TIER`** (default **`standard`**) and **ignores** bare `CLAWQL_ENABLE_*`. Helm continues to inject instance JSON from chart `enable*` values. Put toggles in instance JSON or set `CLAWQL_TIER`.

### 3. Deep workspace importers

`clawql-auth` / `clawql-payments` drop sync/Promise façades (Effect-only public API). Typical `clawql-mcp` npm consumers are unaffected.

---

## What’s new (operator truths)

### Gateway / edge / enterprise

- Dedicated VG Managed Edge Gateway boot (#748)
- Edge Phase 1 + 2 (IDP proxy origin, Pulumi binding) (#843, #869)
- Helm `managedGateway` hardening (#870)
- Enterprise control plane (#849)

### Web / data / MCP UI

- **`clawql-web`** — `web_search` / `web_fetch` (#854+)
- **`clawql-data`** — DuckDB `data_*` tools
- MCP UI HTMX playground (#912, #970+)

### Payments / auth / Effect

- Credits HATEOAS auth gate (#842); hosted P2P/compensation off by default (#847)
- Effect-everywhere credits/auth (#851)
- OAuth AS + ID-JAG (#942, #961)

### OpenBench / agents / fabric

- OpenBench B-7 suite + advanced Phase 1 packs
- Personal agent / Harvey Lab / `clawql-agents`
- Streams + Protocol Fabric site (#962, #966)
- IDP NATS agent bridge

### Standalone npm (this tag)

| Package | Version | Notes |
| --- | --- | --- |
| `clawql-mcp` | **8.0.0** | Lockstep workspace |
| `mcp-grpc-transport` | **1.0.0** | Major vs npm **0.2.0** for standalone grpc users |
| `mcp-api-adapter` | **0.6.0** | First registry publish (from-source docs #855) |

---

## Upgrade (7.2.0 → 8.0.0)

```bash
npm install clawql-mcp@8.0.0
# or
npx -p clawql-mcp@8.0.0 clawql-mcp

# Restore 7.x default API stack if you need it
export CLAWQL_PROVIDER=default

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

| Chart | Chart version | appVersion |
| --- | --- | --- |
| `charts/clawql-mcp` | `0.8.0` | `8.0.0` |
| `charts/clawql-operator` | `0.3.0` | `8.0.0` |
| `charts/clawql-idp` | `0.2.0` | `8.0.0` |

---

## Out of scope for 8.0.0

- Reverting empty-by-default providers (intentional major).
- Separate npm publish of every `clawql-*` package if OIDC linking still blocks (publish order ready; `clawql-mcp` remains the consumer surface).
- Reconciling legacy **`clawql-ouroboros@0.1.1`** on npm vs monorepo **8.0.0** (document / deprecate on publish day).

---

## Release checklist

See [`docs/release/v8.0.0-checklist.md`](docs/release/v8.0.0-checklist.md).
