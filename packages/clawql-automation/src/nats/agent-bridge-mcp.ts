/**
 * Streamable HTTP MCP caller for the IDP agent bridge.
 * Uses @modelcontextprotocol/sdk when available (workspace / optional peer).
 */

import type { AgentBridgeMcpCaller } from "./agent-bridge.js";
import { natsMcpHttpUrl } from "./env.js";

export async function createStreamableHttpMcpCaller(
  url = natsMcpHttpUrl()
): Promise<{ caller: AgentBridgeMcpCaller; close: () => Promise<void> }> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  );

  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({ name: "clawql-idp-agent-bridge", version: "7.2.0" }, {});
  await client.connect(transport);

  const caller: AgentBridgeMcpCaller = {
    callTool: async (name, args) => {
      try {
        const result = await client.callTool({ name, arguments: args });
        const text = Array.isArray(result.content)
          ? result.content
              .map((c) => ("text" in c && typeof c.text === "string" ? c.text : ""))
              .join("\n")
          : "";
        if (result.isError) {
          return { ok: false, error: text || "tool returned isError", text };
        }
        return { ok: true, text };
      } catch (e: unknown) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };

  return {
    caller,
    close: async () => {
      await client.close().catch(() => undefined);
    },
  };
}
