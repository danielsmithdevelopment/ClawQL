/**
 * SubscriptionDO — significance filter stub (Streams spec §4).
 * Production: ws_intent, config, rtpConsent, worm rows in SQLite.
 */
export class SubscriptionDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/evaluate") && request.method === "POST") {
      const subscriptionId = request.headers.get("x-subscription-id") ?? "unknown";
      const eventId = request.headers.get("x-event-id") ?? crypto.randomUUID();
      const bodyText = await request.text();
      const preview = bodyText.slice(0, 256);

      await this.state.storage.put("last_event", {
        subscriptionId,
        eventId,
        at: Date.now(),
        bytes: bodyText.length,
      });

      // Lab stub: always significant when body is non-empty or header forces pass.
      const force =
        request.headers.get("x-clawql-significance") === "pass" ||
        bodyText.length > 0;

      return Response.json({
        significant: force,
        reason: force ? "lab_stub_pass" : "empty_body",
        preview,
        subscriptionId,
        eventId,
      });
    }

    const last = await this.state.storage.get("last_event");
    return Response.json({ do: "SubscriptionDO", lastEvent: last ?? null });
  }
}
