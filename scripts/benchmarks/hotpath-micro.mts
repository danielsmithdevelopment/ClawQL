import { performance } from "node:perf_hooks";
import { createServer } from "node:http";
import { writeFile, mkdir } from "node:fs/promises";
import { Effect } from "effect";
import { decodeExecuteInput } from "/workspace/packages/clawql-api/src/schema/search-execute-schema.ts";
import { loadSpec, resetSpecCache } from "/workspace/packages/clawql-api/src/spec/spec-loader.ts";
import { executeOperationGraphQL } from "/workspace/packages/clawql-api/src/graphql/in-process-execute.ts";
import { executeRestOperation } from "/workspace/packages/clawql-api/src/execute/rest-operation.ts";
import { shapeExecuteDataEffect } from "/workspace/packages/clawql-api/src/execute/where-filter.ts";
import {
  buildGraphQLSchema,
  resetGraphQLSchemaCache,
} from "/workspace/packages/clawql-api/src/graphql/schema-builder.ts";
import { runMcpProxyBeforeCallTool } from "/workspace/src/composition/clawql-api-adapters.ts";
import { handleAuditToolInput } from "/workspace/src/mcp/clawql-audit.ts";
import { handleClawqlExecuteToolInput } from "/workspace/src/mcp/tools.ts";

const payload = JSON.stringify({
  pets: [
    { id: 1, name: "Ada", status: "available" },
    { id: 2, name: "Grace", status: "available" },
  ],
});

const server = createServer((_q, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(payload);
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;
const home = `/tmp/clawql-micro-${process.pid}`;
await mkdir(home, { recursive: true });
process.env.CLAWQL_HOME = home;
process.env.CLAWQL_OBSIDIAN_VAULT_PATH = home;
process.env.CLAWQL_SPEC_PATH = `/tmp/clawql-micro-spec-${process.pid}.json`;
process.env.CLAWQL_API_BASE_URL = base;
process.env.CLAWQL_BUNDLED_OFFLINE = "1";
process.env.CLAWQL_TIER = "gateway";
process.env.CLAWQL_CAPABILITY_LIFECYCLE = "0";
delete process.env.CLAWQL_WORM_ENABLED;
delete process.env.CLAWQL_PROVIDER;
delete process.env.CLAWQL_GRAPHQL_SOURCES;

await writeFile(
  process.env.CLAWQL_SPEC_PATH,
  JSON.stringify(
    {
      openapi: "3.0.3",
      info: { title: "p", version: "1" },
      servers: [{ url: base }],
      paths: {
        "/pets": {
          get: {
            operationId: "listPets",
            responses: {
              "200": {
                description: "ok",
                content: { "application/json": { schema: { type: "object" } } },
              },
            },
          },
        },
      },
    },
    null,
    2
  )
);

function pct(a: number[], p: number) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
}

async function bench(label: string, n: number, fn: () => Promise<unknown>) {
  for (let i = 0; i < 15; i++) await fn();
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  return {
    label,
    n,
    p50: Number(pct(samples, 50).toFixed(3)),
    p95: Number(pct(samples, 95).toFixed(3)),
    mean: Number((samples.reduce((a, b) => a + b, 0) / n).toFixed(3)),
  };
}

resetSpecCache();
const loaded = await loadSpec();
const op = loaded.operations.find((o) => o.id === "listPets")!;
const openapi = loaded.openapi as object;

const results = [];
results.push(
  await bench("decodeExecuteInput", 400, () =>
    Effect.runPromise(
      decodeExecuteInput({ operationId: "listPets", args: {}, fields: ["pets"] })
    )
  )
);
results.push(await bench("loadSpec_cached", 400, () => loadSpec()));
resetGraphQLSchemaCache();
results.push(
  await bench("buildGraphQLSchema_cold_each", 20, async () => {
    resetGraphQLSchemaCache();
    await buildGraphQLSchema(openapi, base);
  })
);
resetGraphQLSchemaCache();
await buildGraphQLSchema(openapi, base);
results.push(
  await bench("buildGraphQLSchema_warm_cache", 80, () => buildGraphQLSchema(openapi, base))
);
results.push(
  await bench("runBeforeCallTool_hooks", 150, () =>
    runMcpProxyBeforeCallTool("execute", { operationId: "listPets", args: {} })
  )
);
results.push(
  await bench("audit_append_direct", 150, () =>
    handleAuditToolInput({
      operation: "append",
      category: "b",
      action: "a",
      summary: "s",
    })
  )
);
results.push(
  await bench("direct_fetch", 150, async () => {
    const r = await fetch(`${base}/pets`);
    await r.text();
  })
);
results.push(
  await bench("executeRestOperation", 80, () => executeRestOperation(op as never, {}, openapi as never))
);
results.push(
  await bench("executeOperationGraphQL", 80, () =>
    executeOperationGraphQL(openapi, base, op as never, {}, "pets")
  )
);
results.push(
  await bench("shape_fields_only", 400, () =>
    Effect.runPromise(shapeExecuteDataEffect(JSON.parse(payload), { fields: ["pets"] }))
  )
);
results.push(
  await bench("handleClawqlExecuteToolInput_no_wrap", 60, () =>
    handleClawqlExecuteToolInput({ operationId: "listPets", args: {}, fields: ["pets"] })
  )
);

console.log(JSON.stringify({ results }, null, 2));
server.close();
