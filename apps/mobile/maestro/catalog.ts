/**
 * Mobile E2E catalog (MOB-*) — Maestro on simulator/emulator (+ CI web Playwright).
 * Kept separate from the dashboard cloud catalog (202 scenarios) so assertCatalogComplete stays stable.
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
    id: "MOB-07",
    run: "Maestro",
    title: "Approve via fixture simulated NFC (no hardware)",
    passWhen: "Fixture session Approves a change; activity records fixture-nfc attestation",
    flow: "maestro/flows/mob-07-approve-fixture-nfc.yaml",
  },
  {
    id: "MOB-08",
    run: "Maestro",
    title: "Answer a decision and filter the review queue",
    passWhen: "Decision leaves queue after Submit answer; Decisions filter shows remaining count",
    flow: "maestro/flows/mob-08-decision-and-filter.yaml",
  },
  {
    id: "MOB-09",
    run: "Maestro",
    title: "Promote a skill and resolve outcome-unknown",
    passWhen: "Skill leaves queue after promote; outcome-unknown marked applied",
    flow: "maestro/flows/mob-09-skill-and-outcome.yaml",
  },
  {
    id: "MOB-10",
    run: "Maestro",
    title: "End other sessions and simulate local approval push",
    passWhen: "Other sessions ended; Home schedules local notification / web sim",
    flow: "maestro/flows/mob-10-sessions-and-push.yaml",
  },
  {
    id: "MOB-11",
    run: "Maestro",
    title: "Register push device and scan document evidence",
    passWhen:
      "Profile shows fixture push token; Home sim lands in inbox; review attaches fixture camera scan",
    flow: "maestro/flows/mob-11-push-register-and-scan.yaml",
  },
  {
    id: "MOB-12",
    run: "Maestro",
    title: "Refresh session and share request link",
    passWhen: "Profile renews fixture expiry; Review shows Share request link",
    flow: "maestro/flows/mob-12-session-refresh.yaml",
  },
  {
    id: "MOB-13",
    run: "Maestro",
    title: "App Lock on, lock now, unlock",
    passWhen: "Lock screen appears after Lock now; fixture Unlock returns to Profile",
    flow: "maestro/flows/mob-13-app-lock.yaml",
  },
  {
    id: "MOB-14",
    run: "Maestro",
    title: "Offline cache banner and mark all inbox read",
    passWhen: "Review shows offline cache banner; Inbox mark-all-read clears unread",
    flow: "maestro/flows/mob-14-offline-cache.yaml",
  },
  {
    id: "MOB-15",
    run: "Maestro",
    title: "Ask a named teammate on a decision",
    passWhen: "Picker lists approvers; Ask confirms; Activity names the teammate",
    flow: "maestro/flows/mob-15-ask-teammate.yaml",
  },
  {
    id: "MOB-16",
    run: "Maestro",
    title: "Evidence preview and remove attachment",
    passWhen: "Scan shows preview plate; Remove restores empty attachments state",
    flow: "maestro/flows/mob-16-attachment-preview-remove.yaml",
  },
  {
    id: "MOB-17",
    run: "Maestro",
    title: "Surface deep links (inbox digest agents policy)",
    passWhen: "clawql://inbox|digest|agents|policies/:id land on the matching screen",
    flow: "maestro/flows/mob-17-surface-deeplinks.yaml",
  },
  {
    id: "MOB-18",
    run: "Maestro",
    title: "Activity kind and outcome filters",
    passWhen: "Source filter hides decision events; Answered filter shows answer only",
    flow: "maestro/flows/mob-18-activity-filters.yaml",
  },
  {
    id: "MOB-19",
    run: "Maestro",
    title: "System inbox Mark read",
    passWhen: "Unread system row shows Mark read; tap clears the action",
    flow: "maestro/flows/mob-19-system-mark-read.yaml",
  },
  {
    id: "MOB-20",
    run: "Maestro",
    title: "Fixture store subscribe + biometrics capability",
    passWhen: "Profile Subscribe Pro (sandbox) upgrades plan; Face ID / App Lock capability shown",
    flow: "maestro/flows/mob-20-store-subscribe-sandbox.yaml",
  },
  {
    id: "MOB-21",
    run: "Maestro",
    title: "Restore purchases and manage-subscriptions affordance",
    passWhen: "After Pro sandbox subscribe, Restore and Manage in App Store / Play are visible",
    flow: "maestro/flows/mob-21-store-restore-manage.yaml",
  },
  {
    id: "MOB-22",
    run: "Maestro",
    title: "Face ID / Touch ID App Lock labels and unlock",
    passWhen: "Bio capability shown; Lock now → Unlock with Face ID fixture returns to Profile",
    flow: "maestro/flows/mob-22-faceid-app-lock-labels.yaml",
  },
  {
    id: "MOB-23",
    run: "Maestro",
    title: "Spend free-plan upgrade CTA opens Profile billing",
    passWhen: "Spend shows upgrade CTA; View plan & billing lands on Profile Plan & billing",
    flow: "maestro/flows/mob-23-spend-upgrade-cta.yaml",
  },
  {
    id: "MOB-24",
    run: "Maestro",
    title: "Voice assistant list pending (fixture dictate)",
    passWhen: "Voice screen runs list pending and shows spoken pending titles",
    flow: "maestro/flows/mob-24-voice-list-pending.yaml",
  },
  {
    id: "MOB-25",
    run: "Maestro",
    title: "Voice start workflow + Shortcuts donation share",
    passWhen: "start standup digest navigates to Workflows; Shortcuts share note appears",
    flow: "maestro/flows/mob-25-voice-workflow-shortcuts.yaml",
  },
  {
    id: "MOB-26",
    run: "Maestro",
    title: "Memory explorer search and detail",
    passWhen: "Memory list filters; open Northwind entity shows fields",
    flow: "maestro/flows/mob-26-memory-explorer.yaml",
  },
  {
    id: "MOB-27",
    run: "Maestro",
    title: "API keys issue revoke and copy secret",
    passWhen: "Issue key shows secret; revoke removes row",
    flow: "maestro/flows/mob-27-api-keys.yaml",
  },
  {
    id: "MOB-28",
    run: "Maestro",
    title: "Sessions timeline lists active agents",
    passWhen: "Sessions screen shows legal-ops waiting row",
    flow: "maestro/flows/mob-28-sessions.yaml",
  },
  {
    id: "MOB-29",
    run: "Maestro",
    title: "Skills proposed and active queues",
    passWhen: "Skills screen shows proposed + active sections",
    flow: "maestro/flows/mob-29-skills.yaml",
  },
  {
    id: "MOB-30",
    run: "Maestro",
    title: "Connections accounts and Settings network",
    passWhen: "Connections shows GitHub accounts; Settings shows webhook hosts",
    flow: "maestro/flows/mob-30-connections-settings.yaml",
  },
  {
    id: "MOB-31",
    run: "Maestro",
    title: "Team invite with acceptance checks and roles",
    passWhen: "Invite sends after checkboxes; Roles tab shows Admin",
    flow: "maestro/flows/mob-31-team-invite.yaml",
  },
  {
    id: "MOB-32",
    run: "Maestro",
    title: "Usage month forecast and team budgets",
    passWhen: "Spend shows month usage and documents team row",
    flow: "maestro/flows/mob-32-usage-depth.yaml",
  },
  {
    id: "MOB-33",
    run: "Maestro",
    title: "Gateway routes and Memory pipelines erase",
    passWhen: "Gateway shows standard route; erase Jane Okafor after checks",
    flow: "maestro/flows/mob-33-gateway-memory-erase.yaml",
  },
  {
    id: "MOB-34",
    run: "Maestro",
    title: "Billing portal CTA fixture honesty",
    passWhen: "Spend portal button shows fixture honesty note",
    flow: "maestro/flows/mob-34-billing-portal.yaml",
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

export function assertMobileCatalogComplete(): void {
  const maestro = MOBILE_SCENARIOS.filter((s) => s.run === "Maestro");
  const manual = MOBILE_SCENARIOS.filter((s) => s.run === "Manual");
  if (maestro.length !== 30) {
    throw new Error(`Expected 30 Maestro MOB scenarios, got ${maestro.length}`);
  }
  if (manual.length !== 2) {
    throw new Error(`Expected 2 Manual scenarios (REV-13, UX-09), got ${manual.length}`);
  }
  for (const s of maestro) {
    if (!s.flow) throw new Error(`${s.id} missing flow path`);
  }
}
