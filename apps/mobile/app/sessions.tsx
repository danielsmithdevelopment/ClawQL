import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import type { AgentSession } from "@/src/domain/schemas";
import { listAgentSessionsEffect } from "@/src/services/api";
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

export default function SessionsScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<readonly AgentSession[]>([]);

  useEffect(() => {
    if (!session) return;
    void Effect.runPromise(listAgentSessionsEffect(session)).then(setRows);
  }, [session]);

  if (!session) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenScroll testID="sessions-screen">
      <SectionHeader
        icon="sessions"
        title="Sessions"
        subtitle="Agent session timeline — same catalog as the cloud console Sessions page."
      />
      <SurfaceCard testID="sessions-list">
        <Column spacing={space.sm}>
          {rows.map((row) => (
            <SurfaceCard key={row.id} testID={`session-row-${row.id}`} tint="soft">
              <Badge label={row.status} tone={row.tone} />
              <Body>{row.name}</Body>
              <Meta color={brand.inkFaint}>{row.meta}</Meta>
              <Meta color={brand.inkFaint}>{row.stats}</Meta>
              <Meta color={brand.inkFaint}>{row.active ? "Active" : "Ended"}</Meta>
            </SurfaceCard>
          ))}
        </Column>
      </SurfaceCard>
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
