/**
 * ClawQL Streams celld skeleton — Worker entry (Lab 5b).
 * Routes public HTTP to GatewayDO; DO classes match clawql-celld.md §4.
 */
export { GatewayDO } from "./gateway-do.js";
export { SubscriptionDO } from "./subscription-do.js";
export { AgentSessionDO } from "./agent-session-do.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "clawql-streams-celld-skeleton",
        celldBaseline: "v0.4.0",
      });
    }
    const gatewayId = env.GATEWAY.idFromName("gateway");
    return env.GATEWAY.get(gatewayId).fetch(request);
  },
};
