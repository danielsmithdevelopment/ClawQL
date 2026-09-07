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

      const significance = await subStub.fetch(
        new Request("https://internal/subscription/evaluate", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-subscription-id": subscriptionId,
            "x-event-id": eventId,
          },
          body: await request.text(),
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
        });
      }

      const sessionName = `sess:${subscriptionId}:${eventId}`;
      const sessionId = this.env.AGENT_SESSION.idFromName(sessionName);
      const sessionStub = this.env.AGENT_SESSION.get(sessionId);

      const sessionRes = await sessionStub.fetch(
        new Request("https://internal/session/start", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-subscription-id": subscriptionId,
            "x-event-id": eventId,
          },
          body: JSON.stringify({
            subscriptionId,
            eventId,
            payloadPreview: evalBody.preview ?? null,
          }),
        }),
      );

      const spawned = ((await this.state.storage.get("spawn_count")) ?? 0) + 1;
      await this.state.storage.put("spawn_count", spawned);

      const sessionBody = await sessionRes.json();
      return Response.json({
        ok: sessionRes.ok,
        action: "spawn",
        subscriptionId,
        eventId,
        session: sessionBody,
        spawnCount: spawned,
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
