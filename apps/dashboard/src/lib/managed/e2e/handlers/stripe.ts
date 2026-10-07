/**
 * Stripe Checkout completion for Cloud E2E (SU-01 / SU-02 / SU-03).
 * Production-shaped POST /billing/checkout — Pass-when via /audit + console UI.
 * Still harness-provisioned until real Stripe test-mode webhooks land in CI.
 */
import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness } from "@/lib/managed/e2e/service";
import { appendAudit, getWorld } from "@/lib/managed/e2e/world";

export function postBillingCheckout(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }
    const world = getWorld();
    const body = (yield* Effect.tryPromise({
      try: () =>
        req.json() as Promise<{
          signedInUserId?: string;
          foreignUserId?: string;
          replay?: boolean;
          testCard?: string;
        }>,
      catch: () => ({}),
    })) as {
      signedInUserId?: string;
      foreignUserId?: string;
      replay?: boolean;
      testCard?: string;
    };

    const signedIn = body.signedInUserId ?? world.signedInUserId ?? "user_dana";
    // Foreign ID in the request is ignored (SU-03)
    void body.foreignUserId;
    void body.testCard;

    if (world.stripeProvisioningDone) {
      appendAudit("stripe", "checkout.completed", "Ignored replay — already provisioned", {
        signedInUserId: signedIn,
      });
      return NextResponse.json({
        ok: true,
        provisioned: false,
        replayIgnored: true,
        orgId: world.orgId,
        owner: world.people.find((p) => p.role === "owner")?.name,
        firstRun: `${world.firstRunStep} of ${world.firstRunTotal}`,
      });
    }

    world.stripeProvisioningDone = true;
    world.signedInUserId = signedIn;
    world.firstRunStep = 1;
    world.orgName = world.orgName || "Acme Robotics";
    appendAudit("system", "org.created", "Organization created", { orgId: world.orgId });
    appendAudit("Dana Reyes", "owner.joined", "Owner joined", { userId: signedIn });
    appendAudit("stripe", "plan.started", "Team plan started", { testCard: true });

    return NextResponse.json({
      ok: true,
      provisioned: true,
      orgId: world.orgId,
      owner: "Dana Reyes",
      firstRun: `${world.firstRunStep} of ${world.firstRunTotal}`,
      landOn: "/",
    });
  });
}
