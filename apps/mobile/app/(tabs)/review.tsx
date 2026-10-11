import { Effect } from "effect";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import type { ReviewItem, ReviewKind } from "@/src/domain/schemas";
import { listReviewEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { space } from "@/src/theme";
import {
  Badge,
  Body,
  Card,
  FilterChip,
  LoadingBlock,
  Meta,
  Screen,
  ScreenScroll,
  Title,
} from "@/src/ui/primitives";

type FilterKind = ReviewKind | "all";

const FILTERS: { id: FilterKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "change", label: "Changes" },
  { id: "source", label: "Sources" },
  { id: "decision", label: "Decisions" },
  { id: "skill", label: "Skills" },
];

export default function ReviewQueueScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [source, setSource] = useState<"live" | "fixture">("fixture");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!session) return;
      if (opts?.soft) setRefreshing(true);
      try {
        const res = await Effect.runPromise(listReviewEffect(session));
        setItems([...res.items]);
        setSource(res.source);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setHydrated(true);
      }
    },
    [session]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const counts = useMemo(() => {
    const byKind = { change: 0, source: 0, decision: 0, skill: 0 };
    for (const item of items) byKind[item.kind] += 1;
    return byKind;
  }, [items]);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.kind === filter)),
    [items, filter]
  );

  if (!session || (loading && !hydrated)) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <ScreenScroll
      testID="review-queue-screen"
      refreshing={refreshing}
      onRefresh={() => void load({ soft: true })}
    >
      <View style={{ marginBottom: space.md }}>
        <Title accessibilityRole="header">Review</Title>
        <Meta style={{ marginTop: 4 }}>
          {items.length} waiting · source {source}
        </Meta>
      </View>

      <View
        style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: space.sm }}
        testID="review-filters"
      >
        {FILTERS.map((f) => (
          <FilterChip
            key={f.id}
            testID={`filter-${f.id}`}
            label={f.label}
            count={f.id === "all" ? items.length : counts[f.id]}
            selected={filter === f.id}
            onPress={() => setFilter(f.id)}
          />
        ))}
      </View>

      {visible.length === 0 ? (
        <Meta testID="review-empty">
          {items.length === 0
            ? "Queue clear. Decided requests move to Activity."
            : `No ${filter} requests waiting.`}
        </Meta>
      ) : (
        visible.map((item) => (
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
