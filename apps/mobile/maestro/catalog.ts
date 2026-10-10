/**
 * Mobile E2E catalog (MOB-*) — Maestro on simulator/emulator.
 * Kept separate from the dashboard cloud catalog (197 scenarios) so assertCatalogComplete stays stable.
 * REV-13 / UX-09 remain Manual (physical YubiKey NFC).
 */

export type MobileScenario = {
  readonly id: string;
  readonly run: "Maestro" | "Manual";
  readonly title: string;
  readonly passWhen: string;
  readonly flow?: string;
};

export const MOBILE_SCENARIOS: readonly MobileScenario[] = [
  {
    id: "MOB-01",
    run: "Maestro",
    title: "Sign in without localhost (fixture / system browser return)",
    passWhen: "Home is visible after fixture or browser callback; no localhost redirect",
    flow: "maestro/flows/mob-01-sign-in-fixture.yaml",
  },
  {
    id: "MOB-02",
    run: "Maestro",
    title: "Decline an exact-change request",
    passWhen: "Request leaves the queue; decline recorded",
    flow: "maestro/flows/mob-02-review-decline.yaml",
  },
  {
    id: "MOB-03",
    run: "Maestro",
    title: "Approve via reviewer-demo device biometrics",
    passWhen: "Approved with audit tag device_biometric_reviewer_demo",
    flow: "maestro/flows/mob-03-approve-reviewer-demo.yaml",
  },
  {
    id: "MOB-04",
    run: "Maestro",
    title: "Push / deep link opens the exact request",
    passWhen: "clawql://review/:id or https://cloud.clawql.com/app/review/:id lands on detail",
    flow: "maestro/flows/mob-04-push-deeplink.yaml",
  },
  {
    id: "MOB-05",
    run: "Maestro",
    title: "Revoke a connected app and delete the account",
    passWhen: "App gone from Connected apps; delete cascade completes; sign-in shown",
    flow: "maestro/flows/mob-05-revoke-and-delete.yaml",
  },
  {
    id: "MOB-06",
    run: "Maestro",
    title: "Sign out",
    passWhen: "Returns to Sign in with browser CTA",
    flow: "maestro/flows/mob-06-sign-out.yaml",
  },
  {
    id: "REV-13",
    run: "Manual",
    title: 'Choose "use my phone instead" and approve by tapping the YubiKey to the phone',
    passWhen: "Request approved; phone recorded as approving device",
  },
  {
    id: "UX-09",
    run: "Manual",
    title: "Approve a request in the iPhone app by tapping a YubiKey",
    passWhen: "Approved; audit records phone and key",
  },
];
