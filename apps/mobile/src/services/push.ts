/**
 * Push registration + deep-link routing into Review detail.
 * Fixture mode can schedule a local notification (no APNs/FCM/EAS).
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

/** Extract request id from a notification response / content data blob. */
export function parseApprovalNotificationDataEffect(
  data: unknown
): Effect.Effect<string | null> {
  return Effect.sync(() => {
    if (!data || typeof data !== "object") return null;
    const row = data as Record<string, unknown>;
    if (row.type === "approval_request" && typeof row.requestId === "string") {
      return row.requestId;
    }
    if (typeof row.requestId === "string") return row.requestId;
    if (typeof row.url === "string") {
      // Sync parse without Effect nesting
      try {
        const u = new URL(row.url);
        const q = u.searchParams.get("requestId");
        if (q) return q;
        const parts = u.pathname.split("/").filter(Boolean);
        const idx = parts.indexOf("review");
        if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
      } catch {
        return null;
      }
    }
    return null;
  });
}

/**
 * Schedule a local approval notification — works in fixture / Maestro without EAS push creds.
 * On web, returns a synthetic id (Notifications are limited).
 */
export function scheduleLocalApprovalNotificationEffect(input: {
  requestId: string;
  title?: string;
  body?: string;
  delaySeconds?: number;
}): Effect.Effect<{ notificationId: string; simulated: boolean }, PushError> {
  return Effect.gen(function* () {
    if (Platform.OS === "web") {
      return {
        notificationId: `web-sim-${input.requestId}`,
        simulated: true,
      };
    }
    const id = yield* Effect.tryPromise({
      try: async () => {
        const permissions = await Notifications.getPermissionsAsync();
        if (permissions.status !== "granted") {
          await Notifications.requestPermissionsAsync();
        }
        return Notifications.scheduleNotificationAsync({
          content: {
            title: input.title ?? "Something needs you",
            body: input.body ?? "Open the request to approve with your security key.",
            data: {
              type: "approval_request",
              requestId: input.requestId,
            } satisfies ApprovalPushPayload,
            sound: true,
          },
          trigger:
            (input.delaySeconds ?? 1) > 0
              ? {
                  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                  seconds: input.delaySeconds ?? 1,
                }
              : null,
        });
      },
      catch: (cause) =>
        new PushError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });
    return { notificationId: id, simulated: false };
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
    readonly parseApprovalNotificationData: (
      data: unknown
    ) => Effect.Effect<string | null>;
    readonly scheduleLocalApprovalNotification: (input: {
      requestId: string;
      title?: string;
      body?: string;
      delaySeconds?: number;
    }) => Effect.Effect<{ notificationId: string; simulated: boolean }, PushError>;
    readonly buildReviewDeepLink: (requestId: string) => Effect.Effect<string>;
  }
>()(CLAWQL_PUSH_TAG) {}

export const MobilePushLive = Layer.succeed(MobilePush, {
  register: registerForPushEffect,
  parseApprovalDeepLink: parseApprovalDeepLinkEffect,
  parseApprovalNotificationData: parseApprovalNotificationDataEffect,
  scheduleLocalApprovalNotification: scheduleLocalApprovalNotificationEffect,
  buildReviewDeepLink: buildReviewDeepLinkEffect,
});
