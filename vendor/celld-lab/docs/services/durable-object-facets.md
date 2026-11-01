# Durable Object Facets

A facet is a child object inside a Durable Object, with a SQLite database of
its own. A supervisor class starts a facet from a class that a
[Worker Loader](dynamic-workers.md) provides, so generated or untrusted code
gets durable storage without a Durable Object namespace. Read the
[Cloudflare Durable Object Facets documentation](https://developers.cloudflare.com/dynamic-workers/usage/durable-object-facets/)
for the standard API.

## Example

The [facets example](../../examples/facets) creates a facet from a class that a
Worker Loader provides.

<!-- celld-example: facets -->

## API

- `ctx.facets.get(name, callback)` returns a stub for the named facet. The
  callback returns `{ class, id }`, and celld runs it only to start the facet.
- `worker.getDurableObjectClass("App")` on a Worker Loader binding, or
  `ctx.exports.App`, supplies the `class`.
- `ctx.exports.App({ props })` creates a class handle with startup properties.
- `ctx.facets.abort(name, reason)` stops a facet and keeps its database.
- `ctx.facets.delete(name)` stops a facet and removes its database.
- The stub answers `fetch()` and the RPC methods of the class.

## A facet is a part of its root object

A facet is not a cell. It has no ownership record and no fencing epoch of its
own, and it uses those of the root cell, which the
[Durable Objects page](durable-objects.md#ownership-and-the-single-threaded-model)
describes.

A facet runs on the owner node of the root cell. An eviction, a reset, and a
move take the root object and its facets as one group, and the startup
callback runs again at the next call.

As in workerd, a facet write commits in the database of the facet, so a
rollback of a root transaction does not undo a facet call inside it. A facet
and its root object therefore never commit atomically. celld holds an outbound
effect of a facet, and the reply of a facet call, until the facet stream proves
the writes of that call. The effect also passes the output gate of the root
cell.

## Starting and addressing a facet

`ctx.facets.get(name, callback)` returns a stub, and celld runs the callback
only when the facet is not already running. The callback returns a `class` and
an optional `id`. The `class` comes from
`worker.getDurableObjectClass("App")` on a Worker Loader binding, or from
`ctx.exports.App` for an exported `DurableObject` class without a storage
migration; that facet runs in the isolate of its root.

A loaded class can extend `DurableObject`, or it can be a plain class with a
`(state, env)` constructor. A plain class answers `fetch()`, and its RPC
methods require the `js_rpc` compatibility flag, as on workerd.

`id` sets `ctx.id` in the facet. A `DurableObjectId` keeps its name, a string
ID stays a string, and an omitted ID inherits the parent ID and its name. An
unmigrated class handle has no `idFromName()`, so use a Durable Object
namespace to create a named ID.

`ctx.exports.App({ props })` creates a class handle with startup properties.
The call copies the properties, so a later change to the object does not
reach `ctx.props`. The properties must support structured cloning. A
loopback class without properties supplies an empty object.

- The name alone selects the database, so a changed `id` still reaches the
  stored data. A name has a limit of 256 bytes.
- A facet can start facets of its own, to a total depth of 4 that counts the
  root object.
- `ctx.facets.abort(name, reason)` stops a facet and keeps its database. A
  call on the stopped stub throws the reason.
- `ctx.facets.delete(name)` stops the facet and removes its database and the
  database of every facet below it.

No name reaches a facet from outside its root object, so external traffic
must go through the supervisor. Use a separate Durable Object, addressed with
[`idFromName()`](durable-objects.md#identity-and-addressing), when children
must run on different nodes.

## WebSockets in a facet

A facet can accept a WebSocket: its `fetch()` returns a `101` response with the
client end of a `WebSocketPair`, and the root object returns that response. The
facet can call `accept()` on the server end or pass it to
`ctx.acceptWebSocket()`. A facet can also open a WebSocket with
`new WebSocket(url)` or with an `Upgrade: websocket` fetch. celld delivers the
events of each such socket to the facet, not to the root object. Socket output
waits for the facet stream and passes the output gate of the root cell.

A facet socket does not hibernate, because celld cannot start a facet again
without its root object. A socket that the facet accepts or opens keeps the root
cell resident until it closes. The client end of a `101` response from another
Durable Object does not. `getWebSockets()` returns the sockets of that facet.

`ctx.facets.abort()` and `ctx.facets.delete()` close the sockets of each stopped
facet with code `1001`, and the facet receives no close event. workerd drops the
connection instead, so its client sees `1006`. A drain, an ownership move, or a
generation swap closes a facet socket with `1012`, and an output gate failure
closes it with `1011`.

## Differences from Cloudflare

- A Durable Object binding cannot supply a facet class. A class with a storage
  migration cannot supply one either, because `ctx.exports` holds that class as
  a namespace.
- Each facet has a separate SQLite database, which celld replicates as a
  separate stream under the bucket prefix of the root Durable Object.
- A facet cannot set an alarm. `storage.setAlarm()` throws inside a facet, so
  the root object must hold the schedule.
- A facet socket does not hibernate. It keeps the root cell resident until the
  socket closes.
- A facet stub is not awaitable, and a pipelined property path is unavailable,
  so a call must name one method.
- The `clone()` method is unavailable.

The [Cloudflare compatibility](../cloudflare-compat.md#services)
page lists the runtime APIs and the unsupported services.
