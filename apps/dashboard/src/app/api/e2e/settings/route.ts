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
};

function roleOf(actor: string | undefined, asRole: SettingsBody["asRole"]) {
  if (asRole) return asRole;
  const person = personByName(actor ?? "") ?? getWorld().people.find((p) => p.id === getWorld().signedInUserId);
  return person?.role ?? "member";
}

/** Org settings mutate surface — members are refused (ADM-03). */
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

      const role = roleOf(body.actor, body.asRole);
      if (role === "member" || role === "billing" || role === "auditor") {
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

      return NextResponse.json({
        ok: true,
        orgName: world.orgName,
        requestExpiryMinutes: world.requestExpiryMinutes,
        auditRetentionYears: world.auditRetentionYears,
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
      const world = getWorld();
      return NextResponse.json({
        orgName: world.orgName,
        requestExpiryMinutes: world.requestExpiryMinutes,
        auditRetentionYears: world.auditRetentionYears,
        signedInUserId: world.signedInUserId,
      });
    }),
  );
}
