/**
 * Console session lifecycle for Cloud E2E (idle / max / end-others).
 * Production-shaped POST /session/* — Pass-when via /audit + Profile UI.
 */
import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness } from "@/lib/managed/e2e/service";
import { appendAudit, getWorld, personByName } from "@/lib/managed/e2e/world";

function parsePerson(body: { person?: string }): string {
  return body.person ?? "Dana Reyes";
}

function sessionSnapshot(personName: string) {
  const world = getWorld();
  const person = personByName(personName);
  const active = person?.sessions.filter((s) => !s.ended) ?? [];
  const ended = person?.sessions.filter((s) => s.ended) ?? [];
  const signedIn = Boolean(person?.active && active.length > 0);
  return {
    person: personName,
    signedIn,
    idleTimeoutMinutes: world.idleTimeoutMinutes,
    maxSessionMinutes: world.maxSessionMinutes,
    sessions: (person?.sessions ?? []).map((s) => ({
      id: s.id,
      device: s.device,
      path: s.path,
      ended: s.ended,
      signedInAt: s.signedInAt,
      lastActiveAt: s.lastActiveAt,
    })),
    returnPath: ended[0]?.path ?? active[0]?.path ?? "/home",
  };
}

/**
 * Enforce idle + max-session rules against wall-clock timestamps.
 * Arrange ages lastActiveAt / signedInAt via control; this is Pass-when.
 */
export function postSessionEnforce(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }

    const body = (yield* Effect.tryPromise({
      try: () => req.json() as Promise<{ person?: string }>,
      catch: () => ({}),
    })) as { person?: string };

    const personName = parsePerson(body);
    const person = personByName(personName);
    if (!person) {
      return NextResponse.json({ error: "person not found" }, { status: 404 });
    }

    const world = getWorld();
    const now = Date.now();
    const idleMs = world.idleTimeoutMinutes * 60_000;
    const maxMs = world.maxSessionMinutes * 60_000;
    let reason: "idle" | "max" | null = null;
    let returnPath = "/home";

    for (const s of person.sessions) {
      if (s.ended) continue;
      const lastActive = Date.parse(s.lastActiveAt);
      const signedInAt = Date.parse(s.signedInAt);
      if (Number.isFinite(signedInAt) && now - signedInAt > maxMs) {
        s.ended = true;
        reason = "max";
        returnPath = s.path;
        continue;
      }
      if (Number.isFinite(lastActive) && now - lastActive > idleMs) {
        s.ended = true;
        reason = reason ?? "idle";
        returnPath = s.path;
      }
    }

    if (reason === "idle") {
      appendAudit(person.name, "session.idle", "Signed out — idle timeout", { path: returnPath });
    } else if (reason === "max") {
      appendAudit(person.name, "session.max", "Signed out — max session length", { path: returnPath });
    }

    return NextResponse.json({
      ok: true,
      enforced: reason,
      ...sessionSnapshot(personName),
      returnPath,
    });
  });
}

/** End every session except the first active one (current browser). */
export function postSessionEndOthers(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }

    const body = (yield* Effect.tryPromise({
      try: () => req.json() as Promise<{ person?: string }>,
      catch: () => ({}),
    })) as { person?: string };

    const personName = parsePerson(body);
    const person = personByName(personName);
    if (!person) {
      return NextResponse.json({ error: "person not found" }, { status: 404 });
    }

    for (const s of person.sessions.slice(1)) s.ended = true;
    appendAudit(person.name, "session.end_others", "Signed out everywhere else");

    return NextResponse.json({ ok: true, ...sessionSnapshot(personName) });
  });
}

/** GET /session — current session snapshot for Profile UI. */
export function getSession(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const url = new URL(req.url);
    const personName = url.searchParams.get("person") ?? "Dana Reyes";
    if (!personByName(personName)) {
      return NextResponse.json({ error: "person not found" }, { status: 404 });
    }
    return NextResponse.json(sessionSnapshot(personName));
  });
}
