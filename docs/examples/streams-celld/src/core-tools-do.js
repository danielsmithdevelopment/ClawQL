/**
 * CoreToolsDO — run slim Core search/execute inside a celld Durable Object.
 *
 * Opt-in surface for “every request can be within celld”:
 * - Worker `POST /mcp` → this DO (Streamable HTTP tools/call)
 * - AgentSessionDO when CLAWQL_CORE_IN_CELLD=1 routes search/execute here via DO stub
 *
 * Execute egress uses isolate `fetch` to CLAWQL_CORE_UPSTREAM (e.g. mock /pets).
 * memory_* stays on the Bun/host MCP process (not Workers-safe vault IO).
 */

import {
  CORE_IN_CELLD_HONESTY,
  CORE_SLIM_CATALOG,
  resolveSlimExecute,
  searchSlimCatalog,
} from "./core-catalog.js";
import { MCP_PROTOCOL_VERSION } from "./mcp-fetch.js";

function jsonRpcResult(id, payload) {
  return {
    jsonrpc: "2.0",
    id: id ?? 1,
    result: {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      isError: payload?.ok === false,
    },
  };
}

function jsonRpcError(id, message) {
  return {
    jsonrpc: "2.0",
    id: id ?? 1,
    error: { code: -32603, message },
  };
}

/**
 * @param {string | undefined} upstream
 * @param {{ method?: string, path?: string, operationId: string }} op
 * @param {Record<string, unknown>} args
 */
async function executeOp(upstream, op, args) {
  if (op.operationId === "streams.session.noop") {
    return {
      ok: true,
      source: "core-tools-do",
      transport: "celld-isolate",
      host: "CoreToolsDO",
      honesty: CORE_IN_CELLD_HONESTY,
      operationId: op.operationId,
      args,
      result: { status: "noop", inCell: true },
    };
  }

  if (op.method && op.path) {
    const base = String(upstream || "").replace(/\/$/, "");
    if (!base) {
      return {
        ok: false,
        source: "core-tools-do",
        transport: "celld-isolate",
        host: "CoreToolsDO",
        honesty: CORE_IN_CELLD_HONESTY,
        operationId: op.operationId,
        error:
          "CLAWQL_CORE_UPSTREAM unset — set to HTTP origin that serves REST paths (e.g. mock pets)",
      };
    }
    const url = `${base}${op.path.startsWith("/") ? op.path : `/${op.path}`}`;
    try {
      const res = await fetch(url, {
        method: op.method,
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text();
      let body;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { raw: text.slice(0, 500) };
      }
      return {
        ok: res.ok,
        source: "core-tools-do",
        transport: "celld-isolate",
        host: "CoreToolsDO",
        honesty: CORE_IN_CELLD_HONESTY,
        operationId: op.operationId,
        upstream: url,
        status: res.status,
        result: body,
        ...(res.ok ? {} : { error: `upstream HTTP ${res.status}` }),
      };
    } catch (err) {
      return {
        ok: false,
        source: "core-tools-do",
        transport: "celld-isolate",
        host: "CoreToolsDO",
        honesty: CORE_IN_CELLD_HONESTY,
        operationId: op.operationId,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    ok: false,
    source: "core-tools-do",
    transport: "celld-isolate",
    host: "CoreToolsDO",
    honesty: CORE_IN_CELLD_HONESTY,
    operationId: op.operationId,
    error: "operation has no REST path and is not a known in-cell noop",
  };
}

export class CoreToolsDO {
  /**
   * @param {{ storage: DurableObjectStorage }} state
   * @param {Record<string, string | undefined>} env
   */
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  /**
   * Direct in-DO API (also used by AgentSession stub).
   * @param {string} name
   * @param {Record<string, unknown>} [args]
   */
  async callTool(name, args = {}) {
    const n = await this.state.storage.get("call_count");
    const callCount = (typeof n === "number" ? n : 0) + 1;
    await this.state.storage.put("call_count", callCount);
    await this.state.storage.put(`call:${callCount}`, {
      name,
      at: Date.now(),
      argsKeys: Object.keys(args || {}),
    });

    if (name === "search") {
      return searchSlimCatalog(String(args.query ?? ""), Number(args.limit ?? 5));
    }
    if (name === "execute") {
      const operationId = String(args.operationId ?? "");
      const plan = resolveSlimExecute(operationId, /** @type {Record<string, unknown>} */ (args.args ?? {}));
      if (!plan.ok) return plan;
      const out = await executeOp(
        this.env.CLAWQL_CORE_UPSTREAM,
        plan.op,
        /** @type {Record<string, unknown>} */ (args.args ?? {})
      );
      return { ...out, callCount };
    }
    if (name === "tools/list" || name === "catalog") {
      return {
        ok: true,
        source: "core-tools-do",
        transport: "celld-isolate",
        host: "CoreToolsDO",
        honesty: CORE_IN_CELLD_HONESTY,
        operations: CORE_SLIM_CATALOG,
        callCount,
      };
    }
    return {
      ok: false,
      deferred: name.startsWith("memory_"),
      tool: name,
      transport: "celld-isolate",
      host: "CoreToolsDO",
      honesty: CORE_IN_CELLD_HONESTY,
      error: name.startsWith("memory_")
        ? "memory_* stays on Bun/host MCP (vault / node:fs) — not in CoreToolsDO"
        : `unsupported tool in CoreToolsDO: ${name}`,
    };
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/health" || url.pathname.endsWith("/health"))) {
      const callCount = (await this.state.storage.get("call_count")) ?? 0;
      return Response.json({
        ok: true,
        do: "CoreToolsDO",
        transport: "celld-isolate",
        honesty: CORE_IN_CELLD_HONESTY,
        catalogSize: CORE_SLIM_CATALOG.length,
        callCount,
      });
    }

    // Internal DO stub: POST /tool { name, arguments }
    if (request.method === "POST" && url.pathname.endsWith("/tool")) {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ ok: false, error: "bad json" }, { status: 400 });
      }
      const payload = await this.callTool(String(body.name || ""), body.arguments ?? body.args ?? {});
      return Response.json(payload);
    }

    // Streamable HTTP MCP surface (initialize + tools/call)
    if (request.method === "POST" && (url.pathname === "/mcp" || url.pathname.endsWith("/mcp") || url.pathname === "/")) {
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response("bad json", { status: 400 });
      }
      const id = body.id ?? 1;

      if (body.method === "initialize") {
        return Response.json(
          {
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: MCP_PROTOCOL_VERSION,
              capabilities: { tools: {} },
              serverInfo: {
                name: "clawql-core-tools-do",
                version: "0.1.0",
                title: "ClawQL Core in celld (slim)",
              },
            },
          },
          {
            headers: {
              "content-type": "application/json",
              "mcp-session-id": "core-tools-do",
            },
          }
        );
      }

      if (body.method === "tools/list") {
        const tools = [
          {
            name: "search",
            description: "Slim in-cell catalog search (CoreToolsDO)",
            inputSchema: {
              type: "object",
              properties: { query: { type: "string" }, limit: { type: "number" } },
            },
          },
          {
            name: "execute",
            description: "Slim in-cell execute (fetch upstream REST or noop)",
            inputSchema: {
              type: "object",
              properties: {
                operationId: { type: "string" },
                args: { type: "object" },
              },
              required: ["operationId"],
            },
          },
        ];
        return Response.json({
          jsonrpc: "2.0",
          id,
          result: { tools },
        });
      }

      if (body.method === "tools/call") {
        const name = body.params?.name;
        const args = body.params?.arguments ?? {};
        const payload = await this.callTool(String(name || ""), args);
        return Response.json(jsonRpcResult(id, payload));
      }

      return Response.json(jsonRpcError(id, `unsupported method: ${body.method}`), { status: 400 });
    }

    return Response.json(
      {
        do: "CoreToolsDO",
        ok: true,
        honesty: CORE_IN_CELLD_HONESTY,
        routes: ["GET /health", "POST /tool", "POST /mcp"],
      },
      { status: 200 }
    );
  }
}

/**
 * Call CoreToolsDO via binding (AgentSession / Worker helpers).
 * @param {{ idFromName: (n: string) => DurableObjectId, get: (id: DurableObjectId) => { fetch: (r: Request) => Promise<Response> } }} binding
 * @param {string} name
 * @param {Record<string, unknown>} [args]
 */
export async function callCoreToolsDo(binding, name, args = {}) {
  if (!binding) {
    return {
      ok: false,
      deferred: true,
      tool: name,
      reason: "CORE_TOOLS binding missing",
    };
  }
  const id = binding.idFromName("core");
  const stub = binding.get(id);
  const res = await stub.fetch(
    new Request("https://internal/core/tool", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, arguments: args }),
    })
  );
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text.slice(0, 500), status: res.status };
  }
}
