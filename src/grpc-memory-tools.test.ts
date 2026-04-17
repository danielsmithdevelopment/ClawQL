/**
 * gRPC `CallTool` integration: `memory_ingest` and `memory_recall` with
 * protobufjs-encoded `google.protobuf.Struct` (same wire path as `scripts/grpc-memory-recall.mjs`).
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import protobuf from "protobufjs";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maybeStartGrpcMcpServer } from "mcp-grpc-transport";
import { createRegisteredMcpServer } from "./mcp-server-factory.js";
import { resetSpecCache } from "./spec-loader.js";
import { resetSchemaFieldCache } from "./tools.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const minimalSpec = join(here, "test-utils/fixtures/minimal-petstore.json");
const protoRoot = join(root, "packages/mcp-grpc-transport/proto");

const CALL_TOOL = "/model_context_protocol.Mcp/CallTool";

type StructFields = Record<string, { stringValue?: string; numberValue?: number; boolValue?: boolean }>;

function argsToStructFields(args: Record<string, unknown>): StructFields {
  const fields: StructFields = {};
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined) continue;
    if (typeof v === "string") fields[k] = { stringValue: v };
    else if (typeof v === "number" && Number.isFinite(v)) fields[k] = { numberValue: v };
    else if (typeof v === "boolean") fields[k] = { boolValue: v };
  }
  return fields;
}

async function loadCallToolTypes(): Promise<{
  CallToolRequest: protobuf.Type;
  CallToolResponse: protobuf.Type;
}> {
  const require = createRequire(import.meta.url);
  const wellKnown = dirname(require.resolve("google-proto-files/package.json"));
  const pbRoot = new protobuf.Root();
  await pbRoot.load(join(protoRoot, "model_context_protocol/mcp.proto"), {
    keepCase: true,
    includeDirs: [protoRoot, wellKnown],
  });
  return {
    CallToolRequest: pbRoot.lookupType("model_context_protocol.CallToolRequest"),
    CallToolResponse: pbRoot.lookupType("model_context_protocol.CallToolResponse"),
  };
}

function toObjectMessages(
  CallToolResponse: protobuf.Type,
  raw: protobuf.Message[]
): Record<string, unknown>[] {
  return raw.map((msg) =>
    CallToolResponse.toObject(msg, { defaults: true, enums: String, longs: String })
  ) as Record<string, unknown>[];
}

function lastNonEmptyToolText(messages: Record<string, unknown>[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i]?.content as
      | Array<{ text?: { text?: string } }>
      | undefined;
    if (!content?.length) continue;
    const t = content[0]?.text?.text;
    if (typeof t === "string" && t.length > 0) return t;
  }
  return "";
}

async function callToolGrpc(
  address: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const { CallToolRequest, CallToolResponse } = await loadCallToolTypes();
  const payload = {
    common: {},
    request: {
      name: toolName,
      arguments: { fields: argsToStructFields(args) },
    },
  };
  const verr = CallToolRequest.verify(payload);
  if (verr) throw new Error(String(verr));

  const client = new grpc.Client(address, grpc.credentials.createInsecure());
  await new Promise<void>((resolve, reject) => {
    client.waitForReady(Date.now() + 15_000, (e) => (e ? reject(e) : resolve()));
  });
  const md = new grpc.Metadata();
  md.set("mcp-protocol-version", SUPPORTED_PROTOCOL_VERSIONS[0]!);

  const serialize = (req: object) =>
    Buffer.from(CallToolRequest.encode(CallToolRequest.create(req)).finish());
  const deserialize = (buf: Buffer) => CallToolResponse.decode(buf);

  const stream = client.makeServerStreamRequest(
    CALL_TOOL,
    serialize,
    deserialize,
    payload,
    md
  );

  const decoded: protobuf.Message[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on("data", (msg: protobuf.Message) => decoded.push(msg));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  client.close();

  return toObjectMessages(CallToolResponse, decoded);
}

describe("gRPC CallTool + memory_ingest / memory_recall", () => {
  const saved: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    Object.assign(saved, process.env);
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";
    process.env.CLAWQL_SPEC_PATH = minimalSpec;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATHS;
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-grpc-mem-"));
    resetSpecCache();
    resetSchemaFieldCache();
  });

  afterEach(() => {
    process.env = { ...saved };
    resetSpecCache();
    resetSchemaFieldCache();
  });

  it(
    "memory_ingest succeeds with Struct args over CallTool",
    async () => {
      const started = await maybeStartGrpcMcpServer({
        createMcpServer: createRegisteredMcpServer,
        bindAddress: "127.0.0.1:0",
      });
      if (!started) throw new Error("expected gRPC server");

      try {
        const messages = await callToolGrpc(started.address, "memory_ingest", {
          title: "Grpc Ingest Note",
          insights: "grpc-memory-tools test body",
        });
        const text = lastNonEmptyToolText(messages);
        expect(text).toContain('"ok": true');
        expect(text).toContain("Memory/");
      } finally {
        await started.shutdown();
      }
    },
    30_000
  );

  it(
    "memory_recall succeeds with Struct args over CallTool (after ingest)",
    async () => {
      const token = `grpc-recall-${Date.now()}`;
      const started = await maybeStartGrpcMcpServer({
        createMcpServer: createRegisteredMcpServer,
        bindAddress: "127.0.0.1:0",
      });
      if (!started) throw new Error("expected gRPC server");

      try {
        const ingestMessages = await callToolGrpc(started.address, "memory_ingest", {
          title: "Recall Seed",
          insights: `unique ${token} content for recall`,
        });
        const ingestText = lastNonEmptyToolText(ingestMessages);
        expect(ingestText).toContain('"ok": true');

        const recallMessages = await callToolGrpc(started.address, "memory_recall", {
          query: token,
          limit: 10,
        });
        const recallText = lastNonEmptyToolText(recallMessages);
        expect(recallText).toContain('"ok": true');
        expect(recallText.toLowerCase()).toContain(token.toLowerCase());
      } finally {
        await started.shutdown();
      }
    },
    30_000
  );
});
