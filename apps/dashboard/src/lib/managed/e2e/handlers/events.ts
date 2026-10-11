import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness } from "@/lib/managed/e2e/service";
import { deliverEventToSubscriptions, getWorld, newId, pushEvent } from "@/lib/managed/e2e/world";

/** GET /events — list events; optional ?after=<eventId> for stream cursor resume. */
export function getEvents(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const world = getWorld();
    const url = new URL(req.url);
    const after = url.searchParams.get("after");
    let events = world.events;
    if (after) {
      const idx = events.findIndex((e) => e.id === after);
      events = idx >= 0 ? events.slice(idx + 1) : events;
    }
    const cloudEvents = events.map((e) => ({
      id: e.id,
      type: e.type.startsWith("com.clawql.") ? e.type : `com.clawql.${e.type}`,
      time: e.at,
      source: e.source ?? "clawql://cloud",
      data: e.payload,
      test: e.test ?? false,
      inbound: e.inbound,
      untrusted: e.untrusted,
    }));
    return NextResponse.json({
      events: cloudEvents,
      cursor: world.streamCursor,
      counts24h: world.eventTypeCounts24h,
    });
  });
}

/** POST /events — emit a test event or redeliver. */
export function postEvents(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const body = (yield* Effect.tryPromise({
      try: () =>
        req.json() as Promise<{
          type?: string;
          payload?: unknown;
          test?: boolean;
          redeliverId?: string;
          retryAll?: boolean;
          burst?: number;
        }>,
      catch: () => ({}),
    })) as {
      type?: string;
      payload?: unknown;
      test?: boolean;
      redeliverId?: string;
      retryAll?: boolean;
      burst?: number;
    };

    if (body.redeliverId) {
      const existing = getWorld().events.find((e) => e.id === body.redeliverId);
      if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
      // Same event ID on redelivery
      yield* Effect.tryPromise({
        try: () => deliverEventToSubscriptions(existing),
        catch: () => undefined as void,
      });
      return NextResponse.json({ ok: true, id: existing.id, redelivered: true });
    }

    if (body.retryAll) {
      for (const sub of getWorld().subscriptions) {
        const pending = [...sub.pendingRetries];
        sub.pendingRetries = [];
        for (const p of pending) {
          const evt = {
            id: p.eventId,
            type: p.type,
            payload: p.payload,
            at: new Date().toISOString(),
          };
          yield* Effect.tryPromise({
            try: () => deliverEventToSubscriptions(evt),
            catch: () => undefined as void,
          });
        }
        sub.health = "Healthy";
      }
      return NextResponse.json({ ok: true, retried: true });
    }

    if (body.burst && body.burst > 0) {
      const ids: string[] = [];
      for (let i = 0; i < body.burst; i++) {
        const evt = pushEvent(body.type ?? "stream.changed", body.payload ?? { i });
        ids.push(evt.id);
        yield* Effect.tryPromise({
          try: () => deliverEventToSubscriptions(evt),
          catch: () => undefined as void,
        });
      }
      return NextResponse.json({ ok: true, ids, count: ids.length });
    }

    const evt = pushEvent(body.type ?? "test.ping", body.payload ?? {}, { test: body.test ?? true });
    // Preserve original id for test marker
    if (body.test !== false) {
      (evt as { test: boolean }).test = true;
    }
    yield* Effect.tryPromise({
      try: () => deliverEventToSubscriptions(evt),
      catch: () => undefined as void,
    });
    return NextResponse.json({ ok: true, id: evt.id ?? newId("evt"), event: evt });
  });
}
