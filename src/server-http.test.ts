import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  recordNativeGraphqlExecute,
  resetNativeProtocolMetricsForTests,
} from "./native-protocol-metrics.js";
import { createMcpHttpApp } from "./server-http.js";
import { resetSpecCache } from "./spec-loader.js";
import { resetSchemaFieldCache } from "./tools.js";

/**
 * Close the HTTP server without hanging the Vitest worker: undici/fetch can leave
 * keep-alive sockets open; `close()` alone may wait indefinitely. Destroying
 * connections first avoids EnvironmentTeardownError (RPC pending onUserConsoleLog).
 */
function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

const here = dirname(fileURLToPath(import.meta.url));
const minimalSpec = join(here, "test-utils/fixtures/minimal-petstore.json");

describe("server-http", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.CLAWQL_SPEC_PATH = process.env.CLAWQL_SPEC_PATH;
    saved.CLAWQL_PROVIDER = process.env.CLAWQL_PROVIDER;
    saved.CLAWQL_SPEC_PATHS = process.env.CLAWQL_SPEC_PATHS;
    saved.CLAWQL_CORS_ALLOW_ORIGIN = process.env.CLAWQL_CORS_ALLOW_ORIGIN;
    process.env.CLAWQL_SPEC_PATH = minimalSpec;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATHS;
    delete process.env.CLAWQL_CORS_ALLOW_ORIGIN;
    resetSpecCache();
    resetSchemaFieldCache();
  });

  afterEach(() => {
    for (const key of Object.keys(saved)) {
      const v = saved[key as keyof typeof saved];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
    resetSpecCache();
    resetSchemaFieldCache();
  });

  async function withHttpServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
    const app = await createMcpHttpApp({ mcpPath: "/mcp" });
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected TCP address");
    const baseUrl = `http://127.0.0.1:${addr.port}`;
    try {
      await run(baseUrl);
    } finally {
      await closeHttpServer(server);
    }
  }

  it("POST /graphql returns schema introspection", async () => {
    await withHttpServer(async (base) => {
      const res = await fetch(`${base}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "{ __schema { queryType { name } } }",
        }),
      });
      expect(res.ok).toBe(true);
      const body = (await res.json()) as {
        data?: { __schema?: { queryType?: { name?: string } } };
      };
      expect(body.data?.__schema?.queryType?.name).toBeTruthy();
    });
  });

  it("GET /healthz returns ok and endpoint path", async () => {
    await withHttpServer(async (base) => {
      const res = await fetch(`${base}/healthz`);
      expect(res.ok).toBe(true);
      const body = (await res.json()) as {
        status: string;
        endpoint: string;
      };
      expect(body.status).toBe("ok");
      expect(body.endpoint).toBe("/mcp");
    });
  });

  it("GET /metrics returns Prometheus native-protocol metrics", async () => {
    await withHttpServer(async (base) => {
      const res = await fetch(`${base}/metrics`);
      expect(res.ok).toBe(true);
      expect(res.headers.get("content-type")).toMatch(/text\/plain/);
      const text = await res.text();
      expect(text).toContain("# HELP clawql_native_protocol_graphql_merge_operations");
      expect(text).toContain("# HELP clawql_native_protocol_grpc_execute_total");
    });
  });

  it("GET /metrics is not mounted when CLAWQL_DISABLE_HTTP_METRICS=1", async () => {
    const saved = process.env.CLAWQL_DISABLE_HTTP_METRICS;
    process.env.CLAWQL_DISABLE_HTTP_METRICS = "1";
    try {
      await withHttpServer(async (base) => {
        const res = await fetch(`${base}/metrics`);
        expect(res.status).toBe(404);
      });
    } finally {
      if (saved === undefined) delete process.env.CLAWQL_DISABLE_HTTP_METRICS;
      else process.env.CLAWQL_DISABLE_HTTP_METRICS = saved;
    }
  });

  it("GET /healthz includes nativeProtocolMetrics when CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS=1", async () => {
    const saved = process.env.CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS;
    process.env.CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS = "1";
    resetNativeProtocolMetricsForTests();
    try {
      await withHttpServer(async (base) => {
        const res = await fetch(`${base}/healthz`);
        expect(res.ok).toBe(true);
        const body = (await res.json()) as {
          status?: string;
          nativeProtocolMetrics?: Record<string, unknown>;
        };
        expect(body.status).toBe("ok");
        expect(body.nativeProtocolMetrics).toEqual({
          graphqlMergedOperations: 0,
          grpcMergedOperations: 0,
          graphqlExecuteOk: 0,
          graphqlExecuteErr: 0,
          grpcExecuteOk: 0,
          grpcExecuteErr: 0,
          graphqlBySource: {},
          grpcBySource: {},
        });
      });
    } finally {
      if (saved === undefined) delete process.env.CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS;
      else process.env.CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS = saved;
    }
  });

  it("GET /healthz nativeProtocolMetrics reflects in-process counters after recordNativeGraphqlExecute", async () => {
    const saved = process.env.CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS;
    process.env.CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS = "1";
    resetNativeProtocolMetricsForTests();
    try {
      await withHttpServer(async (base) => {
        recordNativeGraphqlExecute(true, "vitest-gql-source");
        const res = await fetch(`${base}/healthz`);
        expect(res.ok).toBe(true);
        const body = (await res.json()) as {
          nativeProtocolMetrics?: {
            graphqlExecuteOk?: number;
            graphqlBySource?: Record<string, { executeOk: number }>;
          };
        };
        expect(body.nativeProtocolMetrics?.graphqlExecuteOk).toBe(1);
        expect(body.nativeProtocolMetrics?.graphqlBySource?.["vitest-gql-source"]?.executeOk).toBe(
          1
        );
      });
    } finally {
      if (saved === undefined) delete process.env.CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS;
      else process.env.CLAWQL_HEALTHZ_NATIVE_PROTOCOL_METRICS = saved;
      resetNativeProtocolMetricsForTests();
    }
  });

  it("GET /healthz optional merkle when CLAWQL_HEALTHZ_MEMORY_ARTIFACTS=1", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-hz-"));
    const savedVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    const savedMerkle = process.env.CLAWQL_MERKLE_ENABLED;
    const savedHz = process.env.CLAWQL_HEALTHZ_MEMORY_ARTIFACTS;
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    process.env.CLAWQL_MERKLE_ENABLED = "1";
    process.env.CLAWQL_HEALTHZ_MEMORY_ARTIFACTS = "1";
    await mkdir(join(dir, "Memory"), { recursive: true });
    await writeFile(join(dir, "Memory/a.md"), "# A\n", "utf8");
    const { syncMemoryDbFromDocuments } = await import("./memory-db.js");
    const text = await readFile(join(dir, "Memory/a.md"), "utf8");
    await syncMemoryDbFromDocuments(dir, [{ path: "Memory/a.md", text, mtimeMs: 1 }]);
    try {
      await withHttpServer(async (base) => {
        const res = await fetch(`${base}/healthz`);
        expect(res.ok).toBe(true);
        const body = (await res.json()) as { merkleSnapshot?: { rootHex: string } };
        expect(body.merkleSnapshot?.rootHex).toMatch(/^[0-9a-f]{64}$/);
      });
    } finally {
      if (savedVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
      else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = savedVault;
      if (savedMerkle === undefined) delete process.env.CLAWQL_MERKLE_ENABLED;
      else process.env.CLAWQL_MERKLE_ENABLED = savedMerkle;
      if (savedHz === undefined) delete process.env.CLAWQL_HEALTHZ_MEMORY_ARTIFACTS;
      else process.env.CLAWQL_HEALTHZ_MEMORY_ARTIFACTS = savedHz;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("GET /healthz includes cuckoo metrics when CLAWQL_HEALTHZ_MEMORY_ARTIFACTS and Cuckoo enabled", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-hz-"));
    const savedVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    const savedCuckoo = process.env.CLAWQL_CUCKOO_ENABLED;
    const savedHz = process.env.CLAWQL_HEALTHZ_MEMORY_ARTIFACTS;
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = dir;
    process.env.CLAWQL_CUCKOO_ENABLED = "1";
    process.env.CLAWQL_HEALTHZ_MEMORY_ARTIFACTS = "1";
    await mkdir(join(dir, "Memory"), { recursive: true });
    await writeFile(join(dir, "Memory/a.md"), "# A\n", "utf8");
    const { syncMemoryDbFromDocuments } = await import("./memory-db.js");
    const text = await readFile(join(dir, "Memory/a.md"), "utf8");
    await syncMemoryDbFromDocuments(dir, [{ path: "Memory/a.md", text, mtimeMs: 1 }]);
    try {
      await withHttpServer(async (base) => {
        const res = await fetch(`${base}/healthz`);
        expect(res.ok).toBe(true);
        const body = (await res.json()) as {
          cuckooMembershipArtifactsEnabled?: boolean;
          cuckooMetrics?: { rebuildCount: number };
          cuckooFilterPersistedAt?: string;
        };
        expect(body.cuckooMembershipArtifactsEnabled).toBe(true);
        expect(body.cuckooMetrics?.rebuildCount).toBeGreaterThanOrEqual(1);
        expect(body.cuckooFilterPersistedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
      });
    } finally {
      if (savedVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
      else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = savedVault;
      if (savedCuckoo === undefined) delete process.env.CLAWQL_CUCKOO_ENABLED;
      else process.env.CLAWQL_CUCKOO_ENABLED = savedCuckoo;
      if (savedHz === undefined) delete process.env.CLAWQL_HEALTHZ_MEMORY_ARTIFACTS;
      else process.env.CLAWQL_HEALTHZ_MEMORY_ARTIFACTS = savedHz;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("POST /mcp initialize allocates mcp-session-id", async () => {
    await withHttpServer(async (base) => {
      const res = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "vitest", version: "1.0.0" },
          },
        }),
      });
      expect(res.ok).toBe(true);
      expect(res.headers.get("mcp-session-id")).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });
  });

  it("POST /mcp without session rejects non-initialize", async () => {
    await withHttpServer(async (base) => {
      const res = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        }),
      });
      expect(res.status).toBe(400);
    });
  });

  it("OPTIONS /mcp returns 204 when CLAWQL_CORS_ALLOW_ORIGIN=*", async () => {
    process.env.CLAWQL_CORS_ALLOW_ORIGIN = "*";
    await withHttpServer(async (base) => {
      const res = await fetch(`${base}/mcp`, { method: "OPTIONS" });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Expose-Headers") ?? "").toMatch(/mcp-session-id/i);
    });
  });

  it("POST /mcp initialize includes CORS headers when CLAWQL_CORS_ALLOW_ORIGIN=*", async () => {
    process.env.CLAWQL_CORS_ALLOW_ORIGIN = "*";
    await withHttpServer(async (base) => {
      const res = await fetch(`${base}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "vitest", version: "1.0.0" },
          },
        }),
      });
      expect(res.ok).toBe(true);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  it("streamable HTTP listTools includes sandbox_exec when CLAWQL_ENABLE_SANDBOX=1", async () => {
    const vaultDir = mkdtempSync(join(tmpdir(), "clawql-http-sandbox-"));
    const savedSandbox = process.env.CLAWQL_ENABLE_SANDBOX;
    const savedVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    process.env.CLAWQL_ENABLE_SANDBOX = "1";
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vaultDir;
    await mkdir(join(vaultDir, "Memory"), { recursive: true });
    resetSpecCache();
    resetSchemaFieldCache();
    try {
      await withHttpServer(async (base) => {
        const { StreamableHTTPClientTransport } =
          await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
        const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
        const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
        const client = new Client({ name: "vitest-http-sandbox", version: "1.0.0" }, {});
        await client.connect(transport);
        try {
          const { tools } = await client.listTools();
          const names = new Set(tools.map((t) => t.name));
          expect(names.has("sandbox_exec")).toBe(true);
        } finally {
          await client.close();
        }
      });
    } finally {
      await rm(vaultDir, { recursive: true, force: true }).catch(() => {});
      if (savedSandbox === undefined) delete process.env.CLAWQL_ENABLE_SANDBOX;
      else process.env.CLAWQL_ENABLE_SANDBOX = savedSandbox;
      if (savedVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
      else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = savedVault;
      resetSpecCache();
      resetSchemaFieldCache();
    }
  }, 25_000);

  it("streamable HTTP listTools includes notify when CLAWQL_ENABLE_NOTIFY=1 (#140)", async () => {
    const vaultDir = mkdtempSync(join(tmpdir(), "clawql-http-notify-"));
    const savedNotify = process.env.CLAWQL_ENABLE_NOTIFY;
    const savedVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    process.env.CLAWQL_ENABLE_NOTIFY = "1";
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vaultDir;
    await mkdir(join(vaultDir, "Memory"), { recursive: true });
    resetSpecCache();
    resetSchemaFieldCache();
    try {
      await withHttpServer(async (base) => {
        const { StreamableHTTPClientTransport } =
          await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
        const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
        const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
        const client = new Client({ name: "vitest-http-notify", version: "1.0.0" }, {});
        await client.connect(transport);
        try {
          const { tools } = await client.listTools();
          const names = new Set(tools.map((t) => t.name));
          expect(names.has("notify")).toBe(true);
        } finally {
          await client.close();
        }
      });
    } finally {
      await rm(vaultDir, { recursive: true, force: true }).catch(() => {});
      if (savedNotify === undefined) delete process.env.CLAWQL_ENABLE_NOTIFY;
      else process.env.CLAWQL_ENABLE_NOTIFY = savedNotify;
      if (savedVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
      else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = savedVault;
      resetSpecCache();
      resetSchemaFieldCache();
    }
  }, 25_000);

  it("streamable HTTP listTools includes knowledge_search_onyx when CLAWQL_ENABLE_ONYX=1 (#144)", async () => {
    const vaultDir = mkdtempSync(join(tmpdir(), "clawql-http-onyx-"));
    const savedOnyx = process.env.CLAWQL_ENABLE_ONYX;
    const savedVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    process.env.CLAWQL_ENABLE_ONYX = "1";
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vaultDir;
    await mkdir(join(vaultDir, "Memory"), { recursive: true });
    resetSpecCache();
    resetSchemaFieldCache();
    try {
      await withHttpServer(async (base) => {
        const { StreamableHTTPClientTransport } =
          await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
        const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
        const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
        const client = new Client({ name: "vitest-http-onyx", version: "1.0.0" }, {});
        await client.connect(transport);
        try {
          const { tools } = await client.listTools();
          const names = new Set(tools.map((t) => t.name));
          expect(names.has("knowledge_search_onyx")).toBe(true);
        } finally {
          await client.close();
        }
      });
    } finally {
      await rm(vaultDir, { recursive: true, force: true }).catch(() => {});
      if (savedOnyx === undefined) delete process.env.CLAWQL_ENABLE_ONYX;
      else process.env.CLAWQL_ENABLE_ONYX = savedOnyx;
      if (savedVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
      else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = savedVault;
      resetSpecCache();
      resetSchemaFieldCache();
    }
  }, 25_000);

  it("streamable HTTP listTools includes ouroboros_* when CLAWQL_ENABLE_OUROBOROS=1 (#141)", async () => {
    const vaultDir = mkdtempSync(join(tmpdir(), "clawql-http-ouroboros-"));
    const savedOuro = process.env.CLAWQL_ENABLE_OUROBOROS;
    const savedVault = process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
    process.env.CLAWQL_ENABLE_OUROBOROS = "1";
    process.env.CLAWQL_OBSIDIAN_VAULT_PATH = vaultDir;
    await mkdir(join(vaultDir, "Memory"), { recursive: true });
    resetSpecCache();
    resetSchemaFieldCache();
    try {
      await withHttpServer(async (base) => {
        const { StreamableHTTPClientTransport } =
          await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
        const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
        const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
        const client = new Client({ name: "vitest-http-ouroboros", version: "1.0.0" }, {});
        await client.connect(transport);
        try {
          const { tools } = await client.listTools();
          const names = new Set(tools.map((t) => t.name));
          expect(names.has("ouroboros_create_seed_from_document")).toBe(true);
          expect(names.has("ouroboros_run_evolutionary_loop")).toBe(true);
          expect(names.has("ouroboros_get_lineage_status")).toBe(true);
        } finally {
          await client.close();
        }
      });
    } finally {
      await rm(vaultDir, { recursive: true, force: true }).catch(() => {});
      if (savedOuro === undefined) delete process.env.CLAWQL_ENABLE_OUROBOROS;
      else process.env.CLAWQL_ENABLE_OUROBOROS = savedOuro;
      if (savedVault === undefined) delete process.env.CLAWQL_OBSIDIAN_VAULT_PATH;
      else process.env.CLAWQL_OBSIDIAN_VAULT_PATH = savedVault;
      resetSpecCache();
      resetSchemaFieldCache();
    }
  }, 25_000);
});
