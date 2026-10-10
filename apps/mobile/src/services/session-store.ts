import * as SecureStore from "expo-secure-store";
import { Context, Data, Effect, Layer } from "effect";
import { Platform } from "react-native";

import {
  MobileSession,
  SchemaDecodeError,
  decodeUnknownEffect,
} from "../domain/schemas";

const SESSION_KEY = "clawql.mobile.session.v1";

export class SessionStoreError extends Data.TaggedError("SessionStoreError")<{
  readonly reason: string;
}> {}

const memoryFallback = new Map<string, string>();

function canUseSecureStore(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

function canUseLocalStorage(): boolean {
  return (
    Platform.OS === "web" &&
    typeof globalThis !== "undefined" &&
    typeof (globalThis as { localStorage?: Storage }).localStorage !== "undefined"
  );
}

async function writeSessionJson(json: string): Promise<void> {
  if (canUseSecureStore()) {
    await SecureStore.setItemAsync(SESSION_KEY, json);
    return;
  }
  if (canUseLocalStorage()) {
    (globalThis as unknown as { localStorage: Storage }).localStorage.setItem(
      SESSION_KEY,
      json
    );
    return;
  }
  memoryFallback.set(SESSION_KEY, json);
}

async function readSessionJson(): Promise<string | null> {
  if (canUseSecureStore()) {
    return await SecureStore.getItemAsync(SESSION_KEY);
  }
  if (canUseLocalStorage()) {
    return (
      (globalThis as unknown as { localStorage: Storage }).localStorage.getItem(
        SESSION_KEY
      ) ?? null
    );
  }
  return memoryFallback.get(SESSION_KEY) ?? null;
}

async function clearSessionJson(): Promise<void> {
  if (canUseSecureStore()) {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return;
  }
  if (canUseLocalStorage()) {
    (globalThis as unknown as { localStorage: Storage }).localStorage.removeItem(
      SESSION_KEY
    );
    return;
  }
  memoryFallback.delete(SESSION_KEY);
}

export function saveSessionEffect(
  session: MobileSession
): Effect.Effect<void, SessionStoreError> {
  return Effect.tryPromise({
    try: async () => {
      await writeSessionJson(JSON.stringify(session));
    },
    catch: (cause) =>
      new SessionStoreError({
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
  });
}

export function loadSessionEffect(): Effect.Effect<
  MobileSession | null,
  SessionStoreError | SchemaDecodeError
> {
  return Effect.gen(function* () {
    const raw = yield* Effect.tryPromise({
      try: () => readSessionJson(),
      catch: (cause) =>
        new SessionStoreError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return yield* decodeUnknownEffect(MobileSession, parsed);
  });
}

export function clearSessionEffect(): Effect.Effect<void, SessionStoreError> {
  return Effect.tryPromise({
    try: () => clearSessionJson(),
    catch: (cause) =>
      new SessionStoreError({
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
  });
}

export const CLAWQL_SESSION_STORE_TAG = "clawql/MobileSessionStore" as const;

export class MobileSessionStore extends Context.Service<
  typeof CLAWQL_SESSION_STORE_TAG,
  {
    readonly save: (session: MobileSession) => Effect.Effect<void, SessionStoreError>;
    readonly load: () => Effect.Effect<
      MobileSession | null,
      SessionStoreError | SchemaDecodeError
    >;
    readonly clear: () => Effect.Effect<void, SessionStoreError>;
  }
>()(CLAWQL_SESSION_STORE_TAG) {}

export const MobileSessionStoreLive = Layer.succeed(MobileSessionStore, {
  save: saveSessionEffect,
  load: loadSessionEffect,
  clear: clearSessionEffect,
});
