/**
 * Managed console API client for Home / Review / Profile / account deletion.
 * Fixture mode mirrors dashboard fixtures so Maestro can run offline.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Context, Data, Effect, Layer, Ref } from "effect";

import {
  FIXTURE_ACTIVITY,
  FIXTURE_AGENTS,
  FIXTURE_CONNECTED_APPS,
  FIXTURE_DECIDED,
  FIXTURE_DEVICE_SESSIONS,
  FIXTURE_DIGEST,
  FIXTURE_INBOX,
  FIXTURE_KEYS,
  FIXTURE_NOTIFICATION_PREFS,
  FIXTURE_ORG,
  FIXTURE_POLICIES,
  FIXTURE_POLICY_DETAIL,
  FIXTURE_REVIEW_ITEMS,
  FIXTURE_SPEND,
  FIXTURE_TEAMMATES,
} from "../domain/fixtures";
import {
  AccountDeletionResult,
  ActivityEvent,
  ActivityListResponse,
  AgentSummary,
  ApprovalPolicy,
  ApprovalPolicyDetail,
  ConnectedApp,
  DeviceSession,
  DocumentAttachment,
  HomeSpend,
  InboxItem,
  MorningDigest,
  NotificationPrefs,
  OrgSummary,
  PushDevice,
  ReviewDecision,
  ReviewItem,
  ReviewKind,
  ReviewListResponse,
  SecurityKey,
  Teammate,
  decodeUnknownEffect,
  type MobileSession,
} from "../domain/schemas";
import { loadMobileConfigEffect } from "./config";
import {
  loadOfflineSnapshotEffect,
  saveOfflineSnapshotEffect,
} from "./offline-cache";

export class MobileApiError extends Data.TaggedError("MobileApiError")<{
  readonly reason: string;
  readonly status?: number;
}> {}

type MutableState = {
  items: ReviewItem[];
  /** Decided items kept so Activity / deep links can reopen history. */
  decided: ReviewItem[];
  connectedApps: ConnectedApp[];
  notificationPrefs: NotificationPrefs;
  activity: ActivityEvent[];
  deviceSessions: DeviceSession[];
  inbox: InboxItem[];
  pushDevices: PushDevice[];
  attachments: DocumentAttachment[];
  deleted: boolean;
};

const stateRef = Ref.makeUnsafe<MutableState>({
  items: [...FIXTURE_REVIEW_ITEMS],
  decided: [...FIXTURE_DECIDED],
  connectedApps: [...FIXTURE_CONNECTED_APPS],
  notificationPrefs: { ...FIXTURE_NOTIFICATION_PREFS },
  activity: [...FIXTURE_ACTIVITY],
  deviceSessions: [...FIXTURE_DEVICE_SESSIONS],
  inbox: [...FIXTURE_INBOX],
  pushDevices: [],
  attachments: [],
  deleted: false,
});

function authHeaders(session: MobileSession): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Bearer ${session.accessToken}`,
  };
}

function isFixtureSession(session: MobileSession, fixtureMode: boolean): boolean {
  return fixtureMode || session.accessToken.startsWith("fixture-");
}

function nextActivityId(): string {
  return `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function activityTitle(item: ReviewItem, decision: ReviewDecision, answer?: string): string {
  if (decision === "answer") return `Answered ${item.decisionSite ?? item.title}`;
  if (decision === "skip") return `Skipped ${item.title}`;
  if (decision === "ask_teammate") {
    return answer
      ? `Asked ${answer} about ${item.title}`
      : `Asked teammate about ${item.title}`;
  }
  if (decision === "approve" && item.kind === "skill") return `Promoted ${item.title}`;
  if (decision === "approve") return `Approved ${item.title}`;
  if (decision === "decline") return `Declined ${item.title}`;
  if (decision === "mark_applied") return `Marked applied · ${item.title}`;
  if (decision === "mark_not_applied") return `Marked not applied · ${item.title}`;
  if (decision === "retry_with_key") return `Keyed retry · ${item.title}`;
  return `${decision} · ${item.title}${answer ? ` · ${answer}` : ""}`;
}

function persistOfflineSnapshotEffect(): Effect.Effect<void> {
  return Effect.gen(function* () {
    const state = yield* Ref.get(stateRef);
    yield* saveOfflineSnapshotEffect({
      reviewItems: state.items,
      activityEvents: state.activity,
      inbox: state.inbox,
    }).pipe(Effect.catch(() => Effect.void));
  });
}

export function listReviewEffect(
  session: MobileSession,
  filter?: { kind?: ReviewKind | "all" }
): Effect.Effect<ReviewListResponse, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      const state = yield* Ref.get(stateRef);
      const kind = filter?.kind;
      const items =
        !kind || kind === "all" ? state.items : state.items.filter((i) => i.kind === kind);
      yield* persistOfflineSnapshotEffect();
      return { items, source: "fixture" as const };
    }
    const decoded = yield* Effect.gen(function* () {
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
    }).pipe(
      Effect.catch((err) =>
        Effect.gen(function* () {
          const snap = yield* loadOfflineSnapshotEffect().pipe(
            Effect.mapError(() => err)
          );
          if (!snap || snap.reviewItems.length === 0) {
            return yield* Effect.fail(err);
          }
          return {
            items: snap.reviewItems,
            source: "cache" as const,
          } satisfies ReviewListResponse;
        })
      )
    );
    if (decoded.source !== "cache") {
      yield* saveOfflineSnapshotEffect({
        reviewItems: decoded.items,
        activityEvents: [],
        inbox: [],
      }).pipe(Effect.catch(() => Effect.void));
    }
    const kind = filter?.kind;
    if (!kind || kind === "all") return decoded;
    return { ...decoded, items: decoded.items.filter((i) => i.kind === kind) };
  });
}

export function getReviewByIdEffect(
  session: MobileSession,
  id: string
): Effect.Effect<ReviewItem | null, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      const state = yield* Ref.get(stateRef);
      return (
        state.items.find((i) => i.id === id) ??
        state.decided.find((i) => i.id === id) ??
        null
      );
    }
    const list = yield* listReviewEffect(session);
    return list.items.find((i) => i.id === id) ?? null;
  });
}

export function pendingReviewCountEffect(
  session: MobileSession
): Effect.Effect<number, MobileApiError> {
  return listReviewEffect(session).pipe(Effect.map((r) => r.items.length));
}

export function decideReviewEffect(input: {
  session: MobileSession;
  id: string;
  kind: ReviewKind;
  decision: ReviewDecision;
  answer?: string;
  approvalProof?: {
    method: "nfc_security_key" | "device_biometric_reviewer_demo";
    attestation?: string;
  };
}): Effect.Effect<{ ok: true; id: string; status: string }, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(input.session, config.fixtureMode)) {
      const state = yield* Ref.get(stateRef);
      const item = state.items.find((i) => i.id === input.id);
      if (!item) {
        return yield* Effect.fail(new MobileApiError({ reason: "not_found", status: 404 }));
      }
      const leaveInQueue = input.decision === "retry_with_key";
      const status =
        input.decision === "answer" ? (input.answer ?? "answer") : input.decision;
      const detail =
        input.answer ??
        input.approvalProof?.method ??
        (input.approvalProof?.attestation?.startsWith("fixture-nfc:")
          ? "fixture_simulated_nfc"
          : input.decision);
      const event: ActivityEvent = {
        id: nextActivityId(),
        atMs: Date.now(),
        title: activityTitle(item, input.decision, input.answer),
        detail: String(detail),
        kind: item.kind,
        decision: input.decision,
        reviewId: item.id,
      };
      const archived: ReviewItem = {
        ...item,
        decidedAtMs: Date.now(),
        decidedStatus: status,
      };
      yield* Ref.update(stateRef, (s) => ({
        ...s,
        items: leaveInQueue ? s.items : s.items.filter((i) => i.id !== input.id),
        decided: leaveInQueue
          ? s.decided
          : [archived, ...s.decided.filter((d) => d.id !== input.id)].slice(0, 50),
        activity: [event, ...s.activity].slice(0, 50),
      }));
      return {
        ok: true as const,
        id: input.id,
        status,
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
            answer: input.answer,
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

export function listActivityEffect(
  session: MobileSession
): Effect.Effect<ActivityListResponse, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      const state = yield* Ref.get(stateRef);
      yield* persistOfflineSnapshotEffect();
      return { events: state.activity, source: "fixture" as const };
    }
    // Live activity comes from the audit surface; until wired, serve offline cache if any.
    const snap = yield* loadOfflineSnapshotEffect().pipe(
      Effect.catch(() => Effect.succeed(null))
    );
    if (snap && snap.activityEvents.length > 0) {
      return { events: snap.activityEvents, source: "cache" as const };
    }
    return { events: [], source: "live" as const };
  });
}

export function listDeviceSessionsEffect(
  session: MobileSession
): Effect.Effect<readonly DeviceSession[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      const state = yield* Ref.get(stateRef);
      return state.deviceSessions.filter((s) => !s.ended);
    }
    return FIXTURE_DEVICE_SESSIONS.filter((s) => s.current);
  });
}

export function endOtherDeviceSessionsEffect(
  session: MobileSession
): Effect.Effect<{ ended: number }, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      const before = yield* Ref.get(stateRef);
      const toEnd = before.deviceSessions.filter((row) => !row.current && !row.ended).length;
      yield* Ref.update(stateRef, (s) => ({
        ...s,
        deviceSessions: s.deviceSessions.map((row) =>
          row.current || row.ended ? row : { ...row, ended: true }
        ),
      }));
      return { ended: toEnd };
    }
    return { ended: 0 };
  });
}

export function getHomeSpendEffect(
  session: MobileSession
): Effect.Effect<HomeSpend, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
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
  session: MobileSession
): Effect.Effect<readonly SecurityKey[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    // Live key inventory is console-managed; phone shows the fixture-shaped list with honesty tag.
    void session;
    void config;
    return FIXTURE_KEYS;
  });
}

export function listConnectedAppsEffect(
  session: MobileSession
): Effect.Effect<readonly ConnectedApp[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
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
    if (isFixtureSession(input.session, config.fixtureMode)) {
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

const NOTIFICATION_PREFS_KEY = "clawql.mobile.notificationPrefs.v1";

export function getNotificationPrefsEffect(
  _session: MobileSession
): Effect.Effect<NotificationPrefs, MobileApiError> {
  return Effect.gen(function* () {
    void _session;
    const fromDisk = yield* Effect.tryPromise({
      try: async () => {
        const raw = await AsyncStorage.getItem(NOTIFICATION_PREFS_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as NotificationPrefs;
      },
      catch: () => new MobileApiError({ reason: "prefs_read_failed" }),
    }).pipe(Effect.catch(() => Effect.succeed(null as NotificationPrefs | null)));
    if (fromDisk) {
      yield* Ref.update(stateRef, (s) => ({ ...s, notificationPrefs: fromDisk }));
      return fromDisk;
    }
    return yield* Ref.get(stateRef).pipe(Effect.map((s) => s.notificationPrefs));
  });
}

export function setNotificationPrefsEffect(input: {
  session: MobileSession;
  prefs: NotificationPrefs;
}): Effect.Effect<NotificationPrefs, MobileApiError> {
  return Effect.gen(function* () {
    void input.session;
    yield* Ref.update(stateRef, (s) => ({
      ...s,
      notificationPrefs: input.prefs,
    }));
    yield* Effect.tryPromise({
      try: async () => {
        await AsyncStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(input.prefs));
      },
      catch: () => new MobileApiError({ reason: "prefs_write_failed" }),
    }).pipe(Effect.catch(() => Effect.void));
    return input.prefs;
  });
}

export function deleteAccountEffect(
  session: MobileSession
): Effect.Effect<AccountDeletionResult, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      yield* Ref.update(stateRef, (s) => ({
        ...s,
        deleted: true,
        items: [],
        decided: [],
        activity: [],
        deviceSessions: [],
      }));
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

export function listPoliciesEffect(
  session: MobileSession
): Effect.Effect<readonly ApprovalPolicy[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return FIXTURE_POLICIES;
    }
    // Live: policies remain console-authored; phone shows fixture-shaped empty until API lands.
    return FIXTURE_POLICIES;
  });
}

export function getPolicyDetailEffect(
  session: MobileSession,
  id: string
): Effect.Effect<ApprovalPolicyDetail | null, MobileApiError> {
  return Effect.gen(function* () {
    yield* Effect.void;
    void session;
    if (id === FIXTURE_POLICY_DETAIL.id) return FIXTURE_POLICY_DETAIL;
    const row = FIXTURE_POLICIES.find((p) => p.id === id);
    if (!row) return null;
    return {
      id: row.id,
      title: row.when,
      lastChanged: "Managed in the web console.",
      appliesTo: row.whenDetail || row.when,
      appliesHelp: row.blockedNote ?? "Phone shows a summary; edit policies on the console.",
      whoApproves: row.who,
      whoHelp: row.blocked ? "No approvers — always blocked." : `Approvals needed: ${row.approvals}.`,
      approvalsNeeded: row.approvals,
      expiresAfter: row.waits,
      expiresHelp: row.securityKey === "Required" ? "Security key required to approve." : "No security key required.",
      requireSecurityKey: row.securityKey === "Required",
      notify: "Phone push, Slack",
    } satisfies ApprovalPolicyDetail;
  });
}

export function getOrgSummaryEffect(
  session: MobileSession
): Effect.Effect<OrgSummary, MobileApiError> {
  return Effect.sync(() =>
    session.orgId === FIXTURE_ORG.orgId
      ? FIXTURE_ORG
      : {
          orgId: session.orgId,
          name: session.orgId.replace(/^org_/, "").replace(/_/g, " "),
          plan: session.reviewerDemo ? "Reviewer demo" : "Team",
          role: session.role,
          members: "—",
        }
  );
}

export function listAgentsEffect(
  session: MobileSession
): Effect.Effect<readonly AgentSummary[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return FIXTURE_AGENTS;
    }
    return FIXTURE_AGENTS;
  });
}

export function getMorningDigestEffect(
  session: MobileSession
): Effect.Effect<MorningDigest, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return FIXTURE_DIGEST;
    }
    return FIXTURE_DIGEST;
  });
}

export function listTeammatesEffect(
  session: MobileSession
): Effect.Effect<readonly Teammate[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return FIXTURE_TEAMMATES;
    }
    return FIXTURE_TEAMMATES;
  });
}

export function listInboxEffect(
  session: MobileSession
): Effect.Effect<readonly InboxItem[], MobileApiError> {
  return Effect.gen(function* () {
    void session;
    const state = yield* Ref.get(stateRef);
    return state.inbox;
  });
}

export function markInboxReadEffect(
  session: MobileSession,
  inboxId: string
): Effect.Effect<void, MobileApiError> {
  return Effect.gen(function* () {
    void session;
    yield* Ref.update(stateRef, (s) => ({
      ...s,
      inbox: s.inbox.map((item) =>
        item.id === inboxId ? { ...item, unread: false } : item
      ),
    }));
  });
}

export function markInboxReadByReviewEffect(
  session: MobileSession,
  reviewId: string
): Effect.Effect<number, MobileApiError> {
  return Effect.gen(function* () {
    void session;
    const before = yield* Ref.get(stateRef);
    const marked = before.inbox.filter(
      (item) => item.reviewId === reviewId && item.unread
    ).length;
    if (marked === 0) return 0;
    yield* Ref.update(stateRef, (s) => ({
      ...s,
      inbox: s.inbox.map((item) =>
        item.reviewId === reviewId && item.unread
          ? { ...item, unread: false }
          : item
      ),
    }));
    yield* persistOfflineSnapshotEffect();
    return marked;
  });
}

export function markAllInboxReadEffect(
  session: MobileSession
): Effect.Effect<number, MobileApiError> {
  return Effect.gen(function* () {
    void session;
    const before = yield* Ref.get(stateRef);
    const marked = before.inbox.filter((item) => item.unread).length;
    yield* Ref.update(stateRef, (s) => ({
      ...s,
      inbox: s.inbox.map((item) => (item.unread ? { ...item, unread: false } : item)),
    }));
    yield* persistOfflineSnapshotEffect();
    return marked;
  });
}

export function registerPushDeviceEffect(input: {
  session: MobileSession;
  token: string;
  platform: "ios" | "android" | "web";
  label: string;
  fixture: boolean;
}): Effect.Effect<PushDevice, MobileApiError> {
  return Effect.gen(function* () {
    void input.session;
    const device: PushDevice = {
      id: `push_${input.platform}_${input.token.slice(-12)}`,
      token: input.token,
      platform: input.platform,
      label: input.label,
      registeredAtMs: Date.now(),
      fixture: input.fixture,
    };
    yield* Ref.update(stateRef, (s) => ({
      ...s,
      pushDevices: [device, ...s.pushDevices.filter((d) => d.token !== device.token)],
    }));
    return device;
  });
}

export function listPushDevicesEffect(
  session: MobileSession
): Effect.Effect<readonly PushDevice[], MobileApiError> {
  return Effect.gen(function* () {
    void session;
    const state = yield* Ref.get(stateRef);
    return state.pushDevices;
  });
}

export function clearPushDevicesEffect(
  session: MobileSession
): Effect.Effect<void, MobileApiError> {
  return Effect.gen(function* () {
    void session;
    yield* Ref.update(stateRef, (s) => ({ ...s, pushDevices: [] }));
  });
}

export function listAttachmentsEffect(
  session: MobileSession,
  reviewId: string
): Effect.Effect<readonly DocumentAttachment[], MobileApiError> {
  return Effect.gen(function* () {
    void session;
    const state = yield* Ref.get(stateRef);
    return state.attachments.filter((a) => a.reviewId === reviewId);
  });
}

export function addAttachmentEffect(input: {
  session: MobileSession;
  attachment: DocumentAttachment;
}): Effect.Effect<DocumentAttachment, MobileApiError> {
  return Effect.gen(function* () {
    void input.session;
    yield* Ref.update(stateRef, (s) => ({
      ...s,
      attachments: [input.attachment, ...s.attachments],
    }));
    return input.attachment;
  });
}

export function prependInboxItemEffect(item: InboxItem): Effect.Effect<void> {
  return Ref.update(stateRef, (s) => ({
    ...s,
    inbox: [item, ...s.inbox],
  }));
}

/** Test helper — reset fixture queue between Maestro / unit runs. */
export function resetFixtureStateEffect(): Effect.Effect<void> {
  return Ref.set(stateRef, {
    items: [...FIXTURE_REVIEW_ITEMS],
    decided: [...FIXTURE_DECIDED],
    connectedApps: [...FIXTURE_CONNECTED_APPS],
    notificationPrefs: { ...FIXTURE_NOTIFICATION_PREFS },
    activity: [...FIXTURE_ACTIVITY],
    deviceSessions: [...FIXTURE_DEVICE_SESSIONS],
    inbox: [...FIXTURE_INBOX],
    pushDevices: [],
    attachments: [],
    deleted: false,
  });
}

export const CLAWQL_MOBILE_API_TAG = "clawql/MobileApi" as const;

export class MobileApi extends Context.Service<
  typeof CLAWQL_MOBILE_API_TAG,
  {
    readonly listReview: (
      session: MobileSession,
      filter?: { kind?: ReviewKind | "all" }
    ) => Effect.Effect<ReviewListResponse, MobileApiError>;
    readonly getReviewById: (
      session: MobileSession,
      id: string
    ) => Effect.Effect<ReviewItem | null, MobileApiError>;
    readonly decideReview: (input: {
      session: MobileSession;
      id: string;
      kind: ReviewKind;
      decision: ReviewDecision;
      answer?: string;
      approvalProof?: {
        method: "nfc_security_key" | "device_biometric_reviewer_demo";
        attestation?: string;
      };
    }) => Effect.Effect<{ ok: true; id: string; status: string }, MobileApiError>;
    readonly listActivity: (
      session: MobileSession
    ) => Effect.Effect<ActivityListResponse, MobileApiError>;
    readonly pendingReviewCount: (
      session: MobileSession
    ) => Effect.Effect<number, MobileApiError>;
    readonly listDeviceSessions: (
      session: MobileSession
    ) => Effect.Effect<readonly DeviceSession[], MobileApiError>;
    readonly endOtherDeviceSessions: (
      session: MobileSession
    ) => Effect.Effect<{ ended: number }, MobileApiError>;
    readonly getHomeSpend: (
      session: MobileSession
    ) => Effect.Effect<HomeSpend, MobileApiError>;
    readonly listAgents: (
      session: MobileSession
    ) => Effect.Effect<readonly AgentSummary[], MobileApiError>;
    readonly getMorningDigest: (
      session: MobileSession
    ) => Effect.Effect<MorningDigest, MobileApiError>;
    readonly listTeammates: (
      session: MobileSession
    ) => Effect.Effect<readonly Teammate[], MobileApiError>;
    readonly listInbox: (
      session: MobileSession
    ) => Effect.Effect<readonly InboxItem[], MobileApiError>;
    readonly markInboxRead: (
      session: MobileSession,
      inboxId: string
    ) => Effect.Effect<void, MobileApiError>;
    readonly markInboxReadByReview: (
      session: MobileSession,
      reviewId: string
    ) => Effect.Effect<number, MobileApiError>;
    readonly markAllInboxRead: (
      session: MobileSession
    ) => Effect.Effect<number, MobileApiError>;
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
    readonly registerPushDevice: (input: {
      session: MobileSession;
      token: string;
      platform: "ios" | "android" | "web";
      label: string;
      fixture: boolean;
    }) => Effect.Effect<PushDevice, MobileApiError>;
    readonly listPushDevices: (
      session: MobileSession
    ) => Effect.Effect<readonly PushDevice[], MobileApiError>;
    readonly clearPushDevices: (
      session: MobileSession
    ) => Effect.Effect<void, MobileApiError>;
    readonly listAttachments: (
      session: MobileSession,
      reviewId: string
    ) => Effect.Effect<readonly DocumentAttachment[], MobileApiError>;
    readonly addAttachment: (input: {
      session: MobileSession;
      attachment: DocumentAttachment;
    }) => Effect.Effect<DocumentAttachment, MobileApiError>;
    readonly deleteAccount: (
      session: MobileSession
    ) => Effect.Effect<AccountDeletionResult, MobileApiError>;
  }
>()(CLAWQL_MOBILE_API_TAG) {}

export const MobileApiLive = Layer.succeed(MobileApi, {
  listReview: listReviewEffect,
  getReviewById: getReviewByIdEffect,
  decideReview: decideReviewEffect,
  listActivity: listActivityEffect,
  pendingReviewCount: pendingReviewCountEffect,
  listDeviceSessions: listDeviceSessionsEffect,
  endOtherDeviceSessions: endOtherDeviceSessionsEffect,
  getHomeSpend: getHomeSpendEffect,
  listAgents: listAgentsEffect,
  getMorningDigest: getMorningDigestEffect,
  listTeammates: listTeammatesEffect,
  listInbox: listInboxEffect,
  markInboxRead: markInboxReadEffect,
  markInboxReadByReview: markInboxReadByReviewEffect,
  markAllInboxRead: markAllInboxReadEffect,
  listSecurityKeys: listSecurityKeysEffect,
  listConnectedApps: listConnectedAppsEffect,
  revokeConnectedApp: revokeConnectedAppEffect,
  getNotificationPrefs: getNotificationPrefsEffect,
  setNotificationPrefs: setNotificationPrefsEffect,
  registerPushDevice: registerPushDeviceEffect,
  listPushDevices: listPushDevicesEffect,
  clearPushDevices: clearPushDevicesEffect,
  listAttachments: listAttachmentsEffect,
  addAttachment: addAttachmentEffect,
  deleteAccount: deleteAccountEffect,
});
