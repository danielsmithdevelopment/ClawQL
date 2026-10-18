/**
 * SubscriptionDO — significance filter (Streams §3.4) + last-event bookkeeping.
 * Production: also ws_intent, config, rtpConsent, worm rows in SQLite.
 */
import { decideSignificance, parseSignificanceConfig } from "./significance-filter.js";

export class SubscriptionDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Persist per-subscription filter config (optional).
    if (url.pathname.endsWith("/config") && request.method === "PUT") {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ ok: false, error: "bad json" }, { status: 400 });
      }
      const cfg = parseSignificanceConfig(body.significance ?? body);
      if (!cfg) {
        return Response.json({ ok: false, error: "significance.type required" }, { status: 400 });
      }
      await this.state.storage.put("significance", cfg);
      return Response.json({ ok: true, significance: cfg });
    }

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

      const forcePass = request.headers.get("x-clawql-significance") === "pass";
      const forceFail = request.headers.get("x-clawql-significance") === "fail";
      const stored = await this.state.storage.get("significance");
      const headerCfgRaw = request.headers.get("x-clawql-significance-config");
      let headerCfg = null;
      if (headerCfgRaw) {
        try {
          headerCfg = parseSignificanceConfig(JSON.parse(headerCfgRaw));
        } catch {
          headerCfg = null;
        }
      }

      const rateKey = "rate_timestamps";
      const prevRate = await this.state.storage.get(rateKey);
      const rateTimestamps = Array.isArray(prevRate) ? prevRate : [];

      const decision = decideSignificance(bodyText, {
        forcePass,
        forceFail,
        config: headerCfg ?? stored ?? null,
        rateTimestamps,
      });

      if (Array.isArray(decision.rateTimestamps)) {
        await this.state.storage.put(rateKey, decision.rateTimestamps);
      }

      return Response.json({
        significant: decision.significant,
        reason: decision.reason,
        filterType: decision.filterType,
        preview,
        subscriptionId,
        eventId,
        ...(decision.eventsInWindow != null ? { eventsInWindow: decision.eventsInWindow } : {}),
        ...(decision.path != null ? { path: decision.path } : {}),
        ...(decision.got != null ? { got: decision.got } : {}),
        ...(decision.threshold != null ? { threshold: decision.threshold } : {}),
        ...(decision.children ? { children: decision.children } : {}),
      });
    }

    const last = await this.state.storage.get("last_event");
    const significance = await this.state.storage.get("significance");
    return Response.json({
      do: "SubscriptionDO",
      lastEvent: last ?? null,
      significance: significance ?? null,
    });
  }
}
