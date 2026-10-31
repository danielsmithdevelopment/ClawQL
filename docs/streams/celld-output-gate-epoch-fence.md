# celld output gate + lease-epoch fencing (mechanism fix)

**Priority:** top — durability selling point. Restore “intent durable before send” only after v3 passes with automatic R2 intent checks.  
**Upstream:** [denoland/celld](https://github.com/denoland/celld) (Apache-2.0) `v0.4.0`.  
**ClawQL fork:** [`vendor/celld`](../../vendor/celld/) — maintained here until a standalone fork repo exists (see [`FORK.md`](../../vendor/celld/FORK.md)).

## What already exists in celld v0.4.0

| Piece | Location | Behavior |
| ----- | -------- | -------- |
| Output gate | `crates/logic/output_gate.rs` | Every egress `Channel` (including `Fetch`) held until write position is proven durable under the **resident epoch** |
| Disable | `CELLD_OUTPUT_GATE=0` | Shell skips `Event::Output` — **never set this on fleet boards** |
| Fetch path | `crates/celld/js.rs` `op_fetch` → `await_egress_gate` | “Whatever this request can reveal must be durable before it leaves” |
| Bucket proof + ownership | `durable_reached` → `VerifyOwnership` | Bucket proof alone is not enough; ownership must still name this node at this epoch |
| Known gap (upstream comment) | same | “the bucket cannot refuse a stale writer” |

Despite the gate, ClawQL N=1000 settle found mid-flight hangs with **no durable intent** on R2/DO storage (and 494 with create meta only). So either the gate released on a proof survivors cannot restore, a stale incarnation wrote a discarded generation, or local `synchronous=NORMAL` position advanced ahead of true LTX durability.

## One fix (closes H1 + H2) — landed in `vendor/celld`

1. **Fenced acknowledgment (`CELLD_FENCED_ACK`, default on)**  
   - Every storage write returns a **sequence / position**.  
   - Outgoing calls are held until storage confirms that write is **durable = committed under the current lease epoch** (not merely accepted in memory / local WAL).  
   - ClawQL patch: after each LTX PUT, **confirm GET** before advancing `synced_seq` so the gate cannot release on a PUT survivors cannot read.  
   - If confirmation does not arrive in time, **never send** (safe).

2. **Incarnation in lease + refuse live steal (`CELLD_REFUSE_LIVE_INCARNATION`, default on)**  
   - Process generation already lives on the node lease (`ownership_index_generation`).  
   - ClawQL patch: **refuse to start** if a still-live foreign generation holds that node ID (duplicate-identity guard for pinned IDs).  
   - ClawQL patch: **refuse node-log bundle PUT** when the record is not Open at the shipper epoch (stale writer never lands orphan objects → never gets ack → never sends).

3. **Enforce in celld’s runtime fetch path** (`op_fetch` / `gated_channel_send`), not in each Worker — no program can skip it.

## ClawQL side (this repo)

| Item | Status |
| ---- | ------ |
| Pause mechanism claim | Done — publish-readiness, mcp-tools, www, AVAILABILITY, STATUS |
| Cost Plus / social correction text | [cost-plus-thread-correction.md](../gtm/cost-plus-thread-correction.md) |
| Vendored celld fork with H1/H2 patches | [`vendor/celld`](../../vendor/celld/) |
| TLA+ `IntentDurablyAckedBeforeSend` | Done (ack = epoch-committed, not re-get) |
| Trace checker | Done |
| Kill-after-fetch regression | Expected fail until forked binary proven; then `CLAWQL_REQUIRE_OUTPUT_GATE=1` |
| Stale-incarnation regression | Simulation test in streams-celld scripts |
| Mid-flight harness intent check | In `run-board.mjs` (`lost_midflight_intent`); v3 also verifies R2 |
| Lease-sweep + alive-vs-ready | Parallel (availability hang) |
| Measure durable-ack latency | Publish p50/p99 of gate wait as the price of the guarantee |

## Restore claim only when

1. Forked celld binary (`0.4.0-clawql.1`+) is pinned on CI / boards.  
2. Kill-after-fetch + stale-incarnation tests **pass** (required).  
3. Trace checker + TLA weak configs still fail the weak cases.  
4. v3 board: frozen option-2 criteria **and** every mid-flight trial verifies intent in R2; correctness includes lost-intent as failure.  
5. Latency of durable-ack published beside the claim.

## Non-fixes

- Re-reading intent via `storage.get` after `put` on the same node.  
- Treating zero duplicates on a hanging mock upstream as proof of the mechanism.
