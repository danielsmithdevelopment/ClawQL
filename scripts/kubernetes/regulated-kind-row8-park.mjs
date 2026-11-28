/**
 * Park a HIGH-risk execute against the in-cluster MCP for row 8 CLI probe.
 * Prints EXECUTION_ID=<id> on success. Keys from CLAWQL_WIRE_* env.
 */
import { readFileSync } from "node:fs";
import { importPKCS8, SignJWT } from "jose";

const base = (process.env.CLAWQL_WIRE_BASE_URL || "").replace(/\/$/, "");
const keyPath = process.env.CLAWQL_WIRE_OIDC_PRIVATE_KEY_PEM_PATH || "";
const issuer = process.env.CLAWQL_WIRE_OIDC_ISSUER || "";
const audience = process.env.CLAWQL_WIRE_OIDC_AUDIENCE || "clawql-mcp";
const kid = process.env.CLAWQL_WIRE_OIDC_KID || "kind-wire";

if (!base || !keyPath || !issuer) {
  console.error("missing CLAWQL_WIRE_BASE_URL / PRIVATE_KEY / ISSUER");
  process.exit(2);
}

const privateKey = await importPKCS8(readFileSync(keyPath, "utf8"), "ES256");
const token = await new SignJWT({
  atr: {
    sub: "wire-agent",
    role: "operator",
    scope: ["execute", "search", "memory", "sources_propose", "patchItem", "resume", "core"],
  },
})
  .setProtectedHeader({ alg: "ES256", kid })
  .setSubject("wire-agent")
  .setIssuer(issuer)
  .setAudience(audience)
  .setIssuedAt()
  .setExpirationTime("2h")
  .sign(privateKey);

async function parseBody(res) {
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (ct.includes("text/event-stream") || text.startsWith("event:")) {
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    const last = lines[lines.length - 1];
    return last ? JSON.parse(last.slice(5).trim()) : { raw: text };
  }
  return text ? JSON.parse(text) : null;
}

const initRes = await fetch(`${base}/mcp`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "row8-park", version: "1" },
    },
  }),
});
const sessionId = initRes.headers.get("mcp-session-id") || "";
if (!initRes.ok) {
  console.error("initialize failed", initRes.status, await initRes.text());
  process.exit(1);
}
await fetch(`${base}/mcp`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${token}`,
    ...(sessionId ? { "mcp-session-id": sessionId } : {}),
  },
  body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
});

const parkRes = await fetch(`${base}/mcp`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${token}`,
    ...(sessionId ? { "mcp-session-id": sessionId } : {}),
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "execute",
      arguments: { operationId: "patchItem", args: { id: "park-8-kind" } },
    },
  }),
});
const parkBody = await parseBody(parkRes);
const text =
  parkBody?.result?.content?.[0]?.text || parkBody?.error?.message || JSON.stringify(parkBody);
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  console.error("park not JSON", text);
  process.exit(1);
}
if (!parsed.executionId) {
  console.error("no executionId", text);
  process.exit(1);
}
console.log(`EXECUTION_ID=${parsed.executionId}`);
