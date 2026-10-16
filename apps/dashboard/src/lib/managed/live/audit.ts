import { Effect } from "effect";

import { AUDIT_ENTRIES, AUDIT_INCIDENT } from "@/lib/managed/fixtures-ops";
import { listSupportAuditRuntimeEffect } from "@/lib/managed/live/impersonation";

export type ManagedAuditIncident = {
  readonly entryId: string;
  readonly incidentId: string;
  readonly foundAt: string;
  readonly summary: string;
  readonly explanation: string;
  readonly paymentNote: string;
};

export type ManagedAuditEntry = {
  readonly id: string;
  readonly time: string;
  readonly actor: string;
  readonly action: string;
  readonly outcome: string;
  readonly tone: "ok" | "warn" | "danger";
};

export const listManagedAuditEffect = (): Effect.Effect<{
  readonly entries: readonly ManagedAuditEntry[];
  readonly incident: ManagedAuditIncident;
  readonly source: "fixture";
}> =>
  Effect.gen(function* () {
    const runtime = yield* listSupportAuditRuntimeEffect();
    return {
      entries: [...runtime, ...AUDIT_ENTRIES],
      incident: {
        entryId: AUDIT_INCIDENT.entryId,
        incidentId: AUDIT_INCIDENT.incidentId,
        foundAt: AUDIT_INCIDENT.foundAt,
        summary: AUDIT_INCIDENT.summary,
        explanation: AUDIT_INCIDENT.explanation,
        paymentNote: AUDIT_INCIDENT.paymentNote,
      },
      source: "fixture" as const,
    };
  });
