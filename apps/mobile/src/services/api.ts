/**
 * Managed console API client for Home / Review / Profile / account deletion.
 * Fixture mode mirrors dashboard fixtures so Maestro can run offline.
 */
import { Context, Data, Effect, Layer, Ref } from "effect";

import {
  FIXTURE_CONNECTED_APPS,
  FIXTURE_KEYS,
  FIXTURE_NOTIFICATION_PREFS,
  FIXTURE_REVIEW_ITEMS,
  FIXTURE_SPEND,
} from "../domain/fixtures";
import {
  AccountDeletionResult,
  ConnectedApp,
  HomeSpend,
  NotificationPrefs,
  ReviewDecision,
  ReviewItem,
  ReviewListResponse,
  SecurityKey,
  decodeUnknownEffect,
  type MobileSession,
} from "../domain/schemas";
import { loadMobileConfigEffect } from "./config";

export class MobileApiError extends Data.TaggedError("MobileApiError")<{
  readonly reason: string;
  readonly status?: number;
}> {}

type MutableState = {
  items: ReviewItem[];
  connectedApps: ConnectedApp[];
  notificationPrefs: NotificationPrefs;
  deleted: boolean;
};

const stateRef = Ref.makeUnsafe<MutableState>({
  items: [...FIXTURE_REVIEW_ITEMS],
  connectedApps: [...FIXTURE_CONNECTED_APPS],
  notificationPrefs: { ...FIXTURE_NOTIFICATION_PREFS },
  deleted: false,
});

function authHeaders(session: MobileSession): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Bearer ${session.accessToken}`,
  };
}

export function listReviewEffect(
  session: MobileSession
): Effect.Effect<ReviewListResponse, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (config.fixtureMode || session.accessToken.startsWith("fixture-")) {
      const state = yield* Ref.get(stateRef);
      return { items: state.items, source: "fixture" as const };
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/review`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json();
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    });
    return yield* decodeUnknownEffect(ReviewListResponse, res).pipe(
      Effect.mapError((e) => new MobileApiError({ reason: e.message }))
    );
  });
}

export function decideReviewEffect(input: {
  session: MobileSession;
  id: string;
  kind: "change" | "source";
  decision: ReviewDecision;
  approvalProof?: {
    method: "nfc_security_key" | "device_biometric_reviewer_demo";
    attestation?: string;
  };
}): Effect.Effect<{ ok: true; id: string; status: string }, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (config.fixtureMode || input.session.accessToken.startsWith("fixture-")) {
      yield* Ref.update(stateRef, (s) => ({
        ...s,
        items:
          input.decision === "retry_with_key"
            ? s.items
            : s.items.filter((i) => i.id !== input.id),
      }));
      return {
        ok: true as const,
        id: input.id,
        status: input.decision,
      };
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/review`, {
          method: "POST",
          headers: authHeaders(input.session),
          body: JSON.stringify({
            id: input.id,
            kind: input.kind,
            decision: input.decision,
            approvalProof: input.approvalProof,
          }),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{ ok: true; id: string; status: string }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    });
    return res;
  });
}

export function getHomeSpendEffect(
  session: MobileSession
): Effect.Effect<HomeSpend, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (config.fixtureMode || session.accessToken.startsWith("fixture-")) {
      return FIXTURE_SPEND;
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/spend/today`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json();
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });
    return yield* decodeUnknownEffect(HomeSpend, res).pipe(
      Effect.mapError((e) => new MobileApiError({ reason: e.message }))
    );
  });
}

export function listSecurityKeysEffect(
  _session: MobileSession
): Effect.Effect<readonly SecurityKey[], MobileApiError> {
  return Effect.succeed(FIXTURE_KEYS);
}

export function listConnectedAppsEffect(
  session: MobileSession
): Effect.Effect<readonly ConnectedApp[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (config.fixtureMode || session.accessToken.startsWith("fixture-")) {
      const state = yield* Ref.get(stateRef);
      return state.connectedApps;
    }
    return FIXTURE_CONNECTED_APPS;
  });
}

export function revokeConnectedAppEffect(input: {
  session: MobileSession;
  clientId: string;
}): Effect.Effect<void, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (config.fixtureMode || input.session.accessToken.startsWith("fixture-")) {
      yield* Ref.update(stateRef, (s) => ({
        ...s,
        connectedApps: s.connectedApps.filter((a) => a.clientId !== input.clientId),
      }));
      return;
    }
    yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(
          `${config.apiBase}/oauth/ema/clients/${encodeURIComponent(input.clientId)}`,
          {
            method: "DELETE",
            headers: authHeaders(input.session),
          }
        );
        if (!r.ok && r.status !== 204) {
          throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        }
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });
  });
}

export function getNotificationPrefsEffect(
  _session: MobileSession
): Effect.Effect<NotificationPrefs, MobileApiError> {
  return Ref.get(stateRef).pipe(Effect.map((s) => s.notificationPrefs));
}

export function setNotificationPrefsEffect(input: {
  session: MobileSession;
  prefs: NotificationPrefs;
}): Effect.Effect<NotificationPrefs, MobileApiError> {
  return Ref.update(stateRef, (s) => ({
    ...s,
    notificationPrefs: input.prefs,
  })).pipe(Effect.as(input.prefs));
}

export function deleteAccountEffect(
  session: MobileSession
): Effect.Effect<AccountDeletionResult, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (config.fixtureMode || session.accessToken.startsWith("fixture-")) {
      yield* Ref.update(stateRef, (s) => ({ ...s, deleted: true, items: [] }));
      return {
        ok: true,
        jobId: "adj_fixture_delete",
        status: "completed",
        message: "Fixture account deletion completed (keys → org → Stripe → vault → auth).",
      };
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/payments/account/delete`, {
          method: "POST",
          headers: authHeaders(session),
          body: JSON.stringify({}),
        });
        const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        if (!r.ok) {
          throw Object.assign(
            new Error(String(body.error ?? `http_${r.status}`)),
            { status: r.status }
          );
        }
        return body;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    });
    return yield* decodeUnknownEffect(AccountDeletionResult, {
      ok: res.ok === true,
      jobId: res.jobId,
      status: res.status,
      message: res.message,
    }).pipe(Effect.mapError((e) => new MobileApiError({ reason: e.message })));
  });
}

/** Test helper — reset fixture queue between Maestro / unit runs. */
export function resetFixtureStateEffect(): Effect.Effect<void> {
  return Ref.set(stateRef, {
    items: [...FIXTURE_REVIEW_ITEMS],
    connectedApps: [...FIXTURE_CONNECTED_APPS],
    notificationPrefs: { ...FIXTURE_NOTIFICATION_PREFS },
    deleted: false,
  });
}

export const CLAWQL_MOBILE_API_TAG = "clawql/MobileApi" as const;

export class MobileApi extends Context.Service<
  typeof CLAWQL_MOBILE_API_TAG,
  {
    readonly listReview: (
      session: MobileSession
    ) => Effect.Effect<ReviewListResponse, MobileApiError>;
    readonly decideReview: (input: {
      session: MobileSession;
      id: string;
      kind: "change" | "source";
      decision: ReviewDecision;
      approvalProof?: {
        method: "nfc_security_key" | "device_biometric_reviewer_demo";
        attestation?: string;
      };
    }) => Effect.Effect<{ ok: true; id: string; status: string }, MobileApiError>;
    readonly getHomeSpend: (
      session: MobileSession
    ) => Effect.Effect<HomeSpend, MobileApiError>;
    readonly listSecurityKeys: (
      session: MobileSession
    ) => Effect.Effect<readonly SecurityKey[], MobileApiError>;
    readonly listConnectedApps: (
      session: MobileSession
    ) => Effect.Effect<readonly ConnectedApp[], MobileApiError>;
    readonly revokeConnectedApp: (input: {
      session: MobileSession;
      clientId: string;
    }) => Effect.Effect<void, MobileApiError>;
    readonly getNotificationPrefs: (
      session: MobileSession
    ) => Effect.Effect<NotificationPrefs, MobileApiError>;
    readonly setNotificationPrefs: (input: {
      session: MobileSession;
      prefs: NotificationPrefs;
    }) => Effect.Effect<NotificationPrefs, MobileApiError>;
    readonly deleteAccount: (
      session: MobileSession
    ) => Effect.Effect<AccountDeletionResult, MobileApiError>;
  }
>()(CLAWQL_MOBILE_API_TAG) {}

export const MobileApiLive = Layer.succeed(MobileApi, {
  listReview: listReviewEffect,
  decideReview: decideReviewEffect,
  getHomeSpend: getHomeSpendEffect,
  listSecurityKeys: listSecurityKeysEffect,
  listConnectedApps: listConnectedAppsEffect,
  revokeConnectedApp: revokeConnectedAppEffect,
  getNotificationPrefs: getNotificationPrefsEffect,
  setNotificationPrefs: setNotificationPrefsEffect,
  deleteAccount: deleteAccountEffect,
});
