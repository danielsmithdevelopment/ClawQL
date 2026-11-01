# Testing

celld makes three promises:

- An acknowledged write is durable.
- A cell has one writer at a time.
- Code written for Cloudflare Workers and Durable Objects operates the same on
  celld.

We test the API contract by differential execution against workerd, the
coordination protocol by model checking and deterministic simulation, and the
full system by fault injection on live fleets.

## Conformance: two runtimes, one output

We run the same Workers and Durable Objects programs on workerd, Cloudflare's
production runtime, and on celld, and the outputs must match. workerd supplies
the reference output, so the expected behavior does not depend on celld.

Each new API adds fixtures to the corpus. We also port the workerd Durable
Objects contract tests, its web-platform globals tests, and the upstream Web
Platform Tests. Before a release, we replay storage, SQL, alarm, stream,
WebSocket, and lifecycle scenarios through the full `celld` binary in each
deployment mode.

## Specification: exhaustive at small size

The coordination protocol is specified in TLA+. Heyang Zhou wrote the
specifications against celld v0.1.0. His model checking found four bugs and a
split-brain that lost an acknowledged write. All are fixed. None had surfaced
in our own review or testing.

At a small configuration, the checker visits every reachable state. The model
grants a linearizable object store and perfect shared clocks, so a violation
needs no clock skew or storage anomaly. The invariants are one writer for each
epoch and no lost acknowledged write. The checker also verifies that the epoch
in the key stops a stale owner's late writes from losing an acknowledged write.

Each configuration pins an expected verdict, and most verdicts are failures:
each models a past protocol bug or a deliberately broken checker, and must
produce its counterexample.

A redesign of the write-acknowledgment fence was checked before it was built.
The check found an eight-state counterexample against the old version: a
dormant cell resumes at its old epoch while its release is in flight,
acknowledges a write, and the following takeover restores without it. The fix
shipped, and the counterexample stays as a pinned failure.

The checker also removed code. celld once sealed a cell's durable history at
restore. The verdicts showed that the seal only prevented the return of an
unacknowledged write, which celld does not promise, and that it could turn a
recoverable ordering error into permanent data loss.

We update the specifications by hand with protocol changes. They do not run in
continuous integration. A separate record tracks what the model does not yet
describe, including guarantees weaker than the code's.

## Simulation: the protocol under adversarial schedules

The dangerous bugs are in coordination: a crash during an ownership handoff, a
lease renewal that races a takeover, an alarm against a partially restored
cell. These windows are too narrow and too rare to wait for.

The coordination protocol is therefore a
[pure decision core](https://github.com/denoland/celld/tree/main/crates/logic)
with no I/O. The clock, the randomness, and the object store are interfaces
that a simulator drives. The simulated store injects latency, compare-and-swap
races, and lost responses. The clocks drift, and a node can crash at each
await point. Scripted adversaries play the cells, such as a handler that never
returns or a write stream that stops halfway. V8 is not deterministic, so it
stays out of the simulation.

A seeded scheduler drives each run, so a failure reproduces exactly. We check
safety (two writers in one epoch, a lost acknowledged write, an expired lease
that returns) and liveness (each armed alarm fires, ownership settles on one
node after a crash). A property must survive tens of thousands of seeds, and
the core protocols have run through millions of schedules. Deliberately broken
protocol variants verify that the checkers detect the faults.

## Live fleets: what simulation cannot see

Simulation cannot see real S3 tail latency, real kernel and filesystem
behavior, or V8 under memory pressure. A permanent fleet lab runs standard VMs
from standard providers against a real bucket. Workloads rotate: chat rooms
with many WebSocket connections, working sets that shift across tens of
thousands of checksummed cells, deployment cutovers under load, and nodes
filled to the memory limit. The lab qualifies each release. We archive each
run's configuration, verification sweeps, node journals, kernel logs, and
phase timings, including failed runs.

Faults land between verification passes. A pass fetches each cell through
different nodes and compares the status, the body, and the full message
ledger. A cell can be briefly unavailable while ownership moves, but its
committed state must stay complete and a live node must serve it again.

The scenarios:

- `SIGKILL` a node mid-write-stream and delete its local database, so recovery
  comes only from the bucket. Every acknowledged write returns, because the
  output gate held each response until the write was durable.
- Freeze an owner, write to its cells through other nodes, and unfreeze it.
  The node sees that its lease moved and refuses to serve the old state. Each
  write lands exactly once.
- Cut a node off from the bucket. It fences itself.
- Throttle the bucket to 429 on every request. The engine slows to the store's
  rate and does not amplify the throttle.
- Stop a full host at the provider level mid-workload. Its cells move to other
  nodes, and the returning host rejoins with no duplicate residency.

Across every run of every scenario, the verification sweeps show zero body
faults, zero status faults, and zero lost messages.

## A few numbers we trust

- **The epoch fence holds under contention.** Five hundred concurrent
  claimants made 5,500 attempts on the same cells: one writer for each epoch,
  zero violations.
- **A warm resident request is local.** A request to a resident cell does zero
  bucket operations and returns in p50 ~1.1 ms and p99 ~7 ms (a fixed-host
  measurement). Only a cold activation touches object storage.
- **A durable write waits for a durability proof.** A single node proves each
  write through the bucket, so one storage round trip is the minimum. A fleet
  of two or more nodes can instead prove a write when each follower holds it
  on disk. A lab fleet measured about 600 ms for a bucket proof and about 25 ms
  for a fleet proof. The bucket upload races every fleet proof, so a slow
  follower cannot make a write slower than a bucket proof. Concurrent writes
  to one cell share one upload.
- **A restore is normal work.** Placement treats the restore of an inactive
  cell as ordinary work. The measured restore times come from the retired
  external replicator, so this page gives no number until a fleet run measures
  `celld-ltx`.
- **Ten small nodes held real scale.** Ten nodes, each with 4 vCPU and 8 GB,
  held 10,000 resident cells and 20,000 concurrent WebSocket connections. With
  two of the ten nodes stopped, every cell was available again on another node
  in ~11 s at the tail (with reserve headroom).

## Known failure edges

A fleet at its resident limit has no space for a lost node's cells, so losing
multiple nodes degrades service. We test recovery with and without reserve
capacity to measure this limit.

Report a schedule that breaks a guarantee, an untested fault, or a measurement
that you cannot reproduce in the
[issue tracker](https://github.com/denoland/celld/issues).
