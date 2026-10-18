/**
 * GatewayDO — webhook ingress and session spawn (Streams spec §4).
 */
export class GatewayDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/admin/status") {
      const spawned = (await this.state.storage.get("spawn_count")) ?? 0;
      return Response.json({
        do: "GatewayDO",
        spawned,
        inferenceUrl: this.env.INFERENCE_URL ?? null,
      });
    }

    // Lab probe: read AgentSessionDO after TTL alarm (Streams §3.5).
    const sessionMatch = url.pathname.match(/^\/admin\/session\/([^/]+)\/([^/]+)\/?$/);
    if (sessionMatch && request.method === "GET") {
      const subscriptionId = decodeURIComponent(sessionMatch[1]);
      const eventId = decodeURIComponent(sessionMatch[2]);
      const sessionName = `sess:${subscriptionId}:${eventId}`;
      const sessionId = this.env.AGENT_SESSION.idFromName(sessionName);
      const sessionStub = this.env.AGENT_SESSION.get(sessionId);
      return sessionStub.fetch(new Request("https://internal/session/status", { method: "GET" }));
    }

    const webhookMatch = url.pathname.match(/^\/webhook\/([^/]+)\/?$/);
    if (webhookMatch && request.method === "POST") {
      const subscriptionId = decodeURIComponent(webhookMatch[1]);
      const eventId =
        request.headers.get("x-clawql-event-id") ??
        request.headers.get("x-request-id") ??
        crypto.randomUUID();

      const subName = `sub:${subscriptionId}`;
      const subId = this.env.SUBSCRIPTION.idFromName(subName);
      const subStub = this.env.SUBSCRIPTION.get(subId);

      const bodyText = await request.text();
      /** @type {Record<string, string>} */
      const evalHeaders = {
        "content-type": "application/json",
        "x-subscription-id": subscriptionId,
        "x-event-id": eventId,
      };
      const sigHeader = request.headers.get("x-clawql-significance");
      if (sigHeader) evalHeaders["x-clawql-significance"] = sigHeader;
      const sigCfg = request.headers.get("x-clawql-significance-config");
      if (sigCfg) evalHeaders["x-clawql-significance-config"] = sigCfg;

      const significance = await subStub.fetch(
        new Request("https://internal/subscription/evaluate", {
          method: "POST",
          headers: evalHeaders,
          body: bodyText,
        }),
      );
      if (!significance.ok) {
        return significance;
      }
      const evalBody = await significance.json();
      if (!evalBody.significant) {
        return Response.json({
          ok: true,
          action: "filtered",
          subscriptionId,
          eventId,
          reason: evalBody.reason ?? "not_significant",
          filterType: evalBody.filterType ?? null,
        });
      }

      const sessionName = `sess:${subscriptionId}:${eventId}`;
      const sessionId = this.env.AGENT_SESSION.idFromName(sessionName);
      const sessionStub = this.env.AGENT_SESSION.get(sessionId);

      /** @type {Record<string, string>} */
      const sessionHeaders = {
        "content-type": "application/json",
        "x-subscription-id": subscriptionId,
        "x-event-id": eventId,
      };
      const ttlHeader = request.headers.get("x-clawql-session-ttl-ms");
      if (ttlHeader) sessionHeaders["x-clawql-session-ttl-ms"] = ttlHeader;

      const sessionRes = await sessionStub.fetch(
        new Request("https://internal/session/start", {
          method: "POST",
          headers: sessionHeaders,
          body: JSON.stringify({
            subscriptionId,
            eventId,
            payloadPreview: evalBody.preview ?? null,
          }),
        }),
      );

      const sessionBody = await sessionRes.json();
      // Propagate fail-closed compliance / session errors (do not mask as 200 spawn).
      if (!sessionRes.ok) {
        return Response.json(
          {
            ok: false,
            action: "spawn_failed",
            subscriptionId,
            eventId,
            session: sessionBody,
            status: sessionRes.status,
          },
          { status: sessionRes.status || 503 }
        );
      }

      const spawned = ((await this.state.storage.get("spawn_count")) ?? 0) + 1;
      await this.state.storage.put("spawn_count", spawned);

      return Response.json({
        ok: true,
        action: "spawn",
        subscriptionId,
        eventId,
        session: sessionBody,
        spawnCount: spawned,
        filterType: evalBody.filterType ?? null,
        filterReason: evalBody.reason ?? null,
      });
    }

    return Response.json(
      {
        do: "GatewayDO",
        hint: "POST /webhook/{subscriptionId} with optional x-clawql-event-id",
        paths: ["/admin/status", "/webhook/:subscriptionId"],
      },
      { status: 404 },
    );
  }
}
