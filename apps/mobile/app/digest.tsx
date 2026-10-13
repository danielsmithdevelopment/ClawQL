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
  IconBubble,
  LoadingBlock,
  Meta,
  ScreenHost,
  ScreenScroll,
  SecondaryButton,
  SectionHeader,
  Subtitle,
  SurfaceCard,
} from "@/src/ui/primitives";

export default function DigestScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [digest, setDigest] = useState<MorningDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    <ScreenScroll
      testID="digest-screen"
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
      <SectionHeader icon="digest" title={digest.headline} subtitle={digest.whenLabel} tone="seed" />
      <Body>{digest.summary}</Body>

      {digest.awaitingYou > 0 ? (
        <SurfaceCard testID="digest-awaiting" tint="seed" elevated>
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
            <Column spacing={space.sm}>
              <IconBubble
                name={item.tone === "warn" ? "change" : item.tone === "ok" ? "activity" : "agents"}
                tone="seed"
                size={32}
                iconSize={16}
              />
              <Badge label={item.tone} tone={item.tone} />
              <Body>{item.title}</Body>
              <Meta>{item.detail}</Meta>
            </Column>
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
