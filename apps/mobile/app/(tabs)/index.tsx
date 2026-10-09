import { Effect } from "effect";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import type { HomeSpend, ReviewItem } from "@/src/domain/schemas";
import { getHomeSpendEffect, listReviewEffect } from "@/src/services/api";
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
  Subtitle,
  Title,
} from "@/src/ui/primitives";

export default function HomeScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [spend, setSpend] = useState<HomeSpend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      const [review, spendRes] = await Promise.all([
        Effect.runPromise(listReviewEffect(session)),
        Effect.runPromise(getHomeSpendEffect(session)),
      ]);
      setItems([...review.items]);
      setSpend(spendRes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
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
    <ScreenScroll testID="home-screen">
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
      {error ? <Meta style={{ color: "#BE123C" }}>{error}</Meta> : null}
      {items.length === 0 ? (
        <Meta testID="home-empty">Nothing waiting. You're clear.</Meta>
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
    </ScreenScroll>
  );
}
