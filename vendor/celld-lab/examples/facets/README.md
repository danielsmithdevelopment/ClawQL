# Facets

This example starts a Worker at runtime with the Worker Loader, and it runs a
Durable Object class from that Worker as a facet of a Durable Object. The facet
counts the requests in its own SQLite database with the synchronous KV API, and
celld replicates that database with the root object. The parent passes a
parameterized `ctx.exports` Service Binding through `WorkerCode.env`, so the
loaded Worker can call the parent entrypoint.

The `worker_loaders` key of `wrangler.jsonc` declares the Worker Loader, and
the entry in this example puts the binding at `env.LOADER`. Cloudflare can
still change the Worker Loader API, so this example needs no setting but it can
change. Start the example:

```sh
celld dev .
curl http://127.0.0.1:9876/
```

Each request answers the count and the parent entrypoint's greeting. The count
survives a restart of the command.
