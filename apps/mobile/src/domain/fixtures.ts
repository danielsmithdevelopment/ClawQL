import type {
  ActivityEvent,
  ConnectedApp,
  DeviceSession,
  HomeSpend,
  NotificationPrefs,
  ReviewItem,
  SecurityKey,
  MobileSession,
} from "./schemas";

export const FIXTURE_SESSION: MobileSession = {
  accessToken: "fixture-access-token",
  refreshToken: "fixture-refresh-token",
  userId: "user_fixture_dana",
  email: "dana@acme.example",
  displayName: "Dana Reyes",
  role: "Approver",
  orgId: "org_acme",
  reviewerDemo: false,
  expiresAtMs: Date.now() + 86_400_000,
};

/** App Store / Play reviewer demo — biometric approve path, audit-tagged. */
export const REVIEWER_DEMO_SESSION: MobileSession = {
  ...FIXTURE_SESSION,
  userId: "user_apple_reviewer",
  email: "reviewer@clawql-demo.example",
  displayName: "App Reviewer",
  orgId: "org_clawql_reviewer_demo",
  reviewerDemo: true,
};

export const FIXTURE_REVIEW_ITEMS: readonly ReviewItem[] = [
  {
    id: "rev_skill",
    kind: "skill",
    kindLabel: "SKILL",
    title: "Promote reconcile-amendment",
    badge: "New",
    badgeTone: "ok",
    listMeta: "Learned by legal-ops agent, 2 min ago",
    statusLine: "Ready to promote",
    statusTone: "ok",
    skillSummary: "Learned from 6 sessions by legal-ops agent.",
    skillEvidence: [
      "19 of 20 held-out tasks",
      "Stayed in bounds, 20 runs",
      "12 of 12 adversarial runs",
      "Code checks clean",
      "Instructions scanned",
    ],
    skillPermissions: {
      reads: "crm.contracts, memory:legal",
      writes: "crm.contracts (amendments)",
      network: "api.acme.example (CRM only)",
      spend: "$2 / run · $40 / day",
    },
  },
  {
    id: "rev_change",
    kind: "change",
    kindLabel: "CHANGE",
    title: "Change a contract's value",
    badge: "MEDIUM risk",
    badgeTone: "warn",
    listMeta: "legal-ops agent, for Priya Shah",
    statusLine: "Expires in 11 min",
    statusTone: "danger",
    changeStatus: "pending",
    operationId: "adjust_contract_value",
    digest: "4e7c…91ab",
    exactChange: [
      { field: "Contract", now: "Northwind MSA ct_4471", after: "—" },
      { field: "Annual value", now: "$48,500.00", after: "$52,000.00" },
      { field: "Effective", now: "Jan 1, 2026", after: "Nov 1, 2026" },
    ],
  },
  {
    id: "rev_change_unknown",
    kind: "change",
    kindLabel: "CHANGE",
    title: "Apply CRM contact merge",
    badge: "Outcome unknown",
    badgeTone: "danger",
    listMeta: "crm-sync agent, for Dana Reyes",
    statusLine: "Consumed >60s ago · no finalize",
    statusTone: "danger",
    changeStatus: "outcome_unknown",
    idempotencyCapable: true,
    idempotencyKey: "idem_crm_merge_4821",
    needsOutcomeAttention: true,
    operationId: "merge_contacts",
    digest: "9a1f…c2e0",
    exactChange: [
      { field: "Primary", now: "ct_1201", after: "ct_1201 (keep)" },
      { field: "Duplicate", now: "ct_1888", after: "merged → ct_1201" },
    ],
  },
  {
    id: "rev_source",
    kind: "source",
    kindLabel: "NEW SOURCE",
    title: "Add the Linear API",
    badge: "Proposed by an agent",
    badgeTone: "neutral",
    listMeta: "support-bot, 41 min ago",
    statusLine: "No expiry",
    statusTone: "neutral",
  },
  {
    id: "rev_decision",
    kind: "decision",
    kindLabel: "DECISION",
    title: "Billing question or refund request?",
    badge: "Unsure",
    badgeTone: "warn",
    listMeta: "ticket-triage, 52 min ago",
    statusLine: "For the Support group",
    statusTone: "neutral",
    decisionSite: "ticket-triage",
    decisionQuote: 'Ticket #48213: "I was charged twice for October — can you fix this?"',
    decisionChoices: [
      { label: "Billing question", score: "0.48" },
      { label: "Refund request", score: "0.44" },
      { label: "Account access", score: "0.05" },
      { label: "Other", score: "0.03" },
    ],
  },
];

export const FIXTURE_SPEND: HomeSpend = {
  label: "Today's spend",
  amount: "$128.40",
  note: "Across 3 agents · budget $500/day",
};

export const FIXTURE_KEYS: readonly SecurityKey[] = [
  {
    id: "key_yubi_nfc",
    name: "YubiKey 5 NFC",
    badge: "Can approve",
    detail: "Your everyday key. Added Mar 3, last used today at 09:12.",
    canApprove: true,
  },
  {
    id: "key_yubi_backup",
    name: "YubiKey 5C, backup",
    badge: "Can approve",
    detail: "Kept somewhere safe. Added Mar 3, last used Aug 21.",
    canApprove: true,
  },
  {
    id: "key_passkey",
    name: "iCloud Keychain passkey",
    badge: "Sign-in only",
    detail: "Syncs across your Apple devices, so it can't approve. Last used today at 08:40.",
    canApprove: false,
  },
];

export const FIXTURE_CONNECTED_APPS: readonly ConnectedApp[] = [
  {
    clientId: "cursor-ide",
    name: "Cursor",
    scopes: ["execute", "search", "memory"],
    lastUsed: "Today at 09:40",
  },
  {
    clientId: "claude-desktop",
    name: "Claude Desktop",
    scopes: ["execute", "search"],
    lastUsed: "Yesterday",
  },
];

export const FIXTURE_NOTIFICATION_PREFS: NotificationPrefs = {
  push: true,
  slack: true,
  email: false,
  morningDigest: true,
};

export const FIXTURE_DEVICE_SESSIONS: readonly DeviceSession[] = [
  {
    id: "sess_this_phone",
    device: "This iPhone",
    path: "ClawQL app · fixture",
    current: true,
    lastActive: "Now",
    ended: false,
  },
  {
    id: "sess_mac_chrome",
    device: "Mac · Chrome",
    path: "cloud.clawql.com",
    current: false,
    lastActive: "Today at 09:12",
    ended: false,
  },
  {
    id: "sess_ipad",
    device: "iPad · Safari",
    path: "cloud.clawql.com",
    current: false,
    lastActive: "Yesterday",
    ended: false,
  },
];

/** Seed activity so Home / Activity tabs are never empty on first open. */
export const FIXTURE_ACTIVITY: readonly ActivityEvent[] = [
  {
    id: "act_seed_1",
    atMs: Date.now() - 3_600_000,
    title: "Approved Linear source proposal",
    detail: "nfc_security_key · digest a91c…",
    kind: "source",
    decision: "approve",
    reviewId: "rev_source_prior",
  },
  {
    id: "act_seed_2",
    atMs: Date.now() - 7_200_000,
    title: "Answered ticket-triage",
    detail: "Refund request",
    kind: "decision",
    decision: "answer",
    reviewId: "rev_decision_prior",
  },
];
