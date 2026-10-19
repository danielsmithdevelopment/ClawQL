#!/usr/bin/env node
/**
 * Equal-arm vault MCP with optional tool deny — peer best-config stand-in.
 *
 * Same Obsidian Memory/ surface as governance vault-mcp.mjs, but tools listed
 * in DENY_TOOLS (comma-separated) return isError. Used when a peer has no
 * built-in vault deny of its own (Executor) or as a local deny target.
 *
 *   VAULT_ROOT=/tmp/... DENY_TOOLS=memory_ingest node deny-tools-mcp.mjs --http --port 18794
 */
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const VAULT_ROOT = resolve(process.env.VAULT_ROOT || join(process.cwd(), "vault"));
mkdirSync(join(VAULT_ROOT, "Memory"), { recursive: true });

const DENY = new Set(
  String(process.env.DENY_TOOLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

const TOOLS = [
  {
    name: "memory_ingest",
    description:
      "Write a Markdown note into the vault Memory/ folder (Obsidian equal-arm).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        insights: { type: "string" },
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
      properties: { query: { type: "string" } },
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
  writeFileSync(file, `# ${title}\n\n${insights || ""}\n`, "utf8");
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
    { name: "mai-deny-tools-vault-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = req.params.arguments || {};
    if (DENY.has(name)) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Panguard policy blocked tool: ${name} (DENY_TOOLS peer best-config stand-in)`,
          },
        ],
      };
    }
    if (name === "memory_ingest") {
      return {
        content: [{ type: "text", text: JSON.stringify(ingest(args.title, args.insights)) }],
      };
    }
    if (name === "memory_recall") {
      return {
        content: [{ type: "text", text: JSON.stringify(recall(args.query)) }],
      };
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
      res.end(
        JSON.stringify({
          ok: true,
          vault: VAULT_ROOT,
          deny_tools: [...DENY],
        })
      );
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
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(e?.message ?? e) }));
      }
    }
  });
  await new Promise((r) => http.listen(port, "127.0.0.1", r));
  process.stderr.write(
    `[mai-deny-tools-mcp] ready http://127.0.0.1:${port}/mcp vault=${VAULT_ROOT} deny=${[...DENY].join(",") || "(none)"}\n`
  );
}

const args = process.argv.slice(2);
const httpIdx = args.indexOf("--http");
const portIdx = args.indexOf("--port");
if (httpIdx >= 0) {
  const port = Number(portIdx >= 0 ? args[portIdx + 1] : 18794) || 18794;
  runHttp(port).catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  console.error(
    `usage: ${fileURLToPath(import.meta.url)} --http --port N`
  );
  process.exit(2);
}
