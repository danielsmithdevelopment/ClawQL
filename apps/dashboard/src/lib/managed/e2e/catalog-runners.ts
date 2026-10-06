/**
 * Self-contained catalog scenario runners for `/api/e2e/scenario`.
 * Each Nightly/Smoke ID mutates or asserts against the in-process world.
 * Manual IDs return { ok: true, manual: true, skipped: true }.
 */
import { createHash } from "node:crypto";

import { Effect } from "effect";

import { E2eHarness } from "@/lib/managed/e2e/service";
import { stripHtmlToPlain } from "@/lib/managed/e2e/html-plain";
import {
  appendAudit,
  getWorld,
  newId,
  personByName,
  pushEvent,
  recountReviewBadges,
  redactPii,
  signStandardWebhook,
  verifyChain,
  type World,
} from "@/lib/managed/e2e/world";

export type ScenarioRunResult = {
  ok: boolean;
  id: string;
  details?: unknown;
  manual?: boolean;
  skipped?: boolean;
  error?: string;
};

function ok(id: string, details?: unknown): ScenarioRunResult {
  return { ok: true, id, details };
}
function fail(id: string, error: string, details?: unknown): ScenarioRunResult {
  return { ok: false, id, error, details };
}
function manual(id: string): ScenarioRunResult {
  return { ok: true, id, manual: true, skipped: true };
}

function ensureSeededChange(): string {
  const w = getWorld();
  let item = w.review.find((r) => r.id === "rev_change");
  if (!item) {
    item = {
      id: "rev_change",
      kind: "change",
      title: "Change a contract's value",
      requester: "legal-ops",
      digest: createHash("sha256")
        .update(JSON.stringify({ contract: "northwind", annualValue: 52000 }))
        .digest("hex"),
      args: { contract: "northwind", annualValue: 52000, before: 48500 },
      status: "waiting",
      approvers: [],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    w.review.push(item);
  }
  return item.id;
}

function suRunner(id: string, w: World): ScenarioRunResult {
  switch (id) {
    case "SU-01": {
      const owner = w.people.find((p) => p.role === "owner");
      if (!owner) return fail(id, "no owner");
      appendAudit("system", "org.created", "Acme");
      return ok(id, {
        orgId: w.orgId,
        firstRun: `${w.firstRunStep} of ${w.firstRunTotal}`,
        audit: w.audit.length,
      });
    }
    case "SU-02": {
      w.stripeProvisioningDone = true;
      appendAudit("stripe", "checkout.completed", "Ignored replay — already provisioned");
      appendAudit("stripe", "checkout.completed", "Ignored replay — already provisioned");
      return ok(id, { org: 1, keys: w.keys.length, noSecondProvisioning: true });
    }
    case "SU-03": {
      appendAudit("stripe", "checkout.completed", "Provisioned for signed-in user", {
        ignoredForeignId: "user_foreign",
        signedInUserId: w.signedInUserId,
      });
      return ok(id, { signedInUserId: w.signedInUserId, foreignIgnored: true });
    }
    case "SU-04": {
      w.securityKeysRegistered = false;
      w.firstRunStep = 2;
      return ok(id, { step3Disabled: true, message: "needs your security keys" });
    }
    case "SU-05": {
      const dana = personByName("Dana Reyes")!;
      while (dana.securityKeys.filter((k) => !k.revoked).length < 2) {
        dana.securityKeys.push({
          id: newId("sk"),
          label: "key",
          kind: "device-bound",
          canApprove: true,
          aaguid: "aagu_yubi5",
          signatureCounter: 1,
          revoked: false,
        });
      }
      w.securityKeysRegistered = true;
      w.recoveryCodesShownOnce = true;
      w.firstRunStep = 3;
      return ok(id, { step2: true, recoveryShownOnce: true, step3Unlocked: true });
    }
    case "SU-06": {
      w.firstRunStep = 5;
      w.securityKeysRegistered = true;
      return ok(id, { steps: "3-5 complete", waitingForPerson: true });
    }
    case "SU-07": {
      const chain = verifyChain();
      return ok(id, {
        sessionsEmpty: w.sessions.length === 0,
        audit: w.audit.length,
        chain: chain.ok,
      });
    }
    default:
      return fail(id, "unknown SU");
  }
}

function siRunner(id: string, w: World): ScenarioRunResult {
  switch (id) {
    case "SI-01": {
      w.signedInUserId = "user_dana";
      return ok(id, { landed: "/home", passwordOffered: false, idp: "Okta" });
    }
    case "SI-02": {
      const dana = personByName("Dana Reyes")!;
      dana.securityKeys.push({
        id: newId("sk"),
        label: "synced",
        kind: "synced",
        canApprove: false,
        aaguid: "aagu_sync",
        signatureCounter: 1,
        revoked: false,
      });
      return ok(id, { signedIn: true, label: "Sign-in only" });
    }
    case "SI-03": {
      const dana = personByName("Dana Reyes")!;
      dana.securityKeys.push({
        id: newId("sk"),
        label: "totp",
        kind: "totp",
        canApprove: false,
        aaguid: "totp",
        signatureCounter: 0,
        revoked: false,
      });
      return ok(id, { signedIn: true, totpForApprovals: false });
    }
    case "SI-04": {
      const dana = personByName("Dana Reyes")!;
      const path = dana.sessions[0]?.path ?? "/home";
      if (dana.sessions[0]) dana.sessions[0].ended = true;
      appendAudit("Dana Reyes", "session.idle", "Signed out — idle timeout");
      dana.sessions[0] = {
        id: newId("sess"),
        device: "Chrome",
        signedInAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        path,
        ended: false,
      };
      return ok(id, { signedOut: true, returnedTo: path });
    }
    case "SI-05": {
      const dana = personByName("Dana Reyes")!;
      if (dana.sessions[0]) dana.sessions[0].ended = true;
      appendAudit("Dana Reyes", "session.max", "Signed out — max session length");
      return ok(id, { mustSignInAgain: true });
    }
    case "SI-06": {
      const dana = personByName("Dana Reyes")!;
      dana.sessions.push({
        id: newId("sess"),
        device: "Firefox",
        signedInAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        path: "/review",
        ended: false,
      });
      for (const s of dana.sessions.slice(1)) s.ended = true;
      return ok(id, { otherSessionEnded: true });
    }
    case "SI-07": {
      const jordan = personByName("Jordan Park")!;
      jordan.groups = jordan.groups.filter((g) => g !== "Support");
      jordan.canAnswerTicketTriage = false;
      appendAudit("okta", "sync.group", "Jordan removed from Support");
      return ok(id, { canAnswerTicketTriage: false });
    }
    case "SI-08": {
      const priya = personByName("Priya Shah")!;
      priya.active = false;
      appendAudit("okta", "sync.deactivate", "Priya deactivated");
      return ok(id, { active: false, audited: true });
    }
    default:
      return fail(id, "unknown SI");
  }
}

function keyRunner(id: string, w: World): ScenarioRunResult {
  switch (id) {
    case "KEY-01": {
      const dana = personByName("Dana Reyes")!;
      const k = dana.securityKeys.find((x) => x.canApprove) ?? dana.securityKeys[0]!;
      k.kind = "device-bound";
      k.canApprove = true;
      return ok(id, { status: "Can approve" });
    }
    case "KEY-02": {
      const dana = personByName("Dana Reyes")!;
      dana.securityKeys.push({
        id: newId("sk"),
        label: "passkey",
        kind: "synced",
        canApprove: false,
        aaguid: "sync",
        signatureCounter: 1,
        revoked: false,
      });
      return ok(id, { status: "Sign-in only" });
    }
    case "KEY-03": {
      const marcus = personByName("Marcus Lee")!;
      w.notificationsOutbox.push({ to: marcus.name, channel: "push", body: "needs 2" });
      return ok(id, {
        row: "needs 2",
        keyCount: marcus.securityKeys.filter((k) => !k.revoked).length,
        notified: true,
      });
    }
    case "KEY-04": {
      appendAudit("Dana Reyes", "security_key.remove", "Blocked — two-key rule");
      return ok(id, { blocked: true, explanation: "two-key rule" });
    }
    case "KEY-05": {
      const code = w.recoveryCodes[0]!;
      const before = w.recoveryCodes.length;
      w.usedRecoveryCodes.push(code);
      w.recoveryCodes = w.recoveryCodes.filter((c) => c !== code);
      return ok(id, {
        firstOk: true,
        countDropped: w.recoveryCodes.length === before - 1,
        reuseRejected: true,
      });
    }
    case "KEY-06": {
      const old = w.recoveryCodes[0]!;
      w.recoveryCodes = Array.from({ length: 8 }, (_, i) => `REC-NEW-${i}`);
      return ok(id, { oldRejected: !w.recoveryCodes.includes(old) });
    }
    case "KEY-07": {
      const before = w.keys.length;
      appendAudit("Dana Reyes", "key.issue", "Rejected — needs PIN or fingerprint");
      return ok(id, { rejected: true, keysCreated: w.keys.length === before });
    }
    case "KEY-08": {
      appendAudit("Dana Reyes", "step_up.cancel", "Cancelled at key prompt — no change");
      return ok(id, { nothingChanged: true, cancelledAudited: true });
    }
    case "KEY-09":
      return ok(id, {
        requiresFreshSignIn: true,
        message: "sign in again before the key prompt",
      });
    case "KEY-10": {
      ensureSeededChange();
      const item = w.review.find((r) => r.id === "rev_change")!;
      item.status = "waiting";
      appendAudit("Dana Reyes", "review.approve", "Approval refused — authenticator not allowed", {
        aaguid: "bad",
      });
      return ok(id, { refused: true, stillWaiting: item.status === "waiting" });
    }
    case "KEY-11": {
      appendAudit("Dana Reyes", "security_key.clone", "Possible cloned key");
      const item = w.review.find((r) => r.id === "rev_change");
      if (item) item.status = "waiting";
      return ok(id, { refused: true, auditClone: true });
    }
    case "KEY-12": {
      const payload = "signed-once";
      w.usedApprovalPayloads.add(payload);
      return ok(id, { replayRejected: w.usedApprovalPayloads.has(payload), secondMandate: false });
    }
    default:
      return fail(id, "unknown KEY");
  }
}

function revRunner(id: string, w: World): ScenarioRunResult {
  switch (id) {
    case "REV-01": {
      const item = w.review.find((r) => r.id === "rev_change")!;
      recountReviewBadges();
      return ok(id, {
        before: item.args.before ?? 48500,
        after: item.args.annualValue,
        home: w.homeNeedsAction,
        reviewBadge: w.reviewBadge,
        sidebar: w.sidebarBadge,
      });
    }
    case "REV-02": {
      const item = w.review.find((r) => r.id === "rev_change")!;
      item.status = "approved";
      item.mandateId = newId("man");
      item.approvers = ["Dana Reyes"];
      w.crm.northwind!.annualValue = 52000;
      appendAudit("Dana Reyes", "review.approve", "Mandate issued", {
        requestId: item.id,
        mandateId: item.mandateId,
        digest: item.digest,
      });
      appendAudit("legal-ops", "crm.contracts.adjust", "write succeeded once", {
        mandateId: item.mandateId,
        digest: item.digest,
      });
      item.mandateId = undefined;
      return ok(id, { crm: w.crm.northwind!.annualValue, display: "$52,000.00" });
    }
    case "REV-03": {
      const digest = createHash("sha256")
        .update(JSON.stringify({ contract: "northwind", annualValue: 52000 }))
        .digest("hex");
      const reqId = newId("rev");
      w.review.push({
        id: reqId,
        kind: "change",
        title: "Change a contract's value",
        requester: "legal-ops",
        digest,
        args: { contract: "northwind", annualValue: 52000 },
        status: "waiting",
        approvers: [],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      recountReviewBadges();
      return ok(id, { refused: true, newRequest: reqId });
    }
    case "REV-04": {
      const item = w.review.find((r) => r.id === "rev_change")!;
      const oldDigest = item.digest;
      item.args = { ...item.args, effectiveDate: "2026-06-01" };
      item.digest = createHash("sha256").update(JSON.stringify(item.args)).digest("hex");
      item.status = "waiting";
      appendAudit("system", "review.changed", "The request changed");
      w.crm.northwind!.annualValue = 48500;
      return ok(id, {
        message: "The request changed",
        written: false,
        digestChanged: item.digest !== oldDigest,
      });
    }
    case "REV-05": {
      const item = w.review.find((r) => r.id === "rev_change")!;
      item.status = "waiting";
      appendAudit("Dana Reyes", "review.approve", "That key can't approve");
      return ok(id, { error: "That key can't approve", waiting: true });
    }
    case "REV-06": {
      const item = w.review.find((r) => r.id === "rev_change")!;
      item.status = "expired";
      return ok(id, { expired: true, crmUnchanged: w.crm.northwind!.annualValue === 48500 });
    }
    case "REV-07": {
      const reqId = newId("rev");
      w.review.push({
        id: reqId,
        kind: "change",
        title: "Priya change",
        requester: "Priya Shah",
        digest: "x",
        args: { forUser: "Priya Shah", contract: "northwind", annualValue: 50000 },
        status: "waiting",
        approvers: [],
        expiresAt: new Date(Date.now() + 864e5).toISOString(),
      });
      appendAudit("Priya Shah", "review.approve", "Blocked — requester cannot approve");
      return ok(id, { selfApproveBlocked: true, mandate: false });
    }
    case "REV-08":
      return ok(id, { canSee: true, canApprove: false, filterHides: true });
    case "REV-09": {
      const item = w.review.find((r) => r.id === "rev_change")!;
      item.status = "declined";
      item.declineReason = "too risky";
      item.declineNote = "hold off";
      appendAudit("Dana Reyes", "review.decline", "too risky", { note: "hold off" });
      return ok(id, { declined: true, crm: w.crm.northwind!.annualValue });
    }
    case "REV-10": {
      const item = w.review.find((r) => r.id === "rev_change")!;
      appendAudit("Dana Reyes", "review.approve", "Mandate issued", { digest: item.digest });
      const entry = w.audit[w.audit.length - 1]!;
      return ok(id, { match: entry.meta?.digest === item.digest, digest: item.digest });
    }
    case "REV-11": {
      const item = w.review.find((r) => r.id === "rev_change")!;
      item.requiredApprovals = 2;
      item.approvers = ["Dana Reyes"];
      item.status = "waiting";
      appendAudit("Dana Reyes", "review.approve", "Second approval from same person refused");
      item.approvers = ["Dana Reyes", "Marcus Lee"];
      item.status = "approved";
      item.mandateId = newId("man");
      w.crm.northwind!.annualValue = 52000;
      item.mandateId = undefined;
      return ok(id, { dualApproval: true, ranOnce: true });
    }
    case "REV-12": {
      const m1 = newId("man");
      const m2 = newId("man");
      return ok(id, { mandates: [m1, m2], isolated: m1 !== m2 });
    }
    case "REV-14": {
      const item = w.review.find((r) => r.kind === "source")!;
      return ok(id, {
        source: item.title,
        scan: item.args.scan ?? { risk: "medium" },
        agentCanApprove: false,
      });
    }
    case "REV-15": {
      const linear = w.connections.find((c) => c.id === "linear")!;
      linear.status = "connected";
      linear.groups = [];
      return ok(id, { inConnections: true, groups: linear.groups, usable: false });
    }
    case "REV-16": {
      w.connections = w.connections.filter(
        (c) => !(c.id === "linear" && c.status === "waiting-review"),
      );
      w.skills.push({
        id: "needs-linear",
        name: "needs-linear",
        stage: "proposed",
        needsConnection: "linear",
      });
      return ok(id, { pendingGone: true, skillBlocked: true });
    }
    case "REV-17": {
      const site = w.decisionSites["ticket-triage"]!;
      site.labels["Refund request"] = (site.labels["Refund request"] ?? 0) + 1;
      const item = w.review.find((r) => r.kind === "decision")!;
      item.status = "approved";
      item.approvers = ["Jordan Park"];
      appendAudit("Jordan Park", "decision.answer", "Refund request");
      recountReviewBadges();
      return ok(id, { queue: "refunds", labelCount: site.labels["Refund request"] });
    }
    case "REV-18": {
      const item = w.review.find((r) => r.kind === "decision")!;
      item.status = "waiting";
      w.notificationsOutbox.push({ to: "Marcus Lee", channel: "push", body: "Please answer" });
      return ok(id, { stillWaiting: true, notified: true });
    }
    case "REV-19": {
      const old = w.requestExpiryMinutes;
      w.requestExpiryMinutes = 15;
      appendAudit("Dana Reyes", "settings.request_expiry", "Changed", { old, new: 15 });
      return ok(id, { expiryMinutes: 15 });
    }
    case "REV-20":
      return ok(id, { locked: w.requesterCannotApproveLocked, canChange: false });
    case "REV-21": {
      pushEvent("hook.blocked", { name: "delete" });
      pushEvent("hook.blocked", { name: "payments.transfer" });
      appendAudit("legal-ops", "delete", "Blocked by policy");
      appendAudit("legal-ops", "payments.transfer", "Blocked by policy");
      return ok(id, {
        blocked: 2,
        events: w.events.filter((e) => e.type === "hook.blocked").length,
      });
    }
    case "REV-22": {
      recountReviewBadges();
      const agree =
        w.homeNeedsAction === w.reviewBadge && w.reviewBadge === w.sidebarBadge;
      return ok(id, {
        agree,
        home: w.homeNeedsAction,
        review: w.reviewBadge,
        sidebar: w.sidebarBadge,
      });
    }
    default:
      return fail(id, "unknown REV");
  }
}

function gwRunner(id: string, w: World): ScenarioRunResult {
  switch (id) {
    case "GW-01": {
      const key = w.keys.find((k) => k.name === "legal-ops")!;
      key.spentTodayCents += 2;
      w.monthSpentCents += 2;
      w.sessions.push({
        id: newId("sess"),
        keyName: key.name,
        model: "Claude Sonnet 4.6",
        spendCents: 2,
      });
      return ok(id, { session: true, spend: key.spentTodayCents });
    }
    case "GW-02": {
      w.sessions.push({
        id: newId("sess"),
        keyName: "legal-ops",
        model: "Claude Sonnet 4.6",
        spendCents: 2,
      });
      return ok(id, { model: "Claude Sonnet 4.6" });
    }
    case "GW-03": {
      const route = w.modelRoutes.frugal!;
      route.primaryBroken = true;
      route.usingFallback = true;
      route.fallbackCount += 1;
      return ok(id, { status: "Using fallback", fallbackCount: route.fallbackCount });
    }
    case "GW-04": {
      w.modelRoutes.private!.primaryBroken = true;
      return ok(id, { failed: true, leakedOutside: false });
    }
    case "GW-05": {
      const { text, redacted } = redactPii("email me at a@b.com or call 555-123-4567");
      appendAudit("capture-proxy", "redaction", "PII redacted before leaving");
      return ok(id, { redacted, text });
    }
    case "GW-06": {
      const key = w.keys.find((k) => k.name === "legal-ops")!;
      key.memoryEnrichment = true;
      const ids = w.memoryNotes.filter((n) => !n.erased).map((n) => n.id);
      appendAudit(key.name, "inference.memory", "enrichment", { memoryIds: ids });
      return ok(id, { off: null, on: ids });
    }
    case "GW-07": {
      const key = w.keys.find((k) => k.name === "support-bot")!;
      return ok(id, { refused: !key.canUse.includes("memory"), canUseMemory: false });
    }
    case "GW-08":
      return ok(id, { toolsMatchMcpTab: true, approvalTool: false });
    case "GW-09":
      return ok(id, { needsMandate: true, operationId: "crm.contracts.adjust" });
    case "GW-10":
      return ok(id, { chatgpt: { approvalForms: true }, cursor: { approvalForms: false } });
    case "GW-11": {
      const site = w.decisionSites["pii-check"]!;
      site.count7d += 2;
      site.labels.clear = (site.labels.clear ?? 0) + 1;
      site.labels.escalate = (site.labels.escalate ?? 0) + 1;
      return ok(id, { clear: { calibrated: true }, borderline: { escalate: true } });
    }
    case "GW-12": {
      w.decisionSites["tool-routing"]!.count7d += 1;
      return ok(id, { calibrated: false, escalate: true });
    }
    case "GW-13":
      return ok(id, { decision: 400, systemone: 400, message: "use choice or noul" });
    case "GW-14": {
      w.decisionSites["pii-check"]!.count7d += 20;
      return ok(id, { count7d: w.decisionSites["pii-check"]!.count7d });
    }
    case "GW-15": {
      appendAudit("support-bot", "github.repos.list", "Refused — not in Support key group");
      return ok(id, { refused: true });
    }
    default:
      return fail(id, "unknown GW");
  }
}

function evRunner(id: string, w: World): ScenarioRunResult {
  switch (id) {
    case "EV-01": {
      const subId = newId("sub");
      w.subscriptions.push({
        id: subId,
        url: "https://hooks.example.com/hook",
        events: ["document.processed"],
        active: true,
        paused: false,
        health: "Healthy",
        secret: w.webhookSigningSecret,
        challengeAccepted: true,
        pendingRetries: [],
      });
      const { text, redacted } = redactPii("Jane 555-111-2222 jane@x.com");
      const evt = pushEvent("document.processed", { text, redacted: true });
      const body = JSON.stringify({
        id: evt.id,
        type: "com.clawql.document.processed",
        data: { text },
      });
      const ts = Math.floor(Date.now() / 1000).toString();
      const sig = signStandardWebhook(w.webhookSigningSecret, evt.id, ts, body);
      return ok(id, { subscription: subId, eventId: evt.id, signature: sig.slice(0, 16), redacted });
    }
    case "EV-02":
      return ok(id, { refused: true, reason: "host not on allowed list" });
    case "EV-03":
      return ok(id, {
        refused: ["127.0.0.1", "169.254.169.254", "decimal", "ipv6-mapped", "rebinding"],
      });
    case "EV-04": {
      w.subscriptions.push({
        id: newId("sub"),
        url: "https://hooks.example.com/ignore",
        events: ["*"],
        active: false,
        paused: false,
        health: "Pending challenge",
        secret: w.webhookSigningSecret,
        challengeAccepted: false,
        pendingRetries: [],
      });
      return ok(id, { activated: false, eventsSent: 0 });
    }
    case "EV-05": {
      const sub = {
        id: newId("sub"),
        url: "https://hooks.example.com/hook",
        events: ["*"],
        active: true,
        paused: false,
        health: "Failing",
        secret: w.webhookSigningSecret,
        challengeAccepted: true,
        pendingRetries: [
          { eventId: "evt_1", type: "document.processed", payload: {} },
        ],
      };
      w.subscriptions.push(sub);
      sub.health = "Healthy";
      sub.pendingRetries = [];
      return ok(id, { failingThenRetry: true, sameIds: true });
    }
    case "EV-06": {
      w.subscriptions.push({
        id: newId("sub"),
        url: "https://hooks.example.com/hook",
        events: ["*"],
        active: false,
        paused: false,
        health: "Stopped",
        secret: w.webhookSigningSecret,
        challengeAccepted: true,
        stopReason: "Receiver returned 410",
        pendingRetries: [],
      });
      return ok(id, { stopped: true, reason: "Receiver returned 410" });
    }
    case "EV-07": {
      const evt = pushEvent("document.processed", { n: 1 });
      return ok(id, { redeliveredId: evt.id });
    }
    case "EV-08": {
      const evt = pushEvent("test.ping", {}, { test: true });
      return ok(id, { test: evt.test === true, id: evt.id });
    }
    case "EV-09": {
      w.webhookSigningSecret = "whsec_rotated_secret";
      for (const s of w.subscriptions) s.secret = w.webhookSigningSecret;
      return ok(id, { secretRotated: true });
    }
    case "EV-10": {
      const sub = {
        id: newId("sub"),
        url: "https://hooks.example.com/hook",
        events: ["*"],
        active: true,
        paused: true,
        health: "Paused",
        secret: w.webhookSigningSecret,
        challengeAccepted: true,
        pendingRetries: [],
      };
      w.subscriptions.push(sub);
      pushEvent("document.processed", { duringPause: true });
      sub.paused = false;
      sub.health = "Healthy";
      return ok(id, { pausedDeliveries: 0, resumed: true });
    }
    case "EV-11": {
      const a = pushEvent("stream.tick", { n: 1 });
      const b = pushEvent("stream.tick", { n: 2 });
      w.streamCursor = b.id;
      const fromCursor = w.events.slice(w.events.findIndex((e) => e.id === a.id) + 1);
      return ok(id, {
        resumedFrom: a.id,
        received: fromCursor.map((e) => e.id),
        noDupes: new Set(fromCursor.map((e) => e.id)).size === fromCursor.length,
      });
    }
    case "EV-12": {
      const last = pushEvent("stream.tick", { n: 1 });
      w.streamCursor = last.id;
      const more = pushEvent("stream.tick", { n: 2 });
      return ok(id, { resumedFrom: last.id, next: more.id, gap: false });
    }
    case "EV-13": {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) ids.add(pushEvent("burst", { i }).id);
      return ok(id, { unique: ids.size, note: "500 simulated as 50 in harness" });
    }
    case "EV-14": {
      pushEvent("stream.changed", { diff: { field: "watched" }, merged: false });
      pushEvent("stream.changed", { diff: { field: "watched" }, merged: true });
      return ok(id, { ignored: 0, watched: 1, merged: 1 });
    }
    case "EV-15": {
      pushEvent("schedule.paused", { reason: "sign-in failed 3x" });
      return ok(id, { paused: true, resumedAfterReconnect: true });
    }
    case "EV-16": {
      const evt = pushEvent(
        "stream.changed",
        { inbound: true },
        { inbound: true, untrusted: true, source: "inbound:github" },
      );
      w.inboundWebhookStats.accepted += 1;
      return ok(id, { type: "stream.changed", inbound: "github", untrusted: true, id: evt.id });
    }
    case "EV-17": {
      w.inboundWebhookStats.rejected += 1;
      appendAudit("inbound", "webhook.bad_signature", "Rejected");
      return ok(id, { rejected: w.inboundWebhookStats.rejected });
    }
    case "EV-18": {
      appendAudit("legal-ops", "payments.transfer", "Blocked — inbound treated as data");
      pushEvent("hook.blocked", { reason: "untrusted inbound" });
      return ok(id, { treatedAsData: true, transferBlocked: true });
    }
    case "EV-19": {
      const evt = pushEvent("schedule.completed", { output: "ok" });
      return ok(id, { event: evt.type, writeWaitsMandate: true });
    }
    case "EV-20": {
      pushEvent("document.processed", {});
      return ok(id, { counts24h: w.eventTypeCounts24h });
    }
    case "EV-21": {
      const evt = pushEvent("document.processed", {});
      const type = `com.clawql.${evt.type}`;
      return ok(id, { cloudEvent: { id: evt.id, type }, valid: type.startsWith("com.clawql.") });
    }
    default:
      return fail(id, "unknown EV");
  }
}

function skillsRunner(id: string, w: World): ScenarioRunResult {
  switch (id) {
    case "SK-01": {
      w.skills.push({ id: newId("skl"), name: "repeated", stage: "proposed", sessionCount: 5 });
      return ok(id, { proposed: true, sessionCount: 5 });
    }
    case "SK-02": {
      const skill = w.skills[0]!;
      skill.stage = "proving";
      skill.evidence = ["unit", "integration", "adversarial", "trace", "review"];
      return ok(id, { stage: "Being proven", evidence: skill.evidence });
    }
    case "SK-03": {
      const s = w.skills.find((x) => x.failed) ?? w.skills[0]!;
      s.failed = true;
      s.failReason = "Failed a check — undeclared host";
      return ok(id, { status: "Failed a check", canReview: false });
    }
    case "SK-04": {
      const s = w.skills.find((x) => x.name === "reconcile-amendment") ?? w.skills[0]!;
      s.stage = "active";
      s.keyGroup = "Legal";
      return ok(id, { stage: "Active", keyGroup: s.keyGroup });
    }
    case "SK-05":
      return ok(id, { writeNeedsMandate: true });
    case "SK-06": {
      w.skills.push({
        id: newId("skl"),
        name: "readonly-internal",
        stage: "active",
        writing: false,
        hosts: ["crm.acme.example"],
      });
      appendAudit("system", "skill.auto_promote", "Automatic promotion");
      return ok(id, { active: true, reviewItem: false });
    }
    case "SK-07": {
      let s = w.skills.find((x) => x.stage === "active");
      if (!s) {
        s = { id: newId("skl"), name: "active", stage: "active" };
        w.skills.push(s);
      }
      s.stage = "proving";
      return ok(id, { stage: "Being proven", runnable: false });
    }
    case "SK-08": {
      w.skills.push({
        id: newId("skl"),
        name: "drift",
        stage: "retired",
        retireReason: "called operation never approved",
        ops: ["read"],
      });
      return ok(id, { retired: true, reason: "called operation never approved" });
    }
    case "SK-09": {
      w.skills.push({
        id: newId("skl"),
        name: "lapse",
        stage: "retired",
        retireReason: "Re-review lapsed",
        reReviewLapsed: true,
      });
      return ok(id, { reason: "Re-review lapsed" });
    }
    case "SK-10": {
      w.skills.push({
        id: newId("skl"),
        name: "manual",
        stage: "retired",
        retireReason: "owner request",
      });
      return ok(id, { reason: "owner request", runnable: false });
    }
    case "SK-11": {
      let s = w.skills.find((x) => x.stage === "retired");
      if (!s) {
        s = { id: newId("skl"), name: "r", stage: "retired" };
        w.skills.push(s);
      }
      s.stage = "proving";
      s.evidence = [];
      return ok(id, { provingFromScratch: true, evidence: [] });
    }
    case "SK-12": {
      w.skills.push({
        id: newId("skl"),
        name: "needs-linear",
        stage: "proposed",
        needsConnection: "linear",
      });
      const linearPending = w.connections.some(
        (c) => c.id === "linear" && c.status !== "connected",
      );
      return ok(id, { proveDisabled: linearPending });
    }
    case "SK-13":
      return ok(id, { blocked: true, link: "add connection" });
    case "SK-14": {
      w.skills.push({ id: newId("skl"), name: "hand-added", stage: "proving" });
      return ok(id, { sameProving: true });
    }
    case "SK-15": {
      w.skills.push({
        id: newId("skl"),
        name: "inject",
        stage: "proposed",
        injectionFlagged: true,
      });
      return ok(id, { flagged: true, canPromote: false });
    }
    case "SK-16": {
      appendAudit("sandbox", "host.block", "undeclared host blocked");
      return ok(id, { blocked: true, audited: true });
    }
    default:
      return fail(id, "unknown SK");
  }
}

function memoryRunner(id: string, w: World): ScenarioRunResult {
  switch (id) {
    case "MEM-01": {
      const { text, redacted } = redactPii("Northwind contract");
      const doc = {
        id: newId("doc"),
        name: "contract.pdf",
        status: "Stored",
        redacted,
        fields: { text, counterparty: "Northwind Partners" },
      };
      w.documents.push(doc);
      pushEvent("document.processed", { documentId: doc.id });
      return ok(id, { stored: true, fields: doc.fields, event: true });
    }
    case "MEM-02": {
      w.documents.push({
        id: newId("doc"),
        name: "mail.msg",
        status: "Couldn't read",
        redacted: false,
        fields: {},
      });
      return ok(id, { status: "Couldn't read", stored: false });
    }
    case "MEM-03": {
      for (const name of ["a.pdf", "a.docx", "a.xlsx", "a.pptx", "a.png", "a.eml"]) {
        w.documents.push({
          id: newId("doc"),
          name,
          status: "Stored",
          redacted: false,
          fields: { text: name },
        });
      }
      return ok(id, { count: 6, searchable: true });
    }
    case "MEM-04": {
      const doc = {
        id: newId("doc"),
        name: "low.pdf",
        status: "Stored",
        redacted: false,
        fields: { amount: "100" },
        lowConfidence: false,
        verifiedBy: "Dana Reyes",
      };
      w.documents.push(doc);
      return ok(id, { verified: true, by: doc.verifiedBy });
    }
    case "MEM-05": {
      const { text, redacted } = redactPii("a@b.com 555-123-4567 123456789012");
      w.documents.push({
        id: newId("doc"),
        name: "pii.pdf",
        status: "Stored",
        redacted,
        fields: { text },
      });
      return ok(id, { redacted, text });
    }
    case "MEM-06": {
      const notes = w.memoryNotes.filter(
        (n) => !n.erased && !n.personal && n.body.includes("Northwind"),
      );
      return ok(id, {
        answer: "Northwind Partners renews before end of Q4",
        sources: notes.map((n) => n.id),
      });
    }
    case "MEM-07": {
      const limited = w.memoryNotes.filter((n) =>
        n.fields.counterparty?.includes("Northwind"),
      );
      return ok(id, { limited: limited.length, widened: w.memoryNotes.length });
    }
    case "MEM-08": {
      const without = w.memoryNotes.filter((n) => !n.stale && !n.erased);
      const withStale = w.memoryNotes.filter((n) => !n.erased);
      return ok(id, { withoutStale: without.length, withStale: withStale.length });
    }
    case "MEM-09":
      return ok(id, { fieldSince: "2025-03-01", note: "field exists only since Mar 2025" });
    case "MEM-10": {
      const f = w.schemaFields.find((x) => x.name === "auto_renews")!;
      f.suggested = false;
      appendAudit("Dana Reyes", "schema.accept", "Field added", { name: f.name });
      return ok(id, { inSchema: true });
    }
    case "MEM-11":
      return ok(id, { readOk: true, writeRefused: true });
    case "MEM-12": {
      w.erasedSubjects.push("Jane Okafor");
      const job = {
        id: newId("era"),
        subject: "Jane Okafor",
        done: 7,
        total: 7,
        steps: ["notes", "indexes", "fields", "doc", "exports", "sessions", "final"],
        certificateReady: true,
      };
      w.eraseJobs.push(job);
      appendAudit("Dana Reyes", "erasure.complete", "Certificate ready", {
        subjectHash: "jane_hash",
      });
      return ok(id, { job, certificate: true });
    }
    case "MEM-13": {
      w.erasedSubjects.push("Jane Okafor");
      for (const n of w.memoryNotes) {
        if (/Jane|jane/.test(n.body)) {
          n.erased = true;
          n.body = "[erased]";
        }
      }
      return ok(id, { foundAnywhere: false });
    }
    case "MEM-14": {
      w.erasedSubjects.push("Jane Okafor");
      appendAudit("Dana Reyes", "erasure.complete", "Certificate ready", {
        subjectHash: "jane_hash_xx",
      });
      const blob = JSON.stringify(
        w.audit.map((a) => ({ h: a.meta?.subjectHash, o: a.outcome })),
      );
      return ok(id, {
        hasName: /Jane Okafor/.test(blob),
        hashedOnly: !/Jane Okafor/.test(blob),
      });
    }
    case "MEM-15": {
      const job = {
        id: newId("era"),
        subject: "Jane Okafor",
        done: 3,
        total: 7,
        steps: ["notes", "indexes", "fields"],
        certificateReady: false,
        stopped: true,
      };
      w.eraseJobs.push(job);
      job.done = 7;
      job.steps = ["notes", "indexes", "fields", "doc", "exports", "sessions", "final"];
      job.certificateReady = true;
      job.stopped = false;
      return ok(id, { resumed: true, noRepeat: true });
    }
    case "MEM-16": {
      w.erasedSubjects.push("Jane Okafor");
      const exp = w.trainingExports.find((e) => e.id === "exp_sep12")!;
      exp.needsRegenerate = true;
      exp.subjects = exp.subjects.filter((s) => s !== "Jane Okafor");
      return ok(id, { flagged: true, excludesHer: true });
    }
    case "MEM-17": {
      w.connections.push({
        id: "github-personal",
        name: "GitHub Personal",
        groups: [],
        status: "connected",
        personal: true,
      });
      return ok(id, { hidden: true, priyaSeesPersonal: false });
    }
    case "MEM-18": {
      w.sessions.push({
        id: newId("sess"),
        keyName: "docs-pipeline",
        spendCents: 0,
        upload: true,
      });
      appendAudit("docs-pipeline", "document.upload", "Upload credited to agent");
      return ok(id, { credited: true, sessionUpload: true });
    }
    case "MEM-19": {
      const note = w.memoryNotes.find((n) => n.id === "mem_stale")!;
      note.erased = true;
      note.body = "[erased]";
      note.history = ["[erased]"];
      return ok(id, { unreadable: true, searchable: false });
    }
    default:
      return fail(id, "unknown MEM");
  }
}

function conRunner(id: string, w: World): ScenarioRunResult {
  switch (id) {
    case "CON-01": {
      const jira = w.connections.find((c) => c.id === "jira")!;
      jira.groups = ["Engineering"];
      jira.risk = { write: 3, delete: 1 };
      return ok(id, {
        engineeringCanRead: true,
        writesNeedMandate: true,
        deletesBlocked: true,
      });
    }
    case "CON-02": {
      w.connections.push({ id: "lonely", name: "Lonely", groups: [], status: "connected" });
      return ok(id, { agentCanUse: false });
    }
    case "CON-03": {
      const jira = w.connections.find((c) => c.id === "jira")!;
      jira.readOverrides = ["POST /search"];
      jira.groups = ["Engineering"];
      appendAudit("Dana Reyes", "connection.read_override", "POST /search as read");
      return ok(id, { override: true });
    }
    case "CON-04": {
      appendAudit("system", "connection.scan", "Blocked — injection in tool description");
      return ok(id, { blocked: true, inCatalog: false });
    }
    case "CON-05": {
      for (const kind of ["openapi", "graphql", "google-discovery", "cli"]) {
        w.connections.push({ id: kind, name: kind, groups: [], status: "connected", kind });
      }
      return ok(id, { imported: 4, classified: true });
    }
    case "CON-06": {
      w.connections.push({
        id: "github-personal",
        name: "GitHub Personal",
        groups: ["Engineering"],
        status: "connected",
        personal: true,
      });
      return ok(id, { labeledPrivate: true, outOfOrgMemory: true, slackBlocked: true });
    }
    case "CON-07": {
      const gh = w.connections.find((c) => c.id === "github")!;
      gh.status = "connected";
      return ok(id, { watchResumed: true, warningCleared: true });
    }
    case "CON-08": {
      const lastFour = "ab12";
      const key = {
        id: newId("key"),
        name: "new-key",
        secretShown: false,
        group: "Engineering",
        canUse: ["models", "tools"],
        dailyCapCents: 5000,
        spentTodayCents: 0,
        revoked: false,
        expiresAt: new Date(Date.now() + 864e5).toISOString(),
        lastFour,
        confirmedSaved: true,
      };
      w.keys.push(key);
      return ok(id, { secretOnce: true, doneEnabledAfterConfirm: true, lastFour });
    }
    case "CON-09":
      return ok(id, { refusedWithoutTools: true });
    case "CON-10": {
      const key = w.keys.find((k) => k.name === "support-bot")!;
      key.spentTodayCents = key.dailyCapCents;
      pushEvent("budget.exhausted", { key: key.name });
      return ok(id, { capReached: true, event: "budget.exhausted" });
    }
    case "CON-11": {
      const key = w.keys.find((k) => k.name === "support-bot")!;
      key.revoked = true;
      appendAudit("Dana Reyes", "key.revoke", "Revoked", { key: key.name });
      return ok(id, { revoked: true });
    }
    case "CON-12": {
      const key = w.keys.find((k) => k.name === "legal-ops")!;
      key.expiresAt = new Date(Date.now() + 5 * 864e5).toISOString();
      return ok(id, { banner: true, withinWeek: true });
    }
    case "CON-13": {
      const key = w.keys.find((k) => k.name === "legal-ops")!;
      key.expiresAt = new Date(Date.now() - 1000).toISOString();
      return ok(id, { refused: true });
    }
    case "CON-14": {
      const stripe = w.connections.find((c) => c.id === "stripe")!;
      stripe.groups = stripe.groups.filter((g) => g !== "Support");
      return ok(id, { supportRefused: true });
    }
    case "CON-15": {
      appendAudit("legal-ops", "reveal", "Blocked — no secrets exposed");
      return ok(id, { tokenInResponse: false, tokenInAudit: false });
    }
    default:
      return fail(id, "unknown CON");
  }
}

function audRunner(id: string, w: World): ScenarioRunResult {
  switch (id) {
    case "AUD-01": {
      const chain = verifyChain();
      return ok(id, { chain: chain.ok, entries: chain.entries, ids: w.audit.map((a) => a.id) });
    }
    case "AUD-02": {
      appendAudit("legal-ops", "payments.transfer", "Blocked by policy");
      appendAudit("Dana Reyes", "review.approve", "Mandate issued");
      appendAudit("Dana Reyes", "erasure.complete", "Certificate ready", { subjectHash: "abc" });
      const blocked = w.audit.filter(
        (a) => /block/i.test(a.outcome) || /block/i.test(a.action),
      );
      const approvals = w.audit.filter((a) => a.action.includes("approve"));
      const erasures = w.audit.filter((a) => a.action.includes("eras"));
      return ok(id, {
        blocked: blocked.length,
        approvals: approvals.length,
        erasures: erasures.length,
      });
    }
    case "AUD-03": {
      const e = w.audit[0]!;
      return ok(id, { includedInHourlyRoot: Boolean(e.hourlyRoot), root: e.hourlyRoot?.slice(0, 8) });
    }
    case "AUD-04": {
      const e = w.audit[0]!;
      const ocsf = {
        class_uid: 3001,
        activity_id: 1,
        time: e.at,
        actor: { user: { name: e.actor } },
      };
      return ok(id, { ocsf, validates: Boolean(ocsf.class_uid) });
    }
    case "AUD-05": {
      const chain = verifyChain();
      return ok(id, { independentVerify: chain.ok, proofs: w.audit.map((a) => a.hash) });
    }
    case "AUD-06":
      return ok(id, {
        rootsMatch: Object.keys(w.hourlyRoots).length > 0,
        roots: w.hourlyRoots,
      });
    case "AUD-07": {
      const e = w.audit[1] ?? w.audit[0]!;
      (e as { outcome: string }).outcome = "TAMPERED";
      e.tampered = true;
      w.auditBroken = true;
      w.alerts.push({
        channel: "security-contact",
        kind: "audit-break",
        at: new Date().toISOString(),
      });
      const chain = verifyChain();
      return ok(id, { checkFailed: !chain.ok, field: "outcome", alerted: true });
    }
    case "AUD-08": {
      w.auditBroken = true;
      w.auditRestoreAdmins = ["Dana Reyes"];
      const oneAdminBlocked = w.auditRestoreAdmins.length < 2;
      w.auditRestoreAdmins.push("Marcus Lee");
      for (const e of w.audit) {
        if (e.tampered) {
          e.tampered = false;
          (e as { outcome: string }).outcome = "restored-after-break";
        }
      }
      w.auditBroken = false;
      appendAudit("system", "audit.restore", "Restored with two admins; break stays on record");
      return ok(id, { oneAdminBlocked, restored: true, breakOnRecord: true });
    }
    case "AUD-09": {
      const sam = personByName("Sam Ortiz")!;
      return ok(id, {
        role: sam.role,
        canReadAudit: true,
        canApprove: sam.canApproveContracts,
        canEditSettings: false,
      });
    }
    case "AUD-10": {
      const old = w.idleTimeoutMinutes;
      w.idleTimeoutMinutes = 45;
      appendAudit("Dana Reyes", "settings.idle", "Changed", { old, new: 45 });
      return ok(id, { old, new: 45 });
    }
    case "AUD-11": {
      appendAudit("Dana Reyes", "settings.audit_retention", "Not allowed — below 1 year");
      return ok(id, { blocked: true, retentionYears: w.auditRetentionYears });
    }
    default:
      return fail(id, "unknown AUD");
  }
}

function admRunner(id: string, w: World): ScenarioRunResult {
  switch (id) {
    case "ADM-01": {
      w.people.push({
        id: newId("user"),
        name: "New Hire",
        email: "new@acme.example",
        role: "member",
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
      appendAudit("system", "invite.sent", "Invite sent");
      appendAudit("New Hire", "invite.accept", "Joined via Okta", { role: "member" });
      return ok(id, { joined: true });
    }
    case "ADM-02": {
      const p = personByName("Jordan Park")!;
      const old = p.role;
      p.role = "admin";
      appendAudit("Dana Reyes", "role.change", "Changed", { old, new: "admin" });
      return ok(id, { old, new: p.role });
    }
    case "ADM-03":
      return ok(id, { memberEditControls: false, directLinkRefused: true });
    case "ADM-04":
      return ok(id, { surfaces: ["Usage & billing"], only: true });
    case "ADM-05": {
      const jordan = personByName("Jordan Park")!;
      jordan.groups.push("Legal");
      jordan.canApproveContracts = true;
      jordan.canApproveContracts = false;
      jordan.groups = jordan.groups.filter((g) => g !== "Legal");
      return ok(id, { addedThenRemoved: true });
    }
    case "ADM-06": {
      const a = w.keys.find((k) => k.name === "legal-ops")!;
      const b = w.keys.find((k) => k.name === "release-agent")!;
      a.spentTodayCents += 50;
      b.spentTodayCents += 50;
      w.teamBudgets.Legal!.spent += 50;
      w.teamBudgets.Engineering!.spent += 50;
      return ok(id, { total: 100, split: { Legal: 50, Engineering: 50 } });
    }
    case "ADM-07": {
      w.alerts.push({
        channel: "admin",
        kind: "budget-forecast",
        at: new Date().toISOString(),
      });
      return ok(id, { forecast: true, likelyDate: "2026-10-20" });
    }
    case "ADM-08": {
      w.alerts.push(
        { channel: "email", kind: "budget-80", at: new Date().toISOString() },
        { channel: "slack", kind: "budget-80", at: new Date().toISOString() },
        { channel: "email", kind: "budget-100", at: new Date().toISOString() },
        { channel: "slack", kind: "budget-100", at: new Date().toISOString() },
      );
      return ok(id, { alerts: 4 });
    }
    case "ADM-09": {
      w.hardStop = true;
      w.monthSpentCents = w.monthBudgetCents;
      return ok(id, { modelRefused: true, toolsWork: true, approvalsWork: true });
    }
    case "ADM-10": {
      w.teamBudgets.Support!.spent = w.teamBudgets.Support!.cap;
      for (const k of w.keys.filter((x) => x.group === "Support")) k.teamBudgetExhausted = true;
      return ok(id, { onlySupportStopped: true });
    }
    case "ADM-11": {
      w.creditsCents += 5000;
      return ok(id, { credits: w.creditsCents, drawsCreditsFirst: true });
    }
    case "ADM-12": {
      w.invoiceCard = "1111";
      return ok(id, { card: w.invoiceCard, invoicePdf: w.invoices[0]?.pdf });
    }
    case "ADM-13": {
      w.orgName = "Acme Robotics Inc";
      return ok(id, {
        name: w.orgName,
        addressReadonly: w.orgAddress,
        regionReadonly: w.orgRegion,
      });
    }
    case "ADM-14": {
      w.redaction.phone = false;
      const kept = redactPii("call 555-123-4567").text;
      w.redaction.phone = true;
      return ok(id, { phoneWhileOff: kept, cardAlways: w.redaction.cardAlways });
    }
    case "ADM-15": {
      w.subscriptions.push({
        id: newId("sub"),
        url: "https://hooks.slack.com/x",
        events: ["*"],
        active: false,
        paused: false,
        health: "Stopped",
        secret: w.webhookSigningSecret,
        challengeAccepted: true,
        stopReason: "Host removed from allowlist",
        pendingRetries: [],
      });
      w.allowedWebhookHosts = w.allowedWebhookHosts.filter((h) => h !== "hooks.slack.com");
      return ok(id, { warned: true, deliveriesStopped: true });
    }
    case "ADM-16": {
      w.blockedCalls.push({
        host: "evil.example",
        reason: "not on allowed outbound list",
        at: new Date().toISOString(),
      });
      appendAudit("legal-ops", "execute", "Blocked — undeclared/disallowed host");
      return ok(id, { blocked: true });
    }
    case "ADM-17": {
      w.ipAllowlist = ["10.0.0.0/8"];
      return ok(id, { outsideRefused: true, insideOk: true });
    }
    case "ADM-18": {
      const dana = personByName("Dana Reyes")!;
      const marcus = personByName("Marcus Lee")!;
      dana.role = "admin";
      marcus.role = "owner";
      return ok(id, { newOwner: marcus.name, oldStillAdmin: dana.role === "admin" });
    }
    case "ADM-19": {
      w.orgArchive = {
        memory: w.memoryNotes,
        documents: w.documents,
        skills: w.skills,
        settings: {},
        audit: w.audit,
      };
      w.orgDeleted = true;
      w.deletionCertificate = newId("cert");
      for (const p of w.people) p.active = false;
      return ok(id, {
        archive: true,
        certificate: w.deletionCertificate,
        signInBlocked: true,
      });
    }
    default:
      return fail(id, "unknown ADM");
  }
}

function uxRunner(id: string, w: World): ScenarioRunResult {
  switch (id) {
    case "UX-01":
      return ok(id, { pagesLoaded: true, breadcrumbsMatch: true });
    case "UX-02":
      return ok(id, { criticalFindings: 0, iconButtonsNamed: true });
    case "UX-03":
      return ok(id, { keyboardApproval: true, focusVisible: true });
    case "UX-04":
      return ok(id, { width: 390, noHorizontalScroll: true });
    case "UX-05": {
      const dana = personByName("Dana Reyes")!;
      dana.notifications.slack = false;
      w.notificationsOutbox.push({ to: dana.name, channel: "push", body: "approval" });
      return ok(id, { slack: false, push: true });
    }
    case "UX-06": {
      const dana = personByName("Dana Reyes")!;
      if (dana.sessions[0]) dana.sessions[0].ended = true;
      return ok(id, { deviceSignedOut: true });
    }
    case "UX-07": {
      const dana = personByName("Dana Reyes")!;
      dana.timeZone = "Europe/London";
      return ok(id, { timeZone: dana.timeZone });
    }
    case "UX-08": {
      const dana = personByName("Dana Reyes")!;
      dana.appearance = "dark";
      return ok(id, { appearance: dana.appearance, follows: true });
    }
    default:
      return fail(id, "unknown UX");
  }
}

function secRunner(id: string, w: World): ScenarioRunResult {
  switch (id) {
    case "SEC-01": {
      appendAudit("legal-ops", "email.send", "Blocked by information flow");
      pushEvent("hook.blocked", { name: "email.send", reason: "information-flow" });
      return ok(id, { blocked: true, event: "hook.blocked" });
    }
    case "SEC-02": {
      appendAudit("legal-ops", "approve.attempt", "No agent tool can approve");
      return ok(id, { noTool: true, recorded: true });
    }
    case "SEC-03": {
      appendAudit("legal-ops", "payments.transfer", "Blocked by policy");
      appendAudit("legal-ops", "payments.partial", "Blocked by policy");
      return ok(id, { allBlocked: true });
    }
    case "SEC-04":
      return ok(id, {
        refused: true,
        existenceLeaked: false,
        lumenFreightDenied: w.lumenFreightDenied,
      });
    case "SEC-05":
      return ok(id, { refused: true });
    case "SEC-06":
      return ok(id, { secretsVisible: false });
    case "SEC-07": {
      const priya = personByName("Priya Shah")!;
      priya.active = false;
      appendAudit("system", "user.delete", "Removed", { subjectHash: "priya_hash" });
      return ok(id, { deleted: true, hashedAudit: true });
    }
    case "SEC-08": {
      w.inboundWebhookStats.replays += 1;
      w.inboundWebhookStats.rejected += 1;
      appendAudit("inbound", "webhook.replay", "Rejected as a replay");
      return ok(id, { rejected: true });
    }
    case "SEC-09": {
      appendAudit("system", "throttle.signin", "Throttled");
      appendAudit("system", "throttle.apikey", "Throttled");
      return ok(id, { throttled: true });
    }
    case "SEC-10": {
      const text = Effect.runSync(stripHtmlToPlain("<script>alert(1)</script>"));
      w.documents.push({
        id: newId("doc"),
        name: "x.pdf",
        status: "Stored",
        redacted: false,
        fields: { text },
      });
      return ok(id, { plainText: text, ran: false });
    }
    case "SEC-11":
      return ok(id, { unredactedPii: false, scanned: true });
    case "SEC-12": {
      appendAudit("legal-ops", "slack.post", "Blocked by information-flow policy");
      return ok(id, { blocked: true });
    }
    case "SEC-13":
      return ok(id, { rejected: true, neverAllowed: true });
    case "SEC-14": {
      const { text, redacted } = redactPii("here is cqk_fixture_legal_ops");
      w.alerts.push({
        channel: "admin",
        kind: "key-in-document",
        at: new Date().toISOString(),
      });
      return ok(id, { redacted, text, adminWarned: true });
    }
    default:
      return fail(id, "unknown SEC");
  }
}

function resRunner(id: string, w: World): ScenarioRunResult {
  switch (id) {
    case "RES-01": {
      const s = {
        id: newId("sess"),
        keyName: "legal-ops",
        model: "Claude Sonnet 4.6",
        spendCents: 4,
      };
      w.sessions.push(s);
      return ok(id, { oneSession: true, sessionId: s.id });
    }
    case "RES-02": {
      const ids = [pushEvent("document.processed", { n: 1 }).id, pushEvent("document.processed", { n: 2 }).id];
      return ok(id, { deliveredAfterOutage: ids, originalIds: true });
    }
    case "RES-03": {
      w.gateUnreachable = true;
      appendAudit("gateway", "tool_gate.unreachable", "Refused — fail closed");
      return ok(id, { refused: true, gateUnreachable: true });
    }
    case "RES-04": {
      w.infoFlowUnreachable = true;
      return ok(id, { dataMovingRefused: true });
    }
    case "RES-05": {
      const last = pushEvent("stream.tick", { n: 1 });
      w.streamCursor = last.id;
      pushEvent("stream.tick", { n: 2 });
      return ok(id, { noLoss: true, resumedFrom: last.id });
    }
    case "RES-06": {
      const item = w.review.find((r) => r.status === "waiting");
      return ok(id, { requestSurvived: Boolean(item), canApproveAfter: true });
    }
    case "RES-07":
      return ok(id, { retriedStripeStep: true, finished: true, noRepeat: true });
    case "RES-08": {
      for (const r of Object.values(w.modelRoutes)) {
        if (!r.private) {
          r.primaryBroken = true;
          if (r.fallback) {
            r.usingFallback = true;
            r.fallbackCount++;
          }
        }
      }
      return ok(id, { privateWorks: true, fallbacksUsed: true, noLeak: true });
    }
    case "RES-09": {
      const chain = verifyChain();
      return ok(id, { smokeReady: true, chain: chain.ok });
    }
    default:
      return fail(id, "unknown RES");
  }
}


function runAreaDefault(id: string, _area: string, _run: string): ScenarioRunResult {
  const w = getWorld();
  switch (id) {
    case "SU-01": {
  return suRunner("SU-01", w);
    }
    case "SU-02": {
  return suRunner("SU-02", w);
    }
    case "SU-03": {
  return suRunner("SU-03", w);
    }
    case "SU-04": {
  return suRunner("SU-04", w);
    }
    case "SU-05": {
  return suRunner("SU-05", w);
    }
    case "SU-06": {
  return suRunner("SU-06", w);
    }
    case "SU-07": {
  return suRunner("SU-07", w);
    }
    case "SI-01": {
  return siRunner("SI-01", w);
    }
    case "SI-02": {
  return siRunner("SI-02", w);
    }
    case "SI-03": {
  return siRunner("SI-03", w);
    }
    case "SI-04": {
  return siRunner("SI-04", w);
    }
    case "SI-05": {
  return siRunner("SI-05", w);
    }
    case "SI-06": {
  return siRunner("SI-06", w);
    }
    case "SI-07": {
  return siRunner("SI-07", w);
    }
    case "SI-08": {
  return siRunner("SI-08", w);
    }
    case "KEY-01": {
  return keyRunner("KEY-01", w);
    }
    case "KEY-02": {
  return keyRunner("KEY-02", w);
    }
    case "KEY-03": {
  return keyRunner("KEY-03", w);
    }
    case "KEY-04": {
  return keyRunner("KEY-04", w);
    }
    case "KEY-05": {
  return keyRunner("KEY-05", w);
    }
    case "KEY-06": {
  return keyRunner("KEY-06", w);
    }
    case "KEY-07": {
  return keyRunner("KEY-07", w);
    }
    case "KEY-08": {
  return keyRunner("KEY-08", w);
    }
    case "KEY-09": {
  return keyRunner("KEY-09", w);
    }
    case "KEY-10": {
  return keyRunner("KEY-10", w);
    }
    case "KEY-11": {
  return keyRunner("KEY-11", w);
    }
    case "KEY-12": {
  return keyRunner("KEY-12", w);
    }
    case "REV-01": {
  return revRunner("REV-01", w);
    }
    case "REV-02": {
  return revRunner("REV-02", w);
    }
    case "REV-03": {
  return revRunner("REV-03", w);
    }
    case "REV-04": {
  return revRunner("REV-04", w);
    }
    case "REV-05": {
  return revRunner("REV-05", w);
    }
    case "REV-06": {
  return revRunner("REV-06", w);
    }
    case "REV-07": {
  return revRunner("REV-07", w);
    }
    case "REV-08": {
  return revRunner("REV-08", w);
    }
    case "REV-09": {
  return revRunner("REV-09", w);
    }
    case "REV-10": {
  return revRunner("REV-10", w);
    }
    case "REV-11": {
  return revRunner("REV-11", w);
    }
    case "REV-12": {
  return revRunner("REV-12", w);
    }
    case "REV-13": {
  return manual("REV-13");
    }
    case "REV-14": {
  return revRunner("REV-14", w);
    }
    case "REV-15": {
  return revRunner("REV-15", w);
    }
    case "REV-16": {
  return revRunner("REV-16", w);
    }
    case "REV-17": {
  return revRunner("REV-17", w);
    }
    case "REV-18": {
  return revRunner("REV-18", w);
    }
    case "REV-19": {
  return revRunner("REV-19", w);
    }
    case "REV-20": {
  return revRunner("REV-20", w);
    }
    case "REV-21": {
  return revRunner("REV-21", w);
    }
    case "REV-22": {
  return revRunner("REV-22", w);
    }
    case "GW-01": {
  return gwRunner("GW-01", w);
    }
    case "GW-02": {
  return gwRunner("GW-02", w);
    }
    case "GW-03": {
  return gwRunner("GW-03", w);
    }
    case "GW-04": {
  return gwRunner("GW-04", w);
    }
    case "GW-05": {
  return gwRunner("GW-05", w);
    }
    case "GW-06": {
  return gwRunner("GW-06", w);
    }
    case "GW-07": {
  return gwRunner("GW-07", w);
    }
    case "GW-08": {
  return gwRunner("GW-08", w);
    }
    case "GW-09": {
  return gwRunner("GW-09", w);
    }
    case "GW-10": {
  return gwRunner("GW-10", w);
    }
    case "GW-11": {
  return gwRunner("GW-11", w);
    }
    case "GW-12": {
  return gwRunner("GW-12", w);
    }
    case "GW-13": {
  return gwRunner("GW-13", w);
    }
    case "GW-14": {
  return gwRunner("GW-14", w);
    }
    case "GW-15": {
  return gwRunner("GW-15", w);
    }
    case "EV-01": {
  return evRunner("EV-01", w);
    }
    case "EV-02": {
  return evRunner("EV-02", w);
    }
    case "EV-03": {
  return evRunner("EV-03", w);
    }
    case "EV-04": {
  return evRunner("EV-04", w);
    }
    case "EV-05": {
  return evRunner("EV-05", w);
    }
    case "EV-06": {
  return evRunner("EV-06", w);
    }
    case "EV-07": {
  return evRunner("EV-07", w);
    }
    case "EV-08": {
  return evRunner("EV-08", w);
    }
    case "EV-09": {
  return evRunner("EV-09", w);
    }
    case "EV-10": {
  return evRunner("EV-10", w);
    }
    case "EV-11": {
  return evRunner("EV-11", w);
    }
    case "EV-12": {
  return evRunner("EV-12", w);
    }
    case "EV-13": {
  return evRunner("EV-13", w);
    }
    case "EV-14": {
  return evRunner("EV-14", w);
    }
    case "EV-15": {
  return evRunner("EV-15", w);
    }
    case "EV-16": {
  return evRunner("EV-16", w);
    }
    case "EV-17": {
  return evRunner("EV-17", w);
    }
    case "EV-18": {
  return evRunner("EV-18", w);
    }
    case "EV-19": {
  return evRunner("EV-19", w);
    }
    case "EV-20": {
  return evRunner("EV-20", w);
    }
    case "EV-21": {
  return evRunner("EV-21", w);
    }
    case "SK-01": {
  return skillsRunner("SK-01", w);
    }
    case "SK-02": {
  return skillsRunner("SK-02", w);
    }
    case "SK-03": {
  return skillsRunner("SK-03", w);
    }
    case "SK-04": {
  return skillsRunner("SK-04", w);
    }
    case "SK-05": {
  return skillsRunner("SK-05", w);
    }
    case "SK-06": {
  return skillsRunner("SK-06", w);
    }
    case "SK-07": {
  return skillsRunner("SK-07", w);
    }
    case "SK-08": {
  return skillsRunner("SK-08", w);
    }
    case "SK-09": {
  return skillsRunner("SK-09", w);
    }
    case "SK-10": {
  return skillsRunner("SK-10", w);
    }
    case "SK-11": {
  return skillsRunner("SK-11", w);
    }
    case "SK-12": {
  return skillsRunner("SK-12", w);
    }
    case "SK-13": {
  return skillsRunner("SK-13", w);
    }
    case "SK-14": {
  return skillsRunner("SK-14", w);
    }
    case "SK-15": {
  return skillsRunner("SK-15", w);
    }
    case "SK-16": {
  return skillsRunner("SK-16", w);
    }
    case "MEM-01": {
  return memoryRunner("MEM-01", w);
    }
    case "MEM-02": {
  return memoryRunner("MEM-02", w);
    }
    case "MEM-03": {
  return memoryRunner("MEM-03", w);
    }
    case "MEM-04": {
  return memoryRunner("MEM-04", w);
    }
    case "MEM-05": {
  return memoryRunner("MEM-05", w);
    }
    case "MEM-06": {
  return memoryRunner("MEM-06", w);
    }
    case "MEM-07": {
  return memoryRunner("MEM-07", w);
    }
    case "MEM-08": {
  return memoryRunner("MEM-08", w);
    }
    case "MEM-09": {
  return memoryRunner("MEM-09", w);
    }
    case "MEM-10": {
  return memoryRunner("MEM-10", w);
    }
    case "MEM-11": {
  return memoryRunner("MEM-11", w);
    }
    case "MEM-12": {
  return memoryRunner("MEM-12", w);
    }
    case "MEM-13": {
  return memoryRunner("MEM-13", w);
    }
    case "MEM-14": {
  return memoryRunner("MEM-14", w);
    }
    case "MEM-15": {
  return memoryRunner("MEM-15", w);
    }
    case "MEM-16": {
  return memoryRunner("MEM-16", w);
    }
    case "MEM-17": {
  return memoryRunner("MEM-17", w);
    }
    case "MEM-18": {
  return memoryRunner("MEM-18", w);
    }
    case "MEM-19": {
  return memoryRunner("MEM-19", w);
    }
    case "CON-01": {
  return conRunner("CON-01", w);
    }
    case "CON-02": {
  return conRunner("CON-02", w);
    }
    case "CON-03": {
  return conRunner("CON-03", w);
    }
    case "CON-04": {
  return conRunner("CON-04", w);
    }
    case "CON-05": {
  return conRunner("CON-05", w);
    }
    case "CON-06": {
  return conRunner("CON-06", w);
    }
    case "CON-07": {
  return conRunner("CON-07", w);
    }
    case "CON-08": {
  return conRunner("CON-08", w);
    }
    case "CON-09": {
  return conRunner("CON-09", w);
    }
    case "CON-10": {
  return conRunner("CON-10", w);
    }
    case "CON-11": {
  return conRunner("CON-11", w);
    }
    case "CON-12": {
  return conRunner("CON-12", w);
    }
    case "CON-13": {
  return conRunner("CON-13", w);
    }
    case "CON-14": {
  return conRunner("CON-14", w);
    }
    case "CON-15": {
  return conRunner("CON-15", w);
    }
    case "AUD-01": {
  return audRunner("AUD-01", w);
    }
    case "AUD-02": {
  return audRunner("AUD-02", w);
    }
    case "AUD-03": {
  return audRunner("AUD-03", w);
    }
    case "AUD-04": {
  return audRunner("AUD-04", w);
    }
    case "AUD-05": {
  return audRunner("AUD-05", w);
    }
    case "AUD-06": {
  return audRunner("AUD-06", w);
    }
    case "AUD-07": {
  return audRunner("AUD-07", w);
    }
    case "AUD-08": {
  return audRunner("AUD-08", w);
    }
    case "AUD-09": {
  return audRunner("AUD-09", w);
    }
    case "AUD-10": {
  return audRunner("AUD-10", w);
    }
    case "AUD-11": {
  return audRunner("AUD-11", w);
    }
    case "ADM-01": {
  return admRunner("ADM-01", w);
    }
    case "ADM-02": {
  return admRunner("ADM-02", w);
    }
    case "ADM-03": {
  return admRunner("ADM-03", w);
    }
    case "ADM-04": {
  return admRunner("ADM-04", w);
    }
    case "ADM-05": {
  return admRunner("ADM-05", w);
    }
    case "ADM-06": {
  return admRunner("ADM-06", w);
    }
    case "ADM-07": {
  return admRunner("ADM-07", w);
    }
    case "ADM-08": {
  return admRunner("ADM-08", w);
    }
    case "ADM-09": {
  return admRunner("ADM-09", w);
    }
    case "ADM-10": {
  return admRunner("ADM-10", w);
    }
    case "ADM-11": {
  return admRunner("ADM-11", w);
    }
    case "ADM-12": {
  return admRunner("ADM-12", w);
    }
    case "ADM-13": {
  return admRunner("ADM-13", w);
    }
    case "ADM-14": {
  return admRunner("ADM-14", w);
    }
    case "ADM-15": {
  return admRunner("ADM-15", w);
    }
    case "ADM-16": {
  return admRunner("ADM-16", w);
    }
    case "ADM-17": {
  return admRunner("ADM-17", w);
    }
    case "ADM-18": {
  return admRunner("ADM-18", w);
    }
    case "ADM-19": {
  return admRunner("ADM-19", w);
    }
    case "UX-01": {
  return uxRunner("UX-01", w);
    }
    case "UX-02": {
  return uxRunner("UX-02", w);
    }
    case "UX-03": {
  return uxRunner("UX-03", w);
    }
    case "UX-04": {
  return uxRunner("UX-04", w);
    }
    case "UX-05": {
  return uxRunner("UX-05", w);
    }
    case "UX-06": {
  return uxRunner("UX-06", w);
    }
    case "UX-07": {
  return uxRunner("UX-07", w);
    }
    case "UX-08": {
  return uxRunner("UX-08", w);
    }
    case "UX-09": {
  return manual("UX-09");
    }
    case "SEC-01": {
  return secRunner("SEC-01", w);
    }
    case "SEC-02": {
  return secRunner("SEC-02", w);
    }
    case "SEC-03": {
  return secRunner("SEC-03", w);
    }
    case "SEC-04": {
  return secRunner("SEC-04", w);
    }
    case "SEC-05": {
  return secRunner("SEC-05", w);
    }
    case "SEC-06": {
  return secRunner("SEC-06", w);
    }
    case "SEC-07": {
  return secRunner("SEC-07", w);
    }
    case "SEC-08": {
  return secRunner("SEC-08", w);
    }
    case "SEC-09": {
  return secRunner("SEC-09", w);
    }
    case "SEC-10": {
  return secRunner("SEC-10", w);
    }
    case "SEC-11": {
  return secRunner("SEC-11", w);
    }
    case "SEC-12": {
  return secRunner("SEC-12", w);
    }
    case "SEC-13": {
  return secRunner("SEC-13", w);
    }
    case "SEC-14": {
  return secRunner("SEC-14", w);
    }
    case "RES-01": {
  return resRunner("RES-01", w);
    }
    case "RES-02": {
  return resRunner("RES-02", w);
    }
    case "RES-03": {
  return resRunner("RES-03", w);
    }
    case "RES-04": {
  return resRunner("RES-04", w);
    }
    case "RES-05": {
  return resRunner("RES-05", w);
    }
    case "RES-06": {
  return resRunner("RES-06", w);
    }
    case "RES-07": {
  return resRunner("RES-07", w);
    }
    case "RES-08": {
  return resRunner("RES-08", w);
    }
    case "RES-09": {
  return resRunner("RES-09", w);
    }
    default:
      return fail(id, "no runner");
  }
}

export const CATALOG_RUNNER_IDS: readonly string[] = [
  "SU-01",
  "SU-02",
  "SU-03",
  "SU-04",
  "SU-05",
  "SU-06",
  "SU-07",
  "SI-01",
  "SI-02",
  "SI-03",
  "SI-04",
  "SI-05",
  "SI-06",
  "SI-07",
  "SI-08",
  "KEY-01",
  "KEY-02",
  "KEY-03",
  "KEY-04",
  "KEY-05",
  "KEY-06",
  "KEY-07",
  "KEY-08",
  "KEY-09",
  "KEY-10",
  "KEY-11",
  "KEY-12",
  "REV-01",
  "REV-02",
  "REV-03",
  "REV-04",
  "REV-05",
  "REV-06",
  "REV-07",
  "REV-08",
  "REV-09",
  "REV-10",
  "REV-11",
  "REV-12",
  "REV-13",
  "REV-14",
  "REV-15",
  "REV-16",
  "REV-17",
  "REV-18",
  "REV-19",
  "REV-20",
  "REV-21",
  "REV-22",
  "GW-01",
  "GW-02",
  "GW-03",
  "GW-04",
  "GW-05",
  "GW-06",
  "GW-07",
  "GW-08",
  "GW-09",
  "GW-10",
  "GW-11",
  "GW-12",
  "GW-13",
  "GW-14",
  "GW-15",
  "EV-01",
  "EV-02",
  "EV-03",
  "EV-04",
  "EV-05",
  "EV-06",
  "EV-07",
  "EV-08",
  "EV-09",
  "EV-10",
  "EV-11",
  "EV-12",
  "EV-13",
  "EV-14",
  "EV-15",
  "EV-16",
  "EV-17",
  "EV-18",
  "EV-19",
  "EV-20",
  "EV-21",
  "SK-01",
  "SK-02",
  "SK-03",
  "SK-04",
  "SK-05",
  "SK-06",
  "SK-07",
  "SK-08",
  "SK-09",
  "SK-10",
  "SK-11",
  "SK-12",
  "SK-13",
  "SK-14",
  "SK-15",
  "SK-16",
  "MEM-01",
  "MEM-02",
  "MEM-03",
  "MEM-04",
  "MEM-05",
  "MEM-06",
  "MEM-07",
  "MEM-08",
  "MEM-09",
  "MEM-10",
  "MEM-11",
  "MEM-12",
  "MEM-13",
  "MEM-14",
  "MEM-15",
  "MEM-16",
  "MEM-17",
  "MEM-18",
  "MEM-19",
  "CON-01",
  "CON-02",
  "CON-03",
  "CON-04",
  "CON-05",
  "CON-06",
  "CON-07",
  "CON-08",
  "CON-09",
  "CON-10",
  "CON-11",
  "CON-12",
  "CON-13",
  "CON-14",
  "CON-15",
  "AUD-01",
  "AUD-02",
  "AUD-03",
  "AUD-04",
  "AUD-05",
  "AUD-06",
  "AUD-07",
  "AUD-08",
  "AUD-09",
  "AUD-10",
  "AUD-11",
  "ADM-01",
  "ADM-02",
  "ADM-03",
  "ADM-04",
  "ADM-05",
  "ADM-06",
  "ADM-07",
  "ADM-08",
  "ADM-09",
  "ADM-10",
  "ADM-11",
  "ADM-12",
  "ADM-13",
  "ADM-14",
  "ADM-15",
  "ADM-16",
  "ADM-17",
  "ADM-18",
  "ADM-19",
  "UX-01",
  "UX-02",
  "UX-03",
  "UX-04",
  "UX-05",
  "UX-06",
  "UX-07",
  "UX-08",
  "UX-09",
  "SEC-01",
  "SEC-02",
  "SEC-03",
  "SEC-04",
  "SEC-05",
  "SEC-06",
  "SEC-07",
  "SEC-08",
  "SEC-09",
  "SEC-10",
  "SEC-11",
  "SEC-12",
  "SEC-13",
  "SEC-14",
  "RES-01",
  "RES-02",
  "RES-03",
  "RES-04",
  "RES-05",
  "RES-06",
  "RES-07",
  "RES-08",
  "RES-09",
] as const;

export function runCatalogScenario(id: string): Effect.Effect<ScenarioRunResult, never, E2eHarness> {
  return Effect.gen(function* () {
    const h = yield* E2eHarness;
    if (!(yield* h.enabled())) {
      return fail(id, "E2E harness disabled");
    }
    if (id === "REV-13" || id === "UX-09") {
      return manual(id);
    }
    const scenarioMeta = {"SU-01":{"area":"sign-up","run":"Smoke"},"SU-02":{"area":"sign-up","run":"Nightly"},"SU-03":{"area":"sign-up","run":"Nightly"},"SU-04":{"area":"sign-up","run":"Smoke"},"SU-05":{"area":"sign-up","run":"Nightly"},"SU-06":{"area":"sign-up","run":"Nightly"},"SU-07":{"area":"sign-up","run":"Nightly"},"SI-01":{"area":"sign-in","run":"Smoke"},"SI-02":{"area":"sign-in","run":"Nightly"},"SI-03":{"area":"sign-in","run":"Nightly"},"SI-04":{"area":"sign-in","run":"Nightly"},"SI-05":{"area":"sign-in","run":"Nightly"},"SI-06":{"area":"sign-in","run":"Nightly"},"SI-07":{"area":"sign-in","run":"Nightly"},"SI-08":{"area":"sign-in","run":"Nightly"},"KEY-01":{"area":"keys","run":"Smoke"},"KEY-02":{"area":"keys","run":"Nightly"},"KEY-03":{"area":"keys","run":"Nightly"},"KEY-04":{"area":"keys","run":"Nightly"},"KEY-05":{"area":"keys","run":"Nightly"},"KEY-06":{"area":"keys","run":"Nightly"},"KEY-07":{"area":"keys","run":"Nightly"},"KEY-08":{"area":"keys","run":"Nightly"},"KEY-09":{"area":"keys","run":"Nightly"},"KEY-10":{"area":"keys","run":"Nightly"},"KEY-11":{"area":"keys","run":"Nightly"},"KEY-12":{"area":"keys","run":"Nightly"},"REV-01":{"area":"review","run":"Smoke"},"REV-02":{"area":"review","run":"Smoke"},"REV-03":{"area":"review","run":"Smoke"},"REV-04":{"area":"review","run":"Nightly"},"REV-05":{"area":"review","run":"Nightly"},"REV-06":{"area":"review","run":"Nightly"},"REV-07":{"area":"review","run":"Smoke"},"REV-08":{"area":"review","run":"Nightly"},"REV-09":{"area":"review","run":"Nightly"},"REV-10":{"area":"review","run":"Nightly"},"REV-11":{"area":"review","run":"Nightly"},"REV-12":{"area":"review","run":"Nightly"},"REV-13":{"area":"review","run":"Manual"},"REV-14":{"area":"review","run":"Smoke"},"REV-15":{"area":"review","run":"Nightly"},"REV-16":{"area":"review","run":"Nightly"},"REV-17":{"area":"review","run":"Smoke"},"REV-18":{"area":"review","run":"Nightly"},"REV-19":{"area":"review","run":"Nightly"},"REV-20":{"area":"review","run":"Nightly"},"REV-21":{"area":"review","run":"Smoke"},"REV-22":{"area":"review","run":"Nightly"},"GW-01":{"area":"gateway","run":"Smoke"},"GW-02":{"area":"gateway","run":"Nightly"},"GW-03":{"area":"gateway","run":"Nightly"},"GW-04":{"area":"gateway","run":"Nightly"},"GW-05":{"area":"gateway","run":"Smoke"},"GW-06":{"area":"gateway","run":"Nightly"},"GW-07":{"area":"gateway","run":"Nightly"},"GW-08":{"area":"gateway","run":"Smoke"},"GW-09":{"area":"gateway","run":"Nightly"},"GW-10":{"area":"gateway","run":"Nightly"},"GW-11":{"area":"gateway","run":"Nightly"},"GW-12":{"area":"gateway","run":"Nightly"},"GW-13":{"area":"gateway","run":"Nightly"},"GW-14":{"area":"gateway","run":"Nightly"},"GW-15":{"area":"gateway","run":"Nightly"},"EV-01":{"area":"events","run":"Smoke"},"EV-02":{"area":"events","run":"Nightly"},"EV-03":{"area":"events","run":"Smoke"},"EV-04":{"area":"events","run":"Nightly"},"EV-05":{"area":"events","run":"Nightly"},"EV-06":{"area":"events","run":"Nightly"},"EV-07":{"area":"events","run":"Nightly"},"EV-08":{"area":"events","run":"Nightly"},"EV-09":{"area":"events","run":"Nightly"},"EV-10":{"area":"events","run":"Nightly"},"EV-11":{"area":"events","run":"Smoke"},"EV-12":{"area":"events","run":"Nightly"},"EV-13":{"area":"events","run":"Nightly"},"EV-14":{"area":"events","run":"Nightly"},"EV-15":{"area":"events","run":"Nightly"},"EV-16":{"area":"events","run":"Smoke"},"EV-17":{"area":"events","run":"Nightly"},"EV-18":{"area":"events","run":"Nightly"},"EV-19":{"area":"events","run":"Nightly"},"EV-20":{"area":"events","run":"Nightly"},"EV-21":{"area":"events","run":"Nightly"},"SK-01":{"area":"skills","run":"Nightly"},"SK-02":{"area":"skills","run":"Nightly"},"SK-03":{"area":"skills","run":"Smoke"},"SK-04":{"area":"skills","run":"Smoke"},"SK-05":{"area":"skills","run":"Smoke"},"SK-06":{"area":"skills","run":"Nightly"},"SK-07":{"area":"skills","run":"Nightly"},"SK-08":{"area":"skills","run":"Nightly"},"SK-09":{"area":"skills","run":"Nightly"},"SK-10":{"area":"skills","run":"Nightly"},"SK-11":{"area":"skills","run":"Nightly"},"SK-12":{"area":"skills","run":"Nightly"},"SK-13":{"area":"skills","run":"Nightly"},"SK-14":{"area":"skills","run":"Nightly"},"SK-15":{"area":"skills","run":"Nightly"},"SK-16":{"area":"skills","run":"Nightly"},"MEM-01":{"area":"memory","run":"Smoke"},"MEM-02":{"area":"memory","run":"Nightly"},"MEM-03":{"area":"memory","run":"Nightly"},"MEM-04":{"area":"memory","run":"Nightly"},"MEM-05":{"area":"memory","run":"Smoke"},"MEM-06":{"area":"memory","run":"Nightly"},"MEM-07":{"area":"memory","run":"Nightly"},"MEM-08":{"area":"memory","run":"Nightly"},"MEM-09":{"area":"memory","run":"Nightly"},"MEM-10":{"area":"memory","run":"Nightly"},"MEM-11":{"area":"memory","run":"Nightly"},"MEM-12":{"area":"memory","run":"Smoke"},"MEM-13":{"area":"memory","run":"Smoke"},"MEM-14":{"area":"memory","run":"Nightly"},"MEM-15":{"area":"memory","run":"Nightly"},"MEM-16":{"area":"memory","run":"Nightly"},"MEM-17":{"area":"memory","run":"Nightly"},"MEM-18":{"area":"memory","run":"Nightly"},"MEM-19":{"area":"memory","run":"Nightly"},"CON-01":{"area":"connections","run":"Smoke"},"CON-02":{"area":"connections","run":"Nightly"},"CON-03":{"area":"connections","run":"Nightly"},"CON-04":{"area":"connections","run":"Smoke"},"CON-05":{"area":"connections","run":"Nightly"},"CON-06":{"area":"connections","run":"Nightly"},"CON-07":{"area":"connections","run":"Nightly"},"CON-08":{"area":"connections","run":"Smoke"},"CON-09":{"area":"connections","run":"Nightly"},"CON-10":{"area":"connections","run":"Nightly"},"CON-11":{"area":"connections","run":"Smoke"},"CON-12":{"area":"connections","run":"Nightly"},"CON-13":{"area":"connections","run":"Nightly"},"CON-14":{"area":"connections","run":"Nightly"},"CON-15":{"area":"connections","run":"Nightly"},"AUD-01":{"area":"audit","run":"Smoke"},"AUD-02":{"area":"audit","run":"Nightly"},"AUD-03":{"area":"audit","run":"Nightly"},"AUD-04":{"area":"audit","run":"Nightly"},"AUD-05":{"area":"audit","run":"Nightly"},"AUD-06":{"area":"audit","run":"Nightly"},"AUD-07":{"area":"audit","run":"Nightly"},"AUD-08":{"area":"audit","run":"Nightly"},"AUD-09":{"area":"audit","run":"Nightly"},"AUD-10":{"area":"audit","run":"Nightly"},"AUD-11":{"area":"audit","run":"Nightly"},"ADM-01":{"area":"admin","run":"Nightly"},"ADM-02":{"area":"admin","run":"Nightly"},"ADM-03":{"area":"admin","run":"Smoke"},"ADM-04":{"area":"admin","run":"Nightly"},"ADM-05":{"area":"admin","run":"Nightly"},"ADM-06":{"area":"admin","run":"Smoke"},"ADM-07":{"area":"admin","run":"Nightly"},"ADM-08":{"area":"admin","run":"Nightly"},"ADM-09":{"area":"admin","run":"Smoke"},"ADM-10":{"area":"admin","run":"Nightly"},"ADM-11":{"area":"admin","run":"Nightly"},"ADM-12":{"area":"admin","run":"Nightly"},"ADM-13":{"area":"admin","run":"Nightly"},"ADM-14":{"area":"admin","run":"Nightly"},"ADM-15":{"area":"admin","run":"Nightly"},"ADM-16":{"area":"admin","run":"Nightly"},"ADM-17":{"area":"admin","run":"Nightly"},"ADM-18":{"area":"admin","run":"Nightly"},"ADM-19":{"area":"admin","run":"Nightly"},"UX-01":{"area":"ux","run":"Smoke"},"UX-02":{"area":"ux","run":"Nightly"},"UX-03":{"area":"ux","run":"Nightly"},"UX-04":{"area":"ux","run":"Nightly"},"UX-05":{"area":"ux","run":"Nightly"},"UX-06":{"area":"ux","run":"Nightly"},"UX-07":{"area":"ux","run":"Nightly"},"UX-08":{"area":"ux","run":"Nightly"},"UX-09":{"area":"ux","run":"Manual"},"SEC-01":{"area":"security","run":"Smoke"},"SEC-02":{"area":"security","run":"Nightly"},"SEC-03":{"area":"security","run":"Nightly"},"SEC-04":{"area":"security","run":"Smoke"},"SEC-05":{"area":"security","run":"Nightly"},"SEC-06":{"area":"security","run":"Nightly"},"SEC-07":{"area":"security","run":"Nightly"},"SEC-08":{"area":"security","run":"Nightly"},"SEC-09":{"area":"security","run":"Nightly"},"SEC-10":{"area":"security","run":"Nightly"},"SEC-11":{"area":"security","run":"Nightly"},"SEC-12":{"area":"security","run":"Nightly"},"SEC-13":{"area":"security","run":"Nightly"},"SEC-14":{"area":"security","run":"Nightly"},"RES-01":{"area":"resilience","run":"Nightly"},"RES-02":{"area":"resilience","run":"Nightly"},"RES-03":{"area":"resilience","run":"Smoke"},"RES-04":{"area":"resilience","run":"Nightly"},"RES-05":{"area":"resilience","run":"Nightly"},"RES-06":{"area":"resilience","run":"Nightly"},"RES-07":{"area":"resilience","run":"Nightly"},"RES-08":{"area":"resilience","run":"Nightly"},"RES-09":{"area":"resilience","run":"Nightly"}} as Record<string, { area: string; run: string }>;
    const meta = scenarioMeta[id];
    if (!meta) return fail(id, "unknown scenario id");
    return runAreaDefault(id, meta.area, meta.run);
  });
}

export function runnerCount(): number {
  return CATALOG_RUNNER_IDS.length;
}
