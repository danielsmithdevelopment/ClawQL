/**
 * gRPC ListTools: optional `schedule` appears when `CLAWQL_ENABLE_SCHEDULE=1` (#76).
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { maybeStartGrpcMcpServer } from "mcp-grpc-transport";
import { createRegisteredMcpServer } from "./mcp-server-factory.js";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { resetSpecCache } from "./spec-loader.js";
import { resetSchemaFieldCache } from "./tools.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const minimalSpec = join(here, "test-utils", "fixtures", "minimal-petstore.json");
const protoRoot = join(root, "packages/mcp-grpc-transport/proto");

function loadMcpClientConstructor(): grpc.ServiceClientConstructor {
  const require = createRequire(import.meta.url);
  const grpcWorkspaceRoot = join(root, "packages/mcp-grpc-transport");
  const wellKnownProtoRoot = dirname(
    require.resolve("google-proto-files/package.json", { paths: [grpcWorkspaceRoot] })
  );
  const def = protoLoader.loadSync([join(protoRoot, "model_context_protocol/mcp.proto")], {
    includeDirs: [protoRoot, wellKnownProtoRoot],
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(def) as {
    model_context_protocol: { Mcp: grpc.ServiceClientConstructor };
  };
  return loaded.model_context_protocol.Mcp;
}

describe("gRPC ListTools schedule parity (#76)", () => {
  const saved: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    Object.assign(saved, process.env);
    process.env.ENABLE_GRPC = "1";
    process.env.ENABLE_GRPC_REFLECTION = "0";
    process.env.CLAWQL_SPEC_PATH = minimalSpec;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATHS;
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = mkdtempSync(join(tmpdir(), "clawql-grpc-schedule-"));
    process.env.CLAWQL_ENABLE_SCHEDULE = "1";
    process.env.CLAWQL_SCHEDULE_DB_PATH = join(
      process.env.CLAWQL_OBSIDIAN_VAULT_PATH,
      "schedule.db"
    );
    resetSpecCache();
    resetSchemaFieldCache();
  });

  afterEach(() => {
    process.env = { ...saved };
    resetSpecCache();
    resetSchemaFieldCache();
  });

  it("ListTools includes schedule when CLAWQL_ENABLE_SCHEDULE=1", async () => {
    const started = await maybeStartGrpcMcpServer({
      createMcpServer: createRegisteredMcpServer,
      bindAddress: "127.0.0.1:0",
    });
    if (!started) throw new Error("expected gRPC server");

    const Mcp = loadMcpClientConstructor();
    const client = new Mcp(started.address, grpc.credentials.createInsecure());
    const md = new grpc.Metadata();
    md.set("mcp-protocol-version", SUPPORTED_PROTOCOL_VERSIONS[0]!);

    try {
      const out = await new Promise<{ tools?: { name?: string }[] }>((resolve, reject) => {
        client.listTools({ common: {} }, md, (err, res) => {
          if (err) reject(err);
          else resolve(res as { tools?: { name?: string }[] });
        });
      });
      const names = new Set((out.tools ?? []).map((t) => t.name));
      expect(names.has("schedule")).toBe(true);
    } finally {
      client.close();
      await started.shutdown();
    }
  }, 30_000);
});
