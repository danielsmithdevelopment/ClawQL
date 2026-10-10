/**
 * Push registration + deep-link routing into Review detail.
 * Expo Notifications handles APNs/FCM once EAS credentials are configured.
 */
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { Context, Data, Effect, Layer } from "effect";
import { Platform } from "react-native";

import type { MobileSession } from "../domain/schemas";
import { loadMobileConfigEffect } from "./config";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export class PushError extends Data.TaggedError("PushError")<{
  readonly reason: string;
}> {}

export type ApprovalPushPayload = {
  readonly type: "approval_request";
  readonly requestId: string;
};

export function parseApprovalDeepLinkEffect(
  url: string
): Effect.Effect<string | null> {
  return Effect.sync(() => {
    try {
      // Prefer URL so clawql://review/id (host=review, path=/id) works.
      const u = new URL(url);
      const fromQuery = u.searchParams.get("requestId");
      if (fromQuery) return fromQuery;
      const parts = [
        u.hostname && u.hostname !== "cloud.clawql.com" && u.hostname !== "acme.cloud.clawql.com"
          ? u.hostname
          : null,
        ...u.pathname.split("/"),
      ]
        .filter((p): p is string => Boolean(p && p.length > 0));
      if (parts[0] === "app") parts.shift();
      if (parts[0] === "review" && parts[1]) return parts[1];

      // Fallback: expo-linking parse for odd schemes
      const parsed = Linking.parse(url);
      const path = parsed.path ?? "";
      const segments = path.replace(/^\//, "").split("/").filter(Boolean);
      if (segments[0] === "app") segments.shift();
      if (segments[0] === "review" && segments[1]) return segments[1];
      if (parsed.queryParams?.requestId) return String(parsed.queryParams.requestId);
      return null;
    } catch {
      return null;
    }
  });
}

export function registerForPushEffect(
  session: MobileSession
): Effect.Effect<{ token: string | null }, PushError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (config.fixtureMode || Platform.OS === "web") {
      return { token: null };
    }
    const permissions = yield* Effect.tryPromise({
      try: () => Notifications.getPermissionsAsync(),
      catch: (cause) =>
        new PushError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });
    let status = permissions.status;
    if (status !== "granted") {
      const asked = yield* Effect.tryPromise({
        try: () => Notifications.requestPermissionsAsync(),
        catch: (cause) =>
          new PushError({
            reason: cause instanceof Error ? cause.message : String(cause),
          }),
      });
      status = asked.status;
    }
    if (status !== "granted") {
      return { token: null };
    }
    const token = yield* Effect.tryPromise({
      try: async () => {
        const t = await Notifications.getExpoPushTokenAsync();
        return t.data;
      },
      catch: (cause) =>
        new PushError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });

    // Best-effort register with managed console (no-op if route not yet deployed).
    yield* Effect.tryPromise({
      try: async () => {
        await fetch(`${config.apiBase}/api/managed/devices/push`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({
            token,
            platform: Platform.OS,
            userId: session.userId,
          }),
        }).catch(() => undefined);
      },
      catch: () => new PushError({ reason: "register_failed" }),
    }).pipe(Effect.catch(() => Effect.void));

    return { token };
  });
}

export function buildReviewDeepLinkEffect(requestId: string): Effect.Effect<string> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    return `${config.apiBase}/app/review/${encodeURIComponent(requestId)}`;
  });
}

export const CLAWQL_PUSH_TAG = "clawql/MobilePush" as const;

export class MobilePush extends Context.Service<
  typeof CLAWQL_PUSH_TAG,
  {
    readonly register: (
      session: MobileSession
    ) => Effect.Effect<{ token: string | null }, PushError>;
    readonly parseApprovalDeepLink: (url: string) => Effect.Effect<string | null>;
    readonly buildReviewDeepLink: (requestId: string) => Effect.Effect<string>;
  }
>()(CLAWQL_PUSH_TAG) {}

export const MobilePushLive = Layer.succeed(MobilePush, {
  register: registerForPushEffect,
  parseApprovalDeepLink: parseApprovalDeepLinkEffect,
  buildReviewDeepLink: buildReviewDeepLinkEffect,
});
