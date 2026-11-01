import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import type { AutomationSub } from "@/src/domain/schemas";
import { listAutomationsEffect } from "@/src/services/api";
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

export default function AutomationsScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<readonly AutomationSub[]>([]);

  useEffect(() => {
    if (!session) return;
    void Effect.runPromise(listAutomationsEffect(session)).then(setRows);
  }, [session]);

  if (!session) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenScroll testID="automations-screen">
      <SectionHeader
        icon="agents"
        title="Automations"
        subtitle="Subscriptions, webhooks, and streams — same catalog as the cloud console."
      />
      <SurfaceCard testID="automations-readonly-banner" tint="soft">
        <Badge label="Read-only in v1" tone="neutral" />
        <Meta color={brand.inkFaint}>
          Browse subscriptions here. Create/edit stays on the web console for v1.
        </Meta>
      </SurfaceCard>
      <SurfaceCard testID="automations-list">
        <Column spacing={space.sm}>
          {rows.map((row) => (
            <SurfaceCard key={row.id} testID={`automation-row-${row.id}`} tint="soft">
              <Badge label={row.health} tone={row.tone} />
              <Body>{row.name}</Body>
              <Meta color={brand.inkFaint}>{`${row.via} · ${row.target}`}</Meta>
              <Meta color={brand.inkFaint}>{`${row.events} · last ${row.last}`}</Meta>
            </SurfaceCard>
          ))}
        </Column>
      </SurfaceCard>
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
