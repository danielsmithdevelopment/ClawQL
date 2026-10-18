/**
 * ClawQL Streams celld skeleton — Worker entry (Lab 5b + Core-in-celld).
 * Routes public HTTP to GatewayDO; `/mcp` → CoreToolsDO (slim Core in isolate).
 */
export { GatewayDO } from "./gateway-do.js";
export { SubscriptionDO } from "./subscription-do.js";
export { AgentSessionDO } from "./agent-session-do.js";
export { CoreToolsDO } from "./core-tools-do.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "clawql-streams-celld-skeleton",
        celldBaseline: "v0.4.0",
        coreInCelld: true,
        routes: ["/health", "/mcp", "/core/health", "/webhook/{subscriptionId}"],
      });
    }

    // Every MCP tools/call for slim Core lands in CoreToolsDO (celld isolate).
    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
      const id = env.CORE_TOOLS.idFromName("core");
      return env.CORE_TOOLS.get(id).fetch(
        new Request(new URL("/mcp", request.url), request)
      );
    }
    if (url.pathname === "/core/health" || url.pathname === "/core/mcp") {
      const id = env.CORE_TOOLS.idFromName("core");
      const path = url.pathname === "/core/health" ? "/health" : "/mcp";
      return env.CORE_TOOLS.get(id).fetch(
        new Request(new URL(path, request.url), request)
      );
    }

    const gatewayId = env.GATEWAY.idFromName("gateway");
    return env.GATEWAY.get(gatewayId).fetch(request);
  },
};
