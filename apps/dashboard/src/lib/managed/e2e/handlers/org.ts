/**
 * Org lifecycle for Cloud E2E (delete with fresh sign-in gate).
 * Production-shaped POST /org/delete — Pass-when via /audit + Settings UI.
 */
import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness } from "@/lib/managed/e2e/service";
import { appendAudit, getWorld, newId, personByName } from "@/lib/managed/e2e/world";

/** Catalog KEY-09 / Settings: must have signed in within the last 5 minutes. */
export const ORG_DELETE_FRESH_SIGN_IN_MS = 5 * 60 * 1000;

function activeSessionSignedInAt(personName: string): number | null {
  const person = personByName(personName);
  const session = person?.sessions.find((s) => !s.ended);
  if (!session) return null;
  const t = Date.parse(session.signedInAt);
  return Number.isFinite(t) ? t : null;
}

function isFreshSignIn(personName: string, nowMs = Date.now()): boolean {
  const signedInAt = activeSessionSignedInAt(personName);
  if (signedInAt == null) return false;
  return nowMs - signedInAt <= ORG_DELETE_FRESH_SIGN_IN_MS;
}

function performOrgDelete(actor: string): { certificate: string } {
  const world = getWorld();
  world.orgArchive = {
    memory: world.memoryNotes,
    documents: world.documents,
    skills: world.skills,
    settings: { orgName: world.orgName },
    audit: world.audit,
  };
  world.orgDeleted = true;
  world.deletionCertificate = newId("cert");
  for (const p of world.people) p.active = false;
  appendAudit(actor, "org.delete", "Deletion complete", {
    certificate: world.deletionCertificate,
  });
  return { certificate: world.deletionCertificate };
}

/** POST /org/delete — refuse when session is older than 5 minutes (before key prompt). */
export function postOrgDelete(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }

    const body = (yield* Effect.tryPromise({
      try: () =>
        req.json() as Promise<{
          person?: string;
          pinVerified?: boolean;
        }>,
      catch: () => ({}),
    })) as { person?: string; pinVerified?: boolean };

    const personName = body.person ?? "Dana Reyes";
    const person = personByName(personName);
    if (!person) {
      return NextResponse.json({ error: "person not found" }, { status: 404 });
    }

    if (!isFreshSignIn(personName)) {
      appendAudit(person.name, "org.delete", "Asked to sign in again before the key prompt");
      return NextResponse.json(
        { error: "sign in again before deleting the org" },
        { status: 401 },
      );
    }

    if (body.pinVerified === false) {
      appendAudit(person.name, "org.delete", "Security key required");
      return NextResponse.json({ error: "security key required" }, { status: 403 });
    }

    const { certificate } = performOrgDelete(person.name);
    return NextResponse.json({ ok: true, deletionCertificate: certificate });
  });
}
