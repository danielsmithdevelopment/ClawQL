/**
 * Directory / IdP sync for Cloud E2E (Okta-shaped group + deactivate).
 * Production-shaped POST /sync/directory — arrange until real Keycloak/OIDC lands.
 * Pass-when for SI-07/08 remains /decision or CDP approve + /audit.
 */
import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness } from "@/lib/managed/e2e/service";
import { appendAudit, personByName } from "@/lib/managed/e2e/world";

export type DirectorySyncBody = {
  removeJordanFromSupport?: boolean;
  deactivatePriya?: boolean;
  addJordanToLegal?: boolean;
};

export function postDirectorySync(req: Request): Effect.Effect<NextResponse, unknown, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
    }

    const body = (yield* Effect.tryPromise({
      try: () => req.json() as Promise<DirectorySyncBody>,
      catch: () => ({}),
    })) as DirectorySyncBody;

    const applied: string[] = [];

    if (body.removeJordanFromSupport) {
      const jordan = personByName("Jordan Park");
      if (jordan) {
        jordan.groups = jordan.groups.filter((g) => g !== "Support");
        jordan.canAnswerTicketTriage = false;
        appendAudit("okta", "sync.group", "Jordan removed from Support");
        applied.push("removeJordanFromSupport");
      }
    }
    if (body.deactivatePriya) {
      const priya = personByName("Priya Shah");
      if (priya) {
        priya.active = false;
        appendAudit("okta", "sync.deactivate", "Priya deactivated");
        applied.push("deactivatePriya");
      }
    }
    if (body.addJordanToLegal) {
      const jordan = personByName("Jordan Park");
      if (jordan) {
        if (!jordan.groups.includes("Legal")) jordan.groups.push("Legal");
        jordan.canApproveContracts = true;
        appendAudit("okta", "sync.group", "Jordan added to Legal");
        applied.push("addJordanToLegal");
      }
    }

    return NextResponse.json({ ok: true, provider: "okta-shaped", applied });
  });
}
