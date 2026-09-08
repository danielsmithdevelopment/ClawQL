# Streams + celld — evidence matrix

**Status:** living checklist for Lab 5b (`examples/streams-celld`)  
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
| Fleet LTX / multi-node diagnose                         | Manual               | `deployment/samples/streams-celld/README.md`                  |
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
node examples/streams-celld/scripts/mcp-fetch.test.mjs
node examples/streams-celld/scripts/adapter-fetch.test.mjs
node examples/streams-celld/scripts/bundle-check.mjs
make helm-celld-template-tests
```

Expected: all exit **0**; bundle size printed ≈ **0.4 MiB** (must be &lt; **64 MiB**).

### Local E2E smoke (requires celld v0.4.0 + esbuild)

```bash
CELLD_VERSION=v0.4.0 curl -fsSL https://celld.dev/install.sh | sh
npm run build -w clawql-merkle -w clawql-core
STREAMS_CELLD_SMOKE_REQUIRED=1 bash examples/streams-celld/scripts/smoke.sh
```

Without `STREAMS_CELLD_SMOKE_REQUIRED=1`, missing `celld` **exits 0 with a skip message** (developer convenience). CI and release gates must set the env var (or install celld and require the smoke).

Smoke covers: bundle-check → unit fetch tests → mock MCP + mock adapter → `celld dev` → webhook spawn → assertions on streams-slim, hash, MCP transport, adapter probe, LTX keys.

### Full-stack E2E — real clawql-mcp + real mcp-api-adapter (CI job **Streams celld full-stack**)

```bash
CELLD_VERSION=v0.4.0 curl -fsSL https://celld.dev/install.sh | sh
npm run build
npm run build -w clawql-merkle -w clawql-core -w mcp-api-adapter
STREAMS_CELLD_SMOKE_REQUIRED=1 bash examples/streams-celld/scripts/full-stack-smoke.sh
```

This boots **real** `clawql-mcp-http` (vault memory + skills; empty OpenAPI catalog is OK) and **real** `mcp-api-adapter` (`--mcp-url` → that MCP), points celld at both, and asserts search / memory_* / adapter REST / inference health — while refusing mock `source` markers. `execute` of `streams.session.noop` may error on an empty catalog; the smoke still requires a Streamable HTTP hop.

Optional containers: [`examples/streams-celld/docker-compose.full.yml`](../../examples/streams-celld/docker-compose.full.yml).

### Cluster (manual — template-tested only in CI)

Follow [`deployment/samples/streams-celld/README.md`](../../deployment/samples/streams-celld/README.md). Helm templates are asserted in CI; live webhook→fleet→LTX is **not** automated yet.

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
node website/scripts/sync-clawql-streams-doc.mjs
node website/scripts/sync-clawql-celld-doc.mjs
node website/scripts/sync-clawql-durable-objects-doc.mjs
```

---

## What this deliberately does not claim

- Full production `stream_subscribe` / Protocol Fabric event loop package
- In-cell Express mcp-api-adapter (**use full-stack smoke / compose sidecars instead**)
- Automated multi-node LTX / `celld diagnose` fleet proof in GitHub Actions
- Comparative “faster than X” marketing claims
- That empty-catalog `execute(streams.session.noop)` succeeds (OpenAPI ops need a provider pack)
- That Lab 5b `audit:ring` / `audit:seq:*` / celld LTX is the same trail as **`clawql-audit` `WORMAuditTrail`** (see below)

---

## Audit honesty: cell LTX vs `clawql-audit`

Lab 5b flush is a **parallel, weaker** mechanism — not the host compliance trail.

| Property                       | Lab 5b streams-slim → DO/`audit:seq:*` → celld LTX                | `packages/clawql-audit` `WORMAuditTrail`          |
| ------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------- |
| Package path                   | `clawql-core/streams-slim` ring only                              | `WORMAuditTrail.create` + Effect trail            |
| Hash-chain dialect             | `seq` / `prev_hash` via `clawql-merkle`                           | `chainIndex` / `prevHash` seal                    |
| Tip load on restart (no fork)  | **No** — isolate ring resets to genesis; LTX holds a **snapshot** | **Yes** — `loadTip` / `latestEntry` before append |
| Dual-ack outbox + remote drain | No                                                                | Yes (explicitly **not** LTX)                      |
| Merkle batch roots             | No                                                                | Yes                                               |

celld LTX still gives **platform RPO=0 durability** for whatever keys the DO `storage.put`s. That is valuable. It is **not** identity with `clawql-audit` hash-chain continuity, dual-ack, or Merkle verification. Spec lines that say “LTX bucket = WORM trail” mean **operator-owned durable DO SQLite replication**, not “this is `clawql-audit`.”

Follow-up (not required for Lab 5b evidence): hydrate the in-cell ring from `audit:ring` on wake, and/or dual-write session events into host `clawql-audit` over MCP.

---

## Hibernation economics (vendor figure, not ClawQL-measured)

celld docs ≈ **1000 resident cells / 8 GB node** → ~**$0.05 / resident-cell-month** if the node is ~$49/mo. ClawQL Streams tables repeat that as a **planning sketch** (“re-benchmark before GTM”).

Back-of-envelope before treating it as settled:

- Fair compare is **not** “1 Deployment per subscription.” K8s Streams uses a **worker pool + queue**; idle cost is min replicas, not N subscriptions.
- celld wins when you need **per-subscription durable state / affinity** (filter config, hibernatable WS) with most objects idle — density × idle ratio matters.
- Until ClawQL measures resident RAM and idle ratio on a real subscription mix, cite hibernation as a **structural** advantage (1:1 object + hibernate API), not a proven $/mo claim.
