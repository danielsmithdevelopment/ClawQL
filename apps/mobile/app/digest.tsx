import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import type { MorningDigest } from "@/src/domain/schemas";
import { getMorningDigestEffect } from "@/src/services/api";
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
  Subtitle,
  SurfaceCard,
  Title,
} from "@/src/ui/primitives";

export default function DigestScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [digest, setDigest] = useState<MorningDigest | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setDigest(await Effect.runPromise(getMorningDigestEffect(session)));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session || loading || !digest) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenScroll testID="digest-screen">
      <Title>{digest.headline}</Title>
      <Meta>{digest.whenLabel}</Meta>
      <Body>{digest.summary}</Body>

      {digest.awaitingYou > 0 ? (
        <SurfaceCard testID="digest-awaiting">
          <Badge label={`${digest.awaitingYou} waiting`} tone="warn" />
          <Subtitle>Still needs you</Subtitle>
          <Meta>Open Review to clear what piled up overnight.</Meta>
          <SecondaryButton
            testID="digest-open-review"
            label="Go to Review"
            onPress={() => router.replace("/(tabs)/review")}
          />
        </SurfaceCard>
      ) : null}

      <Column spacing={space.sm}>
        {digest.items.map((item) => (
          <SurfaceCard key={item.id} testID={`digest-item-${item.id}`}>
            <Badge label={item.tone} tone={item.tone} />
            <Body>{item.title}</Body>
            <Meta>{item.detail}</Meta>
          </SurfaceCard>
        ))}
      </Column>

      <Meta color={brand.inkFaint}>
        Turn the morning digest on or off under Profile → When something needs you.
      </Meta>
      <SecondaryButton label="Back to Home" onPress={() => router.replace("/(tabs)")} />
    </ScreenScroll>
  );
}
