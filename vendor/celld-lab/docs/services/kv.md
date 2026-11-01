# KV

KV is a key-value store that a Worker reaches through a binding. Each namespace
is one celld cell, and a value above 1 MiB lives in the fleet bucket. Read the
[Cloudflare KV documentation](https://developers.cloudflare.com/kv/api/) for the
API.

## Example

The [KV example](../../examples/kv) reads, writes, and deletes values in a KV
namespace.

<!-- celld-example: kv -->

## API

- `get(key, type)` returns the value as `"text"`, `"json"`, `"arrayBuffer"`, or
  `"stream"`. A missing key gives `null`.
- `getWithMetadata(key, type)` also returns the metadata of the write.
- `put(key, value, options)` takes a string, an `ArrayBuffer`, a typed array, or
  a `ReadableStream`. The options are `expiration` (an absolute time in
  seconds), `expirationTtl` (seconds from now), and `metadata`.
- `delete(key)` removes a key.
- `list({ prefix, cursor })` returns a page of key names and a cursor for the
  next page.

## Configuration and limits

A `kv_namespaces` entry gives a `binding` and an `id`. The `id` is the namespace
identity, and it can be any string, such as a Cloudflare hexadecimal id or
`sessions`. Two Workers that name one `id` reach one namespace. celld ignores
`preview_id`.

`put()` reads a `ReadableStream` to its end before the write, so
`put(key, request.body)` works. `list()` returns at most 1000 keys in byte
order, and a concurrent write cannot make the cursor skip a key.

celld enforces the
[Cloudflare KV limits](https://developers.cloudflare.com/kv/platform/limits/): a
key of at most 512 bytes, a value of at most 25 MiB, metadata of at most 1024
bytes, and at most 100 keys in one bulk `get()`. A call that crosses a limit
fails, and celld never truncates data. The minimum expiration is 60 seconds. An
expired key becomes invisible at the moment it expires.

Every call goes to the node that owns the namespace cell, so a read costs one
cell dispatch. Hold a value in a local variable when one request reads it many
times. Writes to one namespace run one at a time, so use a Durable Object for a
write-hot value such as a counter.

A write of a value above 1 MiB without a fleet bucket fails with
`KV large values need a fleet bucket`.

## Differences from Cloudflare

- A celld read never returns a stale value, because it reaches the cell that
  owns the namespace. Cloudflare KV is eventually consistent.
- celld has no edge cache. `cacheTtl` has no effect, and `cacheStatus` is
  `null`.
- A value above 1 MiB requires a fleet bucket.
- A namespace has one writer. Use more namespaces to increase write capacity.

The [Cloudflare compatibility](../cloudflare-compat.md#services) page lists the
runtime APIs and the unsupported services.
