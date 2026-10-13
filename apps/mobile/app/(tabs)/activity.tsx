import { Effect } from "effect";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";

import {
  filterActivityEvents,
  type ActivityDecisionFilter,
  type ActivityKindFilter,
} from "@/src/domain/activity-filters";
import type { ActivityEvent, DataSource } from "@/src/domain/schemas";
import { listActivityEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { space } from "@/src/theme";
import {
  Column,
  FilterChip,
  List,
  LoadingBlock,
  Meta,
  ReviewRow,
  ScreenHost,
  SectionHeader,
  WrapRow,
} from "@/src/ui/primitives";

const KIND_FILTERS: { id: ActivityKindFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "change", label: "Changes" },
  { id: "source", label: "Sources" },
  { id: "decision", label: "Decisions" },
  { id: "skill", label: "Skills" },
];

const DECISION_FILTERS: { id: ActivityDecisionFilter; label: string }[] = [
  { id: "all", label: "Any outcome" },
  { id: "approve", label: "Approved" },
  { id: "decline", label: "Declined" },
  { id: "answer", label: "Answered" },
  { id: "ask_teammate", label: "Asked" },
  { id: "other", label: "Other" },
];

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
  const [kindFilter, setKindFilter] = useState<ActivityKindFilter>("all");
  const [decisionFilter, setDecisionFilter] = useState<ActivityDecisionFilter>("all");
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

  const kindCounts = useMemo(() => {
    const byKind = { change: 0, source: 0, decision: 0, skill: 0 };
    for (const event of events) byKind[event.kind] += 1;
    return byKind;
  }, [events]);

  const decisionCounts = useMemo(() => {
    const counts = {
      approve: 0,
      decline: 0,
      answer: 0,
      ask_teammate: 0,
      other: 0,
    };
    for (const event of events) {
      if (event.decision === "approve") counts.approve += 1;
      else if (event.decision === "decline") counts.decline += 1;
      else if (event.decision === "answer") counts.answer += 1;
      else if (event.decision === "ask_teammate") counts.ask_teammate += 1;
      else counts.other += 1;
    }
    return counts;
  }, [events]);

  const visible = useMemo(
    () => filterActivityEvents(events, kindFilter, decisionFilter),
    [events, kindFilter, decisionFilter]
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
        <Column spacing={space.sm} style={{ padding: space.md }} testID="activity-filters">
          <SectionHeader
            icon="activity"
            title="Activity"
            subtitle={`${events.length} recent · source ${source}`}
            tone="seed"
          />
          <WrapRow>
            {KIND_FILTERS.map((f) => (
              <FilterChip
                key={f.id}
                testID={`activity-filter-kind-${f.id}`}
                label={f.label}
                count={f.id === "all" ? events.length : kindCounts[f.id]}
                selected={kindFilter === f.id}
                onPress={() => setKindFilter(f.id)}
              />
            ))}
          </WrapRow>
          <WrapRow>
            {DECISION_FILTERS.map((f) => (
              <FilterChip
                key={f.id}
                testID={`activity-filter-decision-${f.id}`}
                label={f.label}
                count={f.id === "all" ? events.length : decisionCounts[f.id]}
                selected={decisionFilter === f.id}
                onPress={() => setDecisionFilter(f.id)}
              />
            ))}
          </WrapRow>
          {visible.length === 0 ? (
            <Meta testID="activity-empty">
              {events.length === 0
                ? "Nothing recorded yet. Approvals and answers land here."
                : "No activity matches these filters."}
            </Meta>
          ) : null}
        </Column>

        {visible.map((event) => (
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
