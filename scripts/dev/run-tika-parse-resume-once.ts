/**
 * One-shot: MCP `execute(tika_parse_put)` on a PDF.
 *
 * **Transport (default: gRPC)** — large base64 bodies fit protobuf `CallTool` frames better than Streamable HTTP JSON.
 * - **`CLAWQL_MCP_TRANSPORT`**: `grpc` (default) | `http` | `auto` (try gRPC, then HTTP on failure).
 * - gRPC target: **`CLAWQL_MCP_GRPC_ADDR`** (`host:port`) or **`GRPC_HOST`** + **`GRPC_PORT`** (default `127.0.0.1:50051`).
 * - HTTP fallback: **`CLAWQL_MCP_HTTP_URL`** (default `http://127.0.0.1/mcp`).
 *
 * Usage: npx tsx scripts/dev/run-tika-parse-resume-once.ts /path/to/file.pdf
 */
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  callToolServerStreamingGrpc,
  lastNonEmptyCallToolText,
  resolveGrpcAddressFromEnv,
} from "../../packages/mcp-grpc-transport/src/grpc-call-tool-client.js";

const pdfPath =
  process.argv[2] ||
  process.env.RESUME_PDF ||
  `${process.env.HOME}/danielsmithdevelopment.github.io/personal-site/public/Daniel-Smith-Resume-final.pdf`;

const httpUrl = (process.env.CLAWQL_MCP_HTTP_URL || "http://127.0.0.1/mcp").trim();

function transportMode(): "grpc" | "http" | "auto" {
  const raw = (process.env.CLAWQL_MCP_TRANSPORT ?? "grpc").trim().toLowerCase();
  if (raw === "http" || raw === "auto") return raw;
  return "grpc";
}

function executeArgs(body: string) {
  return {
    operationId: "tika_parse_put",
    args: {
      body,
      bodyEncoding: "base64",
      bodyContentType: "application/pdf",
    },
  };
}

async function runHttp(): Promise<string> {
  const body = readFileSync(pdfPath).toString("base64");
  const transport = new StreamableHTTPClientTransport(new URL(httpUrl));
  const client = new Client({ name: "tika-parse-resume-once", version: "1.0.0" }, {});
  await client.connect(transport);
  try {
    const r = await client.callTool({
      name: "execute",
      arguments: executeArgs(body),
    });
    if (r.isError) {
      console.error(JSON.stringify(r, null, 2));
      process.exit(1);
    }
    return r.content?.map((c) => ("text" in c ? c.text : "")).join("\n") ?? "";
  } finally {
    await client.close();
  }
}

async function runGrpc(): Promise<string> {
  const pdf = readFileSync(pdfPath);
  const body = pdf.toString("base64");
  const addr = resolveGrpcAddressFromEnv();
  const messages = await callToolServerStreamingGrpc({
    address: addr,
    toolName: "execute",
    arguments: executeArgs(body),
  });
  return lastNonEmptyCallToolText(messages);
}

async function main() {
  const mode = transportMode();
  let text: string;
  if (mode === "http") {
    text = await runHttp();
  } else if (mode === "auto") {
    try {
      text = await runGrpc();
    } catch (e) {
      console.error("[run-tika-parse-resume-once] gRPC failed, falling back to HTTP:", e);
      text = await runHttp();
    }
  } else {
    text = await runGrpc();
  }

  console.log(text.slice(0, 12_000));
  if (text.length > 12_000) {
    console.error(`\n… truncated (${text.length} chars total in tool response)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
