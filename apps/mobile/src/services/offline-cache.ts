/**
 * Offline snapshot of Review / Activity / Inbox for flaky mobile networks.
 * Encrypted at rest with a key kept in SecureStore (audit 8.07).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Context, Data, Effect, Layer } from "effect";
import { Platform } from "react-native";

import type {
  ActivityEvent,
  InboxItem,
  ReviewItem,
  ReviewListResponse,
} from "../domain/schemas";

const SNAPSHOT_KEY = "clawql.mobile.offlineSnapshot.v2";
const KEY_ID = "clawql.mobile.offlineSnapshot.key.v1";

export class OfflineCacheError extends Data.TaggedError("OfflineCacheError")<{
  readonly reason: string;
}> {}

export type OfflineSnapshot = {
  readonly savedAtMs: number;
  readonly reviewItems: readonly ReviewItem[];
  readonly activityEvents: readonly ActivityEvent[];
  readonly inbox: readonly InboxItem[];
};

function canUseSecureStore(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

async function getOrCreateKey(): Promise<string> {
  if (canUseSecureStore()) {
    const existing = await SecureStore.getItemAsync(KEY_ID);
    if (existing) return existing;
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await SecureStore.setItemAsync(KEY_ID, key);
    return key;
  }
  // Web / tests: ephemeral key in memory (not durable across reloads — acceptable for demo).
  const g = globalThis as { __clawqlOfflineKey?: string };
  if (!g.__clawqlOfflineKey) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    g.__clawqlOfflineKey = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return g.__clawqlOfflineKey;
}

async function xorEncrypt(plaintext: string, keyHex: string): Promise<string> {
  const key = new Uint8Array(keyHex.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)));
  const data = new TextEncoder().encode(plaintext);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i]! ^ key[i % key.length]!;
  }
  let binary = "";
  for (let i = 0; i < out.length; i++) binary += String.fromCharCode(out[i]!);
  return btoa(binary);
}

async function xorDecrypt(ciphertextB64: string, keyHex: string): Promise<string> {
  const key = new Uint8Array(keyHex.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)));
  const binary = atob(ciphertextB64);
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i]! ^ key[i % key.length]!;
  }
  return new TextDecoder().decode(out);
}

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
      const key = await getOrCreateKey();
      const sealed = await xorEncrypt(JSON.stringify(snap), key);
      await AsyncStorage.setItem(SNAPSHOT_KEY, sealed);
      // Drop any legacy plaintext snapshot.
      await AsyncStorage.removeItem("clawql.mobile.offlineSnapshot.v1");
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
      const key = await getOrCreateKey();
      let parsed: Partial<OfflineSnapshot>;
      try {
        const json = await xorDecrypt(raw, key);
        parsed = JSON.parse(json) as Partial<OfflineSnapshot>;
      } catch {
        return null;
      }
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
      await AsyncStorage.removeItem("clawql.mobile.offlineSnapshot.v1");
      if (canUseSecureStore()) {
        await SecureStore.deleteItemAsync(KEY_ID);
      } else {
        delete (globalThis as { __clawqlOfflineKey?: string }).__clawqlOfflineKey;
      }
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
