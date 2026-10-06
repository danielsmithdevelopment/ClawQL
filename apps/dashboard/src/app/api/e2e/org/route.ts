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
      const url = new URL(req.url);
      const asOrg = url.searchParams.get("org");
      if (asOrg === "lumen" || asOrg === "org_lumen") {
        // Cross-tenant: never reveal Acme existence (SEC-04)
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      const owner = world.people.find((p) => p.role === "owner");
      return NextResponse.json({
        orgId: world.orgId,
        orgName: world.orgName,
        owner: owner?.name,
        ownerCount: world.people.filter((p) => p.role === "owner").length,
        firstRun: {
          step: world.firstRunStep,
          total: world.firstRunTotal,
          label: `${world.firstRunStep} of ${world.firstRunTotal}`,
          securityKeysRegistered: world.securityKeysRegistered,
          step3Unlocked: world.securityKeysRegistered,
          step3DisabledReason: world.securityKeysRegistered
            ? null
            : "needs your security keys",
        },
        stripeProvisioningDone: world.stripeProvisioningDone,
        deleted: world.orgDeleted ?? false,
      });
    }),
  );
}
