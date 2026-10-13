import { Effect } from "effect";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import type { ActivityEvent, DataSource } from "@/src/domain/schemas";
import { listActivityEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { space } from "@/src/theme";
import {
  Column,
  List,
  LoadingBlock,
  Meta,
  ReviewRow,
  ScreenHost,
  SectionHeader,
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
  const router = useRouter();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [source, setSource] = useState<DataSource>("fixture");
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const res = await Effect.runPromise(listActivityEffect(session));
      setEvents([...res.events]);
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
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenHost testID="activity-screen">
      <List
        onRefresh={async () => {
          await load();
        }}
      >
        <Column spacing={space.sm} style={{ padding: space.md }}>
          <SectionHeader
            icon="activity"
            title="Activity"
            subtitle={`Your recent decisions · source ${source}`}
            tone="neutral"
          />
          {events.length === 0 ? (
            <Meta testID="activity-empty">
              Nothing recorded yet. Approvals and answers land here.
            </Meta>
          ) : null}
        </Column>

        {events.map((event) => (
          <ReviewRow
            key={event.id}
            testID={`activity-event-${event.id}`}
            kindLabel={event.kind.toUpperCase()}
            badge={event.decision}
            badgeTone="neutral"
            title={event.title}
            listMeta={event.detail}
            statusLine={formatWhen(event.atMs)}
            onPress={() => router.push(`/review/${event.reviewId}`)}
          />
        ))}
      </List>
    </ScreenHost>
  );
}
