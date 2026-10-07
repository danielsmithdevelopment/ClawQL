import { createHash } from "node:crypto";

import { Effect } from "effect";
import { NextResponse } from "next/server";

import { E2eHarness, runE2eEffect } from "@/lib/managed/e2e/service";
import {
  appendAudit,
  getWorld,
  newId,
  personByName,
  recountReviewBadges,
} from "@/lib/managed/e2e/world";

export const dynamic = "force-dynamic";

/** Witness snapshot for Nightly Playwright — never used as a stub pass via runScenario. */
export async function GET() {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const world = getWorld();
      return NextResponse.json({
        org: {
          orgId: world.orgId,
          orgName: world.orgName,
          orgAddress: world.orgAddress,
          orgRegion: world.orgRegion,
          deleted: world.orgDeleted,
          deletionCertificate: world.deletionCertificate,
          firstRunStep: world.firstRunStep,
          firstRunTotal: world.firstRunTotal,
          securityKeysRegistered: world.securityKeysRegistered,
          recoveryCodesRemaining: world.recoveryCodes.length,
          recoveryCodesShownOnce: world.recoveryCodesShownOnce,
          stripeProvisioningDone: world.stripeProvisioningDone,
          signedInUserId: world.signedInUserId,
        },
        people: world.people.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          groups: p.groups,
          active: p.active,
          canApproveContracts: p.canApproveContracts,
          canAnswerTicketTriage: p.canAnswerTicketTriage,
          keyCount: p.securityKeys.filter((k) => !k.revoked).length,
          needsTwo: p.securityKeys.filter((k) => !k.revoked && k.canApprove).length < 2,
          keys: p.securityKeys.map((k) => ({
            id: k.id,
            label: k.label,
            kind: k.kind,
            canApprove: k.canApprove,
            status: k.canApprove ? "Can approve" : "Sign-in only",
            aaguid: k.aaguid,
            signatureCounter: k.signatureCounter,
            revoked: k.revoked,
          })),
          sessions: p.sessions,
          notifications: p.notifications,
          timeZone: p.timeZone,
          appearance: p.appearance,
        })),
        keys: world.keys.map((k) => ({
          id: k.id,
          name: k.name,
          group: k.group,
          canUse: k.canUse,
          dailyCapCents: k.dailyCapCents,
          spentTodayCents: k.spentTodayCents,
          revoked: k.revoked,
          expiresAt: k.expiresAt,
          lastFour: k.lastFour,
          confirmedSaved: k.confirmedSaved,
          memoryEnrichment: k.memoryEnrichment ?? false,
          canUseMemory: k.canUse.includes("memory"),
          capReached: k.spentTodayCents >= k.dailyCapCents,
          teamBudgetExhausted: k.teamBudgetExhausted ?? false,
        })),
        sessions: world.sessions,
        review: world.review,
        badges: {
          home: world.homeNeedsAction,
          review: world.reviewBadge,
          sidebar: world.sidebarBadge,
        },
        connections: world.connections,
        skills: world.skills,
        subscriptions: world.subscriptions,
        notificationsOutbox: world.notificationsOutbox,
        alerts: world.alerts,
        modelRoutes: world.modelRoutes,
        decisionSites: world.decisionSites,
        redaction: world.redaction,
        requestExpiryMinutes: world.requestExpiryMinutes,
        idleTimeoutMinutes: world.idleTimeoutMinutes,
        maxSessionMinutes: world.maxSessionMinutes,
        auditRetentionYears: world.auditRetentionYears,
        requesterCannotApproveLocked: world.requesterCannotApproveLocked,
        requiredApprovalsDefault: world.requiredApprovalsDefault,
        hardStop: world.hardStop,
        monthSpentCents: world.monthSpentCents,
        monthBudgetCents: world.monthBudgetCents,
        creditsCents: world.creditsCents,
        teamBudgets: world.teamBudgets,
        invoiceCard: world.invoiceCard,
        invoices: world.invoices,
        schemaFields: world.schemaFields,
        trainingExports: world.trainingExports,
        blockedCalls: world.blockedCalls,
        inboundWebhookStats: world.inboundWebhookStats,
        eventTypeCounts24h: world.eventTypeCounts24h,
        streamCursor: world.streamCursor,
        allowedWebhookHosts: world.allowedWebhookHosts,
        allowedOutboundHosts: world.allowedOutboundHosts,
        ipAllowlist: world.ipAllowlist,
        gateUnreachable: world.gateUnreachable,
        infoFlowUnreachable: world.infoFlowUnreachable,
        auditBroken: world.auditBroken,
        hourlyRoots: world.hourlyRoots,
        orgArchive: world.orgArchive
          ? { keys: Object.keys(world.orgArchive), hasAudit: Boolean(world.orgArchive.audit) }
          : null,
        authAttempts: world.authAttempts ?? { signin: 0, apikey: 0 },
      });
    }),
  );
}

type ControlBody = {
  gateUnreachable?: boolean;
  infoFlowUnreachable?: boolean;
  hardStop?: boolean;
  monthSpentCents?: number;
  monthBudgetCents?: number;
  creditsCents?: number;
  revokeKey?: string;
  expireKey?: string;
  expireRequest?: string;
  setGate?: "unreachable" | "ok";
  breakProvider?: { route: string; broken?: boolean };
  tamperAuditEntry?: string;
  restoreAudit?: { admins: string[] };
  rotateWebhookSecret?: string;
  pauseSubscription?: string;
  resumeSubscription?: string;
  setReceiverMode?: string;
  receiverChallengeOk?: boolean;
  resetReceiver?: boolean;
  idleTimeoutMinutes?: number;
  maxSessionMinutes?: number;
  requestExpiryMinutes?: number;
  auditRetentionYears?: number;
  allowedOutboundHosts?: string[];
  removeWebhookHost?: string;
  ipAllowlist?: string[] | null;
  registerSecurityKeys?: { person: string; count: number };
  useRecoveryCode?: string;
  regenerateRecoveryCodes?: boolean;
  syncOkta?: { removeJordanFromSupport?: boolean; deactivatePriya?: boolean; addJordanToLegal?: boolean };
  changeRole?: { person: string; role: string };
  inviteAccept?: { name: string; role: string };
  orgRename?: string;
  redaction?: Partial<{ phone: boolean; email: boolean; bank: boolean }>;
  transferOwnership?: { from: string; to: string };
  deleteOrg?: { name: string; pinVerified?: boolean; freshSignIn?: boolean };
  resetSignatureCounter?: { person: string; keyId?: string };
  /** Arrange: advance server-side counter ahead of CDP authenticator (KEY-11 clone). */
  inflateSignatureCounter?: { person: string; to: number; label?: string };
  setAaguid?: { person: string; aaguid: string; label?: string };
  markFirstRun?: number;
  stripeWebhookReplay?: boolean;
  stripeCheckoutForeignId?: string;
  stopEraseJob?: string;
  setRequiredApprovals?: number;
  changeRequestArgs?: { requestId: string; args: Record<string, unknown> };
  endOtherSessions?: { person: string };
  idleSignOut?: { person: string };
  forceSessionExpiry?: { person: string };
  teamBudgetExhaust?: string;
  forecastSpend?: boolean;
  budgetAlerts?: boolean;
  addCredits?: number;
  changeCard?: string;
  schemaAccept?: string;
  skillMutate?: Partial<{
    id: string;
    stage: string;
    failed: boolean;
    failReason: string;
    sessionCount: number;
    evidence: string[];
    hosts: string[];
    ops: string[];
    injectionFlagged: boolean;
    needsConnection: string;
    retireReason: string;
    reReviewLapsed: boolean;
    writing: boolean;
    name: string;
  }>;
  proposeSkill?: { name: string; sessionCount: number };
  connectionMutate?: Partial<{
    id: string;
    groups: string[];
    status: string;
    personal: boolean;
    readOverrides: string[];
  }>;
  addConnection?: {
    name: string;
    groups?: string[];
    personal?: boolean;
    kind?: string;
    injection?: boolean;
  };
  lumenAccess?: boolean;
  signedInUserId?: string;
  stripeProvisioningDone?: boolean;
  securityKeysRegistered?: boolean;
  asRole?: "owner" | "admin" | "member" | "billing" | "auditor";
  authAttempt?: { kind: "signin" | "apikey" };
  setMemoryEnrichment?: { key: string; enabled: boolean };
  skillAction?: {
    id: string;
    action: "prove" | "autoPromote" | "retire" | "reprove" | "flagInjection";
    reason?: string;
  };
  secondBrowserSession?: { person: string };
  keySpentToday?: { name: string; cents: number };
  personMutate?: { person: string; canApproveContracts?: boolean; groups?: string[]; notifications?: { slack?: boolean; push?: boolean }; timeZone?: string; appearance?: "light" | "dark"; endSessionDevice?: string };
  /** Persist Review/sessions while recording a gateway restart (RES-01 / RES-06). */
  simulateGatewayRestart?: boolean;
};

export async function POST(req: Request) {
  return runE2eEffect(
    Effect.gen(function* () {
      const h = yield* E2eHarness;
      if (!(yield* h.enabled())) {
        return NextResponse.json({ error: "E2E harness disabled" }, { status: 404 });
      }
      const body = (yield* Effect.tryPromise({
        try: () => req.json() as Promise<ControlBody>,
        catch: () => ({}) as ControlBody,
      })) as ControlBody;

      const world = getWorld();

      if (body.simulateGatewayRestart) {
        world.gateUnreachable = false;
        appendAudit("gateway", "gateway.restart", "Restarted — sessions and review preserved", {
          sessionCount: world.sessions.length,
          reviewWaiting: world.review.filter((r) => r.status === "waiting").length,
        });
      }

      if (typeof body.gateUnreachable === "boolean") world.gateUnreachable = body.gateUnreachable;
      if (body.setGate === "unreachable") world.gateUnreachable = true;
      if (body.setGate === "ok") world.gateUnreachable = false;
      if (typeof body.infoFlowUnreachable === "boolean") {
        world.infoFlowUnreachable = body.infoFlowUnreachable;
      }
      if (typeof body.hardStop === "boolean") world.hardStop = body.hardStop;
      if (typeof body.monthSpentCents === "number") world.monthSpentCents = body.monthSpentCents;
      if (typeof body.monthBudgetCents === "number") world.monthBudgetCents = body.monthBudgetCents;
      if (typeof body.creditsCents === "number") world.creditsCents = body.creditsCents;
      if (typeof body.idleTimeoutMinutes === "number") {
        const old = world.idleTimeoutMinutes;
        world.idleTimeoutMinutes = body.idleTimeoutMinutes;
        appendAudit("Dana Reyes", "settings.idle", "Changed", {
          old,
          new: body.idleTimeoutMinutes,
        });
      }
      if (typeof body.maxSessionMinutes === "number") {
        world.maxSessionMinutes = body.maxSessionMinutes;
      }
      if (typeof body.requestExpiryMinutes === "number") {
        const old = world.requestExpiryMinutes;
        world.requestExpiryMinutes = body.requestExpiryMinutes;
        appendAudit("Dana Reyes", "settings.request_expiry", "Changed", {
          old,
          new: body.requestExpiryMinutes,
        });
      }
      if (typeof body.auditRetentionYears === "number") {
        if (body.auditRetentionYears < 1) {
          appendAudit("Dana Reyes", "settings.audit_retention", "Not allowed — below 1 year");
          return NextResponse.json({ error: "audit retention minimum is 1 year" }, { status: 400 });
        }
        const old = world.auditRetentionYears;
        world.auditRetentionYears = body.auditRetentionYears;
        appendAudit("Dana Reyes", "settings.audit_retention", "Changed", {
          old,
          new: body.auditRetentionYears,
        });
      }
      if (body.allowedOutboundHosts) world.allowedOutboundHosts = body.allowedOutboundHosts;
      if (body.removeWebhookHost) {
        const host = body.removeWebhookHost;
        const live = world.subscriptions.some((s) => s.url.includes(host) && s.active);
        appendAudit(
          "Dana Reyes",
          "settings.webhook_host",
          live ? "Warned — live subscription then removed" : "Removed host from allowlist",
          { host, hadLiveSubscription: live },
        );
        world.allowedWebhookHosts = world.allowedWebhookHosts.filter((h) => h !== host);
        for (const s of world.subscriptions) {
          if (s.url.includes(host)) {
            s.active = false;
            s.paused = true;
            s.health = "Stopped";
            s.stopReason = "Host removed from allowlist";
          }
        }
      }
      if (body.ipAllowlist !== undefined) world.ipAllowlist = body.ipAllowlist;
      if (typeof body.markFirstRun === "number") world.firstRunStep = body.markFirstRun;
      if (typeof body.signedInUserId === "string") world.signedInUserId = body.signedInUserId;
      if (typeof body.lumenAccess === "boolean") world.lumenFreightDenied = !body.lumenAccess;
      if (typeof body.stripeProvisioningDone === "boolean") {
        world.stripeProvisioningDone = body.stripeProvisioningDone;
      }
      if (typeof body.securityKeysRegistered === "boolean") {
        world.securityKeysRegistered = body.securityKeysRegistered;
      }
      if (body.asRole) {
        const person = world.people.find((p) => p.role === body.asRole);
        if (person) world.signedInUserId = person.id;
      }

      if (body.revokeKey) {
        const key = world.keys.find((k) => k.name === body.revokeKey || k.id === body.revokeKey);
        if (key) {
          key.revoked = true;
          appendAudit("Dana Reyes", "key.revoke", "Revoked", { key: key.name });
        }
      }
      if (body.expireKey) {
        const key = world.keys.find((k) => k.name === body.expireKey || k.id === body.expireKey);
        if (key) {
          key.expiresAt = new Date(Date.now() - 1000).toISOString();
        }
      }
      if (body.expireRequest) {
        const item = world.review.find((r) => r.id === body.expireRequest);
        if (item) {
          item.status = "expired";
          item.expiresAt = new Date(Date.now() - 1000).toISOString();
          recountReviewBadges();
        }
      }
      if (body.breakProvider) {
        const route = world.modelRoutes[body.breakProvider.route];
        if (route) {
          route.primaryBroken = body.breakProvider.broken !== false;
        }
      }
      if (body.tamperAuditEntry) {
        const entry = world.audit.find((e) => e.id === body.tamperAuditEntry);
        if (entry) {
          (entry as { outcome: string }).outcome = "TAMPERED";
          entry.tampered = true;
          world.auditBroken = true;
          appendAudit("system", "audit.integrity", "Scheduled check failed", {
            failedAt: entry.id,
            field: "outcome",
          });
          world.alerts.push({
            channel: "security-contact",
            kind: "audit-break",
            at: new Date().toISOString(),
          });
        }
      }
      if (body.restoreAudit) {
        const admins = body.restoreAudit.admins ?? [];
        world.auditRestoreAdmins = [...new Set([...world.auditRestoreAdmins, ...admins])];
        if (world.auditRestoreAdmins.length < 2) {
          appendAudit(admins[0] ?? "admin", "audit.restore", "Refused — need two admins");
          return NextResponse.json(
            { ok: false, error: "two admins required", admins: world.auditRestoreAdmins },
            { status: 403 },
          );
        }
        for (const e of world.audit) {
          if (e.tampered) {
            e.tampered = false;
            (e as { outcome: string }).outcome = "restored-after-break";
          }
        }
        world.auditBroken = false;
        appendAudit("system", "audit.restore", "Restored with two admins; break stays on record", {
          admins: world.auditRestoreAdmins,
        });
      }
      if (body.rotateWebhookSecret) {
        world.webhookSigningSecret = body.rotateWebhookSecret;
        for (const s of world.subscriptions) s.secret = body.rotateWebhookSecret;
        appendAudit("Dana Reyes", "webhook.rotate_secret", "Rotated");
      }
      if (body.pauseSubscription) {
        const sub = world.subscriptions.find((s) => s.id === body.pauseSubscription);
        if (sub) {
          sub.paused = true;
          sub.health = "Paused";
        }
      }
      if (body.resumeSubscription) {
        const sub = world.subscriptions.find((s) => s.id === body.resumeSubscription);
        if (sub) {
          sub.paused = false;
          sub.active = true;
          sub.health = "Healthy";
        }
      }

      // Forward receiver control to local webhook harness
      if (
        body.setReceiverMode ||
        typeof body.receiverChallengeOk === "boolean" ||
        body.resetReceiver
      ) {
        const port = process.env.CLAWQL_E2E_WEBHOOK_PORT ?? "4091";
        yield* Effect.tryPromise({
          try: () =>
            fetch(`http://127.0.0.1:${port}/control`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                mode: body.setReceiverMode,
                challengeOk: body.receiverChallengeOk,
                reset: body.resetReceiver,
                secret: world.webhookSigningSecret,
              }),
            }).then((r) => r.json().catch(() => ({}))),
          catch: () => ({ forwarded: false }),
        });
        if (typeof body.receiverChallengeOk === "boolean") {
          for (const s of world.subscriptions) {
            s.challengeAccepted = body.receiverChallengeOk;
            if (!body.receiverChallengeOk) s.active = false;
          }
        }
      }

      if (body.registerSecurityKeys) {
        const person = personByName(body.registerSecurityKeys.person);
        if (person) {
          while (person.securityKeys.filter((k) => !k.revoked).length < body.registerSecurityKeys.count) {
            person.securityKeys.push({
              id: newId("sk"),
              label: `Key ${person.securityKeys.length + 1}`,
              kind: "device-bound",
              canApprove: true,
              aaguid: "aagu_yubi5",
              signatureCounter: 1,
              revoked: false,
            });
          }
          world.securityKeysRegistered = true;
          world.recoveryCodesShownOnce = true;
          world.firstRunStep = Math.max(world.firstRunStep, 3);
          appendAudit(person.name, "security_keys.register", "Registered", {
            count: body.registerSecurityKeys.count,
          });
        }
      }
      if (body.useRecoveryCode) {
        const code = body.useRecoveryCode;
        if (world.usedRecoveryCodes.includes(code) || !world.recoveryCodes.includes(code)) {
          appendAudit("system", "recovery.use", "Rejected — code invalid or already used");
          return NextResponse.json({ ok: false, error: "recovery code rejected" }, { status: 403 });
        }
        world.usedRecoveryCodes.push(code);
        world.recoveryCodes = world.recoveryCodes.filter((c) => c !== code);
        appendAudit("system", "recovery.use", "Accepted once");
      }
      if (body.regenerateRecoveryCodes) {
        const old = [...world.recoveryCodes];
        world.recoveryCodes = Array.from({ length: 8 }, (_, i) => `REC-NEW-${i}`);
        world.usedRecoveryCodes = [];
        appendAudit("Dana Reyes", "recovery.regenerate", "New codes issued", {
          oldRejected: old.length,
        });
      }
      if (body.syncOkta) {
        if (body.syncOkta.removeJordanFromSupport) {
          const jordan = personByName("Jordan Park");
          if (jordan) {
            jordan.groups = jordan.groups.filter((g) => g !== "Support");
            jordan.canAnswerTicketTriage = false;
            appendAudit("okta", "sync.group", "Jordan removed from Support");
          }
        }
        if (body.syncOkta.deactivatePriya) {
          const priya = personByName("Priya Shah");
          if (priya) {
            priya.active = false;
            appendAudit("okta", "sync.deactivate", "Priya deactivated");
          }
        }
        if (body.syncOkta.addJordanToLegal) {
          const jordan = personByName("Jordan Park");
          if (jordan) {
            if (!jordan.groups.includes("Legal")) jordan.groups.push("Legal");
            jordan.canApproveContracts = true;
            appendAudit("okta", "sync.group", "Jordan added to Legal");
          }
        }
      }
      if (body.changeRole) {
        const p = personByName(body.changeRole.person);
        if (p) {
          const old = p.role;
          p.role = body.changeRole.role as typeof p.role;
          appendAudit("Dana Reyes", "role.change", "Changed", { person: p.name, old, new: p.role });
        }
      }
      if (body.inviteAccept) {
        world.people.push({
          id: newId("user"),
          name: body.inviteAccept.name,
          email: `${body.inviteAccept.name.toLowerCase().replace(/\s+/g, ".")}@acme.example`,
          role: body.inviteAccept.role as "member",
          groups: [],
          active: true,
          securityKeys: [],
          sessions: [],
          notifications: { slack: true, push: true },
          timeZone: "UTC",
          appearance: "light",
          canApproveContracts: false,
          canAnswerTicketTriage: false,
        });
        appendAudit("system", "invite.sent", "Invite sent", { name: body.inviteAccept.name });
        appendAudit(body.inviteAccept.name, "invite.accept", "Joined via Okta", {
          role: body.inviteAccept.role,
        });
      }
      if (body.orgRename) {
        const old = world.orgName;
        world.orgName = body.orgRename;
        appendAudit("Dana Reyes", "org.rename", "Renamed", { old, new: body.orgRename });
      }
      if (body.redaction) {
        if (typeof body.redaction.phone === "boolean") world.redaction.phone = body.redaction.phone;
        if (typeof body.redaction.email === "boolean") world.redaction.email = body.redaction.email;
        if (typeof body.redaction.bank === "boolean") world.redaction.bank = body.redaction.bank;
        appendAudit("Dana Reyes", "settings.redaction", "Changed", { ...body.redaction });
      }
      if (body.transferOwnership) {
        const from = personByName(body.transferOwnership.from);
        const to = personByName(body.transferOwnership.to);
        if (from && to) {
          from.role = "admin";
          to.role = "owner";
          appendAudit("system", "ownership.transfer", "Transferred", {
            from: from.name,
            to: to.name,
          });
        }
      }
      if (body.deleteOrg) {
        if (!body.deleteOrg.freshSignIn) {
          return NextResponse.json(
            { error: "sign in again before deleting the org" },
            { status: 401 },
          );
        }
        if (body.deleteOrg.pinVerified === false) {
          return NextResponse.json({ error: "security key required" }, { status: 403 });
        }
        world.orgArchive = {
          memory: world.memoryNotes,
          documents: world.documents,
          skills: world.skills,
          settings: { orgName: world.orgName },
          audit: world.audit,
        };
        world.orgDeleted = true;
        world.deletionCertificate = newId("cert");
        for (const p of world.people) p.active = false;
        appendAudit("Dana Reyes", "org.delete", "Deletion complete", {
          certificate: world.deletionCertificate,
        });
      }
      if (body.resetSignatureCounter) {
        const p = personByName(body.resetSignatureCounter.person);
        const key =
          p?.securityKeys.find((k) => k.id === body.resetSignatureCounter?.keyId) ??
          p?.securityKeys[0];
        if (key) key.signatureCounter = 0;
      }
      if (body.inflateSignatureCounter) {
        const p = personByName(body.inflateSignatureCounter.person);
        const key =
          (body.inflateSignatureCounter.label
            ? p?.securityKeys.find((k) => k.label === body.inflateSignatureCounter?.label)
            : undefined) ??
          p?.securityKeys.find((k) => k.canApprove && !k.revoked && k.credentialId) ??
          p?.securityKeys[0];
        if (key) key.signatureCounter = body.inflateSignatureCounter.to;
      }
      if (body.setAaguid) {
        const p = personByName(body.setAaguid.person);
        const key =
          (body.setAaguid.label
            ? p?.securityKeys.find((k) => k.label === body.setAaguid?.label)
            : undefined) ??
          p?.securityKeys.find((k) => k.credentialId && k.canApprove && !k.revoked) ??
          p?.securityKeys[0];
        if (key) key.aaguid = body.setAaguid.aaguid;
      }
      if (body.stripeWebhookReplay) {
        if (world.stripeProvisioningDone) {
          appendAudit("stripe", "checkout.completed", "Ignored replay — already provisioned");
        } else {
          world.stripeProvisioningDone = true;
          appendAudit("stripe", "checkout.completed", "Provisioned");
        }
      }
      if (body.stripeCheckoutForeignId) {
        appendAudit("stripe", "checkout.completed", "Provisioned for signed-in user", {
          ignoredForeignId: body.stripeCheckoutForeignId,
          signedInUserId: world.signedInUserId,
        });
      }
      if (body.stopEraseJob) {
        const job = world.eraseJobs.find((j) => j.id === body.stopEraseJob);
        if (job) {
          job.stopped = true;
          job.done = Math.min(job.done, 3);
          job.certificateReady = false;
        }
      }
      if (typeof body.setRequiredApprovals === "number") {
        world.requiredApprovalsDefault = body.setRequiredApprovals;
        for (const r of world.review) {
          if (r.status === "waiting") r.requiredApprovals = body.setRequiredApprovals;
        }
      }
      if (body.changeRequestArgs) {
        const item = world.review.find((r) => r.id === body.changeRequestArgs!.requestId);
        if (item) {
          item.args = body.changeRequestArgs.args;
          item.digest = createHash("sha256")
            .update(JSON.stringify(item.args))
            .digest("hex");
          item.status = "changed";
          // Re-queue as waiting with new digest
          item.status = "waiting";
          appendAudit("system", "review.changed", "Request changed while reviewing", {
            requestId: item.id,
            digest: item.digest,
          });
        }
      }
      if (body.endOtherSessions) {
        const p = personByName(body.endOtherSessions.person);
        if (p) {
          for (const s of p.sessions.slice(1)) s.ended = true;
          appendAudit(p.name, "session.end_others", "Signed out everywhere else");
        }
      }
      if (body.idleSignOut) {
        const p = personByName(body.idleSignOut.person);
        if (p?.sessions[0]) {
          p.sessions[0]!.ended = true;
          appendAudit(p.name, "session.idle", "Signed out — idle timeout");
        }
      }
      if (body.forceSessionExpiry) {
        const p = personByName(body.forceSessionExpiry.person);
        if (p?.sessions[0]) {
          p.sessions[0]!.ended = true;
          appendAudit(p.name, "session.max", "Signed out — max session length");
        }
      }
      if (body.teamBudgetExhaust) {
        const team = body.teamBudgetExhaust;
        if (world.teamBudgets[team]) {
          world.teamBudgets[team]!.spent = world.teamBudgets[team]!.cap;
          for (const k of world.keys.filter((x) => x.group === team)) {
            k.teamBudgetExhausted = true;
          }
        }
      }
      if (body.forecastSpend) {
        world.alerts.push({
          channel: "admin",
          kind: "budget-forecast",
          at: new Date().toISOString(),
        });
        appendAudit("system", "budget.forecast", "Warns — likely 2026-10-20");
      }
      if (body.budgetAlerts) {
        world.alerts.push(
          { channel: "email", kind: "budget-80", at: new Date().toISOString() },
          { channel: "slack", kind: "budget-80", at: new Date().toISOString() },
          { channel: "email", kind: "budget-100", at: new Date().toISOString() },
          { channel: "slack", kind: "budget-100", at: new Date().toISOString() },
        );
        appendAudit("system", "budget.alert", "Admins notified 80% and 100% by email and Slack");
      }
      if (typeof body.addCredits === "number") {
        world.creditsCents += body.addCredits;
        appendAudit("Dana Reyes", "billing.credits", "Added", { cents: body.addCredits });
      }
      if (body.changeCard) {
        world.invoiceCard = body.changeCard;
        appendAudit("Dana Reyes", "billing.card", "Changed", { lastFour: body.changeCard });
      }
      if (body.schemaAccept) {
        const field = world.schemaFields.find((f) => f.name === body.schemaAccept);
        if (field) {
          field.suggested = false;
          field.since = new Date().toISOString().slice(0, 10);
          appendAudit("Dana Reyes", "schema.accept", "Field added", { name: field.name });
        }
      }
      if (body.skillMutate?.id) {
        let skill = world.skills.find((s) => s.id === body.skillMutate!.id);
        if (!skill) {
          skill = {
            id: body.skillMutate.id,
            name: body.skillMutate.name ?? body.skillMutate.id,
            stage: "proposed",
          };
          world.skills.push(skill);
        }
        Object.assign(skill, body.skillMutate);
      }
      if (body.proposeSkill) {
        world.skills.push({
          id: newId("skl"),
          name: body.proposeSkill.name,
          stage: "proposed",
          sessionCount: body.proposeSkill.sessionCount,
        });
      }
      if (body.connectionMutate?.id) {
        const c = world.connections.find((x) => x.id === body.connectionMutate!.id);
        if (c) Object.assign(c, body.connectionMutate);
      }
      if (body.addConnection) {
        if (body.addConnection.injection) {
          appendAudit("system", "connection.scan", "Blocked — injection in tool description");
          return NextResponse.json({ ok: false, error: "pre-install scan blocked" }, { status: 400 });
        }
        world.connections.push({
          id: body.addConnection.name.toLowerCase().replace(/\s+/g, "-"),
          name: body.addConnection.name,
          groups: body.addConnection.groups ?? [],
          status: "connected",
          personal: body.addConnection.personal,
          kind: body.addConnection.kind,
        });
      }

      if (body.authAttempt) {
        const kind = body.authAttempt.kind;
        world.authAttempts[kind] += 1;
        if (world.authAttempts[kind] > 5) {
          appendAudit("system", `throttle.${kind}`, "Throttled");
          return NextResponse.json(
            { ok: false, error: "throttled", kind, attempts: world.authAttempts[kind] },
            { status: 429 },
          );
        }
        return NextResponse.json({
          ok: true,
          kind,
          attempts: world.authAttempts[kind],
        });
      }

      if (body.setMemoryEnrichment) {
        const key = world.keys.find(
          (k) => k.name === body.setMemoryEnrichment!.key || k.id === body.setMemoryEnrichment!.key,
        );
        if (key) {
          key.memoryEnrichment = body.setMemoryEnrichment.enabled;
          appendAudit("Dana Reyes", "key.memory_enrichment", body.setMemoryEnrichment.enabled ? "On" : "Off", {
            key: key.name,
          });
        }
      }

      if (body.skillAction) {
        let skill = world.skills.find((s) => s.id === body.skillAction!.id);
        if (!skill) {
          skill = {
            id: body.skillAction.id,
            name: body.skillAction.id,
            stage: "proposed",
          };
          world.skills.push(skill);
        }
        switch (body.skillAction.action) {
          case "prove":
            skill.stage = "proving";
            skill.evidence = ["unit", "integration", "adversarial", "trace", "review"];
            break;
          case "autoPromote":
            skill.stage = "active";
            skill.writing = false;
            appendAudit("system", "skill.auto_promote", "Automatic promotion", { skillId: skill.id });
            break;
          case "retire":
            skill.stage = "retired";
            skill.retireReason = body.skillAction.reason ?? "owner request";
            break;
          case "reprove":
            skill.stage = "proving";
            skill.evidence = [];
            break;
          case "flagInjection":
            skill.injectionFlagged = true;
            skill.stage = "proposed";
            break;
          default:
            break;
        }
      }

      if (body.secondBrowserSession) {
        const p = personByName(body.secondBrowserSession.person);
        if (p) {
          p.sessions.push({
            id: newId("sess"),
            device: "Firefox/Linux",
            signedInAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
            path: "/review",
            ended: false,
          });
        }
      }

      if (body.keySpentToday) {
        const key = world.keys.find((k) => k.name === body.keySpentToday!.name);
        if (key) key.spentTodayCents = body.keySpentToday.cents;
      }

      if (body.personMutate) {
        const p = personByName(body.personMutate.person);
        if (p) {
          if (typeof body.personMutate.canApproveContracts === "boolean") {
            p.canApproveContracts = body.personMutate.canApproveContracts;
          }
          if (body.personMutate.groups) p.groups = body.personMutate.groups;
          if (body.personMutate.notifications) {
            p.notifications = { ...p.notifications, ...body.personMutate.notifications };
          }
          if (body.personMutate.timeZone) {
            p.timeZone = body.personMutate.timeZone;
            appendAudit(p.name, "profile.timezone", "Changed", { timeZone: p.timeZone });
          }
          if (body.personMutate.appearance) {
            p.appearance = body.personMutate.appearance;
            appendAudit(p.name, "profile.appearance", "Changed", { appearance: p.appearance });
          }
          if (body.personMutate.endSessionDevice) {
            for (const s of p.sessions) {
              if (s.device.includes(body.personMutate.endSessionDevice)) s.ended = true;
            }
            appendAudit(p.name, "session.end_device", "Signed out device", {
              device: body.personMutate.endSessionDevice,
            });
          }
        }
      }

      recountReviewBadges();
      return NextResponse.json({
        ok: true,
        gateUnreachable: world.gateUnreachable,
        infoFlowUnreachable: world.infoFlowUnreachable,
        hardStop: world.hardStop,
        monthSpentCents: world.monthSpentCents,
        monthBudgetCents: world.monthBudgetCents,
        webhookSigningSecret: world.webhookSigningSecret,
        firstRunStep: world.firstRunStep,
        orgDeleted: world.orgDeleted,
        authAttempts: world.authAttempts,
      });
    }),
  );
}
