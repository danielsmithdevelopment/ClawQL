import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";

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
  Title,
} from "@/src/ui/primitives";

export default function ReviewQueueScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [source, setSource] = useState<"live" | "fixture">("fixture");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const res = await Effect.runPromise(listReviewEffect(session));
      setItems([...res.items]);
      setSource(res.source);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session || loading) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <Screen testID="review-queue-screen">
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ marginBottom: space.md }}>
            <Title accessibilityRole="header">Review</Title>
            <Meta style={{ marginTop: 4 }}>
              {items.length} waiting · source {source}
            </Meta>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
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
        )}
        ListEmptyComponent={
          <Meta testID="review-empty">Queue clear. Decided requests move to the audit log.</Meta>
        }
      />
    </Screen>
  );
}
