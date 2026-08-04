#!/usr/bin/env node
/**
 * Call demo MCP tools over the OpenAPI on-ramp (plain HTTP).
 *
 * Requires: node examples/mcp-api-adapter/server.mjs
 */

const base = process.env.OPENAPI_BASE_URL?.trim() || "http://127.0.0.1:8090";
const apiKey = process.env.MCP_API_ADAPTER_API_KEY?.trim();

function headers(extra = {}) {
  const h = { "content-type": "application/json", ...extra };
  if (apiKey) {
    h["x-api-key"] = apiKey;
  }
  return h;
}

async function main() {
  console.log(`OpenAPI base: ${base}\n`);

  const health = await fetch(`${base}/healthz`);
  console.log("GET /healthz", health.status, await health.json());

  const tools = await fetch(`${base}/tools`, { headers: headers() });
  const toolsBody = await tools.json();
  console.log(
    "\nGET /tools",
    tools.status,
    toolsBody.tools?.map((t) => t.name)
  );

  const openapi = await fetch(`${base}/openapi.json`, { headers: headers() });
  const doc = await openapi.json();
  console.log("\nGET /openapi.json info.x-clawql-grpc:");
  console.log(JSON.stringify(doc.info?.["x-clawql-grpc"], null, 2));

  const echo = await fetch(`${base}/echo`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ message: "called via OpenAPI REST" }),
  });
  console.log("\nPOST /echo", echo.status, await echo.json());

  const add = await fetch(`${base}/add`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ a: 20, b: 22 }),
  });
  console.log("POST /add", add.status, await add.json());

  const greet = await fetch(`${base}/greet`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name: "OpenAPI", shout: true }),
  });
  console.log("POST /greet", greet.status, await greet.json());

  console.log("\nSwagger UI:", `${base}/docs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
