# Cloudflare compatibility

celld implements the Cloudflare Workers APIs that this page links to. The notes
list only the celld gaps and differences.

- **Yes** means that celld implements the complete applicable API.
- **Partial** means that celld does not implement a listed input, operation, or
  behavior.
- **No** means that celld does not implement the API.

celld must reject an unsupported configuration or API at deployment or first
use. An unsupported feature that does not cause an error is a defect. This page
identifies each known exception.

## Services

| service | status |
| --- | --- |
| [Workers](https://developers.cloudflare.com/workers/runtime-apis/) | **Partial** |
| [Durable Objects](https://developers.cloudflare.com/durable-objects/) | **Partial** |
| [Static assets](https://developers.cloudflare.com/workers/static-assets/) | **Yes** |
| [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) | **Partial** |
| [Worker Loader](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/) | **Partial** |
| [KV](https://developers.cloudflare.com/kv/api/) | **Partial** |
| [Queues](https://developers.cloudflare.com/queues/configuration/javascript-apis/) | **Partial** |
| [D1](https://developers.cloudflare.com/d1/worker-api/d1-database/) | **Partial** |
| [Workflows](https://developers.cloudflare.com/workflows/build/workers-api/) | **Partial** |
| [R2](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) | **Partial** |
| [Workers AI](https://developers.cloudflare.com/workers-ai/) | **No** |
| [Vectorize](https://developers.cloudflare.com/vectorize/) | **No** |
| [Hyperdrive](https://developers.cloudflare.com/hyperdrive/) | **No** |
| [Browser Rendering](https://developers.cloudflare.com/browser-rendering/) | **No** |
| [Email Workers](https://developers.cloudflare.com/email-routing/email-workers/) | **No** |
| [Python Workers](https://developers.cloudflare.com/workers/languages/python/) | **No** |

### [Workers](https://developers.cloudflare.com/workers/runtime-apis/)

**Partial**

- The [runtime API table](#runtime-apis) lists the Worker runtime gaps.
- celld does not manage a custom domain or terminate TLS. Terminate TLS in the
  ingress proxy.
- An experimental Workers AI HTTP adapter is available through
  `CELLD_AI_URL`.

### [Durable Objects](https://developers.cloudflare.com/durable-objects/)

**Partial**

- An RPC stub cannot cross an isolate boundary. See [RPC](#rpc).
- An outbound WebSocket does not continue after the object moves to another
  node.
- celld refuses invalid UTF-8 from a SQLite `TEXT` value. Store arbitrary
  bytes in a `BLOB`.
- `SqlStorage.Cursor.toArray()` gives a celld-specific error when the isolate
  is near its V8 heap limit.

### [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

**Partial**

- celld rejects a descending range such as `SAT-SUN` or `NOV-FEB`.
- celld rejects `*` inside a list such as `1,*`.
- celld runs one handler for each occurrence across the complete fleet.
- After fleet downtime, celld runs the most recent missed occurrence one time.
- celld runs one handler at a time for each script. It retries a failed handler
  until the next occurrence unless the handler calls `noRetry()`.
- A service-binding target cannot run its own Cron Triggers.

### [Worker Loader](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loader/)

**Partial**

- Worker Loader is experimental and requires `CELLD_WORKER_LOADER=LOADER`.
- A `globalOutbound` Fetcher is not available.
- A loaded Worker cannot receive a capability stub in `env`.
- Awaitable and pipelined properties are not available.

### [KV](https://developers.cloudflare.com/kv/api/)

**Partial**

- celld has no edge cache. `cacheTtl` has no effect, and `cacheStatus` is
  `null`.
- A value above 1 MiB requires a fleet bucket.
- celld stores a separate object when an application writes an identical large
  value after a namespace changes owners. The separate object prevents an old
  owner from deleting the current value.
- celld reads a large-value row from an older release, but it does not reclaim
  the legacy object after the row is removed.
- A namespace has one writer. Use more namespaces to increase write capacity.
- A namespace ID can use the Cloudflare hexadecimal form or another stable
  string.

### [Queues](https://developers.cloudflare.com/queues/configuration/javascript-apis/)

**Partial**

- A queue has one writer. Use more queues to increase write capacity.
- A Queue owner accepts two concurrent producer operations. One operation can
  run and one operation can wait, so an overload cannot delay Queue alarms.
  The owner refuses an additional operation, and the producer can retry it.
- A queue can have one consumer script. The consumer cannot also export a
  `fetch()` handler.
- celld retains a message for four days. You cannot configure this period.
- Pull consumers and the Queues HTTP API are not available.
- Dashboard controls, manual consumer attachment, R2 event notifications, and
  Queue event subscriptions are not available.

### [D1](https://developers.cloudflare.com/d1/worker-api/d1-database/)

**Partial**

- A binding result can contain at most 100,000 rows or 32 MiB.
- celld refuses invalid UTF-8 from a SQLite `TEXT` value. Store arbitrary
  bytes in a `BLOB`.

### [Workflows](https://developers.cloudflare.com/workflows/build/workers-api/)

**Partial**

- `create()` replaces a terminal instance that has the same ID. Cloudflare
  refuses each duplicate ID.
- celld replays `run()` from the start, so code outside a step runs again.
- A crash after a step side effect can run the step callback again.
- `retention` and `locationHint` are not available.
- Non-step work cannot remain pending for more than 60 seconds.
- A step result, an event payload, and the workflow parameters each have a
  1 MiB limit.
- `pause()` stops a queued or waiting instance immediately. It lets an active
  step finish, and the status changes from `waitingForPause` to `paused` before
  the next step starts.
- `resume()` starts a paused instance and cancels a pending pause. A paused
  retry, sleep, or event wait keeps its remaining wait duration.
- `restart()` starts a new generation from the beginning by default. Its
  `from` option can select a step by its `name`, `count`, and `type`. The
  `count` value defaults to `1`, and the `type` value defaults to `do`.
- A selected restart reuses each result before the selected step and reruns
  that step and each later step. The runtime rejects a selector that does not
  match the execution history.
- `delete()`, `deleteBatch()`, and rollback are not available.
- A sensitive step result and a `ReadableStream` step result are not
  available.

### [R2](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)

**Partial**

- An R2 binding uses the fleet bucket under `r2/<bucket_name>/`.
- `ssecKey` is not available.
- A conditional write cannot use a streamed body larger than 8 MiB.
- `createMultipartUpload()` does not accept a checksum.
- A multipart upload cannot resume on another node or after a restart.
- celld cannot replace a multipart part that the object store already holds.
- Out-of-order parts can use at most 256 MiB of memory, and completion cannot
  change the order of stored parts.
- `jurisdiction` is not available.

## Runtime APIs

| API | status |
| --- | --- |
| [Fetch, Request, Response, and Headers](https://developers.cloudflare.com/workers/runtime-apis/fetch/) | **Partial** |
| [Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/) | **Partial** |
| [Context](https://developers.cloudflare.com/workers/runtime-apis/context/) | **Partial** |
| [Handlers](https://developers.cloudflare.com/workers/runtime-apis/handlers/) | **Partial** |
| [RPC](https://developers.cloudflare.com/workers/runtime-apis/rpc/) | **Partial** |
| [Streams](https://developers.cloudflare.com/workers/runtime-apis/streams/) | **Partial** |
| [Encoding](https://developers.cloudflare.com/workers/runtime-apis/encoding/) | **Yes** |
| [WebSockets](https://developers.cloudflare.com/workers/runtime-apis/websockets/) | **Partial** |
| [Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) | **Partial** |
| [Web standards](https://developers.cloudflare.com/workers/runtime-apis/web-standards/) | **Partial** |
| [WebAssembly](https://developers.cloudflare.com/workers/runtime-apis/webassembly/) | **Yes** |
| [Performance and timers](https://developers.cloudflare.com/workers/runtime-apis/performance/) | **Partial** |
| [Console](https://developers.cloudflare.com/workers/runtime-apis/console/) | **Partial** |
| [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) | **Partial** |
| [Facets](https://developers.cloudflare.com/dynamic-workers/usage/durable-object-facets/) | **No** |
| [Cache](https://developers.cloudflare.com/workers/runtime-apis/cache/) | **No** |
| [HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/) | **No** |
| [TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/) | **No** |
| [EventSource](https://developers.cloudflare.com/workers/runtime-apis/eventsource/) | **No** |
| [MessageChannel](https://developers.cloudflare.com/workers/runtime-apis/messagechannel/) | **No** |
| BroadcastChannel | **No** |

### [Fetch, Request, Response, and Headers](https://developers.cloudflare.com/workers/runtime-apis/fetch/)

**Partial**

- The `cache` request option is not available.
- celld removes `Content-Length` from a Worker response. It preserves the
  header for a `HEAD` response.
- A remote Durable Object call streams the request body to the owner. The call
  cannot retry after body transmission starts because celld keeps no replay
  copy.

### [Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/)

**Partial**

- The [services table](#services) lists the available binding types.
- celld supports Durable Objects, services, variables, assets, D1, KV, Queues,
  Workflows, and R2 bindings. Each other binding type is not available.

### [Context](https://developers.cloudflare.com/workers/runtime-apis/context/)

**Partial**

- `passThroughOnException()` has no effect because celld has no CDN fallback.
- `ctx.facets` is not defined.

### [Handlers](https://developers.cloudflare.com/workers/runtime-apis/handlers/)

**Partial**

- The `tail` and `email` handlers are not available.

### [RPC](https://developers.cloudflare.com/workers/runtime-apis/rpc/)

**Partial**

- A cross-isolate named service binding supports only a single method call. It
  does not support `fetch()`, awaitable properties, or pipelined paths.
- An RPC stub cannot cross an isolate boundary.
- `ctx.exports` contains only the entrypoints that the configuration declares.

### [Streams](https://developers.cloudflare.com/workers/runtime-apis/streams/)

**Partial**

- `ReadableStream.from()` is not available.

### [WebSockets](https://developers.cloudflare.com/workers/runtime-apis/websockets/)

**Partial**

- `getTags()` is not available.
- A caller must call `accept()` on the socket from a subrequest upgrade.
- An outbound Worker socket closes after the response and `waitUntil` work
  end.
- celld rejects an upgrade when the response status is not 101.
- celld removes Worker-supplied protocol and connection headers from an upgrade
  response.
- An outbound upgrade combines repeated values for one header name.
- `acceptWebSocket()` throws when the isolate uses more than 90 percent of its
  V8 heap limit.

### [Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)

**Partial**

- `wrapKey()` and `unwrapKey()` are not available.
- RSA-PSS signing is not available.
- Web Crypto does not provide HKDF or PBKDF2 through `deriveBits()`. Use
  `node:crypto` for these algorithms.

### [Web standards](https://developers.cloudflare.com/workers/runtime-apis/web-standards/)

**Partial**

- An `AbortSignal` does not abort an RPC call.
- `signal.onabort` has no effect. Use `addEventListener("abort", ...)`.
- `structuredClone()` is not conformant for some exotic types.

### [Performance and timers](https://developers.cloudflare.com/workers/runtime-apis/performance/)

**Partial**

- An active interval keeps a Worker request open.
- `performance.now()` has millisecond resolution.
- The other `performance` properties are stubs.

### [Console](https://developers.cloudflare.com/workers/runtime-apis/console/)

**Partial**

- `debug`, `trace`, `group`, and `table` have no effect.
- `assert`, `time`, and `count` are not available.

### [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)

**Partial**

- celld implements `node:assert`, `node:async_hooks`, `node:buffer`,
  `node:events`, `node:path`, `node:stream`, `node:timers/promises`, and
  `node:util`.
- `node:crypto` does not implement Diffie-Hellman, streaming signatures,
  ciphers, RSA-PSS, or DSA signatures and key generation.
- `node:zlib` implements only the synchronous gzip and deflate functions.
- `node:fs` returns `ENOENT` from each read.
- Each other Node.js module returns an inert stub. This behavior is a known
  silent gap.

### [TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/)

**No**

- `connect()` returns an inert stub. This behavior is a known silent gap.

### EventSource, MessageChannel, and BroadcastChannel

**No**

- These classes are inert stubs. This behavior is a known silent gap.

## Compatibility flags

celld honors these compatibility switches:

- `delete_all_deletes_alarm`
- `js_rpc`
- `fetcher_no_get_put_delete`
- `sqlite_vec`
- `websocket_standard_binary_type`
- The static-assets navigation flags

celld accepts each other compatibility flag without effect.
`Cloudflare.compatibilityFlags` reports only the flags that celld honors.

## Wrangler configuration

`celld deploy` accepts `wrangler.jsonc` or `wrangler.json`. It does not
accept `wrangler.toml`. The deployment accepts these top-level keys:

- `$schema`, `name`, `main`, and `no_bundle`
- `compatibility_date` and `compatibility_flags`
- `durable_objects` and `migrations`
- `assets`, `services`, `triggers`, and `vars`
- `d1_databases`, `kv_namespaces`, `queues`, `workflows`, and
  `r2_buckets`

Each other top-level key, including `routes`, stops the deployment.
An asset-only project can omit `main`. celld refuses a symlink or special file
in an asset directory, and `.assetsignore` requires Wrangler.

See [Limitations](limitations.md) for the operating-system, networking,
security, pressure, and update boundaries.
