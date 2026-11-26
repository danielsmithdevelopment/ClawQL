# Migrating to ClawQL 8.0.0

**Breaking release means breaking release.** The Phase-2 `Plugin` / `onRegister` / `beforeCallTool` interface is **removed**. There is no compatibility bridge. Rewrite plugins against `ProviderPlugin` / `StandaloneSkillPlugin`. Defaults also change (empty catalog, loopback-first auth, GraphQL/embeddings local-first). On `standard`, Panguard stays opt-in with a boot warning; on `regulated`, enforcement/WORM/local-inference are forced.

## Breaking defaults (read first)

| Before 8.0                                                                                    | After 8.0                                                       | What to set                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundled OpenAPI pack often loaded                                                             | **Empty catalog** until opted in                                | `CLAWQL_PROVIDER=default` or `CLAWQL_INSTANCE_SPEC='{"providers":{"pack":"default"}}'` / Helm `providers.pack=default`                                                                                                                                                                                                                                                                                                                                                                                |
| Panguard proxy composed by default                                                            | **Off on `standard`** until opted in; **forced on `regulated`** | `CLAWQL_PANGUARD_PROXY_PLUGIN=1` (+ `CLAWQL_PANGUARD_IN_PROCESS=1`). Do **not** set `CLAWQL_ALLOW_NO_ENFORCEMENT=1` under regulated                                                                                                                                                                                                                                                                                                                                                                   |
| In-process ATR gating opt-in                                                                  | Still opt-in on `standard`; forced with regulated profile       | `CLAWQL_PANGUARD_IN_PROCESS=1` (+ block list / real policy as needed)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Silent ungated tools if Panguard passive                                                      | **SECURITY WARNING** at boot                                    | Install any blocking enforcement provider, or set `CLAWQL_ALLOW_NO_ENFORCEMENT=1` only if intentional (**refused** when `CLAWQL_TIER=regulated`)                                                                                                                                                                                                                                                                                                                                                      |
| `pageindex_*` tools / hybrid PageIndex                                                        | **Removed** in 8.0                                              | Drop `CLAWQL_ENABLE_PAGEINDEX`, `CLAWQL_MEMORY_RECALL_HYBRID_PAGEINDEX`, and `pageindex.db.json` sync — see [purge inventory](../releases/8.0.0-purge-inventory-spec-v0.1.md)                                                                                                                                                                                                                                                                                                                         |
| `codegraph_*` tools / Graphify import                                                         | **Removed** in 8.0                                              | Drop `CLAWQL_ENABLE_CODEGRAPH`, `CLAWQL_CODEGRAPH_*`, `CLAWQL_MEMORY_RECALL_HYBRID_CODEGRAPH`, and `clawql-codegraph` — see [purge inventory](../releases/8.0.0-purge-inventory-spec-v0.1.md) and [post-8.0 backlog](../backlog/post-8.0-codegraph-revisit.md)                                                                                                                                                                                                                                        |
| Tika / Gotenberg / Stirling in default `DEFAULT_IDP_PIPELINE` + `BUNDLED_DOCUMENT_VENDOR_IDS` | **Opt-in only** — Docling is the sole default converter         | Specs stay on disk (**not hard-purged**); named jobs: Tika=cheap text, Gotenberg=Office→PDF, Stirling=redact, Anydoc=fast Office. Re-add with `CLAWQL_BUNDLED_PROVIDERS=tika,gotenberg,stirling` and/or Helm `documentPipeline.{tika,gotenberg,stirling}.enabled=true` — see [purge inventory](../releases/8.0.0-purge-inventory-spec-v0.1.md)                                                                                                                                                        |
| `ingest_external_knowledge` always listed when documents on                                   | **Hidden** unless `CLAWQL_EXTERNAL_INGEST=1`                    | Vault writes: use **`memory_ingest`**. Bulk/URL import still available behind the existing exact-`1` flag (+ optional `CLAWQL_EXTERNAL_INGEST_FETCH=1`)                                                                                                                                                                                                                                                                                                                                               |
| Dual MCP tools `data_query` + `clawql_sql`                                                    | **`data_query` only** by default                                | Set `CLAWQL_ENABLE_CLAWQL_SQL_ALIAS=1` if a client allowlists `clawql_sql` directly. Harvey LAB already remaps via `lab-mcp-proxy.mjs`                                                                                                                                                                                                                                                                                                                                                                |
| `CLAWQL_MEMORY_RECALL_HYBRID` master                                                          | **Removed** in 8.0                                              | Drop the master switch; use explicit `memory_recall` **`sources`**, or `CLAWQL_MEMORY_RECALL_HYBRID_ONYX=1` for Onyx-only default merge — see [purge inventory](../releases/8.0.0-purge-inventory-spec-v0.1.md)                                                                                                                                                                                                                                                                                       |
| `CLAWQL_MEMORY_VAULT_RANKER=bm25` option                                                      | **Removed** in 8.0                                              | Drop `CLAWQL_MEMORY_VAULT_RANKER=bm25` — `idf` is now the only vault lexical ranker (measured wash vs IDF); operators who still set `bm25` get a one-time warning and fall back to `idf` — see [purge inventory](../releases/8.0.0-purge-inventory-spec-v0.1.md)                                                                                                                                                                                                                                      |
| `CLAWQL_ENABLE_VISION`                                                                        | **Deleted** in 8.0                                              | Placeholder flag for a `vision`/`multimodal` tool that never shipped; delete it from env/config — no replacement                                                                                                                                                                                                                                                                                                                                                                                      |
| Instrumentation / metrics / work traces                                                       | **Clarified** in 8.0 (not a default flip)                       | **OpenTelemetry** is the sole instrumentation layer (`CLAWQL_ENABLE_OTEL_TRACING`). **Prometheus** (`GET /metrics` / `CLAWQL_ENABLE_HTTP_METRICS`) and **Langfuse** (`CLAWQL_ENABLE_LANGFUSE`) are **export destinations**. `observability_*` stay opt-in (`CLAWQL_ENABLE_OBSERVABILITY`, default **off**) for operator LGTM+ query/apply — see [observability README](../observability/README.md#one-instrumentation-layer-80) and [purge inventory](../releases/8.0.0-purge-inventory-spec-v0.1.md) |
| `CLAWQL_ENABLE_OUROBOROS`                                                                     | **Deleted** from `.env.example` / docs                          | Was already deprecated as a registration gate — never resurrected as a gate name. Keep `CLAWQL_OUROBOROS_DATABASE_URL` (or split `CLAWQL_OUROBOROS_DB_*` vars) for durable Postgres lineage                                                                                                                                                                                                                                                                                                           |
| Agent-facing `ouroboros_*` / `clawql_think` (always on via `clawql-harness`)                  | **Default OFF** in 8.0 (opt-in)                                 | Register with `CLAWQL_ENABLE_OUROBOROS_TOOLS=1` or instance/tier `ouroboros.enabled: true`. No additive agent-loop proof yet — demoted, not purged; `clawql-ouroboros` / `clawql-harness` packages and server-side Ouroboros lifecycle are unchanged — see [purge inventory](../releases/8.0.0-purge-inventory-spec-v0.1.md)                                                                                                                                                                          |
| Section IDs from TOC / list “headings”                                                        | **Filtered** in `read_around`                                   | See [Section artifact headings](#section-artifact-headings-toc--lists)                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Plugin` + `beforeCallTool`                                                                   | **Deleted**                                                     | Author `ProviderPlugin` with `tools` / `hooks` / `defineRegisteringProviderPlugin`                                                                                                                                                                                                                                                                                                                                                                                                                    |

Bare `clawql-mcp` after upgrade: `search` / `execute` / `cache` / `audit` / `skills_list` / `skills_get` — **no** GitHub/Slack/… ops and **no** tool-scope enforcement on `standard` until you opt in.

## Breaking changes from the security audit

These are independent of the empty-catalog / ProviderPlugin majors. Escape-hatch inventory: [`docs/security/secure-defaults.md`](../security/secure-defaults.md).

| Topic                          | What changed                                                                                                                         | Operator action                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **Loopback default bind**      | MCP HTTP defaults to `MCP_HOST=127.0.0.1` with Host allowlist for DNS rebinding                                                      | Keep loopback for local agents; set `MCP_ALLOWED_HOSTS` + real auth for Tailscale/internal hostnames |
| **`noAuth` off loopback**      | Non-loopback `noAuth` refused unless `CLAWQL_ALLOW_UNAUTHENTICATED=1`; regulated refuses `noAuth`                                    | Prefer `CLAWQL_AUTH_MODE=apiKey` or `oidc` on anything networked                                     |
| **gRPC auth / TLS**            | Auth wrapper always; TLS required off loopback (regulated requires cert/key)                                                         | Set `GRPC_TLS_*` or bind `127.0.0.1`; avoid `GRPC_ALLOW_INSECURE=1` outside demos                    |
| **Webhook tokens**             | Shared secrets required                                                                                                              | Set `CLAWQL_*_WEBHOOK_TOKEN` (or demo-only `CLAWQL_WEBHOOK_ALLOW_UNAUTHENTICATED=1`)                 |
| **NATS creds + TLS**           | Creds and `tls://` / `wss://` required                                                                                               | Configure user/pass, token, or creds file; avoid `CLAWQL_NATS_ALLOW_INSECURE=1`                      |
| **Decline-only MCP resume**    | MCP `resume` cannot approve mandates                                                                                                 | Approve from console / signed human path; MCP may decline only                                       |
| **GraphQL off by default**     | In-process `/graphql` needs `CLAWQL_HTTP_GRAPHQL=1`; regulated refuses                                                               | Leave unset unless you accept execute-core bypass                                                    |
| **LangExtract → Ollama**       | Live extraction should use local Ollama rather than cloud aggregators by default policy                                              | `LANGEXTRACT_BACKEND=ollama` (+ local model) for live; keep tool opt-in                              |
| **Local embeddings**           | MiniLM local unless `CLAWQL_EMBEDDING_PROVIDER=http`                                                                                 | Do not rely on `OPENAI_API_KEY` alone; set `http` + allowlist under regulated                        |
| **Sources excluded from sync** | Team sync never uploads `sources/`, vault, auth, WORM, `clawql.env`                                                                  | Keep executable source defs local; sync Memory/chats only                                            |
| **Operator payment approvals** | Hash-only operator key and/or dedicated OIDC approve audience                                                                        | See [`outbound-payment-approve.md`](../security/outbound-payment-approve.md)                         |
| **Dashboard auth / passkey**   | Managed console requires session auth; synced passkeys for sign-in, device-bound for approvals; Desktop APIs desktop-mode + loopback | Wire OIDC/passkey for managed; keep Desktop on `127.0.0.1`                                           |

## Plugin interface (hard break)

- **Only** `ProviderPlugin` and `StandaloneSkillPlugin` from `clawql-core` are installable.
- Tool registration: declare `tools` on the plugin, or use `defineRegisteringProviderPlugin({ register })` for env-gated sets.
- Enforcement: blocking `tool` / `pre-execute` hooks (not `beforeCallTool`). Awaited by `McpProxyPipeline` via `fireHook` (ATR never-loosen).
- Horizontal tiers: production MCP boot uses **dynamic** `import()` via `ensureClawqlApi()` / `createRegisteredMcpServerAsync()`. Sync `getClawqlApi()` still static-composes for tests.

### Rewrite sketch

```ts
import { defineProviderPlugin, defineRegisteringProviderPlugin } from "clawql-core";
import { Effect } from "effect";

// Tools
export const myPlugin = defineRegisteringProviderPlugin({
  id: "my-plugin",
  version: "1.0.0",
  description: "…",
  register: (api) =>
    Effect.gen(function* () {
      yield* api.registerMcpTool({ name: "my_tool", schema, handler });
    }),
});

// Enforcement (hooks-only is valid)
export const gate = defineProviderPlugin({
  id: "my-gate",
  version: "1.0.0",
  description: "…",
  hooks: [
    {
      id: "my-gate:pre-execute",
      scope: "tool",
      event: "pre-execute",
      toolPattern: ".*",
      blocking: true,
      handler: (ctx) => Effect.succeed({ allow: true }),
    },
  ],
});
```

## Skills-over-MCP + unified search (8.0)

| Tool / path     | Role                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `search`        | Ranks **operations and skills** together (`kind: "operation" \| "skill"`)                                                    |
| `skills_list`   | Lightweight index (`SkillIndexEntry`)                                                                                        |
| `skills_get`    | Full skill body by `skillId`                                                                                                 |
| Standalone pack | `handoff` / `session-handoff` — default on (`CLAWQL_ENABLE_HANDOFF_SKILL=0` to omit)                                         |
| WebMCP draft    | `webmcp_draft*` — opt-in (`CLAWQL_ENABLE_WEBMCP_DRAFT=1`); see [`docs/specs/webmcp-draft/`](../specs/webmcp-draft/README.md) |

**WebMCP draft (opt-in):**

```bash
export CLAWQL_ENABLE_WEBMCP_DRAFT=1
export CLAWQL_WEBMCP_DRAFT_DURABLE=1          # JSON store under .clawql/ (gateway default when enabled)
# export CLAWQL_WEBMCP_DRAFT_STORE_PATH=/path/to/store.json
# export CLAWQL_WEBMCP_BIND_URL=https://gateway.example/webmcp-draft/bound-execute
```

MCP tools: `webmcp_draft`, `webmcp_draft_review`, `webmcp_draft_publish`, `webmcp_draft_execute`, `webmcp_draft_rollback`. Published browser tools POST `/webmcp-draft/bound-execute` (OpenAPI/GraphQL → `ExecuteService`; forms → `formAction` submit).

Empty skill index until a ProviderPlugin / StandaloneSkillPlugin installs skills (handoff is composed by default).

**ATR visibility:** provider-bundled skills inherit tool ATR (`SkillIndexEntry.source: "provider"`). Standalone skills are not ATR-gated. Hosts bind tokens via `bindProcessSearchAtrTokens` / `CLAWQL_SESSION_ATR`, or pass `atrScopeTokens` on the search layer.

**Session / model hooks:** MCP HTTP fires `session-start` / `session-end`; inference callers pass `modelHooks: { hookRegistry, worm }` into `createInferenceGateway` (helper: `modelHooksFromClawqlApi` / `getHostInferenceGateway`).

**Cold-start scenarios (Agent Seer §9):** `synthesizeScenarios` / `synthesizeScenariosFromApi` build graded scenarios from tool schemas + `parameterNotes`; map to harness tasks via `clawql-harness/bench/scenario-synthesis`.

## Minimal upgrade checklist

```bash
# 1. Rewrite any out-of-tree plugins to ProviderPlugin (no bridge)
# 2. Restore curated APIs (if you relied on the old default pack)
export CLAWQL_PROVIDER=default

# 3. Restore enforcement (recommended for production / required for regulated)
export CLAWQL_PANGUARD_PROXY_PLUGIN=1
export CLAWQL_PANGUARD_IN_PROCESS=1

# 4. Networked MCP: real auth (noAuth is loopback-only)
export MCP_HOST=127.0.0.1
# export CLAWQL_AUTH_MODE=apiKey
# export CLAWQL_API_KEY=…

# 5. Or acknowledge ungated tools (dev / standard only — refused under regulated)
# export CLAWQL_ALLOW_NO_ENFORCEMENT=1
```

## Hosted-edge Workers (not migrated)

The Cloudflare Workers under [`infra/cloudflare/`](../../infra/cloudflare/README.md) are a **pre-8.0 parallel MCP** (hardcoded catalog, D1 audit, no `ProviderPlugin`). They **must** be updated to ClawQL **8.0.0** and the current plugin / empty-catalog / skills design before they are treated as a product surface.

Canonical MCP remains Node `clawql-mcp` / Helm `manifests/charts/clawql-mcp`. Status and layout: [`infra/cloudflare/README.md`](../../infra/cloudflare/README.md).

## Section artifact headings (TOC / lists)

Some converters promote **table-of-contents leader-dot lines** and **numbered list/procedure steps** to ATX Markdown headings. Those mint bogus `sec-*` IDs and can inflate or depress graded retrieval scores.

**How common:** on a naive (unfiltered) TXT→MD convert of 16 public RFCs, **~17%** of promoted ATX headings were TOC/list artifacts (212 / 1262). That class of ghosts wrong-reasons retrieval and citation IDs. Operator Memory vaults that never ingested RFC-style converts may show **0** today — the filter still matters for the next contaminated ingest.

**8.0 product behavior:** `splitMarkdownSections` / `read_around` **skip** those titles at read time for every vault document (existing included). No persisted section index is left behind — IDs are derived from current Markdown on each call. Combined with the optional re-section below, this improves real recall on contaminated vaults without waiting for re-ingest.

**Scan / optional one-time vault cleanup:**

```bash
# Report artifact ATX headings in your vault (same rules as the product filter)
python3 docs/benchmarks/archive/pageindex-ab/scripts/flag_artifact_gold_keys.py --vault "$CLAWQL_OBSIDIAN_VAULT_PATH"

# Dry-run demote report
node scripts/dev/vault-resection-artifact-headings.mjs --vault "$CLAWQL_OBSIDIAN_VAULT_PATH"

# Rewrite: demote matching ## lines to plain text
node scripts/dev/vault-resection-artifact-headings.mjs --vault "$CLAWQL_OBSIDIAN_VAULT_PATH" --write
```

Regression coverage: TOC + numbered-list + postal-junk cases in `packages/clawql-memory/src/recall/read-around.test.ts`. Scan notes: [`docs/benchmarks/archive/pageindex-ab/design/vault-artifact-scan-summary.md`](../benchmarks/archive/pageindex-ab/design/vault-artifact-scan-summary.md).

## Docs

- Spec: [`docs/design/clawql-core-plugin-architecture.md`](../design/clawql-core-plugin-architecture.md)
- Action items: [`docs/design/clawql-8.0-plugin-architecture-action-items.md`](../design/clawql-8.0-plugin-architecture-action-items.md)
- Panguard: [`docs/plugins/panguard-proxy.md`](../plugins/panguard-proxy.md)
- Secure defaults / escape hatches: [`docs/security/secure-defaults.md`](../security/secure-defaults.md)
- Empty catalog / packs: [`docs/plugins/bundled-providers.md`](../plugins/bundled-providers.md)
- Hosted-edge Workers (8.0 lag): [`infra/cloudflare/README.md`](../../infra/cloudflare/README.md)
