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

export function saveSessionEffect(
  session: MobileSession
): Effect.Effect<void, SessionStoreError> {
  return Effect.tryPromise({
    try: async () => {
      const json = JSON.stringify(session);
      if (canUseSecureStore()) {
        await SecureStore.setItemAsync(SESSION_KEY, json);
      } else {
        memoryFallback.set(SESSION_KEY, json);
      }
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
      try: async () => {
        if (canUseSecureStore()) {
          return await SecureStore.getItemAsync(SESSION_KEY);
        }
        return memoryFallback.get(SESSION_KEY) ?? null;
      },
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
    try: async () => {
      if (canUseSecureStore()) {
        await SecureStore.deleteItemAsync(SESSION_KEY);
      } else {
        memoryFallback.delete(SESSION_KEY);
      }
    },
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
