# Examples

These small Wrangler projects demonstrate the Workers platform that `celld`
supports, one service or API at a time:

- `hello/` — a stateless Worker `fetch` handler
- `webapi/` — common Web Platform APIs
- `static-assets/` — an asset-only website with headers and redirects
- `counter/` — a SQLite-backed Durable Object
- `vectordb/` — nearest-color search with a per-object `vec0` index
- `d1/` — a guestbook on a D1 database
- `r2/` — object reads, writes, and deletes on an R2 bucket
- `kv/` — key reads, writes, and deletes in a KV namespace
- `queues/` — a producer and a consumer, with retries and a dead-letter queue
- `async/` — a timer and asynchronous Durable Object storage
- `body/` — request and response bodies
- `router/` — Worker-to-Durable-Object routing
- `wsecho/` — WebSocket echo with hibernation
- `wsclient/` — outbound WebSocket client from a Durable Object
- `alarm/` — a Durable Object alarm handler
- `cron/` — a cron trigger that logs each tick
- `workflow/` — a Workflow that builds a report in one durable step
- `rpc/` — Durable Object method calls through JS RPC
- `dynamic-worker-tails/` — a runtime-loaded Worker with a Tail Worker
- `facets/` — a Durable Object facet over a class the Worker Loader starts
- `container/` — a Durable Object that supervises a container with
  `@cloudflare/containers`; needs `npm install` and a Docker or Podman CLI
- `sandbox/` — the Cloudflare Sandbox SDK: commands, files, and processes
  in a container per sandbox; needs `npm install` and a Docker or Podman CLI
- `pi/` — the PiHarness agent loop in a Durable Object
- `opencode/` — the OpenCode Workerd SDK in a Durable Object
- `python/` — a Python Worker that summarizes HTML with a vendored package;
  needs `uv run pywrangler sync` first (see [Python Workers](../docs/services/workers.md#python-workers))
- `wasm/` — a Durable Object counter in Rust, compiled to Wasm with
  [workers-rs](https://github.com/cloudflare/workers-rs); needs a build step
  first (see its [README](wasm/README.md))

Deploy an example from its directory to the same bucket the nodes use:

```sh
celld deploy . --bucket s3://my-cells-bucket
```

The counter example uses the `name` query parameter as the Durable Object
name. It uses `default` when the parameter is absent. Send requests for
different names to demonstrate independent cells:

```sh
curl 'http://127.0.0.1:8080/increment?name=alpha'
curl 'http://127.0.0.1:8080/increment?name=beta'
curl 'http://127.0.0.1:8080/increment?name=alpha'
```

A fleet can place the named cells on different nodes, and each cell keeps an
independent counter.

They are examples, not the complete compatibility test suite.
