#!/usr/bin/env node
/**
 * Mock pharmacy *write* MCP — Cost Plus Drugs' public MCP is read-only
 * (price / availability / estimates only). This stub is what ClawQL would
 * put behind mandate + audit for refill / transfer / account writes.
 *
 * Label every response MOCK. No clinical or dosing advice.
 *
 * Usage:
 *   node scripts/mock-pharmacy-write-mcp.mjs [port]
 *   CLAWQL_HOME=… clawql sources add http://127.0.0.1:9892/mcp --kind mcp --name "CPD Mock Writes"
 */
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const port = Number(process.env.MOCK_PHARMACY_WRITE_PORT || process.argv[2] || 9892);
const path = "/mcp";
const ledgerDir =
  process.env.MOCK_PHARMACY_LEDGER_DIR ||
  join(process.cwd(), ".demo-data", "mock-pharmacy-ledger");

/** @type {Map<string, Record<string, unknown>>} */
const ledger = new Map();

async function persistLedger(entry) {
  await mkdir(ledgerDir, { recursive: true });
  const id = String(entry.orderId);
  ledger.set(id, entry);
  await writeFile(join(ledgerDir, `${id}.json`), JSON.stringify(entry, null, 2), "utf8");
}

const tools = [
  {
    name: "place_refill_order",
    description:
      "MOCK WRITE — Stage/place a refill for an exact NDC, quantity, and quoted cash price. Requires a valid prescription from a licensed clinician (not supplied here). Not medical advice. No public Cost Plus ordering API exists; this is a ClawQL governance demo stub.",
    inputSchema: {
      type: "object",
      properties: {
        medication_name: { type: "string", minLength: 1 },
        strength: { type: "string", minLength: 1 },
        ndc: { type: "string", minLength: 5 },
        quantity: { type: "integer", minimum: 1 },
        quoted_price_usd: { type: "number", minimum: 0 },
        channel: { type: "string", enum: ["cpd_mail", "tcc_pickup"] },
        patient_name: { type: "string" },
        shipping_address: { type: "string" },
        rx_number: { type: "string" },
      },
      required: [
        "medication_name",
        "strength",
        "ndc",
        "quantity",
        "quoted_price_usd",
        "channel",
      ],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      // Consequential: money + PHI — ClawQL operation-risk should mandate.
    },
  },
  {
    name: "list_mock_orders",
    description: "MOCK — List orders written by this stub (demo ledger only).",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
];

function jsonRpcResult(id, result) {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id, code, message) {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

function toolContent(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  if (req.method === "GET" && url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, mock: true, transport: "mock-pharmacy-write-mcp" }));
    return;
  }
  if (req.method !== "POST" || url.pathname !== path) {
    res.writeHead(404).end("not found");
    return;
  }

  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    res.writeHead(400).end("bad json");
    return;
  }

  const id = body.id ?? 1;

  if (body.method === "initialize") {
    res.writeHead(200, {
      "content-type": "application/json",
      "mcp-session-id": "mock-pharmacy-write",
    });
    res.end(
      jsonRpcResult(id, {
        protocolVersion: "2025-11-25",
        capabilities: { tools: {} },
        serverInfo: { name: "cpd-mock-pharmacy-writes", version: "0.1.0" },
        instructions:
          "MOCK write surface for Cost Plus Drugs governance demos. Read pricing from mcp.costplusdrugs.com; never treat this server as clinical advice or a real pharmacy.",
      })
    );
    return;
  }

  if (body.method === "notifications/initialized") {
    res.writeHead(204).end();
    return;
  }

  if (body.method === "tools/list") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(jsonRpcResult(id, { tools }));
    return;
  }

  if (body.method === "tools/call") {
    const name = body.params?.name;
    const args = body.params?.arguments ?? {};
    try {
      if (name === "place_refill_order") {
        const orderId = `mock_ord_${randomUUID().slice(0, 8)}`;
        const entry = {
          orderId,
          status: "accepted_mock",
          mock: true,
          disclaimer:
            "MOCK ORDER — not transmitted to Cost Plus Drugs. No prescription was verified. Not medical advice.",
          bound: {
            medication_name: args.medication_name,
            strength: args.strength,
            ndc: args.ndc,
            quantity: args.quantity,
            quoted_price_usd: args.quoted_price_usd,
            channel: args.channel,
          },
          // Intentionally omit echoing full patient fields in default tool text
          // when a gateway already redacted them — store only what was sent.
          patient_fields_present: Boolean(args.patient_name || args.shipping_address),
          createdAt: new Date().toISOString(),
        };
        await persistLedger(entry);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(jsonRpcResult(id, toolContent(entry)));
        return;
      }
      if (name === "list_mock_orders") {
        let fromDisk = [...ledger.values()];
        try {
          const { readdir } = await import("node:fs/promises");
          const files = await readdir(ledgerDir);
          for (const f of files.filter((x) => x.endsWith(".json"))) {
            const raw = JSON.parse(await readFile(join(ledgerDir, f), "utf8"));
            if (raw?.orderId) ledger.set(String(raw.orderId), raw);
          }
          fromDisk = [...ledger.values()];
        } catch {
          /* empty ledger ok */
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(jsonRpcResult(id, toolContent({ mock: true, orders: fromDisk })));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(jsonRpcError(id, -32601, `Unknown tool: ${name}`));
    } catch (e) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(jsonRpcError(id, -32000, e instanceof Error ? e.message : String(e)));
    }
    return;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(jsonRpcError(id, -32601, `Unsupported method: ${body.method}`));
});

server.listen(port, "127.0.0.1", () => {
  console.error(
    JSON.stringify({
      ok: true,
      mock: true,
      mcpUrl: `http://127.0.0.1:${port}${path}`,
      healthz: `http://127.0.0.1:${port}/healthz`,
      ledgerDir,
    })
  );
});
