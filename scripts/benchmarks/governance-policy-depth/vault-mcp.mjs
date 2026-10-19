#!/usr/bin/env node
/**
 * Equal-arm vault MCP — exposes memory_ingest + memory_recall against VAULT_ROOT.
 * Peers (Obot / Bifrost / passthrough) and ClawQL share this backend fixture.
 *
 *   VAULT_ROOT=/tmp/.../vault node vault-mcp.mjs --http --port 18780
 */
import { createServer } from "node:http";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const VAULT_ROOT = resolve(process.env.VAULT_ROOT || join(process.cwd(), "vault"));
mkdirSync(join(VAULT_ROOT, "Memory"), { recursive: true });

const TOOLS = [
  {
    name: "memory_ingest",
    description:
      "Write a Markdown note into the vault Memory/ folder. Used by the governance-policy-depth equal-arm fixture.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Note title" },
        insights: { type: "string", description: "Note body / insights" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "memory_recall",
    description: "Keyword search over vault Memory/ notes. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

function slug(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function ingest(title, insights) {
  const file = join(VAULT_ROOT, "Memory", `${slug(title) || "note"}.md`);
  const body = `# ${title}\n\n${insights || ""}\n`;
  writeFileSync(file, body, "utf8");
  return { ok: true, path: file, title };
}

function recall(query) {
  const mem = join(VAULT_ROOT, "Memory");
  if (!existsSync(mem)) return { hits: [] };
  const q = String(query || "").toLowerCase();
  const hits = [];
  for (const name of readdirSync(mem)) {
    if (!name.endsWith(".md")) continue;
    const text = readFileSync(join(mem, name), "utf8");
    if (!q || text.toLowerCase().includes(q) || name.toLowerCase().includes(q)) {
      hits.push({ path: `Memory/${name}`, snippet: text.slice(0, 200) });
    }
  }
  return { hits };
}

function makeServer() {
  const server = new Server(
    { name: "governance-vault-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = req.params.arguments || {};
    if (name === "memory_ingest") {
      const result = ingest(args.title, args.insights);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (name === "memory_recall") {
      const result = recall(args.query);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    return {
      isError: true,
      content: [{ type: "text", text: `unknown tool ${name}` }],
    };
  });
  return server;
}

async function runHttp(port) {
  const http = createServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, vault: VAULT_ROOT }));
      return;
    }
    const server = makeServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      let parsedBody;
      if (raw.length) {
        try {
          parsedBody = JSON.parse(raw.toString("utf8"));
        } catch {
          parsedBody = undefined;
        }
      }
      await server.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (err) {
      void transport.close();
      void server.close();
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(err?.message ?? err) }));
      }
    }
  });
  await new Promise((resolve) => http.listen(port, "0.0.0.0", resolve));
  const addr = http.address();
  process.stderr.write(
    `[governance-vault-mcp] ready http://127.0.0.1:${addr.port}/mcp vault=${VAULT_ROOT}\n`
  );
}

const args = process.argv.slice(2);
const pIdx = args.indexOf("--port");
const port = pIdx >= 0 ? Number(args[pIdx + 1]) || 18780 : 18780;
await runHttp(port);
