# Harness comparison bench

Compare harness plugins on identical tasks/models via `compareHarnesses` from `clawql-harness/bench`.

Context flamegraph JSON (token instrumentation):

```bash
npm run build -w mcp-api-adapter
node examples/mcp-api-adapter/server.mjs   # or your adapter URL

# Side-by-side compressed vs fat — exits non-zero if demos regress
TRACE_BASE=http://127.0.0.1:8090/mcp-ui node integrations/harness-bench/scripts/fetch-trace.mjs --compare

# Single session summary
node integrations/harness-bench/scripts/fetch-trace.mjs demo-compressed
```

Structural harness compare (stub model — no inference traces yet):

```bash
npm run build -w clawql-harness
node integrations/harness-bench/scripts/compare.mjs
```

This is distinct from **Agents OpenBench** (`integrations/agents-bench/`) and **MCP OpenBench** (`openbench/`).
