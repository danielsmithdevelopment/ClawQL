/**
 * AgentSessionDO — ephemeral session stub (Streams spec §4).
 * Model calls use fetch(INFERENCE_URL) — never child_process.
 */
export class AgentSessionDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/start") && request.method === "POST") {
      const subscriptionId = request.headers.get("x-subscription-id") ?? "unknown";
      const eventId = request.headers.get("x-event-id") ?? crypto.randomUUID();
      const startedAt = Date.now();
      const doInstanceId = crypto.randomUUID();
      const virtualKeyId = `vk_lab_${eventId.slice(0, 8)}`;

      const existing = await this.state.storage.get("session_meta");
      if (existing) {
        return Response.json({
          do: "AgentSessionDO",
          idempotent: true,
          session: existing,
        });
      }

      const meta = {
        doInstanceId,
        subscriptionId,
        eventId,
        virtualKeyId,
        startedAt,
        exitReason: null,
      };
      await this.state.storage.put("session_meta", meta);
      await this.state.storage.put(`worm:${startedAt}`, {
        kind: "DO_CREATED",
        doInstanceId,
        virtualKeyId,
        subscriptionId,
        eventId,
      });

      let inference = { skipped: true, reason: "no INFERENCE_URL" };
      const inferenceUrl = this.env.INFERENCE_URL;
      if (inferenceUrl) {
        try {
          const res = await fetch(`${inferenceUrl.replace(/\/$/, "")}/healthz`, {
            method: "GET",
            headers: { accept: "application/json" },
          });
          inference = {
            skipped: false,
            status: res.status,
            ok: res.ok,
          };
          await this.state.storage.put("inference_probe", inference);
        } catch (err) {
          inference = {
            skipped: false,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      return Response.json({
        do: "AgentSessionDO",
        session: meta,
        inference,
        audit: { wormKey: `worm:${startedAt}` },
      });
    }

    const meta = await this.state.storage.get("session_meta");
    return Response.json({ do: "AgentSessionDO", session: meta ?? null });
  }
}
