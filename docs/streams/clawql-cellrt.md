# clawql-cellrt — Specification v0.1

**Status:** Draft · August 2026 · v0.1  
**Language:** Rust (+ Wasmtime; Effect-TS tool surface via WASM component)  
**Package:** `clawql-cellrt` (planned — `crates/clawql-cellrt`)  
**Depends on:** [`clawql-streams`](./clawql-streams.md) v0.2 · [`clawql-celld.md`](./clawql-celld.md) · [`clawql-inference`](../inference/clawql-inference.md) · `@clawql/wasm-polyfills` (planned) · `@clawql/effect-wasm` (planned)  
**Repo home:** ClawQL monorepo — `crates/clawql-cellrt/` (not a separate product repo)  
**Related:** [`clawql-tee.md`](./clawql-tee.md) · [`clawql-tee-airgap-audit.md`](./clawql-tee-airgap-audit.md) · [`clawql-durable-objects.md`](./clawql-durable-objects.md) · [`../specs/network/clawql-network-v0.1.md`](../specs/network/clawql-network-v0.1.md) · [`mcp-api-adapter`](../mcp/mcp-api-adapter.md) · [defense-in-depth](../security/clawql-security-defense-in-depth.md) · [codegraph](../plugins/codegraph.md) · [correctness-by-construction](../design/correctness-by-construction.md) (NASA/SPARK → Rust + TLA+ for key/WORM/liveness invariants)

---

## 1. What this is

`clawql-cellrt` is ClawQL's **owned cell runtime** — a Rust binary that provides a Durable Objects–style execution model purpose-built for ClawQL workloads, with embedded security monitoring, inference gateway, HashiCorp Vault integration, and full observability.

It is **not** a general-purpose DO runtime and **not** a Node `worker_threads` reimplementation. It is the ClawQL-specific production runtime that celld would need to be if ClawQL owned it end-to-end.

### Why build rather than only use celld

| Concern            | celld (adopt)                             | clawql-cellrt (own)                                                           |
| ------------------ | ----------------------------------------- | ----------------------------------------------------------------------------- |
| Status             | Alpha; hostile multi-tenant not supported | ClawQL-owned; production target                                               |
| Security story     | V8 isolate + operator mesh                | Rust memory safety + eBPF + WASM capability sandbox                           |
| Vault / inference  | External sidecars / HTTP                  | Embedded dynamic secrets + PAL + virtual keys                                 |
| Observability      | External                                  | Embedded OTel + Prometheus + Langfuse                                         |
| Tool execution     | JS bundle in V8                           | Bootstrap: HTTP → clawql-mcp; full: `clawql-core.wasm` in Wasmtime            |
| Workers API parity | High (same surface as Cloudflare)         | Different API (Rust cell trait + WIT); session _contract_ shared with Streams |

**Streams v0.2 still adopts celld** for the Workers/DO JavaScript path and as an interim self-hosted option. **cellrt is the ClawQL-owned production path** when sovereignty, security-in-depth, and embedded ClawQL capabilities matter more than Cloudflare Workers API parity.

**Do not build a custom DO runtime on Node `worker_threads`.** cellrt is Rust + Wasmtime. celld remains the Workers-API-compatible self-hosted option.

### Repo placement (decision of record)

cellrt is **not** a general-purpose DO runtime (unlike celld). It is tightly coupled to ClawQL:

- Virtual keys issued/validated by clawql-inference
- WORM event types and LTX bucket layout are ClawQL-specific
- WASM component is `clawql-core.wasm` with a ClawQL WIT world
- Vault injects ClawQL provider secret shapes
- Streams significance filters / subscriptions drive cell spawn
- RTP/OBT emission uses ClawQL training-data formats

**Keep cellrt in the ClawQL monorepo** under `crates/clawql-cellrt/`. Accept Rust toolchain friction in a TypeScript-primary repo; cross-repo integration tests and Helm/release coordination would cost more. TypeScript companions (`@clawql/wasm-polyfills`, `@clawql/effect-wasm`) stay under `packages/`.

**Extractable standalone:** the bucket coordination layer (compare-and-swap leases, LTX replication, peer HMAC) has no ClawQL-specific dependencies — publish later as `bucket-coordinator` on crates.io. Everything else remains ClawQL infrastructure.

### Bootstrap path

HTTP boundary ships first. Cells call a local `clawql-mcp` HTTP server for tool execution while the WASM path is built. Each tool that runs in-process replaces one HTTP call. The transition is invisible to MCP clients. Nothing blocks shipping cellrt coordination + lifecycle before Effect-TS → WASM is complete.

### Path to clawql-tee

cellrt as specified is **software security** (Rust, eBPF, WASM sandbox, Cosign, WORM). [`clawql-tee`](./clawql-tee.md) adds hardware-enforced guarantees (AMD SEV-SNP / Intel TDX, attestation-gated Vault secrets, optional NVIDIA GPU CC) and [`air-gap QR audit transport`](./clawql-tee-airgap-audit.md) so a verifier need not trust the operator or the network path.

---

## 2. Architecture overview

```text
clawql-cellrt binary (Rust, static, ~50–80 MB target)
│
├─ Fleet coordinator (Tokio async)
│    ├─ S3/R2 bucket as coordinator (compare-and-swap ownership leases)
│    ├─ LTX replication (SQLite WAL segments → bucket, RPO=0)
│    ├─ Peer authentication (HMAC-SHA256, WireGuard-compatible)
│    ├─ Node discovery (bucket-based, no membership protocol)
│    └─ Fault recovery (ownership lease expiry → another node acquires)
│
├─ Cell runtime (per-cell, Tokio task)
│    ├─ Wasmtime engine (embedded, one instance per cell)
│    │    └─ clawql-core.wasm (Effect-TS via ComponentizeJS + jco)
│    │         ├─ search · execute · memory_* · audit · cache
│    │         ├─ clawql-ontology (structured filter queries)
│    │         └─ mcp-api-adapter (six protocol surfaces)
│    ├─ Capability grants (network, storage, crypto — explicit WIT imports)
│    ├─ HTTP handler (axum, per-cell)
│    ├─ WebSocket handler (tokio-tungstenite, hibernation via task suspend)
│    └─ Alarm scheduler (tokio time::sleep_until, durable via SQLite)
│
├─ Storage (per-cell)
│    ├─ SQLite via rusqlite (WAL mode, per-cell file)
│    ├─ LTX writer (streams WAL segments to bucket coordinator)
│    └─ WORM guarantees (acknowledge write only after bucket replication)
│
├─ Security layer (clawql-security embedded)
│    ├─ eBPF program loader (libbpf-rs, Linux only)
│    ├─ Syscall monitor (Falco-equivalent rules engine)
│    ├─ WASM capability enforcer (validates WIT imports at instantiation)
│    ├─ Virtual key lifecycle (Rust struct, scoped to cell ID)
│    └─ Cosign binary attestation (verified at startup via sigstore-rs)
│
├─ Inference layer (clawql-inference embedded)
│    ├─ PAL router (Frugal → Standard → Frontier based on policy.yaml)
│    ├─ Virtual key manager (issue on spawn, expire on drop)
│    ├─ Budget enforcer (hard cap, DeductionService via HTTP)
│    └─ WORM inference call store (SQLite, LTX-replicated)
│
├─ Vault client (HashiCorp Vault dynamic secrets)
│    ├─ AppRole auth (VAULT_ROLE_ID + VAULT_SECRET_ID)
│    ├─ Dynamic secret lease on cell spawn
│    ├─ Secret injection into WASM env before instantiation
│    └─ Lease renewal tied to cell alarm lifecycle
│
└─ Observability (embedded)
     ├─ OTel SDK (opentelemetry-rust — traces, metrics, logs)
     ├─ Prometheus exporter (/metrics on fleet HTTP)
     ├─ Langfuse forwarder (RTP/OBT training data emission)
     └─ Structured logging (tracing → JSON → Loki push)
```

---

## 3. Rust crate structure

Monorepo layout (ClawQL repo root):

```text
packages/                         — TypeScript (npm)
  clawql-core/
  clawql-streams/
  mcp-api-adapter/
  wasm-polyfills/                 — @clawql/wasm-polyfills (planned)
  effect-wasm/                    — @clawql/effect-wasm (planned)

crates/
  clawql-cellrt/                  — Cargo workspace (ClawQL-specific)
    Cargo.toml
    cellrt-coordinator/           — wraps bucket-coordinator + ClawQL fleet semantics
    cellrt-runtime/               — cell lifecycle, Wasmtime, HTTP/WS, alarms
    cellrt-storage/               — SQLite + LTX WORM
    cellrt-security/              — eBPF, capability enforcer, Cosign startup
    cellrt-attestation/           — SEV-SNP/TDX remote attestation (tee path)
    cellrt-inference/             — PAL, virtual keys, call store
    cellrt-vault/                 — AppRole bootstrap; attestation auth for tee
    cellrt-observability/         — OTel, Prometheus, Langfuse
    cellrt-cli/                   — start / deploy / diagnose / audit export

# Extract later (crates.io, no ClawQL deps):
bucket-coordinator                — CAS leases, LTX, peer HMAC over S3/R2
```

| Crate                  | Responsibility                                                                 |
| ---------------------- | ------------------------------------------------------------------------------ |
| `cellrt-coordinator`   | Fleet join, leases, peer auth (depends on `bucket-coordinator` when extracted) |
| `cellrt-runtime`       | Per-cell Tokio task, Wasmtime / HTTP bootstrap, axum, WebSocket, alarms        |
| `cellrt-storage`       | rusqlite WAL, LTX writer, WORM ack-after-replication                           |
| `cellrt-security`      | eBPF rules, WIT import validation, Cosign binary verify                        |
| `cellrt-attestation`   | AMD SEV-SNP / Intel TDX reports, VCEK/PCS chain, JWT delivery, QR frame bind   |
| `cellrt-inference`     | PAL router, virtual key issue/expire, budget, WORM call store                  |
| `cellrt-vault`         | Dynamic secrets; AppRole → attestation-gated release when tee enabled          |
| `cellrt-observability` | OTel, Prometheus `/metrics`, Langfuse RTP/OBT                                  |
| `cellrt-cli`           | Binary entry + `audit export` for air-gap QR sequence                          |

---

## 4. Cell lifecycle

### 4.1 Spawn

```rust
pub struct CellId(String);   // "agent:{subscription_id}:{event_id}"

pub async fn spawn_cell(
    id: CellId,
    config: CellConfig,
    coordinator: &FleetCoordinator,
) -> Result<CellHandle> {
    // 1. Acquire ownership lease (compare-and-swap in bucket)
    let lease = coordinator.acquire_lease(&id).await?;

    // 2. Initialize per-cell SQLite (WAL mode)
    let db = CellStorage::open(&id).await?;

    // 3. Request dynamic secrets from Vault
    let secrets = VaultClient::request_dynamic_secrets(&config.vault_role).await?;

    // 4. Issue virtual key (scoped to cell ID)
    let virtual_key = VirtualKeyManager::issue(
        VirtualKeyParams {
            scope: id.clone(),
            budget_tokens: config.budget_tokens,
            ttl_ms: config.virtual_key_ttl_ms,
        }
    ).await?;

    // 5. Write WORM spawn record (LTX → bucket before ack)
    db.worm_append(WormEvent {
        event_type: "CELL_SPAWNED",
        cell_id: id.clone(),
        virtual_key_id: virtual_key.id.clone(),
        subscription_id: config.subscription_id.clone(),
        event_hash: config.event_hash.clone(),
        timestamp: Utc::now(),
    }).await?;

    // 6. Instantiate WASM (or HTTP bootstrap) with capability grants + secrets
    let wasm_instance = WasmRuntime::instantiate(
        &id,
        WasmConfig {
            component_path: coordinator.resolve_component_path().await?,
            env: secrets.to_env_map(),
            virtual_key: virtual_key.clone(),
            capabilities: config.allowed_capabilities,
        }
    ).await?;

    // 7. Set alarm for virtual key TTL (durable — survives process restart)
    db.set_alarm(Utc::now() + Duration::milliseconds(config.virtual_key_ttl_ms)).await?;

    // 8. Start HTTP + WebSocket handlers
    let http_server = CellHttpServer::start(&id, wasm_instance.clone()).await?;

    Ok(CellHandle { id, db, wasm_instance, virtual_key, http_server, lease })
}
```

### 4.2 Request handling

```rust
impl CellHandle {
    pub async fn handle_request(&self, req: CellRequest) -> Result<CellResponse> {
        self.inference.check_budget(&self.virtual_key).await?;

        // Bootstrap: HTTP → clawql-mcp
        // Full: in-process WASM via Wasmtime
        let result = self.wasm_instance.call_tool(req).await?;

        self.db.worm_append(WormEvent {
            event_type: "TOOL_CALL",
            tool_name: req.tool_name.clone(),
            input_hash: sha256(&req.arguments),
            atr_scope_check: result.atr_result.clone(),
            timestamp: Utc::now(),
        }).await?;

        Ok(result.into())
    }
}
```

### 4.3 Alarm (virtual key TTL + cleanup)

```rust
impl CellHandle {
    pub async fn handle_alarm(&self) -> Result<()> {
        self.inference.expire_key(&self.virtual_key).await?;
        self.flush_training_data().await?;

        self.db.worm_append(WormEvent {
            event_type: "CELL_DESTROYED",
            virtual_key_id: self.virtual_key.id.clone(),
            exit_reason: "ttl_expired",
            tokens_used: self.inference.tokens_used(),
            timestamp: Utc::now(),
        }).await?;

        self.coordinator.release_lease(&self.id).await?;
        self.db.close().await?; // LTX replication completes before close returns
        Ok(())
    }
}
```

Idempotent cell naming mirrors Streams / celld: `agent:{subscriptionId}:{eventId}` — at-most-one writer per cell name on replay.

---

## 5. WASM capability model

### 5.1 WIT world definition

The WASM component (`clawql-core.wasm`) declares host capabilities via WIT. cellrt grants only what is declared. Undeclared capabilities are **structurally absent** (not linked), not merely blocked at runtime.

```text
// clawql-core.wit
world clawql-core {
  // Network — fetch only, no raw TCP
  import wasi:http/outgoing-handler@0.2.0

  // Storage — cell SQLite only, no filesystem
  import clawql:storage/cell-storage

  // Crypto — subset of Web Crypto
  import clawql:crypto/digest          // SHA-256/384/512
  import clawql:crypto/hmac            // HMAC sign/verify
  import clawql:crypto/random          // randomUUID, getRandomValues
  import clawql:crypto/aes-gcm         // AES-GCM encrypt/decrypt

  // Node polyfills (from @clawql/wasm-polyfills)
  import clawql:polyfills/async-local-storage
  import clawql:polyfills/event-emitter
  import clawql:polyfills/buffer
  import clawql:polyfills/node-crypto  // subset — maps to clawql:crypto/*

  // Inference — model calls via virtual key
  import clawql:inference/call         // PAL-routed, budget-enforced

  // Audit — WORM writes via host (not direct SQLite)
  import clawql:audit/worm-append

  // Exports — host → component
  export clawql:tools/call-tool
  export clawql:tools/list-tools
  export clawql:mcp/handle-request
  export clawql:mcp/handle-websocket
}
```

### 5.2 Capability enforcer

At WASM instantiation, cellrt validates imports against allowed capabilities and builds a linker with **only** granted host imports. A denied import fails instantiation with `CapabilityDenied` — the component never runs.

### 5.3 What the WASM component cannot do

Structurally absent:

- Raw TCP/UDP sockets
- Filesystem access (`node:fs`, WASI filesystem)
- Process spawning (`node:child_process`)
- Shared memory across cells
- Direct SQLite access (must use `clawql:storage/cell-storage`)
- Direct model API calls (must use `clawql:inference/call` with virtual key enforcement)
- WORM writes without audit trail (must use `clawql:audit/worm-append`)

---

## 6. Virtual key lifecycle in Rust

```rust
#[derive(Clone, Debug)]
pub struct VirtualKey {
    pub id: Uuid,
    pub cell_id: CellId,
    pub budget_tokens: u32,
    pub tokens_used: Arc<AtomicU32>,
    pub expires_at: DateTime<Utc>,
    pub state: Arc<RwLock<VirtualKeyState>>,
}

#[derive(Debug, PartialEq)]
pub enum VirtualKeyState {
    Active,
    BudgetExhausted,
    Expired,
    Revoked,
}
```

- Issued on cell spawn, scoped to `CellId` (`agent:{subscriptionId}:{eventId}`).
- Budget checked before every inference call; exhaustion is a one-way state transition.
- `Drop` on `CellHandle` expires the key even on panic paths (best-effort async expire).
- Alarm path also expires the key and flushes RTP/OBT training data (Streams §7).

The type system enforces one-way lifecycle: `Active` → `BudgetExhausted` | `Expired` | `Revoked`. A leaked key from a destroyed cell is already expired at the inference gateway.

---

## 7. LTX replication and WORM

Every SQLite write is a WORM write because LTX replication acknowledges only after the WAL segment is durable in the bucket (**RPO=0**).

```text
storage.put / worm_append
        │
        ▼
SQLite WAL frame
        │
        ▼
LTX segment → cells/{cell_id}/{txn_id}.ltx  (bucket ACK)
        │
        ▼
caller receives Ok(())   // not before bucket ACK
```

An auditor reconstructs a cell's history from LTX segments with `sqlite3` — no live system access required. Recommended lifecycle: move agent cell LTX to cold storage after 90 days; retain indefinitely for regulated deployments.

---

## 8. Security layer

### 8.1 eBPF monitoring (Linux)

cellrt embeds a Falco-equivalent rules engine via `libbpf-rs`. Production requires Linux kernel ≥ 5.8. On macOS (development), the eBPF layer is a no-op stub — **cellrt on macOS is not production-equivalent**.

Example attach points: `sys_enter_execve`, `sys_enter_connect`, `sys_enter_openat`. Unexpected exec / egress produces `SecurityAlert` events into the observability pipeline.

### 8.2 Cosign binary attestation

On startup, cellrt verifies its own Cosign/Sigstore attestation. A tampered or unsigned binary fails to start (Layer 0 supply-chain guarantee applied to the runtime itself).

### 8.3 Peer network

Same posture as celld: peer protocol is HMAC-authenticated plain HTTP. Run peers on a private network or WireGuard/Tailscale; terminate TLS at ingress (nginx/Istio). Scope bucket credentials to the fleet bucket only.

---

## 9. Fleet coordination

### 9.1 Node discovery via bucket

No membership list. No control plane. Nodes write/renew leases under `nodes/{node_id}` in the shared bucket. Peers with unexpired leases are reachable peers.

### 9.2 Cell ownership (compare-and-swap)

Conditional put on `leases/{cell_id}` (S3 `If-None-Match: *` / R2 equivalent). Lease TTL ~30s with renewal. On node death, another node acquires the lease, rebuilds SQLite from LTX segments, and resumes.

Adding a node: point it at the same bucket. No join command. No membership list.

---

## 10. Effect-TS → WASM build path

ClawQL core is Effect-TS. Solving Effect → WASM is an ecosystem contribution, not a ClawQL-only fork.

### 10.1 Prerequisites (planned packages)

**`@clawql/wasm-polyfills`** — WASI 0.2 host imports for Node APIs Effect needs: `async_hooks` (AsyncLocalStorage), `buffer`, `events`, `stream`, `crypto` subset.

**`@clawql/effect-wasm`** — Effect scheduler shim for non-Node runtimes (`WasmScheduler`, `WasmRuntime`, `WasmSafe<A, E>` type that excludes Node I/O for safe `runSync` inside WASM).

**Hardest risk:** Effect fiber scheduler internals. Use [`codegraph`](../plugins/codegraph.md) to map `Effect.runFork` → leaf Node APIs (`process.nextTick`, `queueMicrotask`, `AsyncLocalStorage`) before writing the shim. Open an Effect-team issue for a scheduler hook point before patching internals.

### 10.2 Build pipeline

```bash
# 1. Bundle with polyfill aliases (provider set compile-time constant — no dynamic import)
CLAWQL_PROVIDER=legal \
esbuild packages/clawql-core/src/index.ts \
  --bundle --platform=browser --target=es2022 \
  --alias:node:async_hooks=@clawql/wasm-polyfills/async-hooks \
  --alias:node:crypto=@clawql/wasm-polyfills/crypto \
  --outfile=dist/clawql-core.bundle.js

# 2. Componentize
jco componentize dist/clawql-core.bundle.js \
  --wit clawql-core.wit --world clawql-core \
  --out dist/clawql-core.wasm

# Must stay under 64 MiB target (CI gate)
wc -c dist/clawql-core.wasm
```

### 10.3 Bootstrap path (before WASM)

```rust
pub enum WasmMode {
    Http { endpoint: Url, auth: BearerToken },  // → local clawql-mcp
    Wasm { store: Store<CellState>, instance: Instance },
}
```

Mode is **auto-detected**: if `clawql-core.wasm` is absent, HTTP mode enables. No operator flag required.

---

## 11. Deployment

### 11.1 Single binary

```bash
cargo build --release --target x86_64-unknown-linux-musl
# Static binary; target ~50–80 MB (Wasmtime ~20 MB + component ~15 MB)

cosign verify-blob \
  --certificate-identity-regexp ".*clawql-cellrt.*" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --signature clawql-cellrt.sig \
  clawql-cellrt
```

### 11.2 Start a fleet node

```bash
export CELLRT_BUCKET=s3://clawql-streams-state
export CELLRT_S3_ENDPOINT=https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com
export CELLRT_ADVERTISE=cellrt-node-a.internal:8080
export CELLRT_LISTEN=0.0.0.0:8080
export VAULT_ADDR=https://vault.internal:8200
export VAULT_ROLE_ID=${VAULT_ROLE_ID}
export VAULT_SECRET_ID=${VAULT_SECRET_ID}
export CLAWQL_INFERENCE_ENDPOINT=http://clawql-inference.internal:8080

clawql-cellrt start
```

### 11.3 Deploy WASM bundle / diagnose

```bash
npm run build:wasm -w clawql-core
clawql-cellrt deploy dist/clawql-core.wasm --bucket "$CELLRT_BUCKET" --endpoint "$CELLRT_S3_ENDPOINT"

clawql-cellrt diagnose --bucket "$CELLRT_BUCKET" --endpoint "$CELLRT_S3_ENDPOINT"
# Reports: nodes, cells/node, LTX lag, virtual keys, Vault leases, eBPF status, attestation
```

### 11.4 Helm values (additions)

```yaml
cellrt:
  enabled: false
  image: ghcr.io/danielsmithdevelopment/clawql-cellrt:latest
  replicas: 2
  bucket: clawql-streams-state
  vault:
    enabled: true
    addr: ""
  inference:
    endpoint: ""
  security:
    ebpf: true # Linux only — disable for macOS/dev
    attestation: true # Cosign binary verification on startup
  tee:
    enabled: false # AMD SEV-SNP / Intel TDX — see clawql-tee.md
    substrate: sev-snp # sev-snp | tdx | nitro
    attestationGatedVault: false
    airgapAudit:
      enabled: false # see clawql-tee-airgap-audit.md
  observability:
    otel:
      enabled: true
      endpoint: ""
    langfuse:
      enabled: false
    prometheus:
      enabled: true
      port: 9090
  wasmMode: http # http (bootstrap) | wasm (full)
```

CLI surface under Streams: `clawql streams cellrt start|deploy|diagnose|scale|audit export` (alongside existing `clawql streams celld …`).

---

## 12. Comparison

|                        | celld                          | clawql-cellrt                                              |
| ---------------------- | ------------------------------ | ---------------------------------------------------------- |
| **Runtime**            | V8 (Workers/DO JS API)         | Wasmtime (Rust host)                                       |
| **Language**           | JavaScript / TypeScript        | Rust + WASM component                                      |
| **Security**           | Alpha; no hostile multi-tenant | Rust memory safety + eBPF + WASM sandbox                   |
| **Vault**              | External sidecar               | Embedded dynamic secret injection                          |
| **Inference**          | External HTTP                  | Embedded PAL routing + virtual keys                        |
| **Observability**      | External                       | Embedded OTel + Langfuse + Prometheus                      |
| **Binary attestation** | Upstream GH attestation        | Cosign verify on startup                                   |
| **Hardware TEE**       | No                             | Planned — [`clawql-tee`](./clawql-tee.md) (SEV-SNP / TDX)  |
| **Air-gap audit**      | No                             | Planned — [`QR transport`](./clawql-tee-airgap-audit.md)   |
| **Capability model**   | Isolate ambient APIs           | WIT — explicit capability grants                           |
| **Bootstrap**          | N/A                            | HTTP → clawql-mcp (ships immediately)                      |
| **Full path**          | JS bundle in V8                | `clawql-core.wasm` in-process                              |
| **Repo**               | denoland/celld                 | ClawQL monorepo `crates/clawql-cellrt/`                    |
| **Coordination**       | S3 bucket                      | S3 bucket (same pattern; extractable `bucket-coordinator`) |
| **LTX / WORM**         | Yes                            | Yes                                                        |
| **License**            | Apache 2.0                     | Apache 2.0                                                 |

### Three deployment modes

| Mode | Mechanism                                   | Best for                              |
| ---- | ------------------------------------------- | ------------------------------------- |
| A    | Cloudflare Workers (existing DO code path)  | Hosted SaaS                           |
| B    | **cellrt** self-hosted (bucket coordinator) | Sovereign / security-first production |
| C    | K8s HPA on NATS lag                         | Regulated / air-gapped; no DO runtime |

celld remains available as Mode B' for operators who want Workers API parity on self-hosted hardware while cellrt matures.

---

## 13. Build sequence

| Week | Focus                                                             | Exit criteria                                             |
| ---- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| 1    | Coordination: leases, LTX, peer HMAC                              | Multi-node acquire/fail/recover tests green               |
| 2    | Cell runtime HTTP bootstrap + Vault + virtual keys                | Spawn cell → tool via clawql-mcp → WORM in bucket         |
| 3    | Security: Cosign, eBPF (Linux), capability enforcer stub          | Tampered binary rejected; denied import fails instantiate |
| 4    | Observability + CLI + Helm                                        | `diagnose`, `/metrics`, Langfuse opt-in                   |
| 5–6  | `@clawql/wasm-polyfills`                                          | Standalone npm; polyfill surface tests                    |
| 7    | `@clawql/effect-wasm` + Effect-team scheduler hook issue          | Minimal fiber schedule works in Wasmtime                  |
| 8    | clawql-core WASM build (`cache`, `audit` first)                   | Valid component &lt; 64 MiB                               |
| 9    | Wasmtime integration (replace HTTP for ported tools)              | In-process tool calls + WORM correct                      |
| 10   | Hardening, Wasmtime vs WasmEdge bench, C&H B-7.1 smoke via cellrt | Production readiness checklist                            |

Shipable surface at **week 4** (HTTP bootstrap). Full Wasmtime path at **week 10**.

**TEE track (after week 4 bootstrap):** `cellrt-attestation` + Vault attestation auth → SEV-SNP demo → optional GPU CC → air-gap QR export. See [`clawql-tee.md`](./clawql-tee.md) § build sequence.

---

## 14. Open questions

1. **Wasmtime vs WasmEdge.** Prefer Wasmtime (Bytecode Alliance, component model maturity). Re-benchmark WasmEdge in week 10.
2. **Effect scheduler shim correctness.** Highest technical risk. Open Effect-team issue in week 7 _before_ relying on internal patches. Use codegraph for Node-API blast radius first.
3. **eBPF on non-Linux.** macOS/dev is stub-only; document in Helm and PICERL that production security monitoring requires Linux.
4. **Bundle size at full tool surface.** ComponentizeJS embeds SpiderMonkey (~7 MB). Trim via `CLAWQL_PROVIDER=` subsets; CI fails above 64 MiB.
5. **Cloudflare Workers adapter for the same WASM component.** Verify wrangler / Workers component-model support for the WIT world before locking host import names.
6. **Relationship to celld in Helm defaults.** Until cellrt ships, `streams.scalingBackend` remains `kubernetes` \| `celld` \| `cloudflare`. Add `cellrt` when week-4 bootstrap lands.
7. **`bucket-coordinator` extract timing.** When to publish the coordination layer to crates.io vs keep it private to the cellrt workspace.
8. **TEE substrate default.** Prefer AMD SEV-SNP for sovereign root-of-trust; keep Nitro as simplest demo path. Confirm first customer hardware.

---

## Further reading

- [`docs/streams/clawql-streams.md`](./clawql-streams.md) — Streams Specification v0.2
- [`docs/streams/clawql-celld.md`](./clawql-celld.md) — Workers/DO-compatible self-hosted path
- [`docs/streams/clawql-tee.md`](./clawql-tee.md) — hardware TEE + attestation-gated secrets
- [`docs/streams/clawql-tee-airgap-audit.md`](./clawql-tee-airgap-audit.md) — QR air-gap audit transport
- [`docs/streams/clawql-durable-objects.md`](./clawql-durable-objects.md) — session / sidecar / virtual key contract
- [`docs/inference/clawql-inference.md`](../inference/clawql-inference.md) — PAL, virtual keys, call store
- [`docs/mcp/mcp-api-adapter.md`](../mcp/mcp-api-adapter.md) — six protocol surfaces
- [`docs/plugins/codegraph.md`](../plugins/codegraph.md) — Effect scheduler feasibility / blast radius
- [`docs/security/clawql-security-defense-in-depth.md`](../security/clawql-security-defense-in-depth.md) — security positioning
- [celld](https://celld.dev/) · [Bytecode Alliance Component Model](https://component-model.bytecodealliance.org/) · [Wasmtime](https://wasmtime.dev/)

---

_clawql-cellrt · Specification v0.1 · August 2026 · Draft_  
_Companion: ClawQL Streams Spec v0.2 · ClawQL Celld Integration Spec · clawql-tee_  
_Planned crate path: `crates/clawql-cellrt` (ClawQL monorepo)_
