import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  loadOpenAppaConfigEffect,
  openAppaWireToolNameEffect,
} from "./config.js";
import {
  openAppaAfterToolResultEffect,
  openAppaBeforeToolCallEffect,
  openAppaBlockToMcpResult,
  resetOpenAppaSessionCacheForTests,
} from "./gate.js";
import { OpenAppaLive, OpenAppaService } from "./openappa-service.js";
import type { OpenAppaConfig } from "./config.js";

type HookHandler = (body: Record<string, unknown>) => {
  status: number;
  body: Record<string, unknown>;
};

function startMockOpenAppa(handler: HookHandler): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
        return;
      }
      if (req.method !== "POST" || req.url !== "/hook") {
        res.writeHead(404);
        res.end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      const reply = handler(body);
      res.writeHead(reply.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(reply.body));
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("no listen address"));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

describe("OpenAPPA Layer 5 client", () => {
  const prevEnable = process.env.CLAWQL_ENABLE_OPENAPPA;
  const prevUrl = process.env.CLAWQL_OPENAPPA_URL;
  let mock: { server: Server; url: string } | undefined;

  beforeEach(() => {
    resetOpenAppaSessionCacheForTests();
  });

  afterEach(async () => {
    if (prevEnable === undefined) delete process.env.CLAWQL_ENABLE_OPENAPPA;
    else process.env.CLAWQL_ENABLE_OPENAPPA = prevEnable;
    if (prevUrl === undefined) delete process.env.CLAWQL_OPENAPPA_URL;
    else process.env.CLAWQL_OPENAPPA_URL = prevUrl;
    if (mock) {
      await new Promise<void>((r) => mock!.server.close(() => r()));
      mock = undefined;
    }
  });

  it("maps mcp tool names to opencode wire spelling", async () => {
    const name = await Effect.runPromise(openAppaWireToolNameEffect("notify", "clawql"));
    expect(name).toBe("mcp__clawql__notify");
  });

  it("loadConfig is null when disabled", async () => {
    delete process.env.CLAWQL_ENABLE_OPENAPPA;
    const cfg = await Effect.runPromise(loadOpenAppaConfigEffect());
    expect(cfg).toBeNull();
  });

  it("allows when OpenAPPA disabled", async () => {
    delete process.env.CLAWQL_ENABLE_OPENAPPA;
    const verdict = await Effect.runPromise(
      openAppaBeforeToolCallEffect({ toolName: "search", args: { query: "x" } })
    );
    expect(verdict.allow).toBe(true);
  });

  it("session_start + allow_call for search", async () => {
    const events: string[] = [];
    mock = await startMockOpenAppa((body) => {
      events.push(String(body.event));
      if (body.event === "session_start") {
        return { status: 200, body: { protocol: 1, decision: "ack" } };
      }
      if (body.event === "tool_call" && body.tool === "mcp__clawql__search") {
        return { status: 200, body: { protocol: 1, decision: "allow_call" } };
      }
      return { status: 500, body: { protocol: 1, decision: "refuse", detail: "unexpected" } };
    });
    const config: OpenAppaConfig = {
      baseUrl: mock.url,
      adapter: "opencode",
      mcpServer: "clawql",
      failurePolicy: "block",
      timeoutMs: 3000,
    };
    const verdict = await Effect.runPromise(
      openAppaBeforeToolCallEffect({
        toolName: "search",
        args: { query: "pets" },
        sessionId: "sess-allow",
        callId: "c1",
        config,
      })
    );
    expect(verdict.allow).toBe(true);
    expect(events).toEqual(["session_start", "tool_call"]);
  });

  it("refuse undeclared_tool → blocked", async () => {
    mock = await startMockOpenAppa((body) => {
      if (body.event === "session_start") {
        return { status: 200, body: { protocol: 1, decision: "ack" } };
      }
      return {
        status: 409,
        body: {
          protocol: 1,
          decision: "refuse",
          class: "undeclared_tool",
          detail: "tool mcp/clawql/foo is not declared",
        },
      };
    });
    const config: OpenAppaConfig = {
      baseUrl: mock.url,
      adapter: "opencode",
      mcpServer: "clawql",
      failurePolicy: "block",
      timeoutMs: 3000,
    };
    const verdict = await Effect.runPromise(
      openAppaBeforeToolCallEffect({
        toolName: "foo",
        args: {},
        sessionId: "sess-refuse",
        config,
      })
    );
    expect(verdict.allow).toBe(false);
    if (verdict.allow) throw new Error("expected block");
    expect(verdict.status).toBe("blocked");
    expect(verdict.reason).toContain("undeclared");
    const mcp = openAppaBlockToMcpResult(verdict);
    expect(mcp.isError).toBe(true);
    expect(JSON.parse(mcp.content[0].text).mechanism).toBe("openappa_layer5");
  });

  it("deny_call with human-approval → mandate_required", async () => {
    mock = await startMockOpenAppa((body) => {
      if (body.event === "session_start") {
        return { status: 200, body: { protocol: 1, decision: "ack" } };
      }
      return {
        status: 200,
        body: {
          protocol: 1,
          decision: "deny_call",
          feedback: "[appa] Blocked: requires attention: human-approval",
          offers: [],
        },
      };
    });
    const config: OpenAppaConfig = {
      baseUrl: mock.url,
      adapter: "opencode",
      mcpServer: "clawql",
      failurePolicy: "block",
      timeoutMs: 3000,
    };
    const verdict = await Effect.runPromise(
      openAppaBeforeToolCallEffect({
        toolName: "notify",
        args: { destination: "external" },
        sessionId: "sess-hitl",
        config,
      })
    );
    expect(verdict.allow).toBe(false);
    if (verdict.allow) throw new Error("expected block");
    expect(verdict.status).toBe("mandate_required");
  });

  it("tool_result replace_output", async () => {
    mock = await startMockOpenAppa((body) => {
      if (body.event === "session_start") {
        return { status: 200, body: { protocol: 1, decision: "ack" } };
      }
      if (body.event === "tool_result") {
        return {
          status: 200,
          body: { protocol: 1, decision: "replace_output", value: "redacted" },
        };
      }
      return { status: 200, body: { protocol: 1, decision: "ack" } };
    });
    const config: OpenAppaConfig = {
      baseUrl: mock.url,
      adapter: "opencode",
      mcpServer: "clawql",
      failurePolicy: "block",
      timeoutMs: 3000,
    };
    const after = await Effect.runPromise(
      openAppaAfterToolResultEffect({
        toolName: "memory_recall",
        args: { query: "x" },
        sessionId: "sess-replace",
        callId: "c9",
        outcome: { status: "success", body: { secret: 1 } },
        config,
      })
    );
    expect(after.action).toBe("replace");
    if (after.action === "replace") expect(after.value).toBe("redacted");
  });

  it("OpenAppaService Layer beforeToolCall", async () => {
    mock = await startMockOpenAppa((body) => {
      if (body.event === "session_start") {
        return { status: 200, body: { protocol: 1, decision: "ack" } };
      }
      return { status: 200, body: { protocol: 1, decision: "allow_call" } };
    });
    const config: OpenAppaConfig = {
      baseUrl: mock.url,
      adapter: "opencode",
      mcpServer: "clawql",
      failurePolicy: "block",
      timeoutMs: 3000,
    };
    const verdict = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* OpenAppaService;
        return yield* svc.beforeToolCall({
          toolName: "cache",
          args: { operation: "get", key: "k" },
          sessionId: "sess-svc",
          config,
        });
      }).pipe(Effect.provide(OpenAppaLive))
    );
    expect(verdict.allow).toBe(true);
  });

  it("warn failure policy allows on transport error", async () => {
    const config: OpenAppaConfig = {
      baseUrl: "http://127.0.0.1:1",
      adapter: "opencode",
      mcpServer: "clawql",
      failurePolicy: "warn",
      timeoutMs: 200,
    };
    const verdict = await Effect.runPromise(
      openAppaBeforeToolCallEffect({
        toolName: "search",
        args: {},
        sessionId: "sess-warn",
        config,
      })
    );
    expect(verdict.allow).toBe(true);
  });
});
