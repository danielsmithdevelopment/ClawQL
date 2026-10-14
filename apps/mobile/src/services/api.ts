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
  FIXTURE_ACTIVE_SKILLS,
  FIXTURE_AGENT_SESSIONS,
  FIXTURE_API_KEYS,
  FIXTURE_AUDIT_ENTRIES,
  FIXTURE_AUDIT_INCIDENT,
  FIXTURE_AUTOMATIONS,
  FIXTURE_CONNECTIONS,
  FIXTURE_GATEWAY_ENDPOINTS,
  FIXTURE_GATEWAY_ROUTES,
  FIXTURE_MANAGED_USAGE,
  FIXTURE_MEMORY_FIELDS,
  FIXTURE_MEMORY_RESULTS,
  FIXTURE_MEMORY_UPLOADS,
  FIXTURE_ORG_SETTINGS,
  FIXTURE_ORG_SETTINGS_BUNDLE,
  FIXTURE_PROPOSED_SKILLS,
  FIXTURE_TEAM_GROUPS,
  FIXTURE_TEAM_ROLES,
  FIXTURE_TEAMMATES,
  FIXTURE_WORKFLOWS,
} from "../domain/fixtures";
import {
  AccountDeletionResult,
  ActiveSkill,
  ActivityEvent,
  ActivityListResponse,
  AgentSession,
  AgentSummary,
  ApiKeyItem,
  ApprovalPolicy,
  ApprovalPolicyDetail,
  AuditEntry,
  AuditIncident,
  AutomationSub,
  ConnectedApp,
  ConnectionItem,
  DeviceSession,
  DocumentAttachment,
  GatewayBundle,
  GatewayEndpoint,
  HomeSpend,
  MemoryUpload,
  InboxItem,
  ManagedUsage,
  MemoryField,
  MemoryResult,
  MorningDigest,
  NotificationPrefs,
  OrgSettings,
  OrgSettingsBundle,
  OrgSummary,
  ProposedSkill,
  PushDevice,
  ReviewDecision,
  ReviewItem,
  ReviewKind,
  ReviewListResponse,
  SecurityKey,
  TeamBundle,
  TeamGroup,
  TeamRole,
  Teammate,
  WorkflowProgram,
  WorkflowRun,
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
  workflowRuns: WorkflowRun[];
  apiKeys: ApiKeyItem[];
  teammates: Teammate[];
  erasedSubjects: string[];
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
  workflowRuns: [],
  apiKeys: [...FIXTURE_API_KEYS],
  teammates: [...FIXTURE_TEAMMATES],
  erasedSubjects: [],
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

/** Cryptographically random hex for fixture ids/secrets (avoids CodeQL insecure-randomness). */
function fixtureRandomHex(byteCount: number): string {
  const buf = new Uint8Array(byteCount);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function nextActivityId(): string {
  return `act_${Date.now().toString(36)}_${fixtureRandomHex(3)}`;
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

export function getManagedUsageEffect(
  session: MobileSession
): Effect.Effect<ManagedUsage, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return FIXTURE_MANAGED_USAGE;
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/usage`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{
          usage?: Omit<ManagedUsage, "source">;
          source?: "live" | "fixture";
        }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(Effect.catch(() => Effect.succeed({ usage: FIXTURE_MANAGED_USAGE, source: "fixture" as const })));
    const usage = res.usage ?? FIXTURE_MANAGED_USAGE;
    return {
      monthSpent: usage.monthSpent,
      monthBudget: usage.monthBudget,
      forecast: usage.forecast,
      forecastNote: usage.forecastNote,
      todaySpent: usage.todaySpent,
      todayNote: usage.todayNote,
      planRenews: usage.planRenews,
      teamRows: usage.teamRows ?? [],
      source: res.source ?? "fixture",
    };
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
    const usage = yield* getManagedUsageEffect(session);
    return homeSpendFromUsage(usage);
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

export function getTeamBundleEffect(
  session: MobileSession
): Effect.Effect<TeamBundle, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      const state = yield* Ref.get(stateRef);
      return {
        people: state.teammates,
        groups: FIXTURE_TEAM_GROUPS,
        roles: FIXTURE_TEAM_ROLES,
        source: "fixture" as const,
      };
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/team`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{
          people?: Teammate[];
          groups?: TeamGroup[];
          roles?: TeamRole[];
          source?: "live" | "fixture";
        }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(
      Effect.catch(() =>
        Effect.succeed({
          people: [...FIXTURE_TEAMMATES],
          groups: [...FIXTURE_TEAM_GROUPS],
          roles: [...FIXTURE_TEAM_ROLES],
          source: "fixture" as const,
        })
      )
    );
    return {
      people: res.people ?? FIXTURE_TEAMMATES,
      groups: res.groups ?? FIXTURE_TEAM_GROUPS,
      roles: res.roles ?? FIXTURE_TEAM_ROLES,
      source: res.source ?? "fixture",
    };
  });
}

export function listTeammatesEffect(
  session: MobileSession
): Effect.Effect<readonly Teammate[], MobileApiError> {
  return Effect.map(getTeamBundleEffect(session), (b) => b.people);
}

export function inviteTeammateEffect(input: {
  session: MobileSession;
  email: string;
  name?: string;
  role?: string;
  acceptCanApprove: boolean;
  acceptSecurityKeys: boolean;
  acceptAuditRecorded: boolean;
}): Effect.Effect<Teammate, MobileApiError> {
  return Effect.gen(function* () {
    const email = input.email.trim().toLowerCase();
    if (!email.includes("@")) {
      return yield* Effect.fail(new MobileApiError({ reason: "email_required" }));
    }
    if (!input.acceptCanApprove || !input.acceptSecurityKeys || !input.acceptAuditRecorded) {
      return yield* Effect.fail(new MobileApiError({ reason: "acceptance_required" }));
    }
    const config = yield* loadMobileConfigEffect();
    if (!isFixtureSession(input.session, config.fixtureMode)) {
      const res = yield* Effect.tryPromise({
        try: async () => {
          const r = await fetch(`${config.apiBase}/api/managed/team`, {
            method: "POST",
            headers: authHeaders(input.session),
            body: JSON.stringify({
              email,
              name: input.name,
              role: input.role,
              acceptCanApprove: input.acceptCanApprove,
              acceptSecurityKeys: input.acceptSecurityKeys,
              acceptAuditRecorded: input.acceptAuditRecorded,
            }),
          });
          if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
          return r.json() as Promise<{ person: Teammate }>;
        },
        catch: (cause) =>
          new MobileApiError({
            reason: cause instanceof Error ? cause.message : String(cause),
            status: (cause as { status?: number })?.status,
          }),
      });
      return res.person;
    }
    const state = yield* Ref.get(stateRef);
    if (state.teammates.some((p) => p.email.toLowerCase() === email)) {
      return yield* Effect.fail(new MobileApiError({ reason: "already_invited" }));
    }
    const local = email.split("@")[0] || "invitee";
    const person: Teammate = {
      id: `invite_${Date.now().toString(36)}`,
      name: (input.name ?? local).trim() || local,
      email,
      role: (input.role ?? "Member").trim() || "Member",
      groups: ["Invited"],
      canApprove: false,
      keysReady: false,
      lastActive: "Invite sent",
      invitePending: true,
    };
    yield* Ref.update(stateRef, (s) => ({
      ...s,
      teammates: [...s.teammates, person],
    }));
    return person;
  });
}

export function listWorkflowsEffect(
  session: MobileSession
): Effect.Effect<readonly WorkflowProgram[], MobileApiError> {
  return Effect.gen(function* () {
    void session;
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return FIXTURE_WORKFLOWS.filter((w) => w.stage !== "retired");
    }
    return FIXTURE_WORKFLOWS.filter((w) => w.stage !== "retired");
  });
}

export function startWorkflowEffect(input: {
  session: MobileSession;
  workflowId: string;
}): Effect.Effect<WorkflowRun, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    const catalog = isFixtureSession(input.session, config.fixtureMode)
      ? FIXTURE_WORKFLOWS
      : FIXTURE_WORKFLOWS;
    const program =
      catalog.find((w) => w.id === input.workflowId || w.name === input.workflowId) ??
      null;
    if (!program) {
      return yield* Effect.fail(
        new MobileApiError({ reason: `workflow_not_found:${input.workflowId}` })
      );
    }
    if (program.stage === "retired") {
      return yield* Effect.fail(
        new MobileApiError({ reason: `workflow_retired:${program.id}` })
      );
    }
    const run: WorkflowRun = {
      id: `wfrun_${Date.now().toString(36)}`,
      workflowId: program.id,
      name: program.name,
      startedAtMs: Date.now(),
      status: "started",
      fixture: true,
    };
    yield* Ref.update(stateRef, (s) => ({
      ...s,
      workflowRuns: [run, ...s.workflowRuns],
      activity: [
        {
          id: nextActivityId(),
          atMs: run.startedAtMs,
          title: `Started workflow ${program.title}`,
          detail: `fixture · ${program.id}`,
          kind: "skill" as const,
          decision: "start_workflow",
          reviewId: program.id,
        },
        ...s.activity,
      ],
    }));
    return run;
  });
}

export function listWorkflowRunsEffect(
  session: MobileSession
): Effect.Effect<readonly WorkflowRun[], MobileApiError> {
  return Effect.gen(function* () {
    void session;
    const state = yield* Ref.get(stateRef);
    return state.workflowRuns;
  });
}

export function searchMemoryEffect(
  session: MobileSession,
  query?: string,
  kind?: MemoryResult["kind"] | "all"
): Effect.Effect<readonly MemoryResult[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      const q = (query ?? "").trim().toLowerCase();
      return FIXTURE_MEMORY_RESULTS.filter((row) => {
        if (kind && kind !== "all" && row.kind !== kind) return false;
        if (!q) return true;
        return (
          row.title.toLowerCase().includes(q) ||
          row.summary.toLowerCase().includes(q) ||
          row.id.toLowerCase().includes(q)
        );
      });
    }
    const params = new URLSearchParams();
    if (query?.trim()) params.set("q", query.trim());
    if (kind && kind !== "all") params.set("kind", kind);
    const qs = params.toString();
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(
          `${config.apiBase}/api/managed/memory${qs ? `?${qs}` : ""}`,
          { headers: authHeaders(session) }
        );
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{ results?: MemoryResult[] }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(
      Effect.catch(() => {
        const q = (query ?? "").trim().toLowerCase();
        return Effect.succeed({
          results: FIXTURE_MEMORY_RESULTS.filter((row) => {
            if (kind && kind !== "all" && row.kind !== kind) return false;
            if (!q) return true;
            return (
              row.title.toLowerCase().includes(q) ||
              row.summary.toLowerCase().includes(q) ||
              row.id.toLowerCase().includes(q)
            );
          }),
        });
      })
    );
    return res.results ?? [];
  });
}

export function getMemoryByIdEffect(
  session: MobileSession,
  id: string
): Effect.Effect<
  { result: MemoryResult; fields: readonly MemoryField[] } | null,
  MobileApiError
> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      const result = FIXTURE_MEMORY_RESULTS.find((r) => r.id === id) ?? null;
      if (!result) return null;
      return { result, fields: FIXTURE_MEMORY_FIELDS };
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(
          `${config.apiBase}/api/managed/memory?id=${encodeURIComponent(id)}`,
          { headers: authHeaders(session) }
        );
        if (r.status === 404) return null;
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{
          result: MemoryResult;
          fields: MemoryField[];
        }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(
      Effect.catch(() => {
        const result = FIXTURE_MEMORY_RESULTS.find((r) => r.id === id) ?? null;
        return Effect.succeed(
          result ? { result, fields: [...FIXTURE_MEMORY_FIELDS] } : null
        );
      })
    );
    return res;
  });
}

export function listApiKeysEffect(
  session: MobileSession
): Effect.Effect<readonly ApiKeyItem[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      const state = yield* Ref.get(stateRef);
      return state.apiKeys.filter((k) => !k.revoked);
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/keys`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{ keys?: ApiKeyItem[] }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    });
    return (res.keys ?? []).filter((k) => !k.revoked);
  });
}

export function issueApiKeyEffect(input: {
  session: MobileSession;
  name: string;
  canUse?: string;
  keyGroup?: string;
}): Effect.Effect<{ key: ApiKeyItem; secret: string }, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    const name = input.name.trim();
    if (!name) {
      return yield* Effect.fail(new MobileApiError({ reason: "name_required" }));
    }
    if (!isFixtureSession(input.session, config.fixtureMode)) {
      const res = yield* Effect.tryPromise({
        try: async () => {
          const r = await fetch(`${config.apiBase}/api/managed/keys`, {
            method: "POST",
            headers: authHeaders(input.session),
            body: JSON.stringify({
              name,
              teamId: input.keyGroup,
              scope: ["execute", "search", "memory"],
            }),
          });
          if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
          return r.json() as Promise<{ key: ApiKeyItem; secret: string }>;
        },
        catch: (cause) =>
          new MobileApiError({
            reason: cause instanceof Error ? cause.message : String(cause),
            status: (cause as { status?: number })?.status,
          }),
      });
      return { key: res.key, secret: res.secret };
    }
    const endsIn = fixtureRandomHex(2);
    const key: ApiKeyItem = {
      id: `key_${Date.now().toString(36)}`,
      name,
      endsIn,
      expiresLabel: "Jan 1, 2028",
      keyGroup: input.keyGroup ?? "Engineering",
      canUse: input.canUse ?? "Models, tools",
      dailyCap: "$50",
      lastUsed: "Never",
    };
    const secret = `cqk_fixture_${endsIn}_${fixtureRandomHex(5)}`;
    yield* Ref.update(stateRef, (s) => ({
      ...s,
      apiKeys: [key, ...s.apiKeys],
    }));
    return { key, secret };
  });
}

export function revokeApiKeyEffect(input: {
  session: MobileSession;
  keyId: string;
}): Effect.Effect<{ ok: true; keyId: string }, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (!isFixtureSession(input.session, config.fixtureMode)) {
      yield* Effect.tryPromise({
        try: async () => {
          const r = await fetch(`${config.apiBase}/api/managed/keys`, {
            method: "POST",
            headers: authHeaders(input.session),
            body: JSON.stringify({ action: "revoke", keyId: input.keyId }),
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
      return { ok: true as const, keyId: input.keyId };
    }
    const state = yield* Ref.get(stateRef);
    if (!state.apiKeys.some((k) => k.id === input.keyId)) {
      return yield* Effect.fail(
        new MobileApiError({ reason: `key_not_found:${input.keyId}`, status: 404 })
      );
    }
    yield* Ref.update(stateRef, (s) => ({
      ...s,
      apiKeys: s.apiKeys.map((k) =>
        k.id === input.keyId ? { ...k, revoked: true } : k
      ),
    }));
    return { ok: true as const, keyId: input.keyId };
  });
}

export function listConnectionsEffect(
  session: MobileSession
): Effect.Effect<readonly ConnectionItem[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return FIXTURE_CONNECTIONS;
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/connections`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{ connections?: ConnectionItem[] }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(
      Effect.catch(() => Effect.succeed({ connections: [...FIXTURE_CONNECTIONS] }))
    );
    return res.connections ?? FIXTURE_CONNECTIONS;
  });
}

export function listAgentSessionsEffect(
  session: MobileSession
): Effect.Effect<readonly AgentSession[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return FIXTURE_AGENT_SESSIONS;
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/sessions`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{ sessions?: AgentSession[] }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(Effect.catch(() => Effect.succeed({ sessions: [...FIXTURE_AGENT_SESSIONS] })));
    return res.sessions ?? FIXTURE_AGENT_SESSIONS;
  });
}

export function listProposedSkillsEffect(
  session: MobileSession
): Effect.Effect<readonly ProposedSkill[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return FIXTURE_PROPOSED_SKILLS;
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/skills`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{ proposed?: ProposedSkill[] }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(Effect.catch(() => Effect.succeed({ proposed: [...FIXTURE_PROPOSED_SKILLS] })));
    return res.proposed ?? FIXTURE_PROPOSED_SKILLS;
  });
}

export function listActiveSkillsEffect(
  session: MobileSession
): Effect.Effect<readonly ActiveSkill[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return FIXTURE_ACTIVE_SKILLS;
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/skills`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{ active?: ActiveSkill[] }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(Effect.catch(() => Effect.succeed({ active: [...FIXTURE_ACTIVE_SKILLS] })));
    return (res.active ?? FIXTURE_ACTIVE_SKILLS).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      keyGroup: row.keyGroup,
      touchesLabel: row.touchesLabel,
      runs7d: row.runs7d,
    }));
  });
}

export function getGatewayBundleEffect(
  session: MobileSession
): Effect.Effect<GatewayBundle, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return {
        base: "https://acme.cloud.clawql.com",
        endpoints: FIXTURE_GATEWAY_ENDPOINTS,
        routes: FIXTURE_GATEWAY_ROUTES,
        source: "fixture" as const,
      };
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/gateway`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<GatewayBundle>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(
      Effect.catch(() =>
        Effect.succeed({
          base: "https://acme.cloud.clawql.com",
          endpoints: [...FIXTURE_GATEWAY_ENDPOINTS],
          routes: [...FIXTURE_GATEWAY_ROUTES],
          source: "fixture" as const,
        })
      )
    );
    return {
      base: res.base ?? "https://acme.cloud.clawql.com",
      endpoints: res.endpoints ?? FIXTURE_GATEWAY_ENDPOINTS,
      routes: res.routes ?? FIXTURE_GATEWAY_ROUTES,
      source: res.source ?? "fixture",
    };
  });
}

export function listGatewayEndpointsEffect(
  session: MobileSession
): Effect.Effect<readonly GatewayEndpoint[], MobileApiError> {
  return Effect.map(getGatewayBundleEffect(session), (b) => b.endpoints);
}

export function listAutomationsEffect(
  session: MobileSession
): Effect.Effect<readonly AutomationSub[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return FIXTURE_AUTOMATIONS;
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/automations`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{ automations?: AutomationSub[] }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(Effect.catch(() => Effect.succeed({ automations: [...FIXTURE_AUTOMATIONS] })));
    return res.automations ?? FIXTURE_AUTOMATIONS;
  });
}

export function listAuditEntriesEffect(
  session: MobileSession
): Effect.Effect<readonly AuditEntry[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return FIXTURE_AUDIT_ENTRIES;
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/audit`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{ entries?: AuditEntry[] }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(Effect.catch(() => Effect.succeed({ entries: [...FIXTURE_AUDIT_ENTRIES] })));
    return res.entries ?? FIXTURE_AUDIT_ENTRIES;
  });
}

export function getAuditIncidentEffect(
  session: MobileSession
): Effect.Effect<AuditIncident, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return { ...FIXTURE_AUDIT_INCIDENT };
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/audit`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{ incident?: AuditIncident }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(Effect.catch(() => Effect.succeed({ incident: { ...FIXTURE_AUDIT_INCIDENT } })));
    return res.incident ?? FIXTURE_AUDIT_INCIDENT;
  });
}

export function getOrgSettingsBundleEffect(
  session: MobileSession
): Effect.Effect<OrgSettingsBundle, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return {
        ...FIXTURE_ORG_SETTINGS_BUNDLE,
        org: { ...FIXTURE_ORG_SETTINGS },
      };
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/settings`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<OrgSettingsBundle & { source?: string }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(
      Effect.catch(() =>
        Effect.succeed({
          ...FIXTURE_ORG_SETTINGS_BUNDLE,
          org: { ...FIXTURE_ORG_SETTINGS },
        })
      )
    );
    return {
      org: res.org ?? FIXTURE_ORG_SETTINGS,
      webhookHosts: res.webhookHosts ?? FIXTURE_ORG_SETTINGS_BUNDLE.webhookHosts,
      egressDomains: res.egressDomains ?? FIXTURE_ORG_SETTINGS_BUNDLE.egressDomains,
      retention: res.retention ?? FIXTURE_ORG_SETTINGS_BUNDLE.retention,
    };
  });
}

export function getOrgSettingsEffect(
  session: MobileSession
): Effect.Effect<OrgSettings, MobileApiError> {
  return getOrgSettingsBundleEffect(session).pipe(Effect.map((b) => b.org));
}

export function listMemoryUploadsEffect(
  session: MobileSession
): Effect.Effect<
  { uploads: readonly MemoryUpload[]; erasedSubjects: readonly string[] },
  MobileApiError
> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      const state = yield* Ref.get(stateRef);
      return { uploads: FIXTURE_MEMORY_UPLOADS, erasedSubjects: state.erasedSubjects };
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/memory?view=uploads`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{
          uploads?: MemoryUpload[];
          erasedSubjects?: string[];
        }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(
      Effect.catch(() =>
        Effect.succeed({
          uploads: [...FIXTURE_MEMORY_UPLOADS],
          erasedSubjects: [] as string[],
        })
      )
    );
    return {
      uploads: res.uploads ?? FIXTURE_MEMORY_UPLOADS,
      erasedSubjects: res.erasedSubjects ?? [],
    };
  });
}

export function eraseMemorySubjectEffect(input: {
  session: MobileSession;
  subject: string;
  acceptIrreversible: boolean;
  acceptAuditKept: boolean;
}): Effect.Effect<{ ok: true; subject: string; jobId?: string }, MobileApiError> {
  return Effect.gen(function* () {
    const subject = input.subject.trim();
    if (!subject) {
      return yield* Effect.fail(new MobileApiError({ reason: "subject_required" }));
    }
    if (!input.acceptIrreversible || !input.acceptAuditKept) {
      return yield* Effect.fail(new MobileApiError({ reason: "acceptance_required" }));
    }
    const config = yield* loadMobileConfigEffect();
    if (!isFixtureSession(input.session, config.fixtureMode)) {
      const res = yield* Effect.tryPromise({
        try: async () => {
          const r = await fetch(`${config.apiBase}/api/managed/memory`, {
            method: "POST",
            headers: authHeaders(input.session),
            body: JSON.stringify({
              action: "erase",
              subject,
              acceptIrreversible: input.acceptIrreversible,
              acceptAuditKept: input.acceptAuditKept,
            }),
          });
          if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
          return r.json() as Promise<{ ok: true; subject: string; jobId?: string }>;
        },
        catch: (cause) =>
          new MobileApiError({
            reason: cause instanceof Error ? cause.message : String(cause),
            status: (cause as { status?: number })?.status,
          }),
      });
      return { ok: true as const, subject: res.subject, jobId: res.jobId };
    }
    const jobId = `era_${Date.now().toString(36)}`;
    yield* Ref.update(stateRef, (s) => ({
      ...s,
      erasedSubjects: s.erasedSubjects.includes(subject)
        ? s.erasedSubjects
        : [...s.erasedSubjects, subject],
    }));
    return { ok: true as const, subject, jobId };
  });
}

export function openBillingPortalEffect(
  session: MobileSession,
  returnUrl?: string
): Effect.Effect<{ url: string; source: "live" | "fixture" }, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      return {
        url: "fixture://billing-portal",
        source: "fixture" as const,
      };
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/billing/portal`, {
          method: "POST",
          headers: authHeaders(session),
          body: JSON.stringify({ returnUrl }),
        });
        const body = (await r.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
        };
        if (!r.ok || !body.url) {
          throw Object.assign(new Error(body.error || `http_${r.status}`), {
            status: r.status,
          });
        }
        return { url: body.url, source: "live" as const };
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
    const config = yield* loadMobileConfigEffect();
    const device: PushDevice = {
      id: `push_${input.platform}_${input.token.slice(-12)}`,
      token: input.token,
      platform: input.platform,
      label: input.label,
      registeredAtMs: Date.now(),
      fixture: input.fixture,
    };
    if (!isFixtureSession(input.session, config.fixtureMode) && !input.fixture) {
      yield* Effect.tryPromise({
        try: async () => {
          const r = await fetch(`${config.apiBase}/api/managed/devices/push`, {
            method: "POST",
            headers: authHeaders(input.session),
            body: JSON.stringify({
              token: input.token,
              platform: input.platform,
              label: input.label,
              userId: input.session.userId,
              fixture: false,
            }),
          });
          if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
          return r.json();
        },
        catch: (cause) =>
          new MobileApiError({
            reason: cause instanceof Error ? cause.message : String(cause),
            status: (cause as { status?: number })?.status,
          }),
      }).pipe(Effect.catch(() => Effect.void));
    }
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
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      const state = yield* Ref.get(stateRef);
      return state.pushDevices;
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(`${config.apiBase}/api/managed/devices/push`, {
          headers: authHeaders(session),
        });
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{ devices?: PushDevice[] }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(Effect.catch(() => Effect.succeed({ devices: [] as PushDevice[] })));
    return res.devices ?? [];
  });
}

export function clearPushDevicesEffect(
  session: MobileSession
): Effect.Effect<void, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (!isFixtureSession(session, config.fixtureMode)) {
      yield* Effect.tryPromise({
        try: async () => {
          const r = await fetch(
            `${config.apiBase}/api/managed/devices/push?userId=${encodeURIComponent(session.userId)}`,
            { method: "DELETE", headers: authHeaders(session) }
          );
          if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
          return r.json();
        },
        catch: (cause) =>
          new MobileApiError({
            reason: cause instanceof Error ? cause.message : String(cause),
            status: (cause as { status?: number })?.status,
          }),
      }).pipe(Effect.catch(() => Effect.void));
    }
    yield* Ref.update(stateRef, (s) => ({ ...s, pushDevices: [] }));
  });
}

export function listAttachmentsEffect(
  session: MobileSession,
  reviewId: string
): Effect.Effect<readonly DocumentAttachment[], MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (isFixtureSession(session, config.fixtureMode)) {
      const state = yield* Ref.get(stateRef);
      return state.attachments.filter((a) => a.reviewId === reviewId);
    }
    const res = yield* Effect.tryPromise({
      try: async () => {
        const r = await fetch(
          `${config.apiBase}/api/managed/evidence?reviewId=${encodeURIComponent(reviewId)}`,
          { headers: authHeaders(session) }
        );
        if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
        return r.json() as Promise<{ attachments?: DocumentAttachment[] }>;
      },
      catch: (cause) =>
        new MobileApiError({
          reason: cause instanceof Error ? cause.message : String(cause),
          status: (cause as { status?: number })?.status,
        }),
    }).pipe(Effect.catch(() => Effect.succeed({ attachments: [] as DocumentAttachment[] })));
    return res.attachments ?? [];
  });
}

export function addAttachmentEffect(input: {
  session: MobileSession;
  attachment: DocumentAttachment;
}): Effect.Effect<DocumentAttachment, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (!isFixtureSession(input.session, config.fixtureMode)) {
      yield* Effect.tryPromise({
        try: async () => {
          const r = await fetch(`${config.apiBase}/api/managed/evidence`, {
            method: "POST",
            headers: authHeaders(input.session),
            body: JSON.stringify(input.attachment),
          });
          if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
          return r.json();
        },
        catch: (cause) =>
          new MobileApiError({
            reason: cause instanceof Error ? cause.message : String(cause),
            status: (cause as { status?: number })?.status,
          }),
      }).pipe(Effect.catch(() => Effect.void));
    }
    yield* Ref.update(stateRef, (s) => ({
      ...s,
      attachments: [input.attachment, ...s.attachments],
    }));
    return input.attachment;
  });
}

export function removeAttachmentEffect(input: {
  session: MobileSession;
  reviewId: string;
  attachmentId: string;
}): Effect.Effect<void, MobileApiError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (!isFixtureSession(input.session, config.fixtureMode)) {
      yield* Effect.tryPromise({
        try: async () => {
          const r = await fetch(`${config.apiBase}/api/managed/evidence`, {
            method: "POST",
            headers: authHeaders(input.session),
            body: JSON.stringify({
              action: "remove",
              reviewId: input.reviewId,
              attachmentId: input.attachmentId,
            }),
          });
          if (!r.ok) throw Object.assign(new Error(`http_${r.status}`), { status: r.status });
          return r.json();
        },
        catch: (cause) =>
          new MobileApiError({
            reason: cause instanceof Error ? cause.message : String(cause),
            status: (cause as { status?: number })?.status,
          }),
      }).pipe(Effect.catch(() => Effect.void));
      return;
    }
    const before = yield* Ref.get(stateRef);
    const found = before.attachments.some(
      (a) => a.id === input.attachmentId && a.reviewId === input.reviewId
    );
    if (!found) {
      return yield* Effect.fail(new MobileApiError({ reason: "not_found", status: 404 }));
    }
    yield* Ref.update(stateRef, (s) => ({
      ...s,
      attachments: s.attachments.filter(
        (a) => !(a.id === input.attachmentId && a.reviewId === input.reviewId)
      ),
    }));
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
    workflowRuns: [],
    apiKeys: [...FIXTURE_API_KEYS],
    teammates: [...FIXTURE_TEAMMATES],
    erasedSubjects: [],
    deleted: false,
  });
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function homeSpendFromUsage(usage: ManagedUsage): HomeSpend {
  return {
    label: "Today's spend",
    amount: money(usage.todaySpent),
    note: usage.todayNote,
    budget: `${money(usage.monthBudget)}/mo`,
    lines: usage.teamRows.map((row) => ({
      agent: row.team,
      amount: money(row.spent),
      note: row.alert ?? `${row.requests.toLocaleString()} requests · ${money(row.budget)} budget`,
    })),
  };
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
    readonly getManagedUsage: (
      session: MobileSession
    ) => Effect.Effect<ManagedUsage, MobileApiError>;
    readonly listAgents: (
      session: MobileSession
    ) => Effect.Effect<readonly AgentSummary[], MobileApiError>;
    readonly getMorningDigest: (
      session: MobileSession
    ) => Effect.Effect<MorningDigest, MobileApiError>;
    readonly listTeammates: (
      session: MobileSession
    ) => Effect.Effect<readonly Teammate[], MobileApiError>;
    readonly getTeamBundle: (
      session: MobileSession
    ) => Effect.Effect<TeamBundle, MobileApiError>;
    readonly inviteTeammate: (input: {
      session: MobileSession;
      email: string;
      name?: string;
      role?: string;
      acceptCanApprove: boolean;
      acceptSecurityKeys: boolean;
      acceptAuditRecorded: boolean;
    }) => Effect.Effect<Teammate, MobileApiError>;
    readonly listWorkflows: (
      session: MobileSession
    ) => Effect.Effect<readonly WorkflowProgram[], MobileApiError>;
    readonly startWorkflow: (input: {
      session: MobileSession;
      workflowId: string;
    }) => Effect.Effect<WorkflowRun, MobileApiError>;
    readonly listWorkflowRuns: (
      session: MobileSession
    ) => Effect.Effect<readonly WorkflowRun[], MobileApiError>;
    readonly searchMemory: (
      session: MobileSession,
      query?: string,
      kind?: MemoryResult["kind"] | "all"
    ) => Effect.Effect<readonly MemoryResult[], MobileApiError>;
    readonly getMemoryById: (
      session: MobileSession,
      id: string
    ) => Effect.Effect<
      { result: MemoryResult; fields: readonly MemoryField[] } | null,
      MobileApiError
    >;
    readonly listApiKeys: (
      session: MobileSession
    ) => Effect.Effect<readonly ApiKeyItem[], MobileApiError>;
    readonly issueApiKey: (input: {
      session: MobileSession;
      name: string;
      canUse?: string;
      keyGroup?: string;
    }) => Effect.Effect<{ key: ApiKeyItem; secret: string }, MobileApiError>;
    readonly revokeApiKey: (input: {
      session: MobileSession;
      keyId: string;
    }) => Effect.Effect<{ ok: true; keyId: string }, MobileApiError>;
    readonly listConnections: (
      session: MobileSession
    ) => Effect.Effect<readonly ConnectionItem[], MobileApiError>;
    readonly listAgentSessions: (
      session: MobileSession
    ) => Effect.Effect<readonly AgentSession[], MobileApiError>;
    readonly listProposedSkills: (
      session: MobileSession
    ) => Effect.Effect<readonly ProposedSkill[], MobileApiError>;
    readonly listActiveSkills: (
      session: MobileSession
    ) => Effect.Effect<readonly ActiveSkill[], MobileApiError>;
    readonly getAuditIncident: (
      session: MobileSession
    ) => Effect.Effect<AuditIncident, MobileApiError>;
    readonly getOrgSettingsBundle: (
      session: MobileSession
    ) => Effect.Effect<OrgSettingsBundle, MobileApiError>;
    readonly getGatewayBundle: (
      session: MobileSession
    ) => Effect.Effect<GatewayBundle, MobileApiError>;
    readonly listGatewayEndpoints: (
      session: MobileSession
    ) => Effect.Effect<readonly GatewayEndpoint[], MobileApiError>;
    readonly listAutomations: (
      session: MobileSession
    ) => Effect.Effect<readonly AutomationSub[], MobileApiError>;
    readonly listAuditEntries: (
      session: MobileSession
    ) => Effect.Effect<readonly AuditEntry[], MobileApiError>;
    readonly getOrgSettings: (
      session: MobileSession
    ) => Effect.Effect<OrgSettings, MobileApiError>;
    readonly listMemoryUploads: (
      session: MobileSession
    ) => Effect.Effect<
      { uploads: readonly MemoryUpload[]; erasedSubjects: readonly string[] },
      MobileApiError
    >;
    readonly eraseMemorySubject: (input: {
      session: MobileSession;
      subject: string;
      acceptIrreversible: boolean;
      acceptAuditKept: boolean;
    }) => Effect.Effect<{ ok: true; subject: string; jobId?: string }, MobileApiError>;
    readonly openBillingPortal: (
      session: MobileSession,
      returnUrl?: string
    ) => Effect.Effect<{ url: string; source: "live" | "fixture" }, MobileApiError>;
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
    readonly removeAttachment: (input: {
      session: MobileSession;
      reviewId: string;
      attachmentId: string;
    }) => Effect.Effect<void, MobileApiError>;
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
  getManagedUsage: getManagedUsageEffect,
  listAgents: listAgentsEffect,
  getMorningDigest: getMorningDigestEffect,
  listTeammates: listTeammatesEffect,
  getTeamBundle: getTeamBundleEffect,
  inviteTeammate: inviteTeammateEffect,
  listWorkflows: listWorkflowsEffect,
  startWorkflow: startWorkflowEffect,
  listWorkflowRuns: listWorkflowRunsEffect,
  searchMemory: searchMemoryEffect,
  getMemoryById: getMemoryByIdEffect,
  listApiKeys: listApiKeysEffect,
  issueApiKey: issueApiKeyEffect,
  revokeApiKey: revokeApiKeyEffect,
  listConnections: listConnectionsEffect,
  listAgentSessions: listAgentSessionsEffect,
  listProposedSkills: listProposedSkillsEffect,
  listActiveSkills: listActiveSkillsEffect,
  getAuditIncident: getAuditIncidentEffect,
  getOrgSettingsBundle: getOrgSettingsBundleEffect,
  getGatewayBundle: getGatewayBundleEffect,
  listGatewayEndpoints: listGatewayEndpointsEffect,
  listAutomations: listAutomationsEffect,
  listAuditEntries: listAuditEntriesEffect,
  getOrgSettings: getOrgSettingsEffect,
  listMemoryUploads: listMemoryUploadsEffect,
  eraseMemorySubject: eraseMemorySubjectEffect,
  openBillingPortal: openBillingPortalEffect,
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
  removeAttachment: removeAttachmentEffect,
  deleteAccount: deleteAccountEffect,
});
