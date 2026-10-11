import { Effect } from "effect";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import type { ActivityEvent, HomeSpend, ReviewItem } from "@/src/domain/schemas";
import {
  getHomeSpendEffect,
  listActivityEffect,
  listReviewEffect,
} from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { colors, space } from "@/src/theme";
import {
  Badge,
  Body,
  Card,
  LoadingBlock,
  Meta,
  Screen,
  ScreenScroll,
  Subtitle,
  Title,
} from "@/src/ui/primitives";

function formatRelative(atMs: number): string {
  const mins = Math.max(0, Math.round((Date.now() - atMs) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function HomeScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [spend, setSpend] = useState<HomeSpend | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!session) return;
      if (opts?.soft) setRefreshing(true);
      setError(null);
      try {
        const [review, spendRes, activityRes] = await Promise.all([
          Effect.runPromise(listReviewEffect(session)),
          Effect.runPromise(getHomeSpendEffect(session)),
          Effect.runPromise(listActivityEffect(session)),
        ]);
        setItems([...review.items]);
        setSpend(spendRes);
        setActivity([...activityRes.events].slice(0, 5));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
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

  if (!session || (loading && !hydrated)) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <ScreenScroll
      testID="home-screen"
      refreshing={refreshing}
      onRefresh={() => void load({ soft: true })}
    >
      <Title accessibilityRole="header">What needs you</Title>
      <Meta style={{ marginTop: 4, marginBottom: space.md }}>
        Signed in as {session.displayName}
        {session.reviewerDemo ? " · reviewer demo" : ""}
      </Meta>
      {spend ? (
        <Card testID="home-spend">
          <Subtitle>{spend.label}</Subtitle>
          <Title style={{ marginTop: 4 }}>{spend.amount}</Title>
          <Meta style={{ marginTop: 4 }}>{spend.note}</Meta>
        </Card>
      ) : null}
      <Subtitle style={{ marginBottom: space.sm }}>Needs action</Subtitle>
      {error ? <Meta style={{ color: colors.danger }}>{error}</Meta> : null}
      {items.length === 0 ? (
        <Meta testID="home-empty">Nothing waiting. You are clear.</Meta>
      ) : (
        items.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            testID={`home-item-${item.id}`}
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

      <Subtitle style={{ marginTop: space.md, marginBottom: space.sm }}>Recent activity</Subtitle>
      {activity.length === 0 ? (
        <Meta testID="home-activity-empty">No recent decisions yet.</Meta>
      ) : (
        activity.map((event) => (
          <Card key={event.id} testID={`home-activity-${event.id}`}>
            <Body style={{ fontWeight: "600" }}>{event.title}</Body>
            <Meta style={{ marginTop: 4 }}>
              {event.detail} · {formatRelative(event.atMs)}
            </Meta>
          </Card>
        ))
      )}
      <Pressable
        accessibilityRole="button"
        testID="home-open-activity"
        onPress={() => router.push("/(tabs)/activity")}
      >
        <Meta style={{ color: colors.accent, marginBottom: space.lg }}>See all activity →</Meta>
      </Pressable>
    </ScreenScroll>
  );
}
