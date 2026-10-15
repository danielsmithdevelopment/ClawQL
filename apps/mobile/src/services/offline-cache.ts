/**
 * Offline snapshot of Review / Activity / Inbox for flaky mobile networks.
 * Payload is AES-GCM encrypted with a key kept in expo-secure-store (Keychain /
 * Keystore). Cleared on sign-out. Approving still requires a live round-trip —
 * cache is browse-only.
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

const SNAPSHOT_KEY = "clawql.mobile.offlineSnapshot.v2.enc";
const LEGACY_SNAPSHOT_KEY = "clawql.mobile.offlineSnapshot.v1";
const KEY_ALIAS = "clawql.mobile.offlineCacheKey.v1";

export class OfflineCacheError extends Data.TaggedError("OfflineCacheError")<{
  readonly reason: string;
}> {}

export type OfflineSnapshot = {
  readonly savedAtMs: number;
  readonly reviewItems: readonly ReviewItem[];
  readonly activityEvents: readonly ActivityEvent[];
  readonly inbox: readonly InboxItem[];
};

const secureStoreOptions: SecureStore.SecureStoreOptions =
  Platform.OS === "ios"
    ? { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
    : {};

async function getOrCreateKeyBytes(): Promise<Uint8Array> {
  const existing = await SecureStore.getItemAsync(KEY_ALIAS, secureStoreOptions);
  if (existing) {
    const bin = Uint8Array.from(atob(existing), (c) => c.charCodeAt(0));
    if (bin.length === 32) return bin;
  }
  const fresh = new Uint8Array(32);
  globalThis.crypto.getRandomValues(fresh);
  await SecureStore.setItemAsync(KEY_ALIAS, btoa(String.fromCharCode(...fresh)), secureStoreOptions);
  return fresh;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey("raw", toArrayBuffer(raw), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function bytesToB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function encryptJson(payload: unknown): Promise<string> {
  const keyBytes = await getOrCreateKeyBytes();
  const key = await importAesKey(keyBytes);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, plain)
  );
  return JSON.stringify({
    v: 2,
    iv: bytesToB64(iv),
    ct: bytesToB64(cipher),
  });
}

async function decryptJson(raw: string): Promise<unknown> {
  const parsed = JSON.parse(raw) as { v?: number; iv?: string; ct?: string };
  if (parsed.v !== 2 || !parsed.iv || !parsed.ct) {
    throw new Error("unsupported_offline_blob");
  }
  const keyBytes = await getOrCreateKeyBytes();
  const key = await importAesKey(keyBytes);
  const iv = b64ToBytes(parsed.iv);
  const ct = b64ToBytes(parsed.ct);
  const plain = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(ct)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

function normalizeSnapshot(parsed: Partial<OfflineSnapshot>): OfflineSnapshot | null {
  if (!Array.isArray(parsed.reviewItems)) return null;
  return {
    savedAtMs: typeof parsed.savedAtMs === "number" ? parsed.savedAtMs : 0,
    reviewItems: parsed.reviewItems as ReviewItem[],
    activityEvents: Array.isArray(parsed.activityEvents)
      ? (parsed.activityEvents as ActivityEvent[])
      : [],
    inbox: Array.isArray(parsed.inbox) ? (parsed.inbox as InboxItem[]) : [],
  };
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
      const enc = await encryptJson(snap);
      await AsyncStorage.setItem(SNAPSHOT_KEY, enc);
      await AsyncStorage.removeItem(LEGACY_SNAPSHOT_KEY);
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
      const enc = await AsyncStorage.getItem(SNAPSHOT_KEY);
      if (enc) {
        try {
          return normalizeSnapshot((await decryptJson(enc)) as Partial<OfflineSnapshot>);
        } catch {
          await AsyncStorage.removeItem(SNAPSHOT_KEY);
        }
      }
      // Drop legacy plaintext cache — never promote it into the encrypted store.
      const legacy = await AsyncStorage.getItem(LEGACY_SNAPSHOT_KEY);
      if (legacy) {
        await AsyncStorage.removeItem(LEGACY_SNAPSHOT_KEY);
      }
      return null;
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
      await Promise.all([
        AsyncStorage.removeItem(SNAPSHOT_KEY),
        AsyncStorage.removeItem(LEGACY_SNAPSHOT_KEY),
      ]);
      await SecureStore.deleteItemAsync(KEY_ALIAS, secureStoreOptions).catch(() => undefined);
    },
    catch: (cause) =>
      new OfflineCacheError({
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
  });
}

/** Serve the review queue from the last offline snapshot (source: cache). Browse-only. */
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
