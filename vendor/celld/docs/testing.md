# Testing

celld makes three important promises:

- An acknowledged write is durable.
- A cell has one writer at a time. It never has two.
- Code written for Cloudflare Workers and Durable Objects operates the
  same on celld.

We try to break each promise at the layer where a failure shows most
clearly. We test the API contract with differential execution against the
Cloudflare runtime. We check the coordination protocol against an
exhaustively model-checked specification, and we test it with
deterministic simulation. We test the full system with fault injection
on live fleets.

## Conformance: two runtimes, one output

We test the compatibility promise differentially. We run each Workers and
Durable Objects program twice: once on workerd, the runtime binary that
Cloudflare operates in production, and once on celld, on identical bytes.
The two outputs must be equal. This shows two facts at once: the program
is real Cloudflare code, because workerd accepts it, and celld obeys the
contract, because the outputs are equal. A test cannot agree with our own
runtime by accident.

The corpus only grows. When celld gets a new API surface, we add fixtures
for that surface, and the fixtures must give equal output on the two
engines. We also port test suites from workerd itself: the Durable
Objects contract, the web-platform globals, and the upstream Web Platform
Tests. Before a release, we also replay scenarios through the full
`celld` binary in each deployment mode: storage, SQL, alarms, streams,
WebSockets, and lifecycle.

## Specification: exhaustive at small size

The coordination protocol is also specified in TLA+. Heyang Zhou wrote
the specifications against celld v0.1.0, and his model checking found
four bugs and a split-brain that lost an acknowledged write. All are
fixed. None had surfaced in our own review or testing.

Where simulation samples schedules, the checker enumerates them: at a
small configuration it visits every reachable state. The model grants
the implementation a linearizable object store and perfect shared
clocks, so a violation it finds needs no clock skew and no storage
anomaly to occur. The invariants are the first two promises at the top
of this page: one writer for each epoch, and no acknowledged write
lost. The fencing argument itself — that a stale owner's late writes
cannot cost an acknowledged write, because the epoch in the key keeps
its lineage apart — is checked, not asserted.

Every configuration carries a pinned expected verdict, and most of the
verdicts are failures: each failing configuration models a bug the
protocol once had, or a deliberately broken checker, and the model
must produce the counterexample. A configuration that stops failing
has lost its tooth. One tooth had already fallen out when the
specifications arrived; we repaired it.

Some specifications model a proposed protocol before it is built. When
the fence on write acknowledgments was redesigned, the design-stage
check produced an eight-state counterexample against the version it
replaced: a dormant cell resumes at its old epoch while its release is
in flight, acknowledges a write, and the takeover that follows
restores without it. The fix shipped; the counterexample stays as a
pinned failure.

The checker has also removed code: celld once sealed a cell's durable
history at restore, and the verdicts showed the seal defended only the
return of a write that was never acknowledged — an outcome celld does
not promise to prevent — while its permanent cut could turn a
recoverable ordering slip into a permanent loss. The seal is gone.

The specifications are a hand-synced snapshot, deliberately not in
continuous integration: a silently stale gate is worse than none. In
practice their updates have landed in the same changes that moved the
protocol, and a delta ledger records what the model does not yet
describe, including places where the model is weaker than the code
rather than wrong. Simulation remains the per-commit ratchet; the
model is its exhaustive small-configuration complement.

## Simulation: the protocol under adversarial schedules

The dangerous bugs live in the coordination: a crash during an ownership
handoff, a lease renewal that races a takeover, an alarm that fires
against a partially restored cell. These windows are nanoseconds wide and
open rarely, so a test cannot wait for them.

Thus the coordination protocol is a
[pure decision core](https://github.com/denoland/celld/tree/main/crates/logic)
with no I/O of its own: the clock, the randomness, and the object store
are interfaces, and a simulator drives the core. The simulated store
injects latency, compare-and-swap races, and lost responses; the clocks
drift apart; a node can crash at each await point. Scripted adversaries
play the cells: a handler that never returns, a write stream that stops
halfway. V8 stays out of the simulation, because V8 is not deterministic.

A seeded scheduler drives each run, so a failure is not a fluke: the seed
replays it exactly, every time, and we keep the seed until the bug is
dead. We examine each property for safety (two writers in one epoch, a
lost acknowledged write, an expired lease that comes back) and for
liveness (each armed alarm fires, and ownership settles on one node after
a crash). A property must survive tens of thousands of seeds, and the
core protocols have run through millions of different schedules.

Simulation has a known failure mode: the checker that cannot fail. So
we also test the checkers: we run deliberately broken variants of the
protocol against the properties, and the properties must find the damage.
A suite that stays green against a broken protocol is a broken suite.

## Live fleets: what simulation cannot see

Simulation cannot see the real S3 tail latency, the real kernel and
filesystem behavior, or V8 under memory pressure. The third layer is
therefore a permanent fleet lab: standard VMs from standard providers,
and a real bucket. The workloads rotate: chat rooms under many WebSocket
connections, working sets that shift across tens of thousands of cells
(each cell has a unique checksum), deployment cutovers under load, and
runs that fill the nodes to the memory limit. The lab qualifies each
release, and between releases it pushes the density and the fault
coverage further. Each run makes an archived evidence bundle: the
configuration, the verification sweeps, the node journals, the kernel
logs, and the phase timings. We keep a red run with the same care as a
green run, because a failure that the harness caught is a result, not a
retry.

We inject the faults between verification passes. A pass fetches each
cell through different nodes and compares the durable state exactly: the
status, the body, and the full message ledger. Each run therefore has a
clean picture before the fault and after it. A cell can be unavailable
for a short time while its ownership moves, but its committed state must
stay complete, and a live node must serve that state again.

The scenarios attack every seam that we know:

- Stop a node with `SIGKILL` in the middle of a write stream and delete
  its local database, so recovery can only come from the bucket. Every
  acknowledged write comes back, because the output gate held each
  response until the write was durable.
- Freeze an owner node, write to its cells through other nodes, and
  unfreeze it. The node sees that its lease moved and refuses to serve
  the old state, and each write from the other nodes lands exactly one
  time: one epoch has at most one writer.
- Cut a node off from the bucket. It fences itself, because a node that
  cannot replicate must not own cells.
- Throttle the bucket, so it answers each request with a 429. The engine
  slows to the write rate of the store and does not amplify the
  throttle, because a node that knows its replicated position does not
  ask a slow store for extra listings.
- Stop a full host at the provider level in the middle of a workload.
  Its cells move to the other nodes, and the returning host joins again
  with no duplicate residency.

Across every run of every scenario, no acknowledged write was lost and
no committed state was damaged; the verification sweeps show zero body
faults, zero status faults, and zero lost messages.

## A few numbers we trust

Each number includes the condition of its measurement. A number without
its conditions has no value.

- **The epoch fence holds under contention.** Five hundred claimants
  tried at the same time to own the same cells: 5,500 attempts, one
  writer for each epoch, zero violations.
- **A warm resident request is local.** A request to a resident cell does
  zero bucket operations and returns in p50 ~1.1 ms and p99 ~7 ms (a
  fixed-host measurement). Only a cold activation touches object storage.
- **A durable write waits for a durability proof.** A single node proves
  each write through the bucket, so one storage round trip is the minimum
  latency for that write. A fleet of two or more nodes can prove a write
  when each follower holds it on disk, and a follower fsync is much
  faster than a storage round trip: a lab fleet measured about 600 ms for
  a bucket proof and about 25 ms for a fleet proof. The bucket upload
  races every fleet proof and either one proves the write, so a slow
  follower cannot make a write slower than a bucket proof. Concurrent
  writes to one cell join one shared upload, so the throughput of one
  cell is not one round trip for each write.
- **A restore is normal work.** Placement handles the restore of an
  inactive cell as ordinary work, and not as an emergency procedure. The
  measured restore times come from the retired external replicator, so this
  page gives no number until a fleet run measures `celld-ltx`.
- **Ten small nodes held real scale.** A fleet of ten nodes, each with 4
  vCPU and 8 GB, held 10,000 resident cells and 20,000 concurrent
  WebSocket connections. We stopped two of the ten nodes, and the data of
  every cell was available again on another node in ~11 s at the tail
  (with reserve headroom).

## The failure edges we intend to find

We must also know where a policy stops, so we record the edges instead of
tuning them away. The clearest edge is the reserve headroom: a fleet that
is full to its resident limit has no space for the cells of a lost node,
so a failure of more than one node at the limit degrades the service,
and a fleet with headroom does not. We measure both sides of that line,
the good restoration with reserve and the red case without, because this
measurement is part of the work.

If you find an edge that we did not find, tell us: a schedule that breaks
a promise, a fault that we did not inject, a number that you cannot
reproduce. That is exactly the bug report that we want:
[github.com/denoland/celld/issues](https://github.com/denoland/celld/issues).
