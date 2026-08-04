#!/usr/bin/env node
/**
 * Side-by-side demo: same tools via OpenAPI REST, GraphQL, and gRPC CallTool.
 *
 * Requires: node examples/mcp-openapi-gateway/server.mjs
 */

import {
  callToolServerStreamingGrpc,
  lastNonEmptyCallToolText,
  resolveGrpcAddressFromEnv,
} from "mcp-grpc-transport";

const base = process.env.OPENAPI_BASE_URL?.trim() || "http://127.0.0.1:8090";
const address =
  process.env.CLAWQL_MCP_GRPC_ADDR?.trim() ||
  resolveGrpcAddressFromEnv() ||
  "127.0.0.1:50051";
const apiKey = process.env.MCP_OPENAPI_GATEWAY_API_KEY?.trim();

function headers() {
  const h = { "content-type": "application/json" };
  if (apiKey) h["x-api-key"] = apiKey;
  return h;
}

async function rest(tool, body) {
  const res = await fetch(`${base}/${tool}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`REST ${tool} ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function graphql(tool, args) {
  let query;
  let variables;
  if (tool === "echo") {
    query = "mutation($m: String!) { echo(message: $m) }";
    variables = { m: args.message };
  } else if (tool === "add") {
    query = "mutation($a: Float!, $b: Float!) { add(a: $a, b: $b) }";
    variables = { a: args.a, b: args.b };
  } else {
    query = "mutation($name: String!, $args: JSON) { callTool(name: $name, args: $args) }";
    variables = { name: tool, args };
  }
  const res = await fetch(`${base}/graphql`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`GraphQL ${tool}: ${JSON.stringify(json)}`);
  }
  return json.data?.[tool] ?? json.data?.callTool;
}

async function grpc(tool, body) {
  const messages = await callToolServerStreamingGrpc({
    address,
    toolName: tool,
    arguments: body,
  });
  return lastNonEmptyCallToolText(messages);
}

async function main() {
  console.log("=== Side-by-side: OpenAPI REST vs GraphQL vs gRPC CallTool ===\n");
  console.log(`REST     → ${base}`);
  console.log(`GraphQL  → ${base}/graphql`);
  console.log(`gRPC     → ${address}\n`);

  const cases = [
    ["echo", { message: "parity-check" }],
    ["add", { a: 7, b: 5 }],
    ["greet", { name: "ClawQL", shout: true }],
  ];

  for (const [tool, args] of cases) {
    const restResult = await rest(tool, args);
    const gqlResult = await graphql(tool, args);
    const grpcText = await grpc(tool, args);
    console.log(`--- ${tool} ${JSON.stringify(args)}`);
    console.log("  REST    :", restResult);
    console.log("  GraphQL :", gqlResult);
    console.log("  gRPC    :", grpcText);
    console.log("");
  }

  console.log("All three paths hit the same MCP tool handlers.");
  console.log("OpenAPI + GraphQL are on-ramps; gRPC is the production / mesh path.");
  console.log(`Swagger:  ${base}/docs`);
  console.log(`GraphiQL: ${base}/graphiql`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
