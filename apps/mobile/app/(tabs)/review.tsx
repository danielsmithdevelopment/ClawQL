import { Effect } from "effect";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";

import type { DataSource, ReviewItem, ReviewKind } from "@/src/domain/schemas";
import { listReviewEffect } from "@/src/services/api";
import {
  listReviewFromCacheEffect,
  loadOfflineSnapshotEffect,
} from "@/src/services/offline-cache";
import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
  Column,
  FilterChip,
  List,
  LoadingBlock,
  Meta,
  ReviewRow,
  ScreenHost,
  SecondaryButton,
  SectionHeader,
  SurfaceCard,
  WrapRow,
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
  const [source, setSource] = useState<DataSource>("fixture");
  const [cacheSavedAt, setCacheSavedAt] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const res = await Effect.runPromise(listReviewEffect(session));
      setItems([...res.items]);
      setSource(res.source);
      if (res.source !== "cache") setCacheSavedAt(null);
    } finally {
      setLoading(false);
      setHydrated(true);
    }
  }, [session]);

  const loadFromCache = useCallback(async () => {
    const [cached, snap] = await Promise.all([
      Effect.runPromise(listReviewFromCacheEffect()),
      Effect.runPromise(loadOfflineSnapshotEffect()),
    ]);
    if (!cached) return;
    setItems([...cached.items]);
    setSource("cache");
    setCacheSavedAt(snap?.savedAtMs ?? Date.now());
  }, []);

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
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenHost testID="review-queue-screen">
      <List
        onRefresh={async () => {
          await load();
        }}
      >
        <Column spacing={space.sm} style={{ padding: space.md }} testID="review-filters">
          <SectionHeader
            icon="change"
            title="Review"
            subtitle={`${items.length} waiting · source ${source}`}
            tone="seed"
          />
          {source === "cache" ? (
            <SurfaceCard testID="review-offline-banner" tint="soft">
              <Meta color={brand.warn}>
                {`Offline cache${
                  cacheSavedAt ? ` · saved ${new Date(cacheSavedAt).toLocaleString()}` : ""
                } — browse only. Approving requires a live connection so digest binding can verify the request has not changed.`}
              </Meta>
              <SecondaryButton
                testID="review-reload-live"
                label="Go online to approve"
                onPress={() => void load()}
              />
            </SurfaceCard>
          ) : (
            <SecondaryButton
              testID="review-load-offline-cache"
              label="Show offline cache"
              onPress={() => void loadFromCache()}
            />
          )}
          <WrapRow>
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
          </WrapRow>
          {visible.length === 0 ? (
            <Meta testID="review-empty">
              {items.length === 0
                ? "Queue clear. Decided requests move to Activity."
                : `No ${filter} requests waiting.`}
            </Meta>
          ) : null}
        </Column>

        {visible.map((item) => (
          <ReviewRow
            key={item.id}
            testID={`review-item-${item.id}`}
            kindLabel={item.kindLabel}
            badge={item.badge}
            badgeTone={item.badgeTone}
            title={item.title}
            listMeta={item.listMeta}
            statusLine={item.statusLine}
            onPress={() => router.push(`/review/${item.id}`)}
          />
        ))}
      </List>
    </ScreenHost>
  );
}
