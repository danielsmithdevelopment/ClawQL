import { Effect } from "effect";

import { AUDIT_ENTRIES, AUDIT_INCIDENT } from "@/lib/managed/fixtures-ops";

export type ManagedAuditIncident = {
  readonly entryId: string;
  readonly incidentId: string;
  readonly foundAt: string;
  readonly summary: string;
  readonly explanation: string;
  readonly paymentNote: string;
};

export const listManagedAuditEffect = (): Effect.Effect<{
  readonly entries: typeof AUDIT_ENTRIES;
  readonly incident: ManagedAuditIncident;
  readonly source: "fixture";
}> =>
  Effect.succeed({
    entries: AUDIT_ENTRIES,
    incident: {
      entryId: AUDIT_INCIDENT.entryId,
      incidentId: AUDIT_INCIDENT.incidentId,
      foundAt: AUDIT_INCIDENT.foundAt,
      summary: AUDIT_INCIDENT.summary,
      explanation: AUDIT_INCIDENT.explanation,
      paymentNote: AUDIT_INCIDENT.paymentNote,
    },
    source: "fixture",
  });
