#!/usr/bin/env node
/**
 * Call ClawQL's `memory_recall` tool over gRPC `model_context_protocol.Mcp/CallTool`.
 *
 * Uses protobufjs to encode `CallToolRequest` (including nested `google.protobuf.Struct`
 * / `Value`). Plain objects passed through `@grpc/proto-loader` serializers can lose
 * nested `Value` fields on the wire; encoding with protobufjs avoids that.
 *
 * Env: GRPC_HOST (default 127.0.0.1), GRPC_PORT (default 50051),
 *      MCP_PROTOCOL_VERSION (default: first entry in SUPPORTED_PROTOCOL_VERSIONS).
 *
 * Server: use **mcp-grpc-transport ≥ 0.1.1** (or current ClawQL workspace) and **restart**
 * the gRPC process after upgrading. Older builds dropped `google.protobuf.Struct.fields`
 * when decoded as a JavaScript **Map**, so `query` arrived undefined on the server.
 */

import * as grpc from "@grpc/grpc-js";
import protobuf from "protobufjs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

const METHOD = "/model_context_protocol.Mcp/CallTool";

function usage() {
  console.error(`Usage: grpc-memory-recall.mjs <query> [options]

Options:
  --host <host>           Target host (${process.env.GRPC_HOST ?? "127.0.0.1"} from GRPC_HOST)
  --port <port>           Target port (${process.env.GRPC_PORT ?? "50051"} from GRPC_PORT)
  --limit <n>             Max notes (memory_recall)
  --max-depth <n>         Wikilink hops (memory_recall)
  --min-score <n>         Min keyword score (memory_recall)
  --protocol-version <v>  mcp-protocol-version metadata (${process.env.MCP_PROTOCOL_VERSION ?? SUPPORTED_PROTOCOL_VERSIONS[0]})
  -h, --help              Show this help

Example:
  node scripts/dev/grpc-memory-recall.mjs "roadmap notes" --limit 8
  GRPC_PORT=50051 node scripts/dev/grpc-memory-recall.mjs "search terms"

If the tool returns Invalid arguments / query / undefined, the gRPC process is likely
using mcp-grpc-transport before 0.1.1: install 0.1.1+, rebuild, restart ENABLE_GRPC,
or run from this repo so node_modules uses the workspace package.
`);
}

/** Build `google.protobuf.Struct` fields for memory_recall (camelCase keys). */
function memoryRecallStructFields({ query, limit, maxDepth, minScore }) {
  const fields = {
    query: { stringValue: String(query) },
  };
  if (limit !== undefined) fields.limit = { numberValue: Number(limit) };
  if (maxDepth !== undefined) fields.maxDepth = { numberValue: Number(maxDepth) };
  if (minScore !== undefined) fields.minScore = { numberValue: Number(minScore) };
  return fields;
}

async function loadProtoTypes() {
  const require = createRequire(import.meta.url);
  const wellKnown = dirname(require.resolve("google-proto-files/package.json"));
  const protoRoot = join(repoRoot, "packages/mcp-grpc-transport/proto");
  const root = new protobuf.Root();
  await root.load(join(protoRoot, "model_context_protocol/mcp.proto"), {
    keepCase: true,
    includeDirs: [protoRoot, wellKnown],
  });
  const CallToolRequest = root.lookupType("model_context_protocol.CallToolRequest");
  const CallToolResponse = root.lookupType("model_context_protocol.CallToolResponse");
  return { CallToolRequest, CallToolResponse };
}

function main() {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      host: { type: "string" },
      port: { type: "string" },
      limit: { type: "string" },
      "max-depth": { type: "string" },
      "min-score": { type: "string" },
      "protocol-version": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: true,
  });

  if (parsed.values.help) {
    usage();
    process.exit(0);
  }

  const positionals = parsed.positionals;
  if (positionals.length === 0) {
    usage();
    process.exit(1);
  }

  const query = positionals.join(" ").trim();
  if (!query) {
    console.error("Error: empty query.");
    process.exit(1);
  }

  const host = parsed.values.host ?? process.env.GRPC_HOST ?? "127.0.0.1";
  const port = parsed.values.port ?? process.env.GRPC_PORT ?? "50051";
  const address = `${host}:${port}`;

  const limit =
    parsed.values.limit !== undefined ? Number.parseInt(parsed.values.limit, 10) : undefined;
  const maxDepth =
    parsed.values["max-depth"] !== undefined
      ? Number.parseInt(parsed.values["max-depth"], 10)
      : undefined;
  const minScore =
    parsed.values["min-score"] !== undefined
      ? Number.parseFloat(parsed.values["min-score"])
      : undefined;

  for (const [name, v] of [
    ["--limit", limit],
    ["--max-depth", maxDepth],
  ]) {
    if (v !== undefined && !Number.isFinite(v)) {
      console.error(`Error: ${name} must be a number.`);
      process.exit(1);
    }
  }
  if (minScore !== undefined && !Number.isFinite(minScore)) {
    console.error("Error: --min-score must be a number.");
    process.exit(1);
  }

  const protocolVersion =
    parsed.values["protocol-version"] ??
    process.env.MCP_PROTOCOL_VERSION ??
    SUPPORTED_PROTOCOL_VERSIONS[0];

  void (async () => {
    const { CallToolRequest, CallToolResponse } = await loadProtoTypes();

    const payload = {
      common: {},
      request: {
        name: "memory_recall",
        arguments: {
          fields: memoryRecallStructFields({ query, limit, maxDepth, minScore }),
        },
      },
    };

    const err = CallToolRequest.verify(payload);
    if (err) {
      console.error("CallToolRequest.verify:", err);
      process.exit(1);
    }

    /** Single encoded frame — avoids any chance the client stack mutates `payload` before serialize. */
    const encodedRequest = Buffer.from(CallToolRequest.encode(CallToolRequest.fromObject(payload)).finish());

    const client = new grpc.Client(address, grpc.credentials.createInsecure());
    await new Promise((resolve, reject) => {
      client.waitForReady(Date.now() + 10_000, (e) => (e ? reject(e) : resolve()));
    });

    const metadata = new grpc.Metadata();
    metadata.set("mcp-protocol-version", protocolVersion);

    const serialize = () => encodedRequest;

    const deserialize = (buf) => CallToolResponse.decode(buf);

    const stream = client.makeServerStreamRequest(
      METHOD,
      serialize,
      deserialize,
      {},
      metadata
    );

    stream.on("data", (msg) => {
      const obj = CallToolResponse.toObject(msg, {
        defaults: true,
        enums: String,
        longs: String,
      });
      const text = JSON.stringify(obj);
      if (
        obj.is_error === true &&
        text.includes('"query"') &&
        text.includes("undefined") &&
        text.includes("Invalid arguments")
      ) {
        console.error(
          "[grpc-memory-recall] Server rejected tool args (query missing). Upgrade mcp-grpc-transport to 0.1.1+, rebuild, and restart the gRPC server (see script header comment)."
        );
      }
      console.log(JSON.stringify(obj, null, 2));
    });

    stream.on("error", (e) => {
      console.error(e);
      client.close();
      process.exit(1);
    });

    stream.on("end", () => {
      client.close();
    });
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

main();
