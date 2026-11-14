# celld durability mode on authorizing boards

**Recorded:** 2026-11-13 (Pacific) after Rivet OpenOrange/celld cost-thread review.  
**Authorizing artifacts:** [`V4_CLAIM.md`](./V4_CLAIM.md) · soak + v4 identity remesure JSONs.

## What celld offers

`CELLD_DURABILITY` (upstream celld ≥0.3.0; docs in `vendor/celld-lab/docs/guarantees.md`):

| Mode | Default? | Acknowledgment waits for | Object-store upload |
| --- | --- | --- | --- |
| `fleet` | **yes** | Disk quorum: every recruited follower fsyncs the write (or the bucket proof wins the race) | Continues in the background after ack |
| `bucket` | no | Bucket (S3/R2) proof for every write | Required before ack |

Fleet needs **two running nodes** before a fleet proof is possible. A one-node fleet falls back to bucket proofs. A three-node fleet can hold three disk copies.

## What the soak and v4 boards actually ran

| Fact | Evidence |
| --- | --- |
| Mode | **`fleet` (default).** Harness never set `CELLD_DURABILITY`; celld defaults to `fleet`. |
| Nodes | **2** (`nodeCount: 2`, stable `fleet_A` / `fleet_B`) |
| Host topology | **Same physical host** (Mac mini Colima Linux guest) — both nodes share one machine's disks |
| Bucket | Cloudflare R2 configured (`CELLD_BUCKET`, `bucketRedacted: true`) — used for leases, LTX tiering, and as the alternate proof path |
| Output gate | **On** (`outputGate: true`; upstream ≥0.6.3 always-on) |
| Fault scope covered | Process / node kill with peer disk still on the same host |
| Fault scope **not** covered | Losing the host's disks, a whole AZ, or a whole region |

R2 intent visibility on recovery is consistent with fleet mode: the background upload often lands before the crash settles, and fleet recovery can also reconstruct from peer node-log / bucket. Visibility in R2 does **not** prove the board ran in `bucket` mode.

## Claim scope (use this wording)

> Authorizing crash-safety was measured under **`CELLD_DURABILITY=fleet`**, two nodes on **one host**, output gate on, R2 as the fleet bucket. Acknowledgments wait for a **fleet disk proof** (or a racing bucket proof), not for “always in the object store.” That covers process and node crashes while peer disks on that host remain. It does **not** claim AZ- or region-loss durability. Zone/region boards and an explicit `bucket`-mode arm are open work.

## Incorrect prior phrasing (corrected elsewhere)

Do **not** say:

- “celld does not acknowledge a write before the data is in the bucket” as an unqualified fact — that is **`bucket` mode only**. Fleet mode can ack before the upload completes ([guarantees.md](../../../vendor/celld-lab/docs/guarantees.md) “The takeover recovery gate”).
- Unqualified “RPO=0 to the bucket” for fleet-default deployments — RPO=0 relative to the **durability proof in force** (disk ensemble and/or bucket).

## Harness

From 2026-11-13, `run-board.mjs` / `run-node-soak.mjs` record `celldDurability` (env or default `fleet`) in every evidence JSON so this cannot go unstated again.

## OpenOrange / Rivet note

Rivet's cost bench is request-cost only under high-churn agents. Their correction that celld since 0.3.0 can ack on local disk replicas (minus AZ spreading when replicas share a zone/host) matches upstream docs and our measured topology. Peer arm behind `DurableRuntime`, with durability mode and fault scope as board dimensions, remains the right next comparison — invite Rivet to review config.
