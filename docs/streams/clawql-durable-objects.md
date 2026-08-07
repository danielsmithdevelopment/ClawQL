# ClawQL Durable Objects — Implementation Spec v0.1

**Status:** Draft · August 2026  
**Package surface:** Cloudflare Durable Objects (hosted) · Node worker approximation (self-hosted / Miniflare)  
**Depends on:** [`clawql-streams`](./clawql-streams.md) · [`clawql-inference`](../inference/clawql-inference.md) · OpenBenchTrace / RTP  
**Related:** [`mcp-api-adapter`](../mcp/mcp-api-adapter.md) · [PorTAL flywheel](../inference/portal-flywheel.md)

---

## 1. Purpose

This document specifies how ClawQL Streams agent sessions run inside **Durable Objects** (or a Node-compatible DO runtime such as Miniflare / a future Node `DurableObjectRuntime`).

Goals:

1. **Ephemeral compute per event** — spawn → work → destroy; pay for what runs.
2. **Ephemeral model credentials** — virtual key bind-on-create, expire-on-destroy.
3. **Three sidecars** — forensic audit, inference, training-data emission — without conflating them.
4. **Parity path** — same session contract on K8s workers when DOs are unavailable (regulated / air-gapped).

The Durable Objects API is an **interface**, not a Cloudflare-only capability. A Node implementation can back the same class shape with `worker_threads`, `better-sqlite3`, HTTP/WebSocket handlers, and hibernation via ref/unref — same pattern Miniflare uses for local Workers. Cloudflare remains the hosted path; Node/K8s remains the sovereign path.

---

## 2. Object types

| DO class         | Lifetime                | Responsibility                                                                                             |
| ---------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `SubscriptionDO` | Long-lived (hibernates) | Holds WebSocket/source connection, significance filter, subscription config + `rtpConsent`, NATS publisher |
| `AgentSessionDO` | Ephemeral (per event)   | Runs one agent session with three sidecars; destroys itself on exit                                        |

Gateway Worker (stateless) routes by topic → `SubscriptionDO`. `SubscriptionDO` spawns `AgentSessionDO` when the significance filter passes.

---

## 3. Sidecars (AgentSessionDO)

```text
AgentSessionDO
  ├─ AuditSidecar          → WORM forensic trail
  ├─ InferenceSidecar      → clawql-inference + virtual key
  └─ TrainingDataSidecar   → RTP turnSequence → OBT envelope → export
```

### 3.1 AuditSidecar

Append-only WORM writer. Threads **virtual key ID** through every entry (§5). Does not store PII event bodies — payload hashes only (Streams §7.2).

### 3.2 InferenceSidecar

Embeds or calls [`clawql-inference`](../inference/clawql-inference.md) with a **constrained surface**:

- No unrestricted filesystem (DO storage / SQLite only)
- HTTP egress only to approved model endpoints (policy manifest)
- Virtual key required for every `/v1/*` call
- PAL routing + semantic cache + Langfuse/OTel as on the standalone gateway

DO is an additional **deployment context** for clawql-inference alongside stdio / HTTP / K8s.

### 3.3 TrainingDataSidecar

Accumulates RTP six-node `turnSequence` in DO SQLite as tools and model calls complete. On session close, wraps in OpenBenchTrace outer envelope and flushes to the configured export destination (Streams §14). Distinct from WORM: training structure vs forensic chain.

---

## 4. Spawn contract (gateway)

Before the AgentSessionDO exists, the **gateway** (not the DO) atomically:

1. Allocates `doInstanceId`
2. Asks clawql-inference to issue `virtualKeyId` scoped to `doInstanceId`
3. Writes WORM `DO_CREATED` with `{ doInstanceId, virtualKeyId, subscriptionId, eventHash, manifestId }`
4. If credit-gated: `DeductionService.hold(estimatedCost)`
5. Spawns DO with environment bindings: `DO_INSTANCE_ID`, `VIRTUAL_KEY`, `SUBSCRIPTION_ID`, `MANIFEST_ID`, `RTP_CONSENT_JWT`, `POLICY_ALIAS`

If key issuance fails, no DO is spawned and no hold is left open.

---

## 5. Virtual key lifecycle

| Phase    | Action                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create   | Issue key scoped to DO instance ID; budget = `budgetTokens` or derived from `budgetUsd`; TTL = `maxTurns × estimated_turn_duration`; PAL from subscription `model` alias |
| Run      | Every model call uses only this key; call-store rows include `virtual_key_id`                                                                                            |
| Close    | Capture actual spend; flush training record; WORM `DO_DESTROYED`; expire key → subsequent use is 401; DO destroys itself                                                 |
| Abnormal | Cloudflare eviction / timeout: hold expires with key TTL; WORM best-effort close; key still expired by TTL                                                               |

**Security property:** compromised credentials from a finished session are already dead. Long-lived service accounts across sessions are out of scope for Streams agent DOs.

---

## 6. WebSocket and hibernation

- **SubscriptionDO** uses WebSocket (or DO-compatible transport) so Cloudflare **hibernation** can sleep between events while keeping the connection.
- Agent sessions that need a persistent client channel (e.g. mcp-api-adapter sixth surface) also prefer WebSocket for hibernation-friendly sessions; Streamable HTTP remains the fallback for clients that cannot do WebSocket.
- HTTP-only long polls do not hibernate cleanly on Cloudflare DOs — document as a hosted-path limitation; K8s path may keep HTTP workers warm instead.

---

## 7. SQLite schema (AgentSessionDO, illustrative)

| Table             | Contents                                                                      |
| ----------------- | ----------------------------------------------------------------------------- |
| `session_meta`    | doInstanceId, subscriptionId, virtualKeyId, manifestId, startedAt, exitReason |
| `rtp_turns`       | ordered RTP nodes (Intent → … → Verdict) as JSON rows                         |
| `inference_calls` | mirror of call-store fields needed for OBT (tier, tokens, cache)              |
| `tool_calls`      | tool name, args hash, ATR result                                              |
| `export_status`   | pending / flushed / failed + destination                                      |

---

## 8. Session close sequence

```text
1. Agent loop exits (converged | maxTurns | budget | error | timeout)
2. TrainingDataSidecar: finalize RTP Verdict node; wrap OBT; export
3. DeductionService.capture(actual) or release on failure (if held)
4. AuditSidecar: DO_DESTROYED + spend summary
5. InferenceSidecar: expire virtual key
6. Clear sensitive SQLite; DO stub destroys / becomes reclaimable
```

Order matters: export and capture before key expiry so the last inference metadata is still attributable; key expiry before destroy so no orphan process can reuse the binding.

---

## 9. Self-hosted parity (K8s)

| Concern      | Cloudflare DO             | K8s session worker                             |
| ------------ | ------------------------- | ---------------------------------------------- |
| Isolation    | Per-object isolate        | Pod / Job per event (or pool with hard reset)  |
| SQLite       | DO storage                | Ephemeral volume or `better-sqlite3` in worker |
| Hibernation  | Native WS hibernation     | Scale-to-zero / idle timeout (not identical)   |
| Virtual key  | Same clawql-inference API | Same                                           |
| Sidecars     | In-process modules        | In-process modules (same code)                 |
| Scale signal | DO platform               | NATS consumer lag → HPA (Streams §6.2)         |

Parity target: **same session contract and WORM/RTP schemas**. Exact hibernation and cold-start numbers will differ — document in operator runbooks, do not pretend they are identical.

---

## 10. mcp-api-adapter on DOs

Optional: a long-lived DO wraps one MCP upstream and serves OpenAPI / GraphQL / `/mcp` / gRPC / WebSocket from SQLite-cached `ListTools`. gen-cli stays build-time. Catalog refresh on wake avoids re-`ListTools` on every request after hibernation. See Streams §6.4 and [`mcp-api-adapter`](../mcp/mcp-api-adapter.md).

---

## 11. Security checklist

- [ ] Virtual key never logged in plaintext; WORM stores key **ID** only
- [ ] ATR `allowedTools` enforced on every tool call inside the DO
- [ ] Event payload hashed for WORM; full body only in TTL-bounded NATS / encrypted cold store
- [ ] Egress allowlist for InferenceSidecar
- [ ] `rtpConsent` JWT validated before TrainingDataSidecar export
- [ ] Manifest ID injected from Cosign-signed release, not free-form client input

---

## 12. Open questions

1. In-process InferenceSidecar vs remote clawql-inference HTTP from the DO (latency vs blast radius).
2. Whether SubscriptionDO and AgentSessionDO share a DO namespace or separate script names for IAM.
3. Miniflare / Node DO runtime maturity for CI parity tests.
4. Batching: one AgentSessionDO per batch window vs N DOs with a parent batch coordinator.

---

## Further reading

- [`docs/streams/clawql-streams.md`](./clawql-streams.md) — Streams v0.1.1 (§3.4 virtual keys, §14 RTP/OBT)
- [`docs/inference/clawql-inference.md`](../inference/clawql-inference.md) — virtual keys, PAL, call store
- [`docs/benchmarks/openbench-trace-collection.md`](../benchmarks/openbench-trace-collection.md) — OBT + RTP
- Essay: [OpenBenchTrace and RTP](https://pragmaticvectors.com/posts/openbench-rtp-relationship/)
- Essay: [What Convergence Week actually proved](https://pragmaticvectors.com/posts/openbench-convergence-week/)
