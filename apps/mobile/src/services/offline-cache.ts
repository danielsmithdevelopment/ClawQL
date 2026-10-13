/**
 * Offline snapshot of Review / Activity / Inbox for flaky mobile networks.
 * Written after successful loads; read when live fetch fails or user asks for cache.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Context, Data, Effect, Layer } from "effect";

import type {
  ActivityEvent,
  InboxItem,
  ReviewItem,
  ReviewListResponse,
} from "../domain/schemas";

const SNAPSHOT_KEY = "clawql.mobile.offlineSnapshot.v1";

export class OfflineCacheError extends Data.TaggedError("OfflineCacheError")<{
  readonly reason: string;
}> {}

export type OfflineSnapshot = {
  readonly savedAtMs: number;
  readonly reviewItems: readonly ReviewItem[];
  readonly activityEvents: readonly ActivityEvent[];
  readonly inbox: readonly InboxItem[];
};

export function saveOfflineSnapshotEffect(input: {
  reviewItems: readonly ReviewItem[];
  activityEvents: readonly ActivityEvent[];
  inbox: readonly InboxItem[];
}): Effect.Effect<OfflineSnapshot, OfflineCacheError> {
  return Effect.tryPromise({
    try: async () => {
      const snap: OfflineSnapshot = {
        savedAtMs: Date.now(),
        reviewItems: [...input.reviewItems],
        activityEvents: [...input.activityEvents],
        inbox: [...input.inbox],
      };
      await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
      return snap;
    },
    catch: (cause) =>
      new OfflineCacheError({
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
  });
}

export function loadOfflineSnapshotEffect(): Effect.Effect<
  OfflineSnapshot | null,
  OfflineCacheError
> {
  return Effect.tryPromise({
    try: async () => {
      const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<OfflineSnapshot>;
      if (!Array.isArray(parsed.reviewItems)) return null;
      return {
        savedAtMs: typeof parsed.savedAtMs === "number" ? parsed.savedAtMs : 0,
        reviewItems: parsed.reviewItems as ReviewItem[],
        activityEvents: Array.isArray(parsed.activityEvents)
          ? (parsed.activityEvents as ActivityEvent[])
          : [],
        inbox: Array.isArray(parsed.inbox) ? (parsed.inbox as InboxItem[]) : [],
      };
    },
    catch: (cause) =>
      new OfflineCacheError({
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
  });
}

export function clearOfflineSnapshotEffect(): Effect.Effect<void, OfflineCacheError> {
  return Effect.tryPromise({
    try: async () => {
      await AsyncStorage.removeItem(SNAPSHOT_KEY);
    },
    catch: (cause) =>
      new OfflineCacheError({
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
  });
}

/** Serve the review queue from the last offline snapshot (source: cache). */
export function listReviewFromCacheEffect(): Effect.Effect<
  ReviewListResponse | null,
  OfflineCacheError
> {
  return Effect.gen(function* () {
    const snap = yield* loadOfflineSnapshotEffect();
    if (!snap) return null;
    return { items: snap.reviewItems, source: "cache" as const };
  });
}

export const CLAWQL_OFFLINE_CACHE_TAG = "clawql/MobileOfflineCache" as const;

export class MobileOfflineCache extends Context.Service<
  typeof CLAWQL_OFFLINE_CACHE_TAG,
  {
    readonly save: (input: {
      reviewItems: readonly ReviewItem[];
      activityEvents: readonly ActivityEvent[];
      inbox: readonly InboxItem[];
    }) => Effect.Effect<OfflineSnapshot, OfflineCacheError>;
    readonly load: () => Effect.Effect<OfflineSnapshot | null, OfflineCacheError>;
    readonly listReviewFromCache: () => Effect.Effect<
      ReviewListResponse | null,
      OfflineCacheError
    >;
    readonly clear: () => Effect.Effect<void, OfflineCacheError>;
  }
>()(CLAWQL_OFFLINE_CACHE_TAG) {}

export const MobileOfflineCacheLive = Layer.succeed(MobileOfflineCache, {
  save: saveOfflineSnapshotEffect,
  load: loadOfflineSnapshotEffect,
  listReviewFromCache: listReviewFromCacheEffect,
  clear: clearOfflineSnapshotEffect,
});
