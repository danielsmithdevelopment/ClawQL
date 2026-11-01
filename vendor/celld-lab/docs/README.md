# celld

celld is a stateful distributed system. It runs server-side JavaScript on
your machines, and it stores the long-term state in a bucket that you own:
S3-compatible, Google Cloud Storage, or Azure Blob Storage. The JavaScript
API and the configuration follow Cloudflare Workers: Workers, Durable
Objects, KV, Queues, D1, R2, Workflows, Cron Triggers, and static assets.

## Cells and nodes

In Cloudflare terms, a cell is a Durable Object: a small server with a
name and a private SQLite database. You make one cell for each user,
document, chat room, or AI agent. A cell serves HTTP, holds WebSocket
connections, sets alarms, and makes outbound connections. Cells share no
database. Each cell runs on one thread: a second request interleaves only
while the first awaits, and storage operations are synchronous.

You run celld as one process on each machine. That process is a **node**,
and the nodes that share one bucket are a **fleet**. Any node can serve
any cell, so you add capacity by starting another node against the same
bucket.

## Cell lifecycle

A cell has the same states as a Durable Object. A **resident** cell is in
memory: it is **active** while it does work, and **idle** when it waits.
celld removes an idle cell from memory after `CELLD_IDLE_EVICT_S` seconds
without work, and earlier under memory pressure or at the residency cap.
Without `CELLD_IDLE_EVICT_S`, only pressure or the cap removes an idle
cell. A cell that keeps its hibernatable WebSocket clients on its node is
**hibernated**. A cell that no node holds is **inactive**: it is only an
object in the bucket and costs almost zero. Every cell starts inactive.

The constructor runs again on each activation, because a cell keeps no
memory across these transitions. A hibernated cell wakes like a cold start,
but its WebSocket clients stay connected and it stays on its node.

Each activation can add a new epoch prefix to the bucket. celld deletes
the older prefixes only when `CELLD_LTX_RETENTION_SECS` enables epoch GC,
so without it the bytes of a cell increase with each activation. See
[epoch GC](guarantees.md#epoch-gc).

One 8 GB node holds 1,000 resident cells, so one resident cell costs
approximately $0.05 each month.

## Ownership and durability

Exactly one node serves a cell at a time. A node claims a cell with a
conditional write of a small record to the bucket, so the bucket decides
who wins. There is no leader election and no membership list. The claim
expires unless the node renews it, so a failed machine releases its cells.

celld does not answer a write until the data survives a failure (RPO=0).
`CELLD_DURABILITY` selects how celld proves that a write is durable:

- `bucket`: the node answers after the write reaches the bucket. Each write
  costs one object store round trip.
- `fleet` (the default): the node sends each write to one or two other
  nodes, and it answers when they hold it on disk or when the bucket upload
  finishes, whichever comes first.

A single node has no peer, so a one-node fleet in `fleet` mode waits for the
bucket on every write, as `bucket` mode does. Two or more
nodes are faster, because a follower fsync is much faster than an object
store write. Run two or more nodes if write latency
matters. A fleet that loses all but one node falls back to the bucket in the
same way, and it stays correct. Set `bucket` to wait for the bucket on every
write, even when peers are available.

When a node stops, another node takes its cells over, and first collects
the data that the stopped node had not uploaded. See
[what celld guarantees](guarantees.md) for the mechanism and the bucket
requirements.

## Alarms

When an event sets an alarm before its response boundary, celld does not
send a successful response until a durable wake entry covers the alarm. A
later `waitUntil` alarm does not delay the response of another event.

A hibernated cell fires its alarm on the node that owns it. One node holds
the waker role, and it wakes only the cells whose owner node has stopped.

## What do you build with cells

- **Real-time applications.** A multiplayer game, a chat room, or a
  collaborative document is one cell. The room needs no lock and no
  external message bus.
- **Agents.** Each AI agent is one cell with its memory, schedule, and
  inbox in its own SQLite database. An inactive agent costs almost nothing.
- **Sharded web applications.** One cell for each user, tenant, or device
  shards the application from the start, so no shared database exists.

## Contents

- [Cells and nodes](#cells-and-nodes)
- [Cell lifecycle](#cell-lifecycle)
- [Ownership and durability](#ownership-and-durability)
- [Alarms](#alarms)
- [What do you build with cells](#what-do-you-build-with-cells)
- [Install](#install)
- [Configure object storage](#configure-object-storage)
- [Deploy an application](#deploy-an-application)
- [Develop an application locally](#develop-an-application-locally)
- [Operate D1, KV, and R2](#operate-d1-kv-and-r2)
- [Start a node](#start-a-node)
- [Add nodes](#add-nodes)
- [Feed an autoscaler](#feed-an-autoscaler)
- [Shut down and roll out a node](#shut-down-and-roll-out-a-node)
- [Upgrade notes](#upgrade-notes)
- [Diagnose a fleet](#diagnose-a-fleet)
- [List Durable Objects](#list-durable-objects)
- [Hot-cell overload](#hot-cell-overload)
- [Environment variables](#environment-variables)
- [Services](#services)
- [Cloudflare compatibility](cloudflare-compat.md)
- [What celld guarantees](guarantees.md)
- [Limitations](limitations.md)
- [Security](security.md)
- [Telemetry](telemetry.md)
- [Testing](testing.md)
- [WebAssembly](wasm.md)
- [Python Workers](services/workers.md#python-workers)

## Services

Each service page contains a runnable example and the known differences from
the Cloudflare service.

- [Workers](services/workers.md)
- [Durable Objects / Cells](services/durable-objects.md)
- [Durable Object Facets](services/durable-object-facets.md)
- [KV](services/kv.md)
- [Queues](services/queues.md)
- [D1](services/d1.md)
- [R2](services/r2.md)
- [Workflows](services/workflows.md)
- [Cron Triggers](services/cron-triggers.md)
- [Static assets](services/static-assets.md)
- [Dynamic Workers](services/dynamic-workers.md)
- [Containers](services/containers.md)

## Install

```sh
curl -fsSL https://celld.dev/install.sh | sh
```

The installer downloads the `celld` binary. Replication runs inside the
process, so a node needs no external replicator. If the installer tells
you, add `~/.local/bin` to `PATH`. To install one exact release, set
`CELLD_VERSION` to its tag, for example `v0.0.1`; to go back, run the
installer again with the previous tag. Each
[release](https://github.com/denoland/celld/releases) has a build
attestation: verify a file with
`gh attestation verify <asset> --repo denoland/celld`.

## Configure object storage

The `s3://`, `gs://`, and `az://` scheme names are case-insensitive, and
celld ignores leading and trailing whitespace in `CELLD_BUCKET`.

For an S3-compatible bucket, celld uses the standard AWS credential chain,
including an EC2 instance role and Amazon EKS Pod Identity. For Cloudflare
R2, create a bucket and an S3 API token with access to it, and set:

```sh
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=auto
export S3_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
export CELLD_BUCKET=s3://YOUR-BUCKET
```

For Google Cloud Storage, celld uses Application Default Credentials. Run
`gcloud auth application-default login`, or point
`GOOGLE_APPLICATION_CREDENTIALS` at a service-account key. Then set
`CELLD_BUCKET=gs://YOUR-BUCKET`. On Compute Engine, the default instance
scope permits only storage reads, so create the instance with the
`cloud-platform` scope.

For Azure Blob Storage, the bucket name is the container:

```sh
export AZURE_STORAGE_ACCOUNT_NAME=YOUR-ACCOUNT
export AZURE_STORAGE_ACCOUNT_KEY=...
export CELLD_BUCKET=az://YOUR-CONTAINER
```

You must configure exactly one Azure credential family: an account key, a
managed identity, or a workload identity. A system-assigned managed
identity needs only the account name. A user-assigned managed identity
needs exactly one of `AZURE_CLIENT_ID`, `AZURE_OBJECT_ID`, and
`AZURE_MSI_RESOURCE_ID`. An identity needs the
[`Storage Blob Data Contributor`](https://learn.microsoft.com/azure/role-based-access-control/built-in-roles#storage-blob-data-contributor)
role or equal permissions. A managed identity works on an Azure VM and an
AKS node, but not on App Service or Container Apps; use a workload
identity or an account key there. The AKS workload identity environment
(`AZURE_AUTHORITY_HOST`, `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
`AZURE_FEDERATED_TOKEN_FILE`) must use the public authority host,
`https://login.microsoftonline.com`. celld rejects every other recognized
Azure configuration variable, such as another credential source or an
endpoint override. For local development against Azurite, set
`AZURE_STORAGE_USE_EMULATOR=true`. celld does not qualify Azurite for a
fleet.

A `gs://` or `az://` bucket takes no `S3_ENDPOINT` and no `AWS_*`
credentials, and celld ignores the storage region.

The bucket credentials give full control of the fleet, so keep them safe.

A bucket value can add a key prefix, `s3://YOUR-BUCKET/PREFIX`, so two
fleets can share one bucket. Without a prefix, the objects stay at the
bucket root.

The store must provide conditional writes, exact ranged reads, and
read-after-write consistency. Amazon S3, Cloudflare R2, Google Cloud
Storage, Tigris, and Azure Blob Storage qualify; Backblaze B2, Hetzner,
and DigitalOcean Spaces do not. MinIO (community edition) passes the
storage test but is not qualified for production; do not use
RELEASE.2025-09-06T17-38-46Z, which rejects the first deploy
(denoland/celld#162). See [what celld guarantees](guarantees.md).

## Deploy an application

Install `esbuild` on `PATH` if the project contains Worker code. Then run
`celld deploy` in a Wrangler project:

```sh
git clone https://github.com/denoland/celld
cd celld/examples/counter
celld deploy . \
  --bucket "$CELLD_BUCKET" \
  --endpoint "$S3_ENDPOINT" \
  --region "$AWS_REGION"
```

`celld deploy` accepts module Workers, Durable Object bindings, service
bindings, variables, cron triggers, D1 databases, KV namespaces, Queues,
R2 buckets, Workflows, WebAssembly modules, and static assets. An unknown
Wrangler configuration key stops the deploy. See
[Cloudflare compatibility](cloudflare-compat.md) for the complete boundary.
A node verifies the SHA-256 digest of each module before it builds a
deployment.

A running node does not restart for a new deployment. Each node reads
`deploy/current.json` every `CELLD_DEPLOY_POLL_S` seconds (default 30) and
adopts a new deployment in place. `POST /reload` on the internal listener
adopts it now, and also rebuilds an unchanged deployment. A request that
started on the previous deployment finishes on it. A deployment that does
not build leaves the current one serving, and the node reports the error
in its log and in the `/reload` response.

An inactive Durable Object runs the new deployment at its next activation.
A resident one moves when no request, alarm handler, or regular WebSocket
is active, and it keeps its storage and its hibernatable WebSockets. A
request that arrives during the move waits for the new code. An outbound
call from a request that already runs in the object does not wait, so that
request can finish on the old code. After
`CELLD_DEPLOY_MAX_AGE_S` seconds (default 60; 0 forces at once), celld
forces the move: it cancels the running work and closes regular WebSockets
with code 1012, as Cloudflare does. During the move, a request on one
deployment can call a Durable Object on the other, so two adjacent
versions must accept each other's calls. `/state` reports the deployment
of each resident object.

## Develop an application locally

```sh
celld dev [PROJECT_DIR_OR_CONFIG]
```

The command starts a local object store, deploys the application, and runs
one node. It does not need Docker or a cloud bucket. The Worker listener
is `http://127.0.0.1:9876` by default.

| flag | effect |
| --- | --- |
| `--port PORT` | The Worker listener port |
| `--host ADDR` | The Worker listener interface. The operator listener stays on loopback |
| `--logs` | Show the node warning and information logs |
| `--clean` | Delete `.celld/dev` before the start |
| `--watch-ignore GLOB` | Ignore one more project-relative glob. Repeatable. Not valid with `--no-watch` |
| `--no-watch` | Disable automatic builds and restarts |

Set `NO_COLOR` to disable color, or `FORCE_COLOR` to enable it when the
output is not a terminal. `NO_COLOR` takes priority.

The command reads `.dev.vars` beside the Wrangler configuration, as
`wrangler dev` does. Without `.dev.vars`, it reads `.env` and then
`.env.local`, which overrides `.env`. Each `NAME=value` entry becomes a
Worker variable and overrides `vars`. A line can start with `export`, and
a quoted value can span lines, for example a PEM key. Comments after a
value and variable references are not supported. In `.env` files, the
command skips, with a warning, an entry that is not a valid binding name
or that collides with another binding; in `.dev.vars` such an entry stops
the build. `celld deploy` does not read these files. Add `.dev.vars`,
`.env`, `.env.local`, and `.celld/` to `.gitignore`.

The command keeps the local state in `.celld/dev`, across restarts and
configuration changes. celld does not migrate stored state, so a stored
value from an earlier configuration can make the application fail with an
error that looks unrelated. Use `--clean` to start from an empty state.
`--clean` deletes nothing else under `.celld`.

The command watches the project directory and rebuilds on a source,
configuration, or dotenv change. The current application serves during the
build, and a failed build does not replace it. The watcher ignores
`.celld`, `.git`, `.wrangler`, `node_modules`, and `target` at each depth,
and it does not watch files outside the project.

The local object store is not available to a fleet node or an operator
subcommand; they need a supported cloud bucket.

## Operate D1, KV, and R2

These commands use the fleet bucket. `celld d1` and `celld kv` reach the
database cell through a node.

```sh
celld d1 migrations apply ledger --bucket "$CELLD_BUCKET"
celld kv bulk put sessions wrangler-export.json --bucket "$CELLD_BUCKET"
```

The `migrations_dir` value must be a relative path inside the project,
without a `..` component. The KV bulk commands use the Wrangler file
format. `celld kv bulk get` streams; a named output file changes only
after the export completes, and a failed stdout export leaves an
incomplete JSON array.

`celld r2` reads and writes the objects of an `r2_buckets` binding under
the reserved `r2/<bucket_name>/` prefix. It needs no running node, so a
release pipeline can publish an artifact before it deploys.

```sh
celld r2 put assets app.zip --path dist/app.zip \
  --content-type application/zip \
  --metadata '{"release":"1.2.3"}' \
  --bucket "$CELLD_BUCKET"
```

The first argument is the `bucket_name`, not the binding name. `--metadata`
becomes `customMetadata`, and the content flags become `httpMetadata`. An
object that another tool writes into the prefix is also readable, without
`cacheExpiry` or checksums. `celld r2 get` streams the body to stdout, and
`celld r2 head` prints the stored record; with `--json`, the
`http` and `custom` fields hold `httpMetadata` and `customMetadata`.

`celld kv list` and `celld r2 list` print at most 1000 keys and print the
`--after KEY` that continues the listing on stderr. Pass `--all` for every
key and `--json` for one JSON object per key.

Every celld command writes data to stdout and messages to stderr. A closed
stdout pipe is a successful stop.

## Start a node

For local development, the default listener is sufficient:

```sh
celld \
  --bucket "$CELLD_BUCKET" \
  --endpoint "$S3_ENDPOINT" \
  --region "$AWS_REGION"
```

For a fleet node, bind the public and internal listeners separately:

```sh
celld \
  --bucket "$CELLD_BUCKET" \
  --endpoint "$S3_ENDPOINT" \
  --region "$AWS_REGION" \
  --listen 0.0.0.0:8080 \
  --internal-listen 10.0.0.12:8081 \
  --advertise node-a.internal:8081
```

`--advertise` requires an explicit `--internal-listen`, and so does a
non-loopback `--listen`. You must route the advertised address to the
internal listener, not to the public listener; celld cannot verify this.

## Add nodes

Start each node with the same bucket settings and its own reachable
`--advertise` address. The nodes find each other through leases in the
bucket; there is no join command.

Peer traffic has no TLS and cell fetch and RPC traffic is not signed, and
the internal listener has an unauthenticated operator API. Put the
advertised addresses on a trusted private network or an encrypted overlay
such as WireGuard or Tailscale, and never expose the internal listener to
the internet. See [security](security.md).

The node that receives a request activates a new cell, so a load balancer
must include a new node in its rotation. A node at its residency cap or
under memory pressure hands the activation to the least-loaded peer. A
pressure eviction releases the ownership record
(`CELLD_PRESSURE_OWNERSHIP=release`, the default), so the cell can move.
An idle eviction keeps the record, so the cell wakes on its own node. An
idle eviction must stop the runtime within `CELLD_OPERATION_DEADLINE_MS`,
or the cell stays resident until the next idle period.

A new node also receives idle cells. Every node reads a shared fleet
sample, `fleet/capacity-v1.json`, every `CELLD_REBALANCE_INTERVAL_MS`
(default 5000; `0` disables balancing). Each node gets a share of the
owned cells in proportion to `CELLD_PLACEMENT_WEIGHT` (default: the CPU
count). The most loaded node hands at most 32 idle cells at a time to the
node furthest below its target, and a receiver fills to 2% below its
target. Only a hibernated cell moves; its hibernatable WebSockets close
with code 1012 so that the clients reconnect. A fleet without
`CELLD_IDLE_EVICT_S` therefore balances only the cells that hibernate on
their own. A draining node and a node with a cold-activation backlog
(`restoring`) receive no cells. Nothing moves while a node reports a lease
without a weight, so a rolling upgrade to this version completes first.
`POST /rebalance/pause` on any node pauses balancing for the fleet, and
`POST /rebalance/resume` on the same node resumes it.

## Feed an autoscaler

celld does not scale itself. An external system starts and stops the
nodes, and celld hands the cells off.

Each node writes its lease to `nodes/<node>.json` in the bucket. The lease
lives `CELLD_TTL_MS` (default 10000) and renews at one third of that. Its
load block, dated by `sampled_ms`, contains `owned_cells`,
`placement_weight`, `resident_cells`, `host_websockets`, `rss_bytes`,
`in_use_bytes`, `cpu_percent_x100`, `open_fds`, `pressured`,
`memory_headroom`, `shed_cells`, and `restoring`. `owned_cells` includes
dormant cells; a restarted node omits it until it has read its ownership
records. `resident_cells` counts only cells in memory. The memory and CPU
values are sampled every second.

`GET /state` on the internal listener reports the live counters. Its
`node_load` object is the lease load block.

| field | meaning |
| --- | --- |
| `capacity_waiting` | Activations queued behind the residency cap. Positive means add a node |
| `activation_waiting`, `restoring` | Cold activations that wait for or hold a permit |
| `owned_cells`, `occupied`, `shedding` | Ownership, residency, and pressure shedding |
| `handed_off`, `rebalanced`, `rebalance_failed` | Cells given to peers, the part balancing moved, and the balancing moves no peer took |
| `remote_route_refreshes` | Cached routes that expired and started a new lookup. Normal lease renewal increases it |
| `allocator` | Rust allocator bytes: `allocated_bytes`, `resident_bytes`, `mapped_bytes`, `retained_bytes`. V8 heaps are not included |
| `libc_malloc` | Linux only: `in_use_bytes` and `free_bytes` of the C allocator that SQLite and V8 use |
| `deployment.isolates`, `deployment.draining` | Per Worker script (`cells`, `stateless`, `services`): `live`, `live_empty`, `retiring`, `freed`, `heap_bytes`, `external_bytes` |

A `live_empty` count that persists for more than 30 seconds means that
isolate maintenance does not run. A persistent `retiring` count means that
a turn or a request still holds the heap.

A positive `capacity_waiting` or a `pressured` lease is the signal to add
a node. Scale down only when every remaining node reports
`memory_headroom` and a small `restoring` backlog. A drain into a full
fleet leaves the cells dormant on the survivors, and each later activation
must shed a resident cell.

`/.well-known/celld/health` on the public listener is a boolean. It
reports 503 during a drain and before a joining node settles.

## Shut down and roll out a node

celld shuts down gracefully on SIGTERM or SIGINT. The health path reports
503, new public requests receive 503 with the connection closed, and
accepted requests finish. The node hands its cells off in batches: it
cancels running alarms (the successor retries them), proves the data
durable, publishes a final snapshot, and releases each ownership record to
a peer. The peer keeps the cell dormant until a request arrives. A
database larger than the durability deadline can upload (80 MiB at the
default 10 seconds) hands off without the snapshot. Busy cells move first.
`POST /shutdown` on the internal listener starts the same handoff.

| variable | default | effect |
| --- | --- | --- |
| `CELLD_SHUTDOWN_TOTAL_MS` | 40000 | The complete stop bound. The drain-token wait is 3/4 of it (30000) and the handoff no-progress interval is 5/8 (25000) |
| `CELLD_RELEASES` | 128 | Concurrent complete handoffs |
| `CELLD_ACTIVATIONS` | see [table](#environment-variables) | Demand-driven restores and startup work |
| `CELLD_READY_FLEET_GATE_MS` | 120000 | The first-readiness gate deadline; `0` disables the gate |

You must set the orchestrator stop grace (systemd `TimeoutStopSec`,
Kubernetes `terminationGracePeriodSeconds`) above
`CELLD_SHUTDOWN_TOTAL_MS`, or SIGKILL can interrupt the handoff. celld
rejects the removed `CELLD_SHUTDOWN_DRAIN_MS` and
`CELLD_DRAIN_TOKEN_WAIT_MS` at startup.

Concurrent stops do not flood the survivors: a draining node claims a
fleet drain token, so nodes hand off one at a time. A node that cannot
claim the token within its wait proceeds without it.

A new process does not report healthy until the fleet settles: no node
drains, every node is below its memory low watermark, the restore backlogs
are small, and ownership is balanced. At `CELLD_READY_FLEET_GATE_MS`,
celld logs `ready_gate_expired` once, but readiness stays closed, so set
an orchestrator rollout deadline. After the first healthy response, fleet
state does not remove readiness.

A cut handoff can leave the log of the stopped process for its
replacement to recover. Another process can replace a recovery that does
not respond for 30 seconds.

A remote call to a cell that is changing owner waits for the new owner,
for at most `CELLD_OPERATION_DEADLINE_MS` (default 15000). celld retries
only an attempt that provably did not start. An application must keep one
stable operation ID when it retries an ambiguous fetch, RPC, D1, or
service operation. A WebSocket client must reconnect.

To roll out a new version, use the rolling update of your orchestrator:
stop each node with SIGTERM, wait for its replacement to report healthy,
and then move to the next node. celld paces the handoffs and readiness
itself.

`POST /shutdown?handoff=preserve` prepares a same-node restart that keeps
the ownership records. It cancels cold activations and uploads each
stopped database first. If an upload fails, the next process uses normal
recovery. The internal operator API is alpha and can change in any
release, so keep operator tooling and celld releases together.

## Upgrade notes

- **v0.1.0 to v0.2.0: stop all.** Stop every v0.1.0 node, then start
  v0.2.0. The two versions use different peer addresses and data formats,
  so a fleet must not mix them.
- **v0.2.1 to v0.3.0: rolling.** The default durability changes from
  `bucket` to `fleet`. Do not start a v0.2.x binary after a node runs
  v0.3.0 unless its shutdown log contains
  `node-log close: sealed epoch`. Otherwise, the downgrade can lose
  acknowledged writes.
- **v0.3.0 to v0.4.0: stop all.** The peer protocol changes, and a v0.3.0
  node cannot read new large KV values, so a mixed fleet can make
  committed KV values unavailable.
- **v0.4.0 to v0.4.1: rolling.** Paged restore starts one lease lifetime
  after the last v0.4.0 node stops. Do not start a v0.4.0 binary after
  that: it cannot restore a paged cell.
- **v0.5.1 to v0.6.0: stop all with `fleet` durability.** A v0.6.0 node
  refuses to start against a v0.5.1 follower. A `bucket` durability fleet
  can roll.
- **v0.6.0 to v0.6.1: rolling.** Until every node runs v0.6.1, do not set
  `CELLD_LTX_RETENTION_SECS`, do not deploy a Python Worker, and do not
  raise `CELLD_MAX_ASSET_FILE_BYTES` above 25 MiB. A rollback to v0.6.0
  can roll after you unset `CELLD_LTX_RETENTION_SECS` on every node.
- **v0.6.1 to v0.6.2: rolling.** Until every node runs v0.6.2, a handler
  failure on the owner of a forwarded Durable Object fetch can reach the
  caller as a 500 response. A v0.6.2 pair rejects the caller's `stub.fetch()`
  instead, as a local owner does. A rollback to v0.6.1 can also roll.
- **v0.6.2 to v0.6.3: rolling.** A v0.6.3 node no longer trusts the
  emSign ECC Root CA - G3 certificate or the eight compromised eMudhra
  intermediate CA certificates for outbound TLS, so upgrade each node
  promptly. Until every node runs v0.6.3, a v0.6.2 node can still acquire a
  cell whose ownership record was lost and start the cell with an empty
  database. A rollback to v0.6.2 can also roll.

## Diagnose a fleet

`celld diagnose` reads the node leases and probes each live peer. It does
not take a lease or change ownership. Use `--peer NODE_ID`, repeatable, to
probe only some nodes.

```sh
celld diagnose \
  --bucket "$CELLD_BUCKET" \
  --endpoint "$S3_ENDPOINT" \
  --region "$AWS_REGION"
```

The report shows expired leases, bad advertised addresses, unreachable
peers, authentication failures, and protocol mismatches. Each node line
shows `restoring`, the cold activations in progress. During a rolling
update, wait for `restoring=0` on every node before you restart the next.

## List Durable Objects

```sh
celld cell list \
  --bucket "$CELLD_BUCKET" \
  --endpoint "$S3_ENDPOINT" \
  --region "$AWS_REGION"
```

Each line is a `Class:ID` scope. Give a class name to list only that
class, and pass `--json` for one JSON object per line. An instance appears
after its first event; an ID that is only derived does not appear. D1
databases, KV namespaces, and Workflows are cells in reserved classes whose
names start with `__`. The `--json` output marks them `"reserved": true`:

```sh
celld cell list --all --json --bucket "$CELLD_BUCKET" |
  jq -r 'select(.reserved | not) | .scope'
```

The command stops at 1000 instances and prints the continuation on stderr:

```
1000 cells shown; more exist. Continue with --after Room:d99d9174b25e46310694dd931b47fbde70a7460bb7b210b546060651ea2ff6e0
```

Pass that `--after SCOPE` for the next page, `--limit N` for a different
page size, or `--all` for everything (one request per 1000, with progress
on stderr). The listing is not a snapshot, but a sequence of `--after`
commands lists each existing instance once.

`celld cell gc --dry-run` takes the same options and prints, for each cell,
the epoch prefixes that epoch GC can delete, their bytes, and the restore
base. It writes nothing, and it exits with an error at the end if it could
not read a cell.

```sh
celld cell gc --dry-run --bucket "$CELLD_BUCKET" --grace-secs 3600
```

The real deletion can come later or not at all. Only a node with a
positive `CELLD_LTX_RETENTION_SECS` deletes, with that grace instead of
`--grace-secs`. A cell deletes only while it is active, after its
activation has a write and, if paged, after its local file is complete.
With `CELLD_LTX_COMPACTION=0`, a cell on a fleet node waits for a handoff
snapshot. One pass deletes at most 64 epochs of a cell.

## Hot-cell overload

celld admits at most 64 concurrent fetch events for one Durable Object
(`CELLD_MAX_CELL_REQUESTS`). A Queue broker admits 256 concurrent producer
calls, commits at most 64 in one transaction, and overlaps up to four
transactions.

Over the limit, celld returns `503` with `Retry-After: 1` and
`X-Celld-Overload: cell`, and does not start the event. The Queue response
body is `{"error":"cell admission refused"}`, and a caught Queue producer
error contains `cell overload: admission refused`. A load generator must
count these responses as rejected work. celld logs `cell_overload_refused`
with the cell scope, node, region, in-flight count, and limit.

## Environment variables

For the full list, including advanced tuning switches, run `celld -h`. An
unset variable selects its default. A Boolean variable accepts only `0` or
`1`. celld exits at startup on an invalid value.

| variable | purpose |
| --- | --- |
| `CELLD_BUCKET` | The fleet bucket, and an optional key prefix. The same as `--bucket` |
| `S3_ENDPOINT` | The S3-compatible endpoint. The same as `--endpoint` |
| `AWS_REGION`, `AWS_DEFAULT_REGION` | The storage region |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | Explicit AWS credentials. The standard AWS credential chain is also available |
| `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_SERVICE_ACCOUNT_KEY` | Google credentials for a `gs://` bucket. Application Default Credentials are also available |
| `AZURE_STORAGE_ACCOUNT_NAME` | The storage account for an `az://` bucket |
| `AZURE_STORAGE_ACCOUNT_KEY` | The storage account key. Do not combine it with an identity selector |
| `AZURE_AUTHORITY_HOST`, `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_FEDERATED_TOKEN_FILE` | The AKS workload identity environment. The authority must be the public Azure host |
| `AZURE_STORAGE_USE_EMULATOR` | Set to `true` to develop against Azurite |
| `CELLD_ADDR` | The public Worker listener. The same as `--listen` |
| `CELLD_INTERNAL_ADDR` | The peer and operator listener. The same as `--internal-listen` |
| `CELLD_ADVERTISE` | The internal address that peers can reach. The same as `--advertise` |
| `CELLD_UNSAFE_PUBLIC_ADVERTISE` | Set to `1` to permit a literal public IP in `CELLD_ADVERTISE`. It does not resolve a DNS name or restrict the internal listener |
| `CELLD_NODE` | An explicit node-session ID: 1 to 128 ASCII letters, numbers, dots, dashes, or underscores, but not `.` or `..` |
| `CELLD_WATCH` | The local work directory for SQLite and replication |
| `CELLD_ESBUILD` | The path of the esbuild executable |
| `CELLD_ACTIVATIONS` | Concurrent cold-cell activations (default: 8 per CPU, at least 16, at most 128) |
| `CELLD_DEPLOY_POLL_S` | The deployment pointer poll interval in seconds (default: 30) |
| `CELLD_DEPLOY_MAX_AGE_S` | Seconds before celld forces a resident Durable Object onto a new deployment (default: 60; 0 forces at once) |
| `CELLD_OPERATION_DEADLINE_MS` | The deadline for a non-restore operation (default: 15000) |
| `CELLD_MAX_CELL_REQUESTS` | Concurrent fetch events for one Durable Object (default: 64) |
| `CELLD_MAX_REQUEST_BODY_BYTES` | The body limit for a public Worker request or a direct Durable Object request (default: 1 GiB) |
| `CELLD_MAX_RESIDENT_CELLS` | The hard limit for resident cells, enforced at admission |
| `CELLD_IDLE_EVICT_S` | Seconds after which an idle cell leaves memory and hibernates (unset: only pressure or the residency cap removes an idle cell) |
| `CELLD_PLACEMENT_WEIGHT` | The ownership share of this node, relative to the other nodes (default: the CPU count) |
| `CELLD_REBALANCE_INTERVAL_MS` | The fleet sample interval and maximum age (default: 5000; 0 disables balancing) |
| `CELLD_MAX_RSS_MB` | The memory threshold for pressure shedding, on the greater of the allocator-adjusted RSS and the active cgroup working set (default: 80% of the available memory; 0 disables the threshold and the absolute cap) |
| `CELLD_DURABILITY` | `fleet` (default): the node sends each write to one or two other nodes and answers when they hold it on disk or the bucket upload finishes. A single node has no peer, so every write waits for the bucket. `bucket`: always wait for the bucket |
| `CELLD_LOG_PIPELINE` | Fleet log rounds in flight (default: 4) |
| `CELLD_LOG_HEDGE_MS` | The wait before a second copy of a slow log append. The default is adaptive: 4 times the slowest recent append, at least 250 ms. `0` disables the copy |
| `CELLD_LTX_TRUNCATE_PAGES` | The WAL size, in pages, at which celld truncates the WAL at the next checkpoint (default: 128, 512 KiB). A database larger than 4 MiB waits until the WAL is larger than the database. `0` disables it |
| `CELLD_LTX_RETENTION_SECS` | Unset or `0` (default): celld deletes no epoch prefix. A positive value enables [epoch GC](guarantees.md#epoch-gc): the owner deletes the prefixes below the restore base, but keeps its own epoch, the one before it, and each epoch younger than this many seconds. A pass runs at most every 5 minutes. With `CELLD_LTX_HYDRATE_MBPS=0`, a paged cell never qualifies. Epoch GC skips facet streams and needs [list-after-write consistency](guarantees.md#what-the-bucket-must-provide) |
| `CELLD_LTX_COMPACTION` | `1` (default) creates additive L1 objects, so a takeover reads tens of objects instead of thousands. Set `0` on every node of a mixed fleet until all nodes read v0.5.2 block objects |
| `CELLD_LTX_COMPACTION_MIN_TXIDS` | The TXID distance that queues an L1 compaction (default: 256) |
| `CELLD_LTX_COMPACTION_MIN_MB` | The L0 MiB that queue an L1 compaction (default: 32, at most 64) |
| `CELLD_LTX_COMPACTIONS` | Concurrent L1 compactions per node (default: 2) |
| `CELLD_LTX_PAGED` | `1` (default): a takeover of a chain of at least `CELLD_LTX_PAGED_MIN_MB` reads pages from the bucket on first use instead of a full download. Until the background fill completes, a page fault blocks the cell's isolate, so a large query can take minutes. Set `0` to download every chain. Set `0` on every node of a mixed fleet with a node before v0.4.1, which permanently refuses a paged cell. The `paged_gate` log event reports when paging turns on or off |
| `CELLD_LTX_PAGED_MIN_MB` | The chain size, in MiB, from which a restore pages (default: 256; `0` pages every chain) |
| `CELLD_LTX_HYDRATE_MBPS` | The background fill rate of a paged cell, in MiB per second, one cell at a time per node (default: 16; `0` keeps the cell sparse) |
| `CELLD_LTX_DURABILITY_TIMEOUT_SECS` | The budget for one durability proof, and for the final snapshot of a handoff (default: 10). A queued write waits at most six budgets. A slow store can need more |
| `CELLD_TOKIO_THREADS` | Host Tokio worker threads (default: the CPU count). The `host_runtime` log event at startup reports `worker_count` |
| `RUST_LOG` | The runtime log filter |

An L1 compaction merges at most 256 source objects within a 64 MiB buffer.
A larger source object spills to temporary files in the cell's local LTX
directory, so the node needs free disk for the source and the output.

These settings are removed. Remove them from the environment, including an
empty value or the former default:

| removed setting | current behavior |
| --- | --- |
| `CELLD_OUTPUT_GATE` | celld always waits for the durability proof before it acknowledges a write |
| `CELLD_SHUTDOWN_DRAIN_MS`, `CELLD_DRAIN_TOKEN_WAIT_MS` | Rejected at startup. Use `CELLD_SHUTDOWN_TOTAL_MS` |
| `CELLD_OTEL_SINK` | Set `CELLD_OTEL=1` for the fleet bucket or set `CELLD_OTEL` to the collector base URL for OTLP |
| `CELLD_AI_BINDING`, `CELLD_AI_URL` | The AI adapter is removed. Call the provider from application code and remove the AI binding |
| `CELLD_CLOUD_RESTART_ON_DEPLOY` | A managed deployment adopts the new code in place. Credential rotation can still restart the process |
| `CELLD_STORAGE_PROBE` | A node always checks the storage contract. A violation prevents startup; an ambiguous transport error produces a warning |
| `CELLD_EVICTIONS` | A node runs at most four concurrent evictions |
| `CELLD_LOG_CAPTURE_WORKERS` | A node uses at most eight log capture workers |
| `CELLD_REBALANCE_BATCH_CELLS` | A balancing batch moves at most 32 idle cells |
| `CELLD_PRESENCE_SHADOW` | A managed node sends its serving status and owned-cell count. Use `celld diagnose --read-only` to check leases |
| `CELLD_LOG_BUNDLE` | Fleet durability always bundles uploads |
| `CELLD_QUEUE_PRODUCER_GROUP_MS` | A Queue owner groups producer calls with a 4 ms timer |
| `CELLD_LOG_GROUP_COMMIT_MS` | A node waits 1 ms before a fleet log capture when Queue writes are pending |
| `CELLD_PACED_HANDOFF` | A node always attempts the handoff within `CELLD_SHUTDOWN_TOTAL_MS` |
