#!/usr/bin/env node
/**
 * One-shot MCP tool call for Cursor-subagent real-model sessions.
 * Env: CF_MT_REAL_MCP_URL
 *
 *   node real-model-mcp-cli.mjs execute '{"operationId":"…","where":"…"}'
 *   node real-model-mcp-cli.mjs list-tools
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.CF_MT_REAL_MCP_URL;
if (!url) {
  console.error(JSON.stringify({ ok: false, error: "CF_MT_REAL_MCP_URL unset" }));
  process.exit(2);
}

const [cmd, argJson] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: real-model-mcp-cli.mjs list-tools | execute <json> | execute_program <json>");
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL(url));
const client = new Client({ name: "cf-real-cli", version: "1" }, {});
await client.connect(transport);
try {
  if (cmd === "list-tools") {
    const listed = await client.listTools();
    console.log(
      JSON.stringify(
        listed.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        null,
        2
      )
    );
  } else if (cmd === "execute" || cmd === "execute_program" || cmd === "search") {
    let args = {};
    try {
      args = JSON.parse(argJson || "{}");
    } catch (e) {
      console.error(JSON.stringify({ ok: false, error: `bad json: ${e.message}` }));
      process.exit(2);
    }
    if (cmd === "execute" && (args.args === undefined || args.args === null)) {
      args = { ...args, args: {} };
    }
    const res = await client.callTool({ name: cmd, arguments: args });
    const text = (res?.content || [])
      .filter((c) => c?.type === "text")
      .map((c) => c.text)
      .join("\n");
    console.log(text);
    if (res.isError) process.exit(1);
  } else {
    console.error(JSON.stringify({ ok: false, error: `unknown cmd ${cmd}` }));
    process.exit(2);
  }
} finally {
  await client.close().catch(() => {});
}
