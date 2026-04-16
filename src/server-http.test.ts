import { createServer } from "node:http";
import { once } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpHttpApp } from "./server-http.js";
import { resetSpecCache } from "./spec-loader.js";
import { resetSchemaFieldCache } from "./tools.js";

const here = dirname(fileURLToPath(import.meta.url));
const minimalSpec = join(here, "test-utils/fixtures/minimal-petstore.json");

describe("server-http", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved.CLAWQL_SPEC_PATH = process.env.CLAWQL_SPEC_PATH;
    saved.CLAWQL_PROVIDER = process.env.CLAWQL_PROVIDER;
    saved.CLAWQL_SPEC_PATHS = process.env.CLAWQL_SPEC_PATHS;
    saved.CLAWQL_CORS_ALLOW_ORIGIN = process.env.CLAWQL_CORS_ALLOW_ORIGIN;
    saved.CLAWQL_COMBINED_MODE = process.env.CLAWQL_COMBINED_MODE;
    saved.CLAWQL_GRAPHQL_EXTERNAL_URL = process.env.CLAWQL_GRAPHQL_EXTERNAL_URL;
    process.env.CLAWQL_SPEC_PATH = minimalSpec;
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATHS;
    delete process.env.CLAWQL_CORS_ALLOW_ORIGIN;
    delete process.env.CLAWQL_COMBINED_MODE;
    delete process.env.CLAWQL_GRAPHQL_EXTERNAL_URL;
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
      server.close();
      await once(server, "close");
    }
  }

  it("POST /graphql responds when CLAWQL_COMBINED_MODE=1", async () => {
    process.env.CLAWQL_COMBINED_MODE = "1";
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
});
