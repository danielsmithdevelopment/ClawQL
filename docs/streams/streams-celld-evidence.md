# Streams + celld — evidence matrix

**Status:** living checklist for Lab 5b (`docs/examples/streams-celld`)  
**Audience:** operators and reviewers who need proof the docs match shipped behavior  
**Related:** [`clawql-celld.md`](./clawql-celld.md) · [`clawql-streams.md`](./clawql-streams.md) · [Learn Lab 5b](https://docs.clawql.com/learn/streams-getting-started#lab-5b--clawql-streams-wrangler-skeleton--bundle-check-30-min)

This page is the honest map of **what is automated**, **what is local-only**, and **what remains draft**. It is not a badge wall — every row names a command that produces the evidence.

---

## Architecture under test (shipped)

| Layer                                                   | In cell bundle?      | How it is proven                                              |
| ------------------------------------------------------- | -------------------- | ------------------------------------------------------------- |
| `clawql-core/streams-slim` (audit / cache / hash-chain) | **Yes**              | Unit tests + webhook smoke assertions                         |
| Audit LTX flush (`audit:ring`, `audit:seq:*`)           | **Yes** (DO storage) | Smoke response keys + unit coverage in core                   |
| Streamable HTTP MCP (`CLAWQL_MCP_URL`)                  | **No** — `fetch`     | `mcp-fetch.test.mjs` + mock smoke + **full-stack** real MCP   |
| mcp-api-adapter REST (`CLAWQL_MCP_ADAPTER_URL`)         | **No** — `fetch`     | `adapter-fetch.test.mjs` + mock smoke + **full-stack** real   |
| Inference                                               | **No** — `fetch`     | Full-stack `/healthz` stub; real sidecar optional via compose |
| Helm celld StatefulSet / probes                         | Chart only           | `make helm-celld-template-tests`                              |
| Fleet LTX / multi-node diagnose                         | Manual               | `docs/examples/idp/streams-celld/README.md`                   |
| `clawql-streams` package / `stream_*` tools             | **Not shipped**      | Spec-only — see Streams §15                                   |
| cellrt / TEE / QR stream source                         | **Not shipped**      | Spec drafts under `docs/streams/`                             |

### Why full product is out-of-process (not “missing”)

Embedding Express `mcp-api-adapter` / vault `clawql-memory` / full `clawql-api` **inside** the Worker is incompatible with celld (no usable `node:fs` / Express / gRPC / stdio). Lab 5b demos the **entire** stack by running those hosts as sidecars and proving the cell `fetch`es them — see **Full-stack smoke** below.

---

## Commands (run from repo root)

### Always — CI (`Streams celld evidence` job)

```bash
npm run build -w clawql-merkle -w clawql-core
npx vitest run packages/clawql-core/src/streams-slim.test.ts
node docs/examples/streams-celld/scripts/mcp-fetch.test.mjs
node docs/examples/streams-celld/scripts/adapter-fetch.test.mjs
node docs/examples/streams-celld/scripts/bundle-check.mjs
make helm-celld-template-tests
```

Expected: all exit **0**; bundle size printed ≈ **0.4 MiB** (must be &lt; **64 MiB**).

### Local E2E smoke (requires celld v0.4.0 + esbuild)

```bash
CELLD_VERSION=v0.4.0 curl -fsSL https://celld.dev/install.sh | sh
npm run build -w clawql-merkle -w clawql-core
STREAMS_CELLD_SMOKE_REQUIRED=1 bash docs/examples/streams-celld/scripts/smoke.sh
```

Without `STREAMS_CELLD_SMOKE_REQUIRED=1`, missing `celld` **exits 0 with a skip message** (developer convenience). CI and release gates must set the env var (or install celld and require the smoke).

Smoke covers: bundle-check → unit fetch tests → mock MCP + mock adapter → `celld dev` → webhook spawn → assertions on streams-slim, hash, MCP transport, adapter probe, LTX keys.

### Full-stack E2E — real clawql-mcp + real mcp-api-adapter (CI job **Streams celld full-stack**)

```bash
CELLD_VERSION=v0.4.0 curl -fsSL https://celld.dev/install.sh | sh
npm run build
npm run build -w clawql-merkle -w clawql-core -w mcp-api-adapter
STREAMS_CELLD_SMOKE_REQUIRED=1 bash docs/examples/streams-celld/scripts/full-stack-smoke.sh
```

This boots **real** `clawql-mcp-http` (vault memory + skills; empty OpenAPI catalog is OK) and **real** `mcp-api-adapter` (`--mcp-url` → that MCP), points celld at both, and asserts search / memory_* / adapter REST / inference health — while refusing mock `source` markers. `execute` of `streams.session.noop` may error on an empty catalog; the smoke still requires a Streamable HTTP hop.

Optional containers: [`docs/examples/streams-celld/docker-compose.full.yml`](../../docs/examples/streams-celld/docker-compose.full.yml).

### Cluster (manual — template-tested only in CI)

Follow [`docs/examples/idp/streams-celld/README.md`](../../docs/examples/idp/streams-celld/README.md). Helm templates are asserted in CI; live webhook→fleet→LTX is **not** automated yet.

---

## CI wiring

| Check                                     | Where                                                    |
| ----------------------------------------- | -------------------------------------------------------- |
| Helm celld templates                      | `make lint-k8s-manifests` → CI `ShellCheck & actionlint` |
| streams-slim + fetch tests + bundle-check | CI job **Streams celld evidence**                        |
| Mock `smoke.sh` with celld                | CI job **Streams celld smoke (celld)**                   |
| Real MCP + adapter `full-stack-smoke.sh`  | CI job **Streams celld full-stack**                      |

---

## Doc sync

After editing `docs/streams/clawql-*.md`, regenerate site pages:

```bash
node apps/docs/scripts/sync-clawql-streams-doc.mjs
node apps/docs/scripts/sync-clawql-celld-doc.mjs
node apps/docs/scripts/sync-clawql-durable-objects-doc.mjs
```

---

## What this deliberately does not claim

- Full production `stream_subscribe` / Protocol Fabric event loop package
- In-cell Express mcp-api-adapter (**use full-stack smoke / compose sidecars instead**)
- Automated multi-node LTX / `celld diagnose` fleet proof in GitHub Actions
- Comparative “faster than X” marketing claims
- That empty-catalog `execute(streams.session.noop)` succeeds (OpenAPI ops need a provider pack)
