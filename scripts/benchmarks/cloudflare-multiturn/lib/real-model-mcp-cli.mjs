#!/usr/bin/env node
/**
 * One-shot MCP tool call for Cursor-subagent real-model sessions.
 * Env: CF_MT_REAL_MCP_URL
 * Optional: CF_MT_REAL_CALL_LOG=/path/to/calls.jsonl — append tokenized call records
 *
 *   node real-model-mcp-cli.mjs execute '{"operationId":"…","where":"…"}'
 *   node real-model-mcp-cli.mjs list-tools
 */
import { appendFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getEncoding } from "js-tiktoken";

const enc = getEncoding("cl100k_base");
function countTokens(text) {
  return enc.encode(typeof text === "string" ? text : JSON.stringify(text ?? "")).length;
}

const url = process.env.CF_MT_REAL_MCP_URL;
if (!url) {
  console.error(JSON.stringify({ ok: false, error: "CF_MT_REAL_MCP_URL unset" }));
  process.exit(2);
}

const [cmd, argJson] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: real-model-mcp-cli.mjs list-tools | execute <json> | execute_program <json> | search <json>");
  process.exit(2);
}

const bearer =
  process.env.CF_MT_REAL_MCP_BEARER?.trim() ||
  process.env.EXECUTOR_V2_API_KEY?.trim() ||
  "";
const transport = new StreamableHTTPClientTransport(
  new URL(url),
  bearer
    ? { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }
    : undefined
);
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
    const callLog = process.env.CF_MT_REAL_CALL_LOG?.trim();
    if (callLog) {
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* raw */
      }
      const where = typeof args.where === "string" ? args.where : "";
      const fields = Array.isArray(args.fields) ? args.fields : undefined;
      const js = typeof args.code === "string" ? args.code : "";
      const source = typeof args.source === "string" ? args.source : "";
      const callArgs =
        args.args && typeof args.args === "object" && !Array.isArray(args.args) ? args.args : {};
      // Fan-out gate: charge full execute args JSON (parity with scripted board / plan).
      const parity = (process.env.CF_MT_REAL_CODE_PARITY || "").trim().toLowerCase();
      let codeText;
      if (parity === "execute_args" && cmd === "execute") {
        codeText = JSON.stringify({
          operationId: args.operationId,
          args: callArgs,
          where,
        });
      } else if (parity === "execute_args" && cmd === "execute_program") {
        codeText = source;
      } else {
        codeText = [where, fields ? JSON.stringify(fields) : "", js, source]
          .filter(Boolean)
          .join("\n");
      }
      const record = {
        t: new Date().toISOString(),
        tool: cmd,
        operationId: args.operationId || null,
        where,
        where_malformed: parsed?.status === "where_invalid",
        isError: Boolean(res.isError),
        code_tokens: countTokens(codeText),
        result_tokens: countTokens(text),
        result_chars: text.length,
      };
      appendFileSync(callLog, `${JSON.stringify(record)}\n`);
    }
    console.log(text);
    if (res.isError) process.exit(1);
  } else {
    console.error(JSON.stringify({ ok: false, error: `unknown cmd ${cmd}` }));
    process.exit(2);
  }
} finally {
  await client.close().catch(() => {});
}
