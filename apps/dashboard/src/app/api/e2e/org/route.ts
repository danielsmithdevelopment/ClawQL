import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import { getWorld } from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = getWorld();
      const asOrgHeader = req.headers.get("x-org");
      const url = new URL(req.url);
      const asOrg = url.searchParams.get("org") ?? asOrgHeader;
      if (asOrg === "lumen" || asOrg === "org_lumen") {
        // Cross-tenant: never reveal Acme existence (SEC-04 / SEC-05)
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      const owner = world.people.find((p) => p.role === "owner");
      const archive = world.orgArchive
        ? {
            sections: Object.keys(world.orgArchive),
            hasMemory: Boolean(world.orgArchive.memory),
            hasDocuments: Boolean(world.orgArchive.documents),
            hasSkills: Boolean(world.orgArchive.skills),
            hasSettings: Boolean(world.orgArchive.settings),
            hasAudit: Boolean(world.orgArchive.audit),
          }
        : null;
      return NextResponse.json({
        orgId: world.orgId,
        orgName: world.orgName,
        orgAddress: world.orgAddress,
        orgRegion: world.orgRegion,
        owner: owner?.name,
        ownerCount: world.people.filter((p) => p.role === "owner").length,
        people: world.people.map((p) => ({
          name: p.name,
          role: p.role,
          active: p.active,
          groups: p.groups,
          canApproveContracts: p.canApproveContracts,
          canAnswerTicketTriage: p.canAnswerTicketTriage,
          sessions: p.sessions,
        })),
        firstRun: {
          step: world.firstRunStep,
          total: world.firstRunTotal,
          label: `${world.firstRunStep} of ${world.firstRunTotal}`,
          securityKeysRegistered: world.securityKeysRegistered,
          step3Unlocked: world.securityKeysRegistered,
          step3DisabledReason: world.securityKeysRegistered
            ? null
            : "needs your security keys",
          recoveryCodesShownOnce: world.recoveryCodesShownOnce,
        },
        stripeProvisioningDone: world.stripeProvisioningDone,
        deleted: world.orgDeleted ?? false,
        deletionCertificate: world.deletionCertificate,
        archive,
        nobodySignedIn: world.people.every((p) => !p.active || p.sessions.every((s) => s.ended)),
        keyCount: world.keys.filter((k) => !k.revoked).length,
        blockedCalls: world.blockedCalls,
        sessions: world.sessions,
      });
    }),
  );
}
