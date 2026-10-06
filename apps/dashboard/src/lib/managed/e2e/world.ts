/**
 * In-process E2E world for ClawQL Cloud catalog harness.
 * Public surfaces under `/api/e2e/*` read/write this store when CLAWQL_E2E_HARNESS=1.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";

export type E2eAuditEntry = {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  readonly action: string;
  readonly outcome: string;
  readonly prevHash: string;
  readonly hash: string;
  readonly meta?: Record<string, unknown>;
  /** Hourly Merkle-style root for AUD-* */
  hourlyRoot?: string;
  tampered?: boolean;
};

export type E2eReviewRequest = {
  id: string;
  kind: "change" | "source" | "decision" | "skill";
  title: string;
  requester: string;
  digest: string;
  args: Record<string, unknown>;
  status: "waiting" | "approved" | "declined" | "expired" | "changed";
  approvers: string[];
  expiresAt: string;
  mandateId?: string;
  requiredApprovals?: number;
  declineReason?: string;
  declineNote?: string;
  visibleTo?: string[];
};

export type E2eKey = {
  id: string;
  name: string;
  secretShown: boolean;
  group: string;
  canUse: string[];
  dailyCapCents: number;
  spentTodayCents: number;
  revoked: boolean;
  expiresAt: string;
  lastFour: string;
  secretOnce?: string;
  /** Persisted bearer token for harness auth after confirmSaved clears secretOnce. Never returned by GET. */
  secretToken?: string;
  confirmedSaved?: boolean;
  memoryEnrichment?: boolean;
  teamBudgetExhausted?: boolean;
};

export type E2ePerson = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member" | "billing" | "auditor";
  groups: string[];
  active: boolean;
  securityKeys: E2eSecurityKey[];
  sessions: E2eBrowserSession[];
  notifications: { slack: boolean; push: boolean };
  timeZone: string;
  appearance: "light" | "dark";
  canApproveContracts: boolean;
  canAnswerTicketTriage: boolean;
};

export type E2eSecurityKey = {
  id: string;
  label: string;
  kind: "device-bound" | "synced" | "totp";
  canApprove: boolean;
  aaguid: string;
  signatureCounter: number;
  revoked: boolean;
};

export type E2eBrowserSession = {
  id: string;
  device: string;
  signedInAt: string;
  lastActiveAt: string;
  path: string;
  ended: boolean;
};

export type E2eMemoryNote = {
  id: string;
  title: string;
  body: string;
  owner: string;
  acl: string[];
  personal: boolean;
  stale: boolean;
  erased: boolean;
  fields: Record<string, string>;
  history: string[];
};

export type E2eSkill = {
  id: string;
  name: string;
  stage: "proposed" | "proving" | "review" | "active" | "retired";
  failed?: boolean;
  failReason?: string;
  sessionCount?: number;
  evidence?: string[];
  keyGroup?: string;
  hosts?: string[];
  ops?: string[];
  injectionFlagged?: boolean;
  needsConnection?: string;
  retireReason?: string;
  reReviewLapsed?: boolean;
  writing?: boolean;
};

export type E2eSubscription = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  paused: boolean;
  health: string;
  secret: string;
  challengeAccepted: boolean;
  stopReason?: string;
  pendingRetries: { eventId: string; type: string; payload: unknown }[];
};

export type E2eEvent = {
  id: string;
  type: string;
  payload: unknown;
  at: string;
  source?: string;
  inbound?: boolean;
  untrusted?: boolean;
  test?: boolean;
};

export type World = {
  orgId: string;
  orgName: string;
  orgAddress: string;
  orgRegion: string;
  orgDeleted: boolean;
  deletionCertificate?: string;
  firstRunStep: number;
  firstRunTotal: number;
  securityKeysRegistered: boolean;
  recoveryCodes: string[];
  recoveryCodesShownOnce: boolean;
  usedRecoveryCodes: string[];
  people: E2ePerson[];
  crm: Record<string, { annualValue: number; counterparty: string; effectiveDate?: string }>;
  keys: E2eKey[];
  review: E2eReviewRequest[];
  audit: E2eAuditEntry[];
  auditBroken: boolean;
  auditRestoreAdmins: string[];
  hourlyRoots: Record<string, string>;
  sessions: { id: string; keyName: string; model?: string; spendCents: number; upload?: boolean }[];
  events: E2eEvent[];
  streamCursor: string | null;
  eventTypeCounts24h: Record<string, number>;
  subscriptions: E2eSubscription[];
  webhookSigningSecret: string;
  inboundWebhookStats: { accepted: number; rejected: number; replays: number };
  seenInboundIds: Set<string>;
  documents: {
    id: string;
    name: string;
    status: string;
    redacted: boolean;
    fields: Record<string, string>;
    verifiedBy?: string;
    lowConfidence?: boolean;
  }[];
  memoryNotes: E2eMemoryNote[];
  schemaFields: { name: string; since?: string; suggested?: boolean }[];
  skills: E2eSkill[];
  connections: {
    id: string;
    name: string;
    groups: string[];
    status: string;
    personal?: boolean;
    risk?: Record<string, number>;
    readOverrides?: string[];
    kind?: string;
  }[];
  gateUnreachable: boolean;
  infoFlowUnreachable: boolean;
  hardStop: boolean;
  monthSpentCents: number;
  monthBudgetCents: number;
  teamBudgets: Record<string, { spent: number; cap: number }>;
  creditsCents: number;
  invoiceCard: string;
  invoices: { id: string; amountCents: number; pdf: string }[];
  alerts: { channel: string; kind: string; at: string }[];
  redaction: { phone: boolean; email: boolean; bank: boolean; cardAlways: true };
  allowedWebhookHosts: string[];
  allowedOutboundHosts: string[];
  ipAllowlist: string[] | null;
  requestExpiryMinutes: number;
  idleTimeoutMinutes: number;
  maxSessionMinutes: number;
  auditRetentionYears: number;
  requesterCannotApproveLocked: true;
  requiredApprovalsDefault: number;
  allowedAuthenticatorAaguids: string[];
  usedMandateSignatures: Set<string>;
  usedApprovalPayloads: Set<string>;
  erasedSubjects: string[];
  eraseJobs: {
    id: string;
    subject: string;
    done: number;
    total: number;
    steps: string[];
    certificateReady: boolean;
    stopped?: boolean;
  }[];
  decisionSites: Record<
    string,
    { mode: "trusted" | "reproving"; count7d: number; labels: Record<string, number> }
  >;
  modelRoutes: Record<
    string,
    {
      primary: string;
      fallback?: string;
      primaryBroken: boolean;
      usingFallback: boolean;
      fallbackCount: number;
      private: boolean;
    }
  >;
  stripeProvisioningDone: boolean;
  homeNeedsAction: number;
  reviewBadge: number;
  sidebarBadge: number;
  notificationsOutbox: { to: string; channel: string; body: string }[];
  trainingExports: { id: string; date: string; needsRegenerate: boolean; subjects: string[] }[];
  blockedCalls: { host: string; reason: string; at: string }[];
  lastSignedApproval?: string;
  orgArchive?: Record<string, unknown>;
  signedInUserId: string;
  lumenFreightDenied: boolean;
  /** Sign-in / API key attempt counters for SEC-09 throttle witnesses. */
  authAttempts: { signin: number; apikey: number };
};

function hashChain(prev: string, payload: string): string {
  return createHash("sha256").update(`${prev}\n${payload}`).digest("hex");
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function seedPeople(): E2ePerson[] {
  const now = new Date().toISOString();
  const deviceKey = (label: string, aaguid: string): E2eSecurityKey => ({
    id: newId("sk"),
    label,
    kind: "device-bound",
    canApprove: true,
    aaguid,
    signatureCounter: 1,
    revoked: false,
  });
  return [
    {
      id: "user_dana",
      name: "Dana Reyes",
      email: "dana@acme.example",
      role: "owner",
      groups: ["Legal", "Engineering"],
      active: true,
      securityKeys: [
        deviceKey("Dana YubiKey 1", "aagu_yubi5"),
        deviceKey("Dana YubiKey 2", "aagu_yubi5"),
      ],
      sessions: [
        {
          id: "sess_browser_dana",
          device: "Chrome/macOS",
          signedInAt: now,
          lastActiveAt: now,
          path: "/home",
          ended: false,
        },
      ],
      notifications: { slack: true, push: true },
      timeZone: "America/Los_Angeles",
      appearance: "light",
      canApproveContracts: true,
      canAnswerTicketTriage: false,
    },
    {
      id: "user_marcus",
      name: "Marcus Lee",
      email: "marcus@acme.example",
      role: "admin",
      groups: ["Legal"],
      active: true,
      securityKeys: [deviceKey("Marcus key", "aagu_yubi5")],
      sessions: [],
      notifications: { slack: true, push: true },
      timeZone: "America/New_York",
      appearance: "light",
      canApproveContracts: true,
      canAnswerTicketTriage: false,
    },
    {
      id: "user_jordan",
      name: "Jordan Park",
      email: "jordan@acme.example",
      role: "member",
      groups: ["Support"],
      active: true,
      securityKeys: [
        deviceKey("Jordan key 1", "aagu_yubi5"),
        deviceKey("Jordan key 2", "aagu_yubi5"),
      ],
      sessions: [],
      notifications: { slack: true, push: true },
      timeZone: "America/Chicago",
      appearance: "light",
      canApproveContracts: false,
      canAnswerTicketTriage: true,
    },
    {
      id: "user_priya",
      name: "Priya Shah",
      email: "priya@acme.example",
      role: "member",
      groups: ["Legal"],
      active: true,
      securityKeys: [
        deviceKey("Priya key 1", "aagu_yubi5"),
        deviceKey("Priya key 2", "aagu_yubi5"),
      ],
      sessions: [],
      notifications: { slack: true, push: true },
      timeZone: "America/Los_Angeles",
      appearance: "light",
      canApproveContracts: true,
      canAnswerTicketTriage: false,
    },
    {
      id: "user_sam",
      name: "Sam Ortiz",
      email: "sam@acme.example",
      role: "auditor",
      groups: [],
      active: true,
      securityKeys: [
        deviceKey("Sam key 1", "aagu_yubi5"),
        deviceKey("Sam key 2", "aagu_yubi5"),
      ],
      sessions: [],
      notifications: { slack: false, push: true },
      timeZone: "UTC",
      appearance: "light",
      canApproveContracts: false,
      canAnswerTicketTriage: false,
    },
  ];
}

function seedWorld(): World {
  const audit: E2eAuditEntry[] = [];
  let prev = "genesis";
  const pushAudit = (actor: string, action: string, outcome: string, meta?: Record<string, unknown>) => {
    const id = `wrm_${1000 + audit.length}`;
    const at = new Date().toISOString();
    const payload = JSON.stringify({ id, at, actor, action, outcome, meta });
    const hash = hashChain(prev, payload);
    const hour = at.slice(0, 13);
    const hourlyRoot = createHash("sha256").update(`${hour}:${hash}`).digest("hex");
    audit.push({ id, at, actor, action, outcome, prevHash: prev, hash, meta, hourlyRoot });
    prev = hash;
  };

  pushAudit("system", "org.seed", "Acme Robotics fixture ready");
  pushAudit("Dana Reyes", "owner.joined", "Owner seeded");
  pushAudit("system", "plan.started", "Team plan");

  const codes = Array.from({ length: 8 }, (_, i) => `REC-${1000 + i}-${randomUUID().slice(0, 4)}`);

  return {
    orgId: "org_acme",
    orgName: "Acme Robotics",
    orgAddress: "100 Market St",
    orgRegion: "us-west",
    orgDeleted: false,
    firstRunStep: 1,
    firstRunTotal: 6,
    securityKeysRegistered: false,
    recoveryCodes: codes,
    recoveryCodesShownOnce: false,
    usedRecoveryCodes: [],
    people: seedPeople(),
    crm: {
      northwind: {
        annualValue: 48500,
        counterparty: "Northwind Partners",
        effectiveDate: "2026-01-01",
      },
    },
    keys: [
      {
        id: "key_legal",
        name: "legal-ops",
        secretShown: false,
        group: "Legal",
        canUse: ["models", "tools", "memory"],
        dailyCapCents: 7500,
        spentTodayCents: 0,
        revoked: false,
        expiresAt: new Date(Date.now() + 8 * 864e5).toISOString(),
        lastFour: "7d02",
        memoryEnrichment: false,
      },
      {
        id: "key_support",
        name: "support-bot",
        secretShown: false,
        group: "Support",
        canUse: ["models", "tools"],
        dailyCapCents: 4000,
        spentTodayCents: 0,
        revoked: false,
        expiresAt: new Date(Date.now() + 60 * 864e5).toISOString(),
        lastFour: "e44a",
      },
      {
        id: "key_release",
        name: "release-agent",
        secretShown: false,
        group: "Engineering",
        canUse: ["models", "tools"],
        dailyCapCents: 6000,
        spentTodayCents: 0,
        revoked: false,
        expiresAt: new Date(Date.now() + 90 * 864e5).toISOString(),
        lastFour: "c801",
      },
      {
        id: "key_docs",
        name: "docs-pipeline",
        secretShown: false,
        group: "Operations",
        canUse: ["models", "tools", "memory"],
        dailyCapCents: 4500,
        spentTodayCents: 0,
        revoked: false,
        expiresAt: new Date(Date.now() + 120 * 864e5).toISOString(),
        lastFour: "11af",
      },
    ],
    review: [
      {
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
        requiredApprovals: 1,
        visibleTo: ["Dana Reyes", "Marcus Lee", "Jordan Park", "Priya Shah"],
      },
      {
        id: "rev_source",
        kind: "source",
        title: "Add the Linear API",
        requester: "support-bot",
        digest: createHash("sha256").update("linear").digest("hex"),
        args: { source: "linear", name: "Linear", scan: { injection: 0, risk: "medium" } },
        status: "waiting",
        approvers: [],
        expiresAt: new Date(Date.now() + 864e5).toISOString(),
        requiredApprovals: 1,
      },
      {
        id: "rev_decision",
        kind: "decision",
        title: "Billing question or refund request?",
        requester: "ticket-triage",
        digest: createHash("sha256").update("ticket").digest("hex"),
        args: { ticket: "t_100" },
        status: "waiting",
        approvers: [],
        expiresAt: new Date(Date.now() + 864e5).toISOString(),
        requiredApprovals: 1,
      },
    ],
    audit,
    auditBroken: false,
    auditRestoreAdmins: [],
    hourlyRoots: Object.fromEntries(
      audit.filter((e) => e.hourlyRoot).map((e) => [e.at.slice(0, 13), e.hourlyRoot!]),
    ),
    sessions: [],
    events: [],
    streamCursor: null,
    eventTypeCounts24h: {},
    subscriptions: [],
    webhookSigningSecret: "whsec_test_acme",
    inboundWebhookStats: { accepted: 0, rejected: 0, replays: 0 },
    seenInboundIds: new Set(),
    documents: [],
    memoryNotes: [
      {
        id: "mem_northwind",
        title: "Northwind renewal",
        body: "Northwind Partners renews Q4; governing_law=Delaware",
        owner: "Dana Reyes",
        acl: ["Legal", "owner"],
        personal: false,
        stale: false,
        erased: false,
        fields: { counterparty: "Northwind Partners", governing_law: "Delaware" },
        history: ["created"],
      },
      {
        id: "mem_stale",
        title: "Old note",
        body: "Stale vendor chatter",
        owner: "Marcus Lee",
        acl: ["Legal"],
        personal: false,
        stale: true,
        erased: false,
        fields: {},
        history: ["created"],
      },
      {
        id: "mem_jane",
        title: "Jane Okafor contact",
        body: "Jane Okafor jane.okafor@example.com",
        owner: "Dana Reyes",
        acl: ["Legal"],
        personal: false,
        stale: false,
        erased: false,
        fields: { email: "jane.okafor@example.com" },
        history: ["created"],
      },
      {
        id: "mem_dana_personal",
        title: "Dana personal GH gist",
        body: "private gist content",
        owner: "Dana Reyes",
        acl: ["Dana Reyes"],
        personal: true,
        stale: false,
        erased: false,
        fields: {},
        history: ["created"],
      },
    ],
    schemaFields: [
      { name: "counterparty", since: "2024-01-01" },
      { name: "governing_law", since: "2025-03-01" },
      { name: "auto_renews", suggested: true },
    ],
    skills: [
      {
        id: "refund-duplicate-charge",
        stage: "proving",
        name: "refund-duplicate-charge",
        failed: true,
        failReason: "Failed a check — undeclared host",
        hosts: ["api.stripe.com", "evil.example"],
      },
      {
        id: "reconcile-amendment",
        stage: "proving",
        name: "reconcile-amendment",
        writing: true,
        hosts: ["crm.acme.example"],
        ops: ["crm.contracts.adjust"],
      },
    ],
    connections: [
      {
        id: "github",
        name: "GitHub",
        groups: ["Engineering"],
        status: "connected",
        risk: { write: 2, delete: 1 },
      },
      {
        id: "jira",
        name: "Jira",
        groups: [],
        status: "connected",
        risk: { write: 3, delete: 1 },
      },
      {
        id: "linear",
        name: "Linear",
        groups: [],
        status: "waiting-review",
        risk: { write: 2, delete: 0 },
      },
      {
        id: "stripe",
        name: "Stripe",
        groups: ["Support", "Legal"],
        status: "connected",
      },
    ],
    gateUnreachable: false,
    infoFlowUnreachable: false,
    hardStop: false,
    monthSpentCents: 128_400,
    monthBudgetCents: 300_000,
    teamBudgets: {
      Legal: { spent: 40_000, cap: 100_000 },
      Support: { spent: 20_000, cap: 80_000 },
      Engineering: { spent: 50_000, cap: 120_000 },
      Operations: { spent: 18_400, cap: 60_000 },
    },
    creditsCents: 0,
    invoiceCard: "4242",
    invoices: [{ id: "inv_001", amountCents: 9900, pdf: "INV-001.pdf" }],
    alerts: [],
    redaction: { phone: true, email: true, bank: true, cardAlways: true },
    allowedWebhookHosts: [
      "hooks.slack.com",
      "chatgpt.com",
      "finance.acme.example",
      "hooks.example.com",
    ],
    allowedOutboundHosts: [
      "api.github.com",
      "api.stripe.com",
      "hooks.slack.com",
      "crm.acme.example",
      "hooks.example.com",
    ],
    ipAllowlist: null,
    requestExpiryMinutes: 30,
    idleTimeoutMinutes: 30,
    maxSessionMinutes: 12 * 60,
    auditRetentionYears: 1,
    requesterCannotApproveLocked: true,
    requiredApprovalsDefault: 1,
    allowedAuthenticatorAaguids: ["aagu_yubi5", "aagu_yubi5c"],
    usedMandateSignatures: new Set(),
    usedApprovalPayloads: new Set(),
    erasedSubjects: [],
    eraseJobs: [],
    decisionSites: {
      "pii-check": { mode: "trusted", count7d: 0, labels: { clear: 0, escalate: 0 } },
      "tool-routing": { mode: "reproving", count7d: 0, labels: { escalate: 0 } },
      "ticket-triage": {
        mode: "trusted",
        count7d: 0,
        labels: { "Refund request": 0, "Billing question": 0 },
      },
    },
    modelRoutes: {
      standard: {
        primary: "Claude Sonnet 4.6",
        fallback: "GPT-4.1",
        primaryBroken: false,
        usingFallback: false,
        fallbackCount: 0,
        private: false,
      },
      frugal: {
        primary: "Haiku",
        fallback: "GPT-4.1-mini",
        primaryBroken: false,
        usingFallback: false,
        fallbackCount: 0,
        private: false,
      },
      private: {
        primary: "local-llama",
        primaryBroken: false,
        usingFallback: false,
        fallbackCount: 0,
        private: true,
      },
    },
    stripeProvisioningDone: true,
    homeNeedsAction: 3,
    reviewBadge: 3,
    sidebarBadge: 3,
    notificationsOutbox: [],
    trainingExports: [
      {
        id: "exp_sep12",
        date: "2025-09-12",
        needsRegenerate: false,
        subjects: ["Jane Okafor"],
      },
    ],
    blockedCalls: [],
    signedInUserId: "user_dana",
    lumenFreightDenied: true,
    authAttempts: { signin: 0, apikey: 0 },
  };
}

const g = globalThis as unknown as { __clawqlE2eWorld?: World };
if (!g.__clawqlE2eWorld) g.__clawqlE2eWorld = seedWorld();

export function e2eEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLAWQL_E2E_HARNESS === "1" || env.CLAWQL_CONSOLE_SURFACE === "managed";
}

export function getWorld(): World {
  return g.__clawqlE2eWorld!;
}

export function resetWorld(): World {
  g.__clawqlE2eWorld = seedWorld();
  return g.__clawqlE2eWorld;
}

export function appendAudit(
  actor: string,
  action: string,
  outcome: string,
  meta?: Record<string, unknown>,
): E2eAuditEntry {
  const world = getWorld();
  const prev = world.audit[world.audit.length - 1]?.hash ?? "genesis";
  const id = `wrm_${1000 + world.audit.length}`;
  const at = new Date().toISOString();
  const payload = JSON.stringify({ id, at, actor, action, outcome, meta });
  const hash = hashChain(prev, payload);
  const hour = at.slice(0, 13);
  const hourlyRoot = createHash("sha256").update(`${hour}:${hash}`).digest("hex");
  const entry: E2eAuditEntry = {
    id,
    at,
    actor,
    action,
    outcome,
    prevHash: prev,
    hash,
    meta,
    hourlyRoot,
  };
  world.audit.push(entry);
  world.hourlyRoots[hour] = hourlyRoot;
  if (world.auditBroken) {
    // New entries after a break go to a verified segment marker
    entry.meta = { ...meta, segment: "verified-after-break" };
  }
  return entry;
}

export function verifyChain(): {
  ok: boolean;
  entries: number;
  latestRoot: string;
  failedAt?: string;
} {
  const world = getWorld();
  let prev = "genesis";
  for (const e of world.audit) {
    if (e.tampered) {
      return {
        ok: false,
        entries: world.audit.length,
        latestRoot: e.hash.slice(0, 8),
        failedAt: e.id,
      };
    }
    const payload = JSON.stringify({
      id: e.id,
      at: e.at,
      actor: e.actor,
      action: e.action,
      outcome: e.outcome,
      meta: e.meta,
    });
    const expected = hashChain(prev, payload);
    if (expected !== e.hash || e.prevHash !== prev) {
      return {
        ok: false,
        entries: world.audit.length,
        latestRoot: e.hash.slice(0, 8),
        failedAt: e.id,
      };
    }
    prev = e.hash;
  }
  return {
    ok: true,
    entries: world.audit.length,
    latestRoot: prev.slice(0, 4) + "…" + prev.slice(-4),
  };
}

export function keyByBearer(authHeader: string | null): E2eKey | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  const world = getWorld();
  const map: Record<string, string> = {
    cqk_fixture_legal_ops: "legal-ops",
    cqk_fixture_support_bot: "support-bot",
    cqk_fixture_release_agent: "release-agent",
    cqk_fixture_docs_pipeline: "docs-pipeline",
    cqk_fixture_ci_pipeline: "release-agent",
  };
  const name = map[token] ?? token;
  const key =
    world.keys.find(
      (k) =>
        k.name === name ||
        k.id === name ||
        `cqk_${k.lastFour}` === token ||
        k.secretOnce === token ||
        k.secretToken === token,
    ) ?? null;
  if (!key) return null;
  if (key.revoked) return key;
  if (new Date(key.expiresAt).getTime() < Date.now()) {
    key.revoked = true;
  }
  return key;
}

export function personByName(name: string): E2ePerson | undefined {
  return getWorld().people.find((p) => p.name === name || p.id === name);
}

export function recountReviewBadges(): void {
  const world = getWorld();
  const waiting = world.review.filter((r) => r.status === "waiting").length;
  world.homeNeedsAction = waiting;
  world.reviewBadge = waiting;
  world.sidebarBadge = waiting;
}

export function pushEvent(
  type: string,
  payload: unknown,
  opts?: { inbound?: boolean; untrusted?: boolean; test?: boolean; source?: string },
): E2eEvent {
  const world = getWorld();
  const evt: E2eEvent = {
    id: newId("evt"),
    type,
    payload,
    at: new Date().toISOString(),
    inbound: opts?.inbound,
    untrusted: opts?.untrusted,
    test: opts?.test,
    source: opts?.source,
  };
  world.events.push(evt);
  world.streamCursor = evt.id;
  world.eventTypeCounts24h[type] = (world.eventTypeCounts24h[type] ?? 0) + 1;
  return evt;
}

export function signStandardWebhook(
  secret: string,
  id: string,
  ts: string,
  body: string,
): string {
  const signed = `${id}.${ts}.${body}`;
  const key = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret);
  // Fall back to utf8 secret when base64 decode is empty/invalid for harness secrets
  const keyBuf = key.length > 0 ? key : Buffer.from(secret);
  const b64 = createHmac("sha256", keyBuf).update(signed).digest("base64");
  const hex = createHmac("sha256", Buffer.from(secret)).update(signed).digest("hex");
  return `v1,${b64} v1hex,${hex}`;
}

export function deliveryUrlFor(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const deliver =
    process.env.CLAWQL_E2E_WEBHOOK_DELIVER === "1" || parsed.hostname === "hooks.example.com";
  if (!deliver) return null;
  if (parsed.hostname === "hooks.example.com") {
    const port = process.env.CLAWQL_E2E_WEBHOOK_PORT ?? "4091";
    return `http://127.0.0.1:${port}/hook`;
  }
  return url;
}

export async function deliverEventToSubscriptions(evt: E2eEvent): Promise<void> {
  const world = getWorld();
  for (const sub of world.subscriptions) {
    if (!sub.active || sub.paused || !sub.challengeAccepted) continue;
    if (sub.events.length && !sub.events.includes(evt.type) && !sub.events.includes("*")) {
      continue;
    }
    const target = deliveryUrlFor(sub.url);
    if (!target) continue;
    const body = JSON.stringify({
      id: evt.id,
      type: `com.clawql.${evt.type}`,
      time: evt.at,
      data: evt.payload,
      test: evt.test ?? false,
      source: evt.source,
      inbound: evt.inbound,
      untrusted: evt.untrusted,
    });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = signStandardWebhook(sub.secret || world.webhookSigningSecret, evt.id, ts, body);
    try {
      const res = await fetch(target, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "webhook-id": evt.id,
          "webhook-timestamp": ts,
          "webhook-signature": sig,
        },
        body,
      });
      if (res.status === 410) {
        sub.active = false;
        sub.health = "Stopped";
        sub.stopReason = "Receiver returned 410";
      } else if (res.status >= 500) {
        sub.health = "Failing";
        sub.pendingRetries.push({
          eventId: evt.id,
          type: evt.type,
          payload: evt.payload,
        });
      } else {
        sub.health = "Healthy";
      }
    } catch {
      sub.health = "Failing";
      sub.pendingRetries.push({
        eventId: evt.id,
        type: evt.type,
        payload: evt.payload,
      });
    }
  }
}

export function redactPii(text: string): { text: string; redacted: boolean } {
  const world = getWorld();
  let out = text;
  let redacted = false;
  if (world.redaction.email) {
    const next = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
    if (next !== out) redacted = true;
    out = next;
  }
  if (world.redaction.bank) {
    const next = out.replace(/\b\d{8,17}\b/g, "[REDACTED_BANK]");
    if (next !== out) redacted = true;
    out = next;
  }
  if (world.redaction.phone) {
    const next = out.replace(
      /(?:\+?\d{1,3}[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/g,
      "[REDACTED_PHONE]",
    );
    if (next !== out) redacted = true;
    out = next;
  }
  const card = out.replace(/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED_CARD]");
  if (card !== out) redacted = true;
  out = card;
  // Detect pasted API keys
  if (/cqk_[a-z0-9_]+/i.test(out)) {
    out = out.replace(/cqk_[a-z0-9_]+/gi, "[REDACTED_KEY]");
    redacted = true;
  }
  return { text: out, redacted };
}
