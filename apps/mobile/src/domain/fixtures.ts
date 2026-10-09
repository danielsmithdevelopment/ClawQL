import type {
  ConnectedApp,
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
