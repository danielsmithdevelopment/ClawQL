import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import { appendAudit, getWorld, personByName } from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

type SettingsBody = {
  orgRename?: string;
  requestExpiryMinutes?: number;
  auditRetentionYears?: number;
  asRole?: "owner" | "admin" | "member" | "billing" | "auditor";
  actor?: string;
  timeZone?: string;
  appearance?: "light" | "dark";
  notifications?: { slack?: boolean; push?: boolean };
  endOtherSessions?: boolean;
  endSessionDevice?: string;
};

function roleOf(actor: string | undefined, asRole: SettingsBody["asRole"]) {
  if (asRole) return asRole;
  const person = personByName(actor ?? "") ?? getWorld().people.find((p) => p.id === getWorld().signedInUserId);
  return person?.role ?? "member";
}

function settingsSnapshot() {
  const world = getWorld();
  const me =
    world.people.find((p) => p.id === world.signedInUserId) ??
    world.people.find((p) => p.role === "owner");
  const signedIn = Boolean(me?.active && me.sessions.some((s) => !s.ended));
  return {
    orgName: world.orgName,
    requestExpiryMinutes: world.requestExpiryMinutes,
    auditRetentionYears: world.auditRetentionYears,
    idleTimeoutMinutes: world.idleTimeoutMinutes,
    maxSessionMinutes: world.maxSessionMinutes,
    signedInUserId: world.signedInUserId,
    signedIn,
    profile: me
      ? {
          name: me.name,
          role: me.role,
          active: me.active,
          timeZone: me.timeZone,
          appearance: me.appearance,
          notifications: me.notifications,
          sessions: me.sessions,
        }
      : null,
    people: world.people.map((p) => ({
      name: p.name,
      role: p.role,
      active: p.active,
      timeZone: p.timeZone,
      appearance: p.appearance,
      notifications: p.notifications,
      sessions: p.sessions,
    })),
    notificationsOutbox: world.notificationsOutbox,
  };
}

/** Org settings mutate surface — members are refused (ADM-03). Profile self-service is allowed. */
export async function POST(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = getWorld();
      const body = (yield* Effect.tryPromise({
        try: () => req.json() as Promise<SettingsBody>,
        catch: () => ({}) as SettingsBody,
      })) as SettingsBody;

      const orgMutate =
        Boolean(body.orgRename) ||
        typeof body.requestExpiryMinutes === "number" ||
        typeof body.auditRetentionYears === "number";

      const role = roleOf(body.actor, body.asRole);
      if (orgMutate && (role === "member" || role === "billing" || role === "auditor")) {
        appendAudit(body.actor ?? role, "settings.mutate", "Refused — role cannot edit settings", {
          role,
        });
        return NextResponse.json(
          { error: "forbidden — members cannot mutate settings", role },
          { status: 403 },
        );
      }

      if (body.orgRename) {
        const old = world.orgName;
        world.orgName = body.orgRename;
        appendAudit(body.actor ?? "Dana Reyes", "org.rename", "Renamed", {
          old,
          new: body.orgRename,
        });
      }
      if (typeof body.requestExpiryMinutes === "number") {
        world.requestExpiryMinutes = body.requestExpiryMinutes;
        appendAudit(body.actor ?? "Dana Reyes", "settings.request_expiry", "Changed", {
          new: body.requestExpiryMinutes,
        });
      }
      if (typeof body.auditRetentionYears === "number") {
        if (body.auditRetentionYears < 1) {
          return NextResponse.json({ error: "audit retention minimum is 1 year" }, { status: 400 });
        }
        world.auditRetentionYears = body.auditRetentionYears;
        appendAudit(body.actor ?? "Dana Reyes", "settings.audit_retention", "Changed", {
          new: body.auditRetentionYears,
        });
      }

      const person =
        personByName(body.actor ?? "") ??
        world.people.find((p) => p.id === world.signedInUserId);
      if (person) {
        if (body.timeZone) {
          person.timeZone = body.timeZone;
          appendAudit(person.name, "profile.timezone", "Changed", { timeZone: body.timeZone });
        }
        if (body.appearance) {
          person.appearance = body.appearance;
          appendAudit(person.name, "profile.appearance", "Changed", { appearance: body.appearance });
        }
        if (body.notifications) {
          person.notifications = { ...person.notifications, ...body.notifications };
          appendAudit(person.name, "profile.notifications", "Changed", {
            ...person.notifications,
          });
        }
        if (body.endOtherSessions) {
          for (const s of person.sessions.slice(1)) s.ended = true;
          appendAudit(person.name, "session.end_others", "Signed out everywhere else");
        }
        if (body.endSessionDevice) {
          for (const s of person.sessions) {
            if (s.device.includes(body.endSessionDevice)) s.ended = true;
          }
          appendAudit(person.name, "session.end_device", "Signed out device", {
            device: body.endSessionDevice,
          });
        }
      }

      return NextResponse.json({
        ok: true,
        ...settingsSnapshot(),
      });
    }),
  );
}

export async function GET() {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      return NextResponse.json(settingsSnapshot());
    }),
  );
}
