import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import type { HomeSpend } from "@/src/domain/schemas";
import { getHomeSpendEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
  Body,
  Column,
  IconBubble,
  LoadingBlock,
  Meta,
  ScreenHost,
  ScreenScroll,
  SecondaryButton,
  SectionHeader,
  Subtitle,
  SurfaceCard,
  Title,
} from "@/src/ui/primitives";

export default function SpendScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [spend, setSpend] = useState<HomeSpend | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setSpend(await Effect.runPromise(getHomeSpendEffect(session)));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session || loading || !spend) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenScroll
      testID="spend-screen"
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        try {
          await load();
        } finally {
          setRefreshing(false);
        }
      }}
    >
      <SectionHeader icon="spend" title={spend.label} subtitle={spend.note} />
      <SurfaceCard tint="seed" elevated>
        <Title testID="spend-amount">{spend.amount}</Title>
        {spend.budget ? <Meta>{`Budget ${spend.budget}`}</Meta> : null}
      </SurfaceCard>

      <SurfaceCard testID="spend-by-agent">
        <Subtitle>By agent</Subtitle>
        <Column spacing={space.sm}>
          {(spend.lines ?? []).map((line) => (
            <Column key={line.agent} spacing={4} testID={`spend-line-${line.agent}`}>
              <Column spacing={space.sm}>
                <IconBubble name="agents" tone="seed" size={28} iconSize={14} />
                <Body>{`${line.agent} · ${line.amount}`}</Body>
                <Meta>{line.note}</Meta>
              </Column>
            </Column>
          ))}
        </Column>
      </SurfaceCard>

      <Meta color={brand.inkFaint}>
        {"Caps and invoices live in the web console. Phone shows today's running total."}
      </Meta>
      <SecondaryButton label="Back to Home" onPress={() => router.replace("/(tabs)")} />
    </ScreenScroll>
  );
}
