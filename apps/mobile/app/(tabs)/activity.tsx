import { Effect } from "effect";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import type { ActivityEvent } from "@/src/domain/schemas";
import { listActivityEffect } from "@/src/services/api";
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

function formatWhen(atMs: number): string {
  try {
    return new Date(atMs).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return String(atMs);
  }
}

export default function ActivityScreen() {
  const { session } = useSession();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [source, setSource] = useState<"live" | "fixture">("fixture");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!session) return;
      if (opts?.soft) setRefreshing(true);
      try {
        const res = await Effect.runPromise(listActivityEffect(session));
        setEvents([...res.events]);
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

  if (!session || (loading && !hydrated)) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <ScreenScroll
      testID="activity-screen"
      refreshing={refreshing}
      onRefresh={() => void load({ soft: true })}
    >
      <Title accessibilityRole="header">Activity</Title>
      <Meta style={{ marginTop: 4, marginBottom: space.md }}>
        Your recent decisions · source {source}
      </Meta>
      {events.length === 0 ? (
        <Meta testID="activity-empty">Nothing recorded yet. Approvals and answers land here.</Meta>
      ) : (
        events.map((event) => (
          <Card key={event.id} testID={`activity-event-${event.id}`}>
            <Badge label={event.kind} tone="neutral" />
            <Body style={{ fontWeight: "600", marginTop: 6 }}>{event.title}</Body>
            <Meta style={{ marginTop: 4 }}>{event.detail}</Meta>
            <Meta style={{ marginTop: 6 }}>{formatWhen(event.atMs)}</Meta>
          </Card>
        ))
      )}
    </ScreenScroll>
  );
}
