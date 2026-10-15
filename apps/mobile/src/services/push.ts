/**
 * Push registration + deep-link routing into app surfaces.
 * Fixture mode can schedule a local notification (no APNs/FCM/EAS).
 */
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { Context, Data, Effect, Layer } from "effect";
import { Platform } from "react-native";

import type { MobileSession } from "../domain/schemas";
import { registerPushDeviceEffect } from "./api";
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

/** Parsed clawql:// or https://cloud.clawql.com/app/… target. */
export type AppDeepLinkTarget =
  | { readonly surface: "review"; readonly id: string }
  | { readonly surface: "inbox" }
  | { readonly surface: "digest" }
  | { readonly surface: "agents" }
  | { readonly surface: "spend" }
  | { readonly surface: "teammates" }
  | { readonly surface: "policies" }
  | { readonly surface: "policy"; readonly id: string }
  | { readonly surface: "voice"; readonly query?: string }
  | { readonly surface: "workflows" }
  | { readonly surface: "memory"; readonly id?: string }
  | { readonly surface: "keys" }
  | { readonly surface: "gateway" }
  | { readonly surface: "automations" }
  | { readonly surface: "audit" }
  | { readonly surface: "settings" }
  | { readonly surface: "sessions" }
  | { readonly surface: "skills" }
  | { readonly surface: "connections" };

const CLOUD_HOSTS = new Set(["cloud.clawql.com", "acme.cloud.clawql.com"]);

function pathSegmentsFromUrl(url: string): {
  segments: string[];
  requestIdQuery: string | null;
  voiceQuery: string | null;
} {
  const u = new URL(url);
  const requestIdQuery = u.searchParams.get("requestId");
  const voiceQuery = u.searchParams.get("q");
  const parts = [
    u.hostname && !CLOUD_HOSTS.has(u.hostname) ? u.hostname : null,
    ...u.pathname.split("/"),
  ].filter((p): p is string => Boolean(p && p.length > 0));
  if (parts[0] === "app") parts.shift();
  return { segments: parts, requestIdQuery, voiceQuery };
}

function targetFromSegments(
  segments: string[],
  requestIdQuery: string | null,
  voiceQuery: string | null = null
): AppDeepLinkTarget | null {
  if (requestIdQuery) return { surface: "review", id: requestIdQuery };
  const [head, next] = segments;
  if (!head) return null;
  if (head === "review" && next) return { surface: "review", id: next };
  if (head === "inbox") return { surface: "inbox" };
  if (head === "digest") return { surface: "digest" };
  if (head === "agents") return { surface: "agents" };
  if (head === "spend") return { surface: "spend" };
  if (head === "teammates") return { surface: "teammates" };
  if (head === "policies" && next) return { surface: "policy", id: next };
  if (head === "policies") return { surface: "policies" };
  if (head === "voice") {
    return voiceQuery ? { surface: "voice", query: voiceQuery } : { surface: "voice" };
  }
  if (head === "workflows") return { surface: "workflows" };
  if (head === "memory" && next) return { surface: "memory", id: next };
  if (head === "memory") return { surface: "memory" };
  if (head === "keys") return { surface: "keys" };
  if (head === "gateway") return { surface: "gateway" };
  if (head === "automations") return { surface: "automations" };
  if (head === "audit") return { surface: "audit" };
  if (head === "settings") return { surface: "settings" };
  if (head === "sessions") return { surface: "sessions" };
  if (head === "skills") return { surface: "skills" };
  if (head === "connections") return { surface: "connections" };
  return null;
}

export function parseAppDeepLinkEffect(
  url: string
): Effect.Effect<AppDeepLinkTarget | null> {
  return Effect.sync(() => {
    try {
      const { segments, requestIdQuery, voiceQuery } = pathSegmentsFromUrl(url);
      const fromUrl = targetFromSegments(segments, requestIdQuery, voiceQuery);
      if (fromUrl) return fromUrl;

      // Fallback: expo-linking parse for odd schemes
      const parsed = Linking.parse(url);
      const path = parsed.path ?? "";
      const linkSegments = path.replace(/^\//, "").split("/").filter(Boolean);
      if (linkSegments[0] === "app") linkSegments.shift();
      const q =
        parsed.queryParams?.requestId != null
          ? String(parsed.queryParams.requestId)
          : null;
      const vq =
        parsed.queryParams?.q != null ? String(parsed.queryParams.q) : null;
      return targetFromSegments(linkSegments, q, vq);
    } catch {
      return null;
    }
  });
}

/** @deprecated Prefer parseAppDeepLinkEffect — kept for approval-only callers. */
export function parseApprovalDeepLinkEffect(
  url: string
): Effect.Effect<string | null> {
  return parseAppDeepLinkEffect(url).pipe(
    Effect.map((target) => (target?.surface === "review" ? target.id : null))
  );
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
        // Lock-screen content is always generic. Callers may pass title/body for
        // inbox/simulation UI, but the OS notification must not leak contract
        // titles or amounts before unlock / App Lock.
        void input.title;
        void input.body;
        return Notifications.scheduleNotificationAsync({
          content: {
            title: "A change needs your review",
            body: "Unlock PhoneApprove to open the request.",
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
): Effect.Effect<{ token: string | null; fixture: boolean }, PushError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();

    // Fixture / web: synthetic Expo token so demos + prefs UI exercise the full path.
    if (config.fixtureMode || Platform.OS === "web") {
      const token = `ExponentPushToken[fixture-${session.userId.slice(0, 8)}]`;
      yield* registerPushDeviceEffect({
        session,
        token,
        platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web",
        label: Platform.OS === "web" ? "Web (fixture)" : "This phone (fixture)",
        fixture: true,
      }).pipe(Effect.catch(() => Effect.void));
      return { token, fixture: true };
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
      return { token: null, fixture: false };
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

    const platform = Platform.OS === "ios" ? "ios" : "android";
    // registerPushDeviceEffect POSTs to /api/managed/devices/push on live sessions.
    yield* registerPushDeviceEffect({
      session,
      token,
      platform,
      label: "This phone",
      fixture: false,
    }).pipe(Effect.catch(() => Effect.void));

    return { token, fixture: false };
  });
}

export function buildReviewDeepLinkEffect(requestId: string): Effect.Effect<string> {
  return buildAppDeepLinkEffect({ surface: "review", id: requestId });
}

export function buildAppDeepLinkEffect(
  target: AppDeepLinkTarget
): Effect.Effect<string> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    const base = `${config.apiBase}/app`;
    switch (target.surface) {
      case "review":
        return `${base}/review/${encodeURIComponent(target.id)}`;
      case "policy":
        return `${base}/policies/${encodeURIComponent(target.id)}`;
      case "inbox":
        return `${base}/inbox`;
      case "digest":
        return `${base}/digest`;
      case "agents":
        return `${base}/agents`;
      case "spend":
        return `${base}/spend`;
      case "teammates":
        return `${base}/teammates`;
      case "policies":
        return `${base}/policies`;
      case "voice":
        return target.query
          ? `${base}/voice?q=${encodeURIComponent(target.query)}`
          : `${base}/voice`;
      case "workflows":
        return `${base}/workflows`;
      case "memory":
        return target.id
          ? `${base}/memory/${encodeURIComponent(target.id)}`
          : `${base}/memory`;
      case "keys":
        return `${base}/keys`;
      case "gateway":
        return `${base}/gateway`;
      case "automations":
        return `${base}/automations`;
      case "audit":
        return `${base}/audit`;
      case "settings":
        return `${base}/settings`;
      case "sessions":
        return `${base}/sessions`;
      case "skills":
        return `${base}/skills`;
      case "connections":
        return `${base}/connections`;
    }
  });
}

/** Expo Router href for a parsed deep link. */
export function hrefForDeepLink(target: AppDeepLinkTarget): string {
  switch (target.surface) {
    case "review":
      return `/review/${target.id}`;
    case "policy":
      return `/policies/${target.id}`;
    case "inbox":
      return "/inbox";
    case "digest":
      return "/digest";
    case "agents":
      return "/agents";
    case "spend":
      return "/spend";
    case "teammates":
      return "/teammates";
    case "policies":
      return "/policies";
    case "voice":
      return target.query ? `/voice?q=${encodeURIComponent(target.query)}` : "/voice";
    case "workflows":
      return "/workflows";
    case "memory":
      return target.id ? `/memory/${target.id}` : "/memory";
    case "keys":
      return "/keys";
    case "gateway":
      return "/gateway";
    case "automations":
      return "/automations";
    case "audit":
      return "/audit";
    case "settings":
      return "/settings";
    case "sessions":
      return "/sessions";
    case "skills":
      return "/skills";
    case "connections":
      return "/connections";
  }
}

export const CLAWQL_PUSH_TAG = "clawql/MobilePush" as const;

export class MobilePush extends Context.Service<
  typeof CLAWQL_PUSH_TAG,
  {
    readonly register: (
      session: MobileSession
    ) => Effect.Effect<{ token: string | null; fixture: boolean }, PushError>;
    readonly parseAppDeepLink: (
      url: string
    ) => Effect.Effect<AppDeepLinkTarget | null>;
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
    readonly buildAppDeepLink: (target: AppDeepLinkTarget) => Effect.Effect<string>;
  }
>()(CLAWQL_PUSH_TAG) {}

export const MobilePushLive = Layer.succeed(MobilePush, {
  register: registerForPushEffect,
  parseAppDeepLink: parseAppDeepLinkEffect,
  parseApprovalDeepLink: parseApprovalDeepLinkEffect,
  parseApprovalNotificationData: parseApprovalNotificationDataEffect,
  scheduleLocalApprovalNotification: scheduleLocalApprovalNotificationEffect,
  buildReviewDeepLink: buildReviewDeepLinkEffect,
  buildAppDeepLink: buildAppDeepLinkEffect,
});
