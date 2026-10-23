/**
 * Regression: sessionful Streamable HTTP JSON mode must not retain one
 * `_streamMapping` entry per POST (MCP SDK #2559). Asserts via CLAWQL_BENCH_STATS
 * on /healthz — fails the instant the host prune disappears, without a long RSS run.
 */
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetClawqlApiForTests } from "../composition/clawql-api-adapters.js";
import { resetClawqlGatewayAuthForTests } from "../composition/gateway-auth.js";
import { getClawqlOptionalToolFlags, resetSpecCache } from "clawql-api";
import { createMcpHttpApp } from "../server-http.js";
import { resetSchemaFieldCache } from "../mcp/tools.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const minimalSpec = join(here, "../test-utils/fixtures/minimal-petstore.json");
const ACCEPT = "application/json, text/event-stream";
/** Enough POSTs that a missing prune yields hundreds of map entries. */
const POST_COUNT = 300;
/** After prune: at most standalone SSE slot + tiny residual; never ~POST_COUNT. */
const MAX_STREAM_MAPPING_ENTRIES = 4;

function closeHttpServer(server: Server): Promise<void> {
  return Promise.race([
    new Promise<void>((resolve, reject) => {
      if (typeof server.closeIdleConnections === "function") {
        server.closeIdleConnections();
      }
      if (typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      }
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        setImmediate(() => resolve());
      });
    }),
    new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

async function parseRpc(resp: Response): Promise<unknown> {
  const ct = resp.headers.get("content-type") || "";
  const text = await resp.text();
  if (ct.includes("text/event-stream") || text.startsWith("event:")) {
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    const last = lines[lines.length - 1];
    if (!last) throw new Error(`empty SSE: ${text.slice(0, 200)}`);
    return JSON.parse(last.slice(5).trim()) as unknown;
  }
  return JSON.parse(text) as unknown;
}

describe("json-stream-mapping-bound", { timeout: 60_000 }, () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      "CLAWQL_SPEC_PATH",
      "CLAWQL_PROVIDER",
      "CLAWQL_SPEC_PATHS",
      "CLAWQL_BUNDLED_PROVIDERS",
      "CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE",
      "CLAWQL_BENCH_STATS",
      "CLAWQL_MCP_SESSION_IDLE_MS",
      "CLAWQL_HTTP_SKIP_GRAPHQL",
      "CLAWQL_HTTP_SKIP_PAYMENTS",
    ] as const) {
      saved[key] = process.env[key];
    }
    process.env.CLAWQL_SPEC_PATH = minimalSpec;
    process.env.CLAWQL_STREAMABLE_HTTP_JSON_RESPONSE = "1";
    process.env.CLAWQL_BENCH_STATS = "1";
    process.env.CLAWQL_MCP_SESSION_IDLE_MS = "0";
    process.env.CLAWQL_HTTP_SKIP_GRAPHQL = "1";
    process.env.CLAWQL_HTTP_SKIP_PAYMENTS = "1";
    delete process.env.CLAWQL_PROVIDER;
    delete process.env.CLAWQL_SPEC_PATHS;
    delete process.env.CLAWQL_BUNDLED_PROVIDERS;
    resetSpecCache();
    resetSchemaFieldCache();
    resetClawqlApiForTests();
    resetClawqlGatewayAuthForTests();
  });

  afterEach(() => {
    for (const key of Object.keys(saved)) {
      const v = saved[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
    resetSpecCache();
    resetSchemaFieldCache();
    resetClawqlApiForTests();
    resetClawqlGatewayAuthForTests();
  });

  it("keeps _streamMapping bounded across hundreds of sessionful JSON POSTs", async () => {
    const flags = getClawqlOptionalToolFlags();
    const app = await createMcpHttpApp({
      mcpPath: "/mcp",
      host: "127.0.0.1",
      skipSpecPreload: true,
      skipGraphqlAttach: true,
      optionalFlagsSnapshot: {
        enableHitlLabelStudio: flags.enableHitlLabelStudio,
        enableConeshare: flags.enableConeshare,
        enableLangfuseEval: flags.enableLangfuseEval,
      },
    });
    const server = createServer(app);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected TCP address");
    const base = `http://127.0.0.1:${addr.port}`;
    const url = `${base}/mcp`;

    try {
      let protocolVersion = "2025-11-25";
      let id = 1;
      const initResp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: ACCEPT },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: id++,
          method: "initialize",
          params: {
            protocolVersion,
            capabilities: {},
            clientInfo: { name: "json-stream-mapping-bound", version: "0.1.0" },
          },
        }),
      });
      const sessionId =
        initResp.headers.get("mcp-session-id") || initResp.headers.get("Mcp-Session-Id");
      expect(sessionId).toBeTruthy();
      const proto = initResp.headers.get("mcp-protocol-version");
      if (proto) protocolVersion = proto;
      await parseRpc(initResp);
      await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: ACCEPT,
          "mcp-protocol-version": protocolVersion,
          "mcp-session-id": sessionId!,
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      });

      for (let i = 0; i < POST_COUNT; i++) {
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: ACCEPT,
            "mcp-protocol-version": protocolVersion,
            "mcp-session-id": sessionId!,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: id++,
            method: "tools/list",
            params: {},
          }),
        });
        const data = (await parseRpc(resp)) as { error?: unknown };
        expect(data.error).toBeUndefined();
      }

      const hz = await fetch(`${base}/healthz`);
      expect(hz.ok).toBe(true);
      const body = (await hz.json()) as {
        mcp_sessions: number;
        stream_mapping_entries?: number;
        request_to_stream_entries?: number;
      };
      expect(body.mcp_sessions).toBe(1);
      expect(typeof body.stream_mapping_entries).toBe("number");
      expect(body.stream_mapping_entries!).toBeLessThanOrEqual(MAX_STREAM_MAPPING_ENTRIES);
      // Without prune this would be ~POST_COUNT (+ initialize). Guard the cliff.
      expect(body.stream_mapping_entries!).toBeLessThan(POST_COUNT / 10);
      expect(body.request_to_stream_entries ?? 0).toBeLessThanOrEqual(MAX_STREAM_MAPPING_ENTRIES);
    } finally {
      await closeHttpServer(server);
    }
  });
});
