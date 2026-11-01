# What celld guarantees

celld makes two promises. Exactly one node serves a cell at a time, so two
machines never write the same database. celld does not acknowledge a write
until the write survives a failure, so an acknowledged write is never lost. Both
promises require a bucket with working conditional writes and ranged reads, and
a supervisor that restarts the process.

## What the bucket must provide

- A conditional create: the write must fail when the object exists.
- A conditional overwrite: the write must fail when the object changed after the
  read.
- Read-after-write consistency: a read after a successful write must return that
  write.
- Ranged reads: a read must return the requested byte range and the bytes from
  that range.
- For epoch GC (`CELLD_LTX_RETENTION_SECS`) only, list-after-write consistency:
  a listing after a successful write must include the written object. Amazon
  S3, Cloudflare R2, Google Cloud Storage, and Azure Blob Storage provide it. A
  Tigris Global or Dual-region bucket provides it only in the region of the
  write, so do not enable epoch GC on one when fleet nodes are in more than one
  region.

The qualified stores are Amazon S3, Cloudflare R2, Tigris, Google Cloud Storage,
and Azure Blob Storage. The release tests run against R2; the S3 path uses the
same client and headers. Azure was qualified on 2026-08-18, single-node, under
an account key, a VM managed identity, and an AKS workload identity. A managed
identity on Azure App Service or Azure Container Apps does not work; see
[limitations](limitations.md).

Backblaze B2, Hetzner Object Storage, and DigitalOcean Spaces do not implement
the required conditional writes, so two nodes can own one cell on them. A store
that accepts the conditional headers but ignores the condition fails late and
silently, so run the storage test.

MinIO (the community edition) passes the storage test but is not qualified for
production. RELEASE.2025-09-06T17-38-46Z answers the conditional create of an
absent object with `NoSuchKey`, so the first deploy fails (denoland/celld#162).
Use RELEASE.2025-09-07T16-13-09Z or later.

A `gs://` bucket uses the Cloud Storage XML API with
`x-goog-if-generation-match` and OAuth credentials, because Cloud Storage does
not apply `If-Match` to a PUT. For an `az://` bucket, the NAME is the container.

## The storage test

`celld diagnose` sends four conditional writes to the bucket:

```
ok bucket conditional write (create, reject-create, update, reject-stale)
```

Two of the four must fail; if the store accepts either, the command exits with
an error that names the store. Use `celld diagnose --read-only` with a
credential that cannot write.

Each node runs the same writes before it serves, then reads a range of a second
object and verifies the range and bytes. A node cannot disable this test. It
makes at most three attempts, with new objects, when an operation fails without
a clear cause; then the node starts with a warning, because a temporary outage
can end. The node stops immediately when a required conditional write or ranged
read is unsupported, when the store ignores a condition or the `Range` header,
or when it returns a wrong range or wrong bytes.

A process that stops mid-test can leave a small object under `probe/`; celld
never reads it.

celld reserves `probe/`, `cells/`, `nodes/`, `node-cells/`, `fleet/`, `deploy/`,
`deploy-blobs/`, `log/`, `wake/`, and `telemetry/`, and deletes objects under
some of them. An application must not write under any of them.

An operator must not delete, expire, or overwrite an object under these
prefixes, except under `probe/` and `telemetry/`. celld reads these objects to
fence and restore cells, and celld deletes the objects that it no longer needs.
A bucket lifecycle rule therefore must not select an object under another
reserved prefix. With a key prefix, each reserved prefix follows the key prefix,
for example `PREFIX/telemetry/`.

## The supervisor

Run celld under a supervisor that restarts the process, such as systemd, Docker
with a restart policy, or Kubernetes. A node that loses its lease fences itself
and exits, and without a restart the fleet loses that capacity. The supervisor
must restart without an attempt limit and wait at least one lease lifetime
between attempts.

## The mechanism

### The ownership record

Each cell has one ownership record in the bucket. It names the owner node's
session and carries a fencing epoch. A node acquires a cell with a conditional
create when no record exists, or a compare-and-swap on an existing record, so
two nodes cannot acquire the same cell. Every activation, a takeover or a local
wake, advances the epoch, so an epoch never has two writers.

The record is `cells/<cell>/own.json`. celld never deletes it, and it must stay
in the bucket for the life of the cell. A missing record next to LTX under
`cells/<cell>/ltx/` means that the record was lost, for example to a lifecycle
rule. celld then refuses to acquire the cell, because a new record at epoch 1
would start it with an empty database. Each request that must read the record,
to acquire the cell or to find its owner, fails, and the node writes
`celld ownership record lost` to stderr. The node then refuses the cell for 10
seconds without a bucket request, so it writes the line at most once in that
interval. A node that still serves the cell keeps serving it and keeps writing
LTX until it stops. That node cannot acknowledge a write that a bucket proof
covers, because the record no longer names it, so the write fails and the node
writes `celld output gate` to stderr. With `CELLD_DURABILITY=bucket`, every
write takes a bucket proof. celld detects the loss only from LTX under
`cells/<cell>/ltx/`. A new cell can keep its first writes in a node bundle under
`log/` until the tiering path drains them, so a loss before that drain starts
the cell empty.

To restore the cell, first stop each node that served the cell with SIGTERM, not
with `POST /shutdown?handoff=preserve`. A preserved restart resumes its cells
without a read of the record, so the node keeps serving the cell. No peer can
acquire the cell, so its handoff cannot complete: the stop can take the whole
`CELLD_SHUTDOWN_TOTAL_MS` and log `shutdown_handoff_stalled`.

A stopped process can still hold acknowledged writes in its node log, outside
the per-cell prefixes, so wait until that log is recovered. A new process with
the same `CELLD_NODE` recovers it during startup, so the log is recovered when
that process reports healthy. Without the same `CELLD_NODE`, a running node
with `CELLD_DURABILITY=fleet`, the default, recovers it after the lease of the
stopped process expires. In that case, wait until `nodes/<node>.json` of the
stopped process is absent, has no `log` object, or shows `"state": "sealed"` in
it. A stop that logs `node-log close: sealed epoch` has already sealed its log.

Then write a released record, which names no node, at the newest epoch: the
numerically highest `e<epoch>` prefix under `cells/<cell>/ltx/`. For a newest
epoch of 7, the record is `{"node": "", "epoch": 7}`. After the refusal interval
ends, the next request acquires the cell at the next epoch and restores it from
the bucket. A released record skips the recovery of the node log of the
previous owner. A record that is written before these logs are recovered can
therefore lose acknowledged writes, and a node that still serves the cell
becomes a second writer.

### The epoch prefix

The replicator copies each cell's SQLite data to `cells/<cell>/ltx/e<epoch>/`
with unconditional PUTs. The epoch in the key is the fence: a node that lost
ownership can keep writing, but only into a superseded prefix, and a restore
selects the current lineage. The tiering path can first combine segments from
many cells into a node bundle and drain each segment into its per-cell prefix
later. A bundle is deleted only when the per-cell prefixes cover every segment
in it. A failed compaction retries after 30 seconds, backing off to at most 300
seconds.

### The acknowledgement rule (RPO=0)

A gate holds each response until a durability proof covers every write it can
reveal: a write response; a read-only response when the object has an uncovered
committed write; an error response, because a thrown message can carry a value
the handler read; an R2 mutation, so it cannot change the application bucket
before the source write is durable; a raw TCP connect, write, TLS upgrade, or
shutdown; and each chunk of a streamed body. A client therefore cannot act on a
value that a crash can still lose.

After a bucket proof, celld reads the ownership record once and acknowledges
only if it still names this node at this epoch. A partitioned node can commit
locally and replicate into its superseded prefix, but it does not acknowledge.
The check reads the record instead of a clock, so a paused process or a skewed
clock cannot pass it.

A fleet proof needs no such read. The owner sends each write to one or two other
nodes, its followers (together, the ensemble), and every follower must fsync it.
A takeover seals the prior node-log session before it restores, so a stale owner
cannot complete another fleet proof.

An unfinished SQL write cursor can return rows before SQLite commits. Outside an
explicit transaction, the application must consume those rows before output or
`storage.sync()`; celld rejects output while a write cursor is unfinished.

### The ensemble needs two nodes

A node never counts itself as a follower, and one follower is enough, therefore
a fleet needs two running celld nodes before any node can complete a fleet
proof. `CELLD_DURABILITY=fleet` is the default, so a one-node fleet requests the
fleet posture and does not get it.

A node recruits up to two followers, so a fleet of three or more nodes holds
three copies of an acknowledged write. The ensemble keeps acknowledging while
one follower remains. A node with one follower recruits a second one when
another node becomes available. Until then, a write that is not yet in the
bucket is only on the owner and on that one follower.

A node without an ensemble stays correct. It acknowledges each write on a bucket
proof instead, at the cost of latency: an object store round trip is much slower
than a follower fsync.

### The takeover recovery gate

In fleet mode, celld can acknowledge a write before its bucket upload completes.
Each process session therefore creates a conditional node-log record before its
first fleet-durable acknowledgement.

A cold activation checks the prior owner's log records before it reads the
bucket. An absent record proves that the session never acknowledged past the
bucket; a sealed record proves that recovery completed. An open or recovering
record forces recovery before the restore: compare-and-swap the record to fence
it, seal the reachable followers, upload their retained segments and bundles
into the per-cell prefixes, and mark the record sealed.

A cell can stop while its node session stays open; its next activation gathers
any acknowledged tail outside its per-cell prefix. Once the log epoch is
active (before its first fleet proof), at least one current follower must
return its complete retained range, or the activation fails and keeps the
recovery requirement.

Recovery has these limits:

- A follower's HTTP error does not prove its data is absent, even when its
  lease has expired, so persistent errors can block recovery and startup.
- A restarted follower cannot certify a range with a damaged batch or a gap
  until valid data covers it.
- An older node's entries-only tail (`CLT1`) proves neither completeness nor
  loss, so recovery or startup can stall during a mixed-version update.
- A deleted final batch is undetectable if no later batch or persisted end
  records its range.
- A torn batch with an unacknowledged write looks like damage after an
  acknowledgement, so the loss record can report an uncertified range when no
  acknowledged write is missing.

A restarting node serves authenticated follower seal and tail requests before
its own predecessor recovery completes, so nodes that restart together can
recover acknowledged writes from surviving follower disks. It accepts
application requests and new follower appends only after startup completes.

Recovery of a large dead node can take minutes. It reads retained bundles in
windows of at most 512 MiB and uploads and releases each window before the next,
so memory does not grow with the session; a cell with rows in several windows
receives one object per window. A failed or timed-out attempt does not fail
waiting requests: the cell retries with a backoff (`CELLD_RECOVERY_RETRY_MS`,
default 1000), and the requests fail with a resolve error only after
`CELLD_RECOVERY_RETRIES` (default 240) attempts.

### Epoch-chain restore

A restore chains the epoch prefixes that contain LTX data, from the newest down
to an epoch that opened with a whole-database snapshot. An epoch that paged in
continues its predecessor from the cut it paged from, and a predecessor that
does not end exactly at that cut is not part of the chain. A legacy
`e<epoch>.seal.json` object does not limit the chain.

A paged cell reads no chain up front. It opens over a sparse local file, reads
each page from the objects on first use, and fills the rest in the background; a
filled cell reads only its local file. A chain smaller than
`CELLD_LTX_PAGED_MIN_MB` is downloaded whole.

### Epoch GC

When `CELLD_LTX_RETENTION_SECS` is positive, the owner of a cell deletes the
epoch prefixes that no restore reads, in both `CELLD_DURABILITY` modes:

1. It builds the chain over every epoch prefix and continues only when the
   newest epoch is its own. Its first object is then in the listing, so a later
   owner restores from a base at the same epoch or higher.
2. A paged cell waits until its local file is complete.
3. It continues only when the ownership record names this node at this epoch.
4. It writes `retired.json` with the base and deletes the prefixes below it,
   keeping its own epoch, the one before, and each epoch younger than the
   configured time.

The order matters: otherwise a fenced owner could delete its successor's base.
A late delete is safe because an epoch below the base never rejoins a chain.
This relies on list-after-write consistency.

A fenced node can append an unacknowledged tail to an older prefix. After a
snapshot successor, a later restore can expose that tail; this does not violate
the contract, because a missing acknowledgement does not prove a write absent.
After a paged successor, the chain clips the older prefix at the cut, and the
takeover recovery gate seals the prior node-log session before the successor
restores, so no write past the cut can be acknowledged.

### Self-fencing

Each node holds a lease in the bucket with an expiry, renewed after one third of
the lifetime (`CELLD_TTL_MS`, default 10000 ms). A failed renewal is retried
while the published expiry has not passed.

When the expiry passes, the node fences itself: it stops each active cell and
fails every incomplete request. It also fences at once when its lease record is
gone or no longer matches what it published. The fence writes nothing; peers
already read the lease as dead or replaced and acquire the cells through the
ownership records. celld checks the published expiry on every routed request,
so a request is safe even before the fence runs.

An ingress checks a cached remote route against the observed lease deadline on
each new request and rereads ownership at the deadline, even if the old owner
holds connections open. Recovery still needs the bucket and the required durable
data. A draining ingress can forward to a live remote owner but refuses new
ownership of an unowned cell or one with an expired owner. The ingress does not
replay a request already sent to the old owner, because the handler can have
committed a write; the caller can cancel it.

A fenced node logs a line starting with `SELF-FENCE:` and exits with code 3.
Other internal failures share the prefix and code; the line names the cause:
`node_lease_watchdog_fence` (expired), `node_lease_record_missing_fence`, or
`node_lease_record_mismatch_fence` (which names no author, because the node
cannot prove who wrote the record). The fenced state is terminal: only a restart
returns the node, through the normal cold-activation path. The
[testing page](testing.md) shows the kill tests for this path.

`RUST_LOG=celld=info,store=debug` logs a `node_lease_read` or `node_lease_write`
event for each store request against the node's own lease record, with an
`outcome` of `found`, `missing`, `applied`, `rejected`, or `error`. An `error`
carries the store failure in an `error` field; a `found` carries the record's
`generation`. The target costs nothing at other filters.

## Alarm discovery and the wake format

SQLite stores the alarm deadline, consumption, retry state, and installation
identity. An alarm hint only makes celld read SQLite; it never authorizes a
handler to run.

Each committed installation has an object under `wake/entries/`, identified by
the ownership epoch and a persistent SQLite sequence. An alarm response waits
for its publication PUT and the output proof; an update within the same minute
also needs a new PUT.

Cleanup publishes a retirement record under `wake/retired/` with conditional
writes. The record needs a durability proof, a current owner, and, if an alarm
remains armed, a confirmed replacement publication. Cleanup deletes only older
identities or a proven consumed one, so an old DELETE cannot remove a later
installation and the bucket needs no conditional DELETE. Deletes of obsolete
publications do not block an alarm response.

Each cleanup pass lists at most 128 objects and processes at most eight cells
concurrently, continuing the listing on the next pass and restarting after the
last page. A failed DELETE or a late PUT can need another full scan. The
interval defaults to 60 seconds; `CELLD_WAKER_TICK_MS` sets it and the due-scan
interval. A large inventory can take many intervals, and each extra node can
repeat the same reads and deletes.

`wake/format.json` selects format 2; `wake/waker.json` holds the advisory lease
for the waker role. A new node initializes an empty fleet or upgrades a stopped
v0.4.1 fleet automatically. An unsupported format, or the old
`wake-format.json`, `wake-v2/`, or `wake-retired-v2/` names, prevents startup.
Application objects outside the reserved namespaces do not.

### Start a fleet with this format

An empty fleet initializes this format automatically. An upgrade from v0.4.1
keeps the bucket and node data directories but needs a stopped fleet, because
v0.4.1 cannot read the new discovery entries.

1. Stop application traffic and deployment writers. Stop every old node and its
   supervisor, then wait for every node lease to expire.
2. Back up the bucket and node data. Keep the node names, peer addresses, and
   data directories. A follower disk can hold acknowledged writes that the
   bucket does not yet hold.
3. Prevent the old binaries from restarting or writing to the bucket: revoke
   their credentials or access. The format marker cannot stop them.
4. Start the new binary on every node with the same configuration, data, and
   addresses. Wait for the fleet to become healthy, then resume traffic.

The nodes can start together. A live node lease blocks the migration, and the
operator must keep old writers from returning.

The migration preserves databases, node logs, ownership records, deployments,
and application objects. It creates a discovery seed for each stored cell, in
pages of at most 128 entries. A seed makes recovery derive the installation
identity from SQLite without changing the deadline or retry state, and it is
removed only after durable recovery, so an interrupted migration cannot discard
an alarm. Recovery can load cells with future alarms while it processes seeds.

If a node stops mid-migration, another starting node resumes it. No node serves
until the full inventory succeeds, so alarms can run late. Later starts do not
migrate again.

To roll back, restore the full stopped-fleet backup; never start an old binary
against the upgraded fleet. The restore loses writes made after the backup, so
preserve those separately.

Restarts and ownership transfers preserve alarm history. Each restored writer
takes a new epoch and keeps the stored sequence and consumed state, so an old
mutation cannot target a later installation.
