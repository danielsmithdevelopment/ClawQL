import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import type { AuditEntry } from "@/src/domain/schemas";
import { listAuditEntriesEffect } from "@/src/services/api";
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

  useEffect(() => {
    if (!session) return;
    void Effect.runPromise(listAuditEntriesEffect(session)).then(setRows);
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
        subtitle="WORM-style recent entries — deepen with chain incident views next."
      />
      <SurfaceCard testID="audit-list">
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
