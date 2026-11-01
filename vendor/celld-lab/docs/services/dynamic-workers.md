# Dynamic Workers

A Dynamic Worker is Worker code that a running Worker supplies at runtime and
loads through a Worker Loader binding, such as code that a customer uploads or
that a model writes. celld compiles the code into a separate V8 isolate on the
node of the loader. Cloudflare runs this feature in an
[open beta](https://developers.cloudflare.com/changelog/post/2026-03-24-dynamic-workers-open-beta/),
so the API can change. Read the
[Cloudflare Dynamic Workers documentation](https://developers.cloudflare.com/dynamic-workers/)
and the
[API reference](https://developers.cloudflare.com/dynamic-workers/api-reference/)
for the standard API.

## Example

The [Dynamic Workers example](../../examples/dynamic-worker-tails) loads a
Worker and sends its invocation records to a Tail Worker.

<!-- celld-example: dynamic-worker-tails -->

## API

- `env.LOADER.get(id, getCode)` loads a Worker under a string id, and
  `env.LOADER.load(code)` loads an anonymous Worker.
- `getCode` returns a `WorkerCode` object: `mainModule`, `modules`,
  `compatibilityDate`, `compatibilityFlags`, `env`, `globalOutbound`, `limits`,
  and `tails`.
- `stub.getEntrypoint(name, options)` returns a Fetcher for the default export
  or for a named `WorkerEntrypoint`.
- `stub.getDurableObjectClass(name, options)` returns a Durable Object class,
  for example for a [facet](durable-object-facets.md).
- `stub.dispose()` releases the loaded Worker.

## Loading a Worker

A `worker_loaders` entry accepts only the `binding` name, as in Wrangler.
celld stops the deployment when the entry sets `tails` or `limits`; set them in
the `WorkerCode` object, or set `limits` in a `getEntrypoint()` call.

celld calls the `getCode` callback of `env.LOADER.get(id, getCode)` only when
it must compile, so a throw in `getCode` surfaces at the first use of the
Worker, not at `get()`.

- A `modules` value can be a module object such as `{ wasm: bytes }`; the
  [WebAssembly page](../wasm.md#dynamic-workers) shows that form. celld refuses
  bare bytes, as workerd does.
- A relative import resolves from the name of the importing module, so
  `dir/a.js` can import `./b.js` when the map contains `dir/b.js`.
- `compatibilityDate` is required, as in workerd.
- The module sources can total 64 MiB by default, as in workerd. An operator
  can set `CELLD_MAX_DYNAMIC_WORKER_CODE_BYTES` on each node to a larger byte
  count. Loaded code cannot raise it, and the heap, execution, and admission
  limits still apply.
- When both `WorkerCode.limits` and `getEntrypoint()` set a limit, celld uses
  the lower value.

## The isolation boundary

The loaded isolate has its own context and heap, but it runs in the process of
the loader. It is not a second process or a virtual machine, so the boundary
scopes what the code can address and makes no claim about V8 escape safety.
For a kernel boundary, run the code in a container under a named runtime; read
[the isolation boundary](containers.md#the-isolation-boundary) on the
Containers page.

The loaded Worker gets no binding and no `vars` entry of the deployment, and no
Worker Loader binding, so it cannot load another Worker. It reaches only the
`env` of its `WorkerCode`. A capability call is an RPC into the isolate of the
loader. celld passes host operations to its internal scripts as function
parameters, never as globals, so `globalThis` exposes none.

When `WorkerCode` omits `globalOutbound`, the loaded Worker inherits the egress
policy of the loader. A `null` value makes `fetch()` and `connect()` throw. A
Fetcher brokers each `fetch()` through the loader. A `connect()` or a WebSocket
through a Fetcher throws, because the celld service protocol carries no
bidirectional tunnel.

## Lifetime and caching

`get(id, getCode)` memoizes the compiled Worker by id inside one loader binding
of one host isolate, so module scope survives between calls there. Each
isolate, each node, and each `worker_loaders` entry has its own map, and pays
the compile again. Cloudflare describes this reuse as possible, not
guaranteed. `load(code)` compiles on each call.

A stub, an entrypoint, a Durable Object class, or a running facet keeps its
loaded Worker alive. The id map holds a weak reference, so after the last
reference disappears the garbage collector can release the Worker, at no
guaranteed time, and a later `get()` runs `getCode` again.

The `dispose()` method of a stub releases its loaded Worker and removes the id
from the map. The other stubs for that load cannot start new calls, and an
in-flight call finishes.

celld drops every loaded Worker when its host isolate retires, after in-flight
calls finish. A loaded Worker never outlives its loader, and a redeploy
compiles the code again.

## Differences from Cloudflare

- The process limit is 256 live Dynamic Workers, and each script generation can
  use 255 slots, so one loader cannot take the whole process. Every loader and
  script shares the process limit, and a load over either limit throws.
- The process rejects the removed `CELLD_MAX_LOADED_WORKERS` environment
  variable.
- `getEntrypoint()` supports `props` and `limits` options, while
  `getDurableObjectClass()` supports only `props`. A structured-clone encoded
  `props` value can be at most 1 MiB.
- A `globalOutbound` Fetcher cannot use `connect()` or a WebSocket.
- A `WorkerCode.tails` array accepts Service Binding Fetchers. Each Fetcher
  receives one event after a Dynamic Worker fetch invocation finishes.
- The event contains the request metadata, the response status, the console
  logs, the uncaught exception, and the invocation outcome.
- celld records at most 256 KiB of serialized console log records for each
  invocation. It stops recording when the next complete record exceeds this
  limit.
- Tail delivery starts after the response is available. A Tail Worker failure
  does not change the response, and celld writes the failure to the console.
- celld enforces `cpuMs` and `subRequests` in `WorkerCode.limits` and in a
  `getEntrypoint()` call. It rejects `allowExperimental`.
- `WorkerCode.env` accepts structured-clone values and Service Binding
  capabilities. The encoded values and the capability props can total 1 MiB.
- A loaded Worker entrypoint cannot transfer to another Worker. Awaitable and
  pipelined properties are also unavailable.

The [Cloudflare compatibility](../cloudflare-compat.md#services) page
lists the runtime APIs and the unsupported services.
