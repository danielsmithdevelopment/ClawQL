# Durable Objects / Cells

A Durable Object is a single-threaded actor with its own SQLite database, and
celld calls each running Durable Object a cell. celld replicates the database
to the fleet. Read the
[Cloudflare Durable Objects documentation](https://developers.cloudflare.com/durable-objects/)
for the standard API.

## Example

The [counter example](../../examples/counter) keeps a counter in the key-value
storage of a Durable Object, and it uses `idFromName()` to give each name a
separate counter.

<!-- celld-example: counter -->

## API

- `env.COUNTER.idFromName(name)` returns an id, and `env.COUNTER.get(id)`
  returns a stub. `getByName(name)` performs both steps.
- `newUniqueId()` and `idFromString()` create and parse a random id.
- `ctx.storage.get()`, `put()`, `delete()`, `list()`, and `deleteAll()` are
  the key-value methods.
- `ctx.storage.sql.exec()` runs SQL on the database of the object.
- `transaction()` and `transactionSync()` group several writes.
- `storage.setAlarm()`, `getAlarm()`, and `deleteAlarm()` manage one alarm per
  object, and celld calls the `alarm(alarmInfo)` handler.
- `ctx.acceptWebSocket()` accepts a hibernatable WebSocket, and celld calls
  `webSocketMessage()` for each frame.
- `blockConcurrencyWhile()` closes the input gate.
- `storage.sync()` waits for the durability of the earlier committed writes.

## Identity and addressing

celld creates the object at the first call on a stub, not at `get()`.

`idFromName()` derives a 64-digit hexadecimal id with HMAC-SHA-256 over the
name, under a key that celld builds from the script name and the class name.
One name therefore reaches one object from every node. `ctx.id.name` holds the
name when it is 1024 UTF-8 bytes or less, as on Cloudflare; a longer name still
routes correctly.

`newUniqueId()` draws random bytes, so keep its `toString()` form to reach the
object again. `idFromString()` verifies the HMAC, so celld refuses an id from a
different namespace.

A rename of the Worker script therefore reaches new, empty objects, and the old
objects keep their storage under the old ids.

## Ownership and the single-threaded model

Exactly one node serves a cell at a time. A node claims a cell with a
conditional write of an ownership record to the fleet bucket. Each activation
advances a fencing epoch that appears in the storage prefix, so a node that
lost the cell writes only into a superseded prefix. The
[guarantees](../guarantees.md) page gives the full mechanism. celld forwards
each stub call to the owner node.

Inside the cell, one synchronous turn runs at a time. An event that awaits can
overlap another event unless `blockConcurrencyWhile()` closes the input gate.
celld holds a response until a durability proof covers every write that the
response can reveal, as the Cloudflare
[output gate](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
does, so an application does not have to `await` a `put()`.

The output gate holds each WebSocket frame only for its own proof, so a
`webSocketMessage()` handler that sends and then awaits delivers that frame
while it runs. On one socket, celld starts message handlers in arrival order
but does not wait for one to finish before the next starts, so an incoming
message can cancel work that an earlier handler awaits. A hibernatable socket
delivers frames in send order across WebSocket handlers and RPC methods.

A cell keeps no in-memory state across an eviction, so the constructor runs
again at the next event. Ownership can also move when a node stops or drains,
or when idle rebalancing moves a hibernated cell. A hibernatable WebSocket
survives hibernation on the same node, and it closes when the cell moves, so
the client must reconnect.

## Durable storage and alarms

A class that a `new_sqlite_classes` migration declares can use the key-value
methods and `ctx.storage.sql.exec()`. The `transactionSync()` callback receives
no argument, as in workerd, and a throw rolls it back. A transaction can start
a nested transaction; a failed nested transaction discards only its own
writes, and the enclosing transaction can still commit.

The synchronous `ctx.storage.kv.list()` iterator reads one entry per step and
does not block later writes. Each step resumes after the last returned key, so
it can observe a change to an entry that it has not returned yet. A new call to
`kv.list()` invalidates the previous iterator for that object.

celld captures each write as an LTX segment and replicates it to
`cells/<cell>/ltx/e<epoch>/` in the fleet bucket. In a fleet of two or more
nodes, the owner answers when each of its one or two followers holds the write
on disk, and the bucket upload follows. On a single node, every write waits for the object
store.

celld does not answer a successful `setAlarm()` until a durable wake entry in
the bucket covers the alarm. A hibernated cell fires its alarm on its owner
node. One node holds the waker role, and it wakes only a cell whose owner
stopped.

## Differences from Cloudflare

- celld makes no placement, migration, or jurisdiction promise. A cell runs on
  a node of your fleet, and `newUniqueId({ jurisdiction })` and
  `namespace.jurisdiction()` throw.
- The key of a namespace contains the script name, so a rename of the script
  changes every id that `idFromName()` derives.
- A `migrations` entry accepts `tag` and `new_sqlite_classes` only. A class
  rename, a class delete, and a class transfer stop the deployment.
- A Durable Object event keeps pending I/O active after the handler returns, so
  a timer or a subrequest does not require `ctx.waitUntil()`.
- The imported `waitUntil()` and `ctx.waitUntil()` can add work while previously
  registered background work remains active.
- An RPC stub cannot cross an isolate boundary. See
  [RPC](../cloudflare-compat.md#rpc).
- An outbound WebSocket does not continue after the object moves to another
  node.
- `SqlStorage.Cursor.toArray()` gives a celld-specific error near the V8 heap
  limit.
- `storage.sync()` waits for the object store or the fleet ensemble to hold all
  earlier committed writes. The operation uses the shorter of the 10-second
  `CELLD_LTX_DURABILITY_TIMEOUT_SECS` default and the 15-second
  `CELLD_OPERATION_DEADLINE_MS` default.
- `storage.sync()` rejects during an open transaction and after an object abort.
  Without an object store, it resolves after the local commit.
- A transaction and `blockConcurrencyWhile()` have a 30-second limit. A timeout
  resets the object and rolls back an open transaction.
- A failed handler still waits for the durability of any value or write that it
  can expose. A celld-generated failure that exposes no object value returns
  immediately.
- Outside an explicit transaction, a SQL write cursor must finish before a
  response, an outbound effect, or `storage.sync()`. An unfinished `RETURNING`
  cursor holds uncommitted writes, so celld rejects that output with an error.
  A read cursor can remain open.

The [Cloudflare compatibility](../cloudflare-compat.md#services) page
lists the runtime APIs and the unsupported services.
