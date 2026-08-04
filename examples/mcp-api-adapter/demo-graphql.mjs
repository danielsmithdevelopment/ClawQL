#!/usr/bin/env node
/**
 * Call demo MCP tools over the GraphQL on-ramp (same gRPC CallTool backend).
 *
 * Requires: node examples/mcp-api-adapter/server.mjs
 */

const base = process.env.OPENAPI_BASE_URL?.trim() || "http://127.0.0.1:8090";
const apiKey = process.env.MCP_API_ADAPTER_API_KEY?.trim();

function headers() {
  const h = { "content-type": "application/json" };
  if (apiKey) h["x-api-key"] = apiKey;
  return h;
}

async function gql(query, variables) {
  const res = await fetch(`${base}/graphql`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`GraphQL failed: ${JSON.stringify(json, null, 2)}`);
  }
  return json.data;
}

async function main() {
  console.log(`GraphQL endpoint: ${base}/graphql`);
  console.log(`GraphiQL:         ${base}/graphiql\n`);

  const health = await gql(`{
    health { status grpcAddress toolCount surfaces }
    tools { name description }
  }`);
  console.log("Query health/tools:", JSON.stringify(health, null, 2));

  const echo = await gql(
    `mutation($m: String!) { echo(message: $m) }`,
    { m: "called via GraphQL" }
  );
  console.log("\nmutation echo:", echo);

  const add = await gql(`mutation { add(a: 20, b: 22) }`);
  console.log("mutation add:", add);

  const greet = await gql(
    `mutation { callTool(name: "greet", args: { name: "GraphQL", shout: true }) }`
  );
  console.log("mutation callTool(greet):", greet);

  const sdl = await fetch(`${base}/graphql/schema.graphql`, { headers: headers() });
  const text = await sdl.text();
  console.log("\nSDL excerpt:\n" + text.split("\n").slice(0, 25).join("\n") + "\n…");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
