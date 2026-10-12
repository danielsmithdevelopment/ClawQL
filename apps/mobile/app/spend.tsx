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
  LoadingBlock,
  Meta,
  ScreenHost,
  ScreenScroll,
  SecondaryButton,
  Subtitle,
  SurfaceCard,
  Title,
} from "@/src/ui/primitives";

export default function SpendScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [spend, setSpend] = useState<HomeSpend | null>(null);
  const [loading, setLoading] = useState(true);

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
    <ScreenScroll testID="spend-screen">
      <Title>{spend.label}</Title>
      <Title testID="spend-amount">{spend.amount}</Title>
      <Meta>{spend.note}</Meta>

      <SurfaceCard testID="spend-by-agent">
        <Subtitle>By agent</Subtitle>
        <Column spacing={space.sm}>
          {(spend.lines ?? []).map((line) => (
            <Column key={line.agent} spacing={2} testID={`spend-line-${line.agent}`}>
              <Body>{`${line.agent} · ${line.amount}`}</Body>
              <Meta>{line.note}</Meta>
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
