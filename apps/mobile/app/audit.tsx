import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import type { AuditEntry, AuditIncident } from "@/src/domain/schemas";
import { getAuditIncidentEffect, listAuditEntriesEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
  Badge,
  Body,
  Column,
  LoadingBlock,
  Meta,
  ScreenHost,
  ScreenScroll,
  SecondaryButton,
  SectionHeader,
  SurfaceCard,
} from "@/src/ui/primitives";

export default function AuditScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<readonly AuditEntry[]>([]);
  const [incident, setIncident] = useState<AuditIncident | null>(null);

  useEffect(() => {
    if (!session) return;
    void Promise.all([
      Effect.runPromise(listAuditEntriesEffect(session)),
      Effect.runPromise(getAuditIncidentEffect(session)),
    ]).then(([entries, inc]) => {
      setRows(entries);
      setIncident(inc);
    });
  }, [session]);

  if (!session) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenScroll testID="audit-screen">
      <SectionHeader
        icon="activity"
        title="Audit"
        subtitle="WORM-style recent entries plus open chain-incident detail."
      />

      <SurfaceCard testID="audit-support-note" tint="soft">
        <Body>Support view-as</Body>
        <Meta color={brand.inkFaint}>
          Owner/Admin “View as” starts only on the cloud console and writes
          `support.impersonation.start|stop` here (and durable JSONL on the
          host). PhoneApprove never starts impersonation — session kill on
          Profile is the mobile incident response for lost devices.
        </Meta>
      </SurfaceCard>

      {incident ? (
        <SurfaceCard testID="audit-incident" tint="soft">
          <Badge label="Open incident" tone="danger" />
          <Body testID="audit-incident-id">{incident.incidentId}</Body>
          <Meta color={brand.inkFaint}>{`Found ${incident.foundAt} · entry ${incident.entryId}`}</Meta>
          <Meta testID="audit-incident-summary">{incident.summary}</Meta>
          <Meta color={brand.inkFaint}>{incident.explanation}</Meta>
          <Meta color={brand.inkFaint}>{incident.paymentNote}</Meta>
        </SurfaceCard>
      ) : null}

      <SurfaceCard testID="audit-list">
        <Body>Recent entries</Body>
        <Column spacing={space.sm}>
          {rows.map((row) => (
            <SurfaceCard key={row.id} testID={`audit-row-${row.id}`} tint="soft">
              <Badge label={row.tone} tone={row.tone} />
              <Body>{row.action}</Body>
              <Meta color={brand.inkFaint}>{`${row.time} · ${row.actor}`}</Meta>
              <Meta color={brand.inkFaint}>{row.outcome}</Meta>
            </SurfaceCard>
          ))}
        </Column>
      </SurfaceCard>
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
