import type {
  ActivityEvent,
  AgentSummary,
  ApprovalPolicy,
  ApprovalPolicyDetail,
  ConnectedApp,
  DeviceSession,
  HomeSpend,
  InboxItem,
  MorningDigest,
  DevicePrefs,
  NotificationPrefs,
  OrgSummary,
  ReviewItem,
  SecurityKey,
  Teammate,
  MobileSession,
  WorkflowProgram,
  MemoryResult,
  MemoryField,
  ApiKeyItem,
  GatewayEndpoint,
  AutomationSub,
  AuditEntry,
  AuditIncident,
  OrgSettings,
  OrgSettingsBundle,
  AgentSession,
  ProposedSkill,
  ActiveSkill,
  ConnectionItem,
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

export const FIXTURE_ORG: OrgSummary = {
  orgId: "org_acme",
  name: "Acme",
  plan: "Team",
  role: "Approver",
  members: "12 people · 4 agents",
};

export const FIXTURE_SPEND: HomeSpend = {
  label: "Today's spend",
  amount: "$128.40",
  note: "Across 3 agents · budget $500/day",
  budget: "$500/day",
  lines: [
    { agent: "legal-ops", amount: "$62.10", note: "CRM amendments · 14 runs" },
    { agent: "ticket-triage", amount: "$41.20", note: "Support decisions · 38 runs" },
    { agent: "crm-sync", amount: "$25.10", note: "Contact merges · 6 runs" },
  ],
};

export const FIXTURE_AGENTS: readonly AgentSummary[] = [
  {
    id: "agent_legal",
    name: "legal-ops",
    role: "CRM contract amendments",
    status: "needs_you",
    statusLabel: "1 waiting on you",
    lastRun: "4 min ago",
    spendToday: "$62.10",
    waiting: 1,
  },
  {
    id: "agent_triage",
    name: "ticket-triage",
    role: "Support decisions",
    status: "active",
    statusLabel: "Running",
    lastRun: "Just now",
    spendToday: "$41.20",
  },
  {
    id: "agent_crm",
    name: "crm-sync",
    role: "Contact merges",
    status: "paused",
    statusLabel: "Paused overnight",
    lastRun: "Last night",
    spendToday: "$25.10",
  },
  {
    id: "agent_support",
    name: "support-bot",
    role: "Source proposals",
    status: "active",
    statusLabel: "Idle · awaiting work",
    lastRun: "1h ago",
    spendToday: "$0.00",
  },
];

export const FIXTURE_DIGEST: MorningDigest = {
  headline: "Overnight from your agents",
  whenLabel: "Today · 7:00 AM digest",
  summary: "3 agents ran · 2 decisions answered · 1 source approved · $38.20 overnight spend",
  awaitingYou: 4,
  items: [
    {
      id: "dig_1",
      title: "ticket-triage answered 12 tickets",
      detail: "Refund vs billing · no escalations left open",
      tone: "ok",
    },
    {
      id: "dig_2",
      title: "legal-ops paused on a contract write",
      detail: "adjust_contract_value · waiting on Contract approvers",
      tone: "warn",
    },
    {
      id: "dig_3",
      title: "support-bot proposed Linear",
      detail: "Approved earlier · digest a91c…",
      tone: "ok",
    },
    {
      id: "dig_4",
      title: "crm-sync hit spend caution",
      detail: "Approaching 60% of daily budget before noon",
      tone: "neutral",
    },
  ],
};

export const FIXTURE_TEAMMATES: readonly Teammate[] = [
  {
    id: "user_dana",
    name: "Dana Reyes",
    email: "dana@acme.example",
    role: "Approver",
    groups: ["Contract approvers", "Admins"],
    canApprove: true,
    keysReady: true,
    lastActive: "Now · this phone",
  },
  {
    id: "user_marcus",
    name: "Marcus Lee",
    email: "marcus@acme.example",
    role: "Approver",
    groups: ["Contract approvers", "Source approvers"],
    canApprove: true,
    keysReady: true,
    lastActive: "Today at 08:55",
  },
  {
    id: "user_priya",
    name: "Priya Shah",
    email: "priya@acme.example",
    role: "Requester",
    groups: ["Support group"],
    canApprove: false,
    keysReady: false,
    lastActive: "Yesterday",
  },
  {
    id: "user_jordan",
    name: "Jordan Kim",
    email: "jordan@acme.example",
    role: "Approver",
    groups: ["Source approvers"],
    canApprove: true,
    keysReady: false,
    lastActive: "3 days ago",
  },
];

export const FIXTURE_INBOX: readonly InboxItem[] = [
  {
    id: "inbox_1",
    title: "legal-ops needs a security key",
    body: "Change a contract's value · expires in 11 min",
    atMs: Date.now() - 120_000,
    kind: "approval",
    reviewId: "rev_change",
    unread: true,
  },
  {
    id: "inbox_2",
    title: "Morning digest is ready",
    body: "3 agents ran overnight · 4 still waiting on you",
    atMs: Date.now() - 3_600_000,
    kind: "digest",
    unread: true,
  },
  {
    id: "inbox_3",
    title: "Skill ready to promote",
    body: "reconcile-amendment · learned by legal-ops",
    atMs: Date.now() - 7_200_000,
    kind: "approval",
    reviewId: "rev_skill",
    unread: false,
  },
  {
    id: "inbox_4",
    title: "Backup key reminder",
    body: "Keep a second key that can approve — passkeys can't.",
    atMs: Date.now() - 86_400_000,
    kind: "system",
    unread: true,
  },
];

export const FIXTURE_POLICIES: readonly ApprovalPolicy[] = [
  {
    id: "pol_contracts",
    when: "Writes to contracts",
    whenDetail: "MEDIUM risk, CRM",
    who: "Contract approvers",
    approvals: "1",
    securityKey: "Required",
    waits: "30 minutes",
  },
  {
    id: "pol_writes",
    when: "Any other write",
    whenDetail: "Every connection",
    who: "Admins",
    approvals: "1",
    securityKey: "Required",
    waits: "30 minutes",
  },
  {
    id: "pol_sources",
    when: "New sources from agents",
    whenDetail: "",
    who: "Source approvers",
    approvals: "1",
    securityKey: "Required",
    waits: "No limit",
  },
  {
    id: "pol_skill_write",
    when: "Skill promotions that write",
    whenDetail: "",
    who: "Approvers for what it writes",
    approvals: "1",
    securityKey: "Required",
    waits: "No limit",
  },
  {
    id: "pol_triage",
    when: "ticket-triage decisions",
    whenDetail: "",
    who: "Support group",
    approvals: "1",
    securityKey: "Not needed",
    waits: "Until answered",
  },
  {
    id: "pol_block",
    when: "Deletes and payments",
    whenDetail: "",
    who: "Always blocked",
    approvals: "—",
    securityKey: "—",
    waits: "—",
    blocked: true,
    blockedNote:
      "No one can approve these for an agent. Allowlist a single operation in Connections if you must.",
  },
];

export const FIXTURE_POLICY_DETAIL: ApprovalPolicyDetail = {
  id: "pol_contracts",
  title: "Writes to contracts",
  lastChanged: "Last changed by Dana Reyes, Sep 14.",
  appliesTo: "MEDIUM-risk writes on CRM contracts",
  appliesHelp: "Covers 6 operations, including adjust_contract_value.",
  whoApproves: "Contract approvers (2 people)",
  whoHelp: "Dana Reyes, Marcus Lee. Managed in Team.",
  approvalsNeeded: "1",
  expiresAfter: "30 minutes",
  expiresHelp: "Expired requests close without changing anything.",
  requireSecurityKey: true,
  notify: "Phone push, Slack",
};

/** Seed archive so Activity / Home drill-in works before any new decisions. */
export const FIXTURE_DECIDED: readonly ReviewItem[] = [
  {
    id: "rev_source_prior",
    kind: "source",
    kindLabel: "NEW SOURCE",
    title: "Add the Linear API",
    badge: "Approved",
    badgeTone: "ok",
    listMeta: "support-bot · decided earlier today",
    statusLine: "Approved with security key",
    statusTone: "ok",
    decidedAtMs: Date.now() - 3_600_000,
    decidedStatus: "approve",
    digest: "a91c…e4f2",
  },
  {
    id: "rev_decision_prior",
    kind: "decision",
    kindLabel: "DECISION",
    title: "Billing question or refund request?",
    badge: "Answered",
    badgeTone: "ok",
    listMeta: "ticket-triage · Support group",
    statusLine: "Refund request",
    statusTone: "ok",
    decidedAtMs: Date.now() - 7_200_000,
    decidedStatus: "answer",
    decisionSite: "ticket-triage",
    decisionQuote: 'Ticket #48102: "Can I get October refunded?"',
    decisionChoices: [
      { label: "Billing question", score: "0.41" },
      { label: "Refund request", score: "0.52" },
      { label: "Other", score: "0.07" },
    ],
  },
];

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

export const FIXTURE_DEVICE_PREFS: DevicePrefs = {
  appLock: false,
  haptics: true,
  iconBadge: true,
  voiceAssistant: true,
  voiceSpeak: true,
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

/** Console Memory explorer (MEMORY_RESULTS). */
export const FIXTURE_MEMORY_RESULTS: readonly MemoryResult[] = [
  {
    id: "ct_4471",
    kind: "ENTITY",
    title: "CONTRACT — Northwind MSA",
    summary: "Annual value $48,500.00 · Renews Jan 1, 2026",
    badge: "Entity",
    badgeTone: "neutral",
  },
  {
    id: "doc_amend2",
    kind: "DOCUMENT",
    title: "Northwind MSA Amendment 2.pdf",
    summary: "Processed 09:41 · 12 fields, 2 redacted",
    badge: "Document",
    badgeTone: "neutral",
  },
  {
    id: "note_pricing",
    kind: "NOTE",
    title: "Northwind pricing history",
    summary: "Verified · from CRM + Amendment 2",
    badge: "Verified",
    badgeTone: "ok",
  },
  {
    id: "note_checklist",
    kind: "NOTE",
    title: "Vendor renewal checklist",
    summary: "Not verified · proposed by research agent",
    badge: "Not verified",
    badgeTone: "warn",
  },
];

export const FIXTURE_MEMORY_FIELDS: readonly MemoryField[] = [
  {
    field: "Counterparty",
    value: "Northwind Partners",
    source: "CRM record",
    confidence: "Extracted",
    tone: "ok",
  },
  {
    field: "Annual value",
    value: "$48,500.00 (change pending)",
    source: "CRM record",
    confidence: "Extracted",
    tone: "ok",
  },
  {
    field: "Renewal date",
    value: "Jan 1, 2026",
    source: "CRM record",
    confidence: "Extracted",
    tone: "ok",
  },
  {
    field: "Escrow percentage",
    value: "10%",
    source: "Pricing history note",
    confidence: "Inferred",
    tone: "warn",
  },
  {
    field: "Signatory email",
    value: "Redacted",
    source: "Amendment 2…",
    confidence: "Personal data",
    tone: "neutral",
  },
];

/** Gateway API keys (console API_KEYS) — mutable copy lives in api stateRef. */
export const FIXTURE_API_KEYS: readonly ApiKeyItem[] = [
  {
    id: "key_billing",
    name: "billing-sync",
    endsIn: "9f1c",
    expiresLabel: "Jan 3, 2027",
    keyGroup: "Operations",
    canUse: "Models, tools",
    dailyCap: "$50",
    lastUsed: "10:14",
  },
  {
    id: "key_experiments",
    name: "experiments",
    endsIn: "a2e4",
    expiresLabel: "Nov 2",
    keyGroup: "Engineering",
    canUse: "Models",
    dailyCap: "$20",
    lastUsed: "07:30",
    capReached: true,
    expiresHighlight: true,
  },
  {
    id: "key_legal",
    name: "legal-ops",
    endsIn: "7d02",
    expiresLabel: "Nov 30",
    keyGroup: "Legal",
    canUse: "Models, tools, memory",
    dailyCap: "$75",
    lastUsed: "09:22",
  },
  {
    id: "key_docs",
    name: "docs-pipeline",
    endsIn: "11af",
    expiresLabel: "Feb 1, 2027",
    keyGroup: "Operations",
    canUse: "Models, tools, memory",
    dailyCap: "$45",
    lastUsed: "09:41",
  },
];

export const FIXTURE_GATEWAY_ENDPOINTS: readonly GatewayEndpoint[] = [
  { path: "/v1", description: "OpenAI-compatible inference" },
  { path: "/mcp", description: "Every connected tool for MCP clients (Claude, Cursor, …)" },
  { path: "/memory", description: "Ingest, search, and erase team memory" },
  { path: "/decision", description: "Fast, calibrated decisions (System One compatible)" },
  { path: "/events", description: "Subscribe by webhook or stream live events" },
];

export const FIXTURE_AUTOMATIONS: readonly AutomationSub[] = [
  {
    id: "sec_slack",
    name: "Security alerts to Slack",
    target: "hooks.slack.com",
    events: "hook.blocked, budget.exhausted",
    via: "Webhook",
    last: "Yesterday 18:02",
    health: "Failing",
    tone: "danger",
  },
  {
    id: "renewals",
    name: "Contract renewals",
    target: "ChatGPT automation",
    events: "document.processed, contracts only",
    via: "Webhook",
    last: "09:41",
    health: "Healthy",
    tone: "ok",
  },
  {
    id: "finance",
    name: "Finance digest",
    target: "finance.acme.example",
    events: "schedule.completed",
    via: "Webhook",
    last: "08:55",
    health: "Healthy",
    tone: "ok",
  },
];

export const FIXTURE_AUDIT_ENTRIES: readonly AuditEntry[] = [
  {
    id: "wrm_4912",
    time: "09:41:02",
    actor: "docs-pipeline",
    action: "document.processed Q3 vendor contract",
    outcome: "12 fields, 2 redacted",
    tone: "ok",
  },
  {
    id: "wrm_4911",
    time: "09:38:12",
    actor: "support-bot",
    action: "payments.transfer",
    outcome: "Blocked by policy",
    tone: "danger",
  },
  {
    id: "wrm_4910",
    time: "09:31:44",
    actor: "Dana Reyes",
    action: "review.approve Linear source",
    outcome: "nfc_security_key",
    tone: "ok",
  },
];

export const FIXTURE_ORG_SETTINGS: OrgSettings = {
  name: "Acme Robotics",
  consoleAddress: "acme.cloud.clawql.com",
  dataRegion: "United States",
  timeZone: "Pacific Time (Los Angeles)",
  securityContact: "security@acme.example",
};

export const FIXTURE_ORG_SETTINGS_BUNDLE: OrgSettingsBundle = {
  org: FIXTURE_ORG_SETTINGS,
  webhookHosts: [
    { host: "hooks.slack.com", subscriptions: 1 },
    { host: "chatgpt.com", subscriptions: 2 },
    { host: "finance.acme.example", subscriptions: 1 },
  ],
  egressDomains: [
    "api.github.com",
    "acme.atlassian.net",
    "slack.com",
    "api.stripe.com",
    "crm.acme.example",
  ],
  retention: [
    {
      label: "Audit log",
      help: "Can be extended, never shortened below 1 year.",
      value: "7 years",
    },
    {
      label: "Session transcripts",
      help: "The steps behind each session in Sessions.",
      value: "90 days",
    },
    {
      label: "Memory and documents",
      help: "Kept until someone deletes or erases them.",
      value: "Until erased",
      locked: true,
    },
  ],
};

export const FIXTURE_AUDIT_INCIDENT: AuditIncident = {
  entryId: "wrm_4877",
  incidentId: "inc_1005_01",
  foundAt: "03:15 today",
  summary:
    "One stored entry, wrm_4877, was changed after it was written. Found by the scheduled check at 03:15 today.",
  explanation:
    "ClawQL doesn't edit entries. Someone with write access to the log storage, or a storage corruption, changed this one.",
  paymentNote:
    "The record was altered to show a blocked payment as allowed. The payment itself never ran.",
};

export const FIXTURE_AGENT_SESSIONS: readonly AgentSession[] = [
  {
    id: "sess_7f2a91c4",
    name: "legal-ops agent",
    meta: "Claude Code, Priya Shah, started 09:22",
    stats: "34 tool calls, $1.82, active for 19 min",
    status: "Waiting on a person",
    tone: "warn",
    active: true,
  },
  {
    id: "sess_support",
    name: "support-bot",
    meta: "ChatGPT, service agent, started 09:31",
    stats: "12 tool calls, $0.41, active for 10 min",
    status: "Blocked call",
    tone: "danger",
    active: true,
  },
  {
    id: "sess_docs",
    name: "docs-pipeline",
    meta: "Codex, service agent, started 09:40",
    stats: "6 tool calls, $0.22, active for 1 min",
    status: "Running",
    tone: "ok",
    active: true,
  },
  {
    id: "sess_release",
    name: "release-agent",
    meta: "Cursor, Marcus Lee, started 08:47",
    stats: "58 tool calls, $2.95, ran 42 min",
    status: "Completed",
    tone: "neutral",
    active: false,
  },
];

export const FIXTURE_PROPOSED_SKILLS: readonly ProposedSkill[] = [
  {
    id: "contract-redline-check",
    name: "contract-redline-check",
    description:
      "Compares a counterparty's redlines against your standard terms and lists what changed.",
    attribution: "Proposed by legal-ops agent after 7 similar sessions. Read only.",
    canProve: true,
  },
  {
    id: "summarize-pr-risk",
    name: "summarize-pr-risk",
    description: "Rates a pull request's risk from the files it touches and its test coverage.",
    attribution: "Proposed by release-agent after 9 similar sessions. Read only.",
    canProve: true,
  },
  {
    id: "linear-issue-sync",
    name: "linear-issue-sync",
    description: "Keeps support tickets and Linear issues in step.",
    attribution: "Proposed by support-bot after 4 similar sessions. Writes, with a mandate.",
    canProve: false,
    blocker: "Waiting on the Linear connection, now in Review",
    blockerTone: "warn",
  },
];

export const FIXTURE_ACTIVE_SKILLS: readonly ActiveSkill[] = [
  {
    id: "standup-digest",
    name: "standup-digest",
    description: "Posts a daily summary to Slack",
    keyGroup: "Operations",
    touchesLabel: "Writes, with a mandate",
    runs7d: 5,
  },
  {
    id: "ticket-summary",
    name: "ticket-summary",
    description: "Summarizes a support thread for handoff",
    keyGroup: "Support",
    touchesLabel: "Read only",
    runs7d: 412,
  },
  {
    id: "triage-ci-failure",
    name: "triage-ci-failure",
    description: "Finds the likely cause of a failed build",
    keyGroup: "Engineering",
    touchesLabel: "Read only",
    runs7d: 63,
  },
];

export const FIXTURE_CONNECTIONS: readonly ConnectionItem[] = [
  {
    id: "github",
    name: "GitHub",
    summary: "2 accounts: work, personal",
    lastUsed: "09:20",
    status: "needs-signin",
    statusLabel: "1 needs sign-in",
    accounts: [
      {
        id: "gh_work",
        handle: "dana-acme",
        ownershipLabel: "Org data",
        detail: "OAuth sign-in expired at 08:58. The acme/web watch is paused.",
        action: "reconnect",
        alert: true,
      },
      {
        id: "gh_personal",
        handle: "danareyes",
        ownershipLabel: "Private to Dana",
        detail: "Connected, last used yesterday",
        action: "manage",
      },
    ],
    ops: { readsAllowed: 604, writesMandate: 431, deletesBlocked: 47 },
    usedBy: ["release-agent key", "New pull requests automation"],
  },
  {
    id: "slack",
    name: "Slack",
    summary: "Acme workspace",
    lastUsed: "08:12",
    status: "connected",
    statusLabel: "Connected",
    accounts: [],
    ops: { readsAllowed: 120, writesMandate: 40, deletesBlocked: 0 },
    usedBy: ["Operations key group"],
  },
  {
    id: "linear",
    name: "Linear",
    summary: "Proposed by support-bot",
    lastUsed: "Not connected yet",
    status: "waiting-review",
    statusLabel: "Waiting in Review",
    accounts: [],
    ops: { readsAllowed: 0, writesMandate: 0, deletesBlocked: 0 },
    usedBy: [],
  },
  {
    id: "stripe",
    name: "Stripe",
    summary: "Read-only access",
    lastUsed: "yesterday",
    status: "connected",
    statusLabel: "Connected",
    accounts: [],
    ops: { readsAllowed: 64, writesMandate: 0, deletesBlocked: 12 },
    usedBy: ["billing-sync key"],
  },
];

/** Console-parity workflows the voice assistant can list / start (fixture). */
export const FIXTURE_WORKFLOWS: readonly WorkflowProgram[] = [
  {
    id: "weekly-spend-digest",
    name: "weekly-spend-digest",
    title: "Weekly spend digest",
    summary: "Summarizes weekly spend for finance and posts a digest.",
    stage: "proving",
  },
  {
    id: "standup-digest",
    name: "standup-digest",
    title: "Standup digest",
    summary: "Posts a daily summary to Slack.",
    stage: "active",
  },
  {
    id: "intake-msa",
    name: "intake-msa",
    title: "MSA intake",
    summary: "Normalizes MSA intake fields into the CRM.",
    stage: "active",
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
