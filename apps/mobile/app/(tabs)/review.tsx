import { Effect } from "effect";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import type { ReviewItem } from "@/src/domain/schemas";
import { listReviewEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { space } from "@/src/theme";
import {
  Badge,
  Body,
  Card,
  LoadingBlock,
  Meta,
  Screen,
  ScreenScroll,
  Title,
} from "@/src/ui/primitives";

export default function ReviewQueueScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [source, setSource] = useState<"live" | "fixture">("fixture");
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const res = await Effect.runPromise(listReviewEffect(session));
      setItems([...res.items]);
      setSource(res.source);
    } finally {
      setLoading(false);
      setHydrated(true);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!session || (loading && !hydrated)) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <ScreenScroll testID="review-queue-screen">
      <View style={{ marginBottom: space.md }}>
        <Title accessibilityRole="header">Review</Title>
        <Meta style={{ marginTop: 4 }}>
          {items.length} waiting · source {source}
        </Meta>
      </View>
      {items.length === 0 ? (
        <Meta testID="review-empty">Queue clear. Decided requests move to the audit log.</Meta>
      ) : (
        items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            testID={`review-item-${item.id}`}
            onPress={() => router.push(`/review/${item.id}`)}
          >
            <Card>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Meta>{item.kindLabel}</Meta>
                <Badge label={item.badge} tone={item.badgeTone} />
              </View>
              <Body style={{ fontWeight: "600", marginTop: 6 }}>{item.title}</Body>
              <Meta style={{ marginTop: 4 }}>{item.listMeta}</Meta>
              <Meta style={{ marginTop: 6 }}>{item.statusLine}</Meta>
            </Card>
          </Pressable>
        ))
      )}
    </ScreenScroll>
  );
}
