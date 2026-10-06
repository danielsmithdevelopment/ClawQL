/** Fixture data for Review, Gateway, Skills, Memory, Audit, Team, Sessions, Automations, Settings, Profile. */

export type ReviewKind = "change" | "source" | "decision" | "skill";

export type ReviewItem = {
  readonly id: string;
  readonly kind: ReviewKind;
  readonly kindLabel: string;
  readonly title: string;
  readonly badge: string;
  readonly badgeTone: "warn" | "neutral" | "ok" | "danger";
  readonly listMeta: string;
  readonly statusLine: string;
  readonly statusTone: "ok" | "warn" | "danger" | "neutral";
};

export const REVIEW_ITEMS: readonly ReviewItem[] = [
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

export type DecisionSiteStage = "exploring" | "proving" | "trusted" | "re-proving";

export type DecisionSite = {
  readonly id: string;
  readonly name: string;
  readonly model: string;
  readonly stage: DecisionSiteStage;
  readonly stageLabel: string;
  readonly answers: string;
  readonly calls7d: string;
  readonly description: string;
};

export const DECISION_SITES: readonly DecisionSite[] = [
  {
    id: "tool-routing",
    name: "tool-routing",
    model: "GLINER2 Decide",
    stage: "re-proving",
    stageLabel: "Re-proving",
    answers: "None while re-proving",
    calls7d: "48,210",
    description:
      "Picks which tool handles each agent request. Wrong answers cost more than escalations, so it only answers when it's sure.",
  },
  {
    id: "pii-check",
    name: "pii-check",
    model: "GLINER2 Decide",
    stage: "trusted",
    stageLabel: "Trusted",
    answers: "81% of calls, 0 wrong in evaluation",
    calls7d: "22,904",
    description: "Flags personal data before it leaves the org boundary.",
  },
  {
    id: "contract-risk",
    name: "contract-risk",
    model: "Tev1 4B, local",
    stage: "proving",
    stageLabel: "Proving",
    answers: "Evaluation running",
    calls7d: "1,408",
    description: "Scores contract risk language before a person is asked.",
  },
  {
    id: "ticket-triage",
    name: "ticket-triage",
    model: "Nimble 9B, local",
    stage: "exploring",
    stageLabel: "Exploring",
    answers: "112 of 300 labels gathered",
    calls7d: "3,377",
    description: "Routes support tickets when the site isn't sure yet.",
  },
];

export const GATEWAY_ROUTES = [
  {
    id: "standard",
    label: "standard",
    chain: "Claude Sonnet 4.6 → GPT-4o",
    status: "Healthy" as const,
    tone: "ok" as const,
  },
  {
    id: "frugal",
    label: "frugal",
    chain: "Gemini 2.5 Flash-Lite → DeepSeek",
    status: "Using fallback",
    tone: "warn" as const,
  },
  {
    id: "private",
    label: "private",
    chain: "Local GPU",
    status: "Healthy" as const,
    tone: "ok" as const,
  },
] as const;

export type SkillStage = "active" | "proving" | "proposed" | "retired";

export type SkillItem = {
  readonly id: string;
  readonly name: string;
  readonly stage: SkillStage;
  readonly badge: string;
  readonly badgeTone: "ok" | "warn" | "danger" | "neutral";
  readonly summary: string;
  readonly description: string;
};

export const SKILLS: readonly SkillItem[] = [
  {
    id: "reconcile-amendment",
    name: "reconcile-amendment",
    stage: "proving",
    badge: "Evidence complete",
    badgeTone: "ok",
    summary: "Learned by legal-ops agent from 6 sessions",
    description:
      "Reads a contract amendment, checks it against the CRM record, and requests the change. Learned from 6 sessions by legal-ops agent.",
  },
  {
    id: "weekly-spend-digest",
    name: "weekly-spend-digest",
    stage: "proving",
    badge: "Testing, 14 of 20",
    badgeTone: "warn",
    summary: "Written by Marcus Lee",
    description: "Summarizes weekly spend for finance and posts a digest.",
  },
  {
    id: "refund-duplicate-charge",
    name: "refund-duplicate-charge",
    stage: "proving",
    badge: "Failed a check",
    badgeTone: "danger",
    summary: "Reached an undeclared host in 1 adversarial run",
    description: "Detects duplicate charges and drafts a refund request.",
  },
  {
    id: "intake-msa",
    name: "intake-msa",
    stage: "active",
    badge: "Active",
    badgeTone: "ok",
    summary: "Promoted 40 days ago",
    description: "Normalizes MSA intake fields into the CRM.",
  },
  {
    id: "draft-renewal-email",
    name: "draft-renewal-email",
    stage: "proposed",
    badge: "Proposed",
    badgeTone: "neutral",
    summary: "Proposed by support-bot",
    description: "Drafts renewal outreach from memory notes.",
  },
  {
    id: "old-invoice-parse",
    name: "old-invoice-parse",
    stage: "retired",
    badge: "Retired",
    badgeTone: "neutral",
    summary: "Drift detected Sep 12",
    description: "Legacy invoice parser — retired after schema drift.",
  },
];

export const MEMORY_RESULTS = [
  {
    id: "ct_4471",
    kind: "ENTITY",
    title: "CONTRACT — Northwind MSA",
    summary: "Annual value $48,500.00 · Renews Jan 1, 2026",
    badge: "Entity",
    badgeTone: "neutral" as const,
  },
  {
    id: "doc_amend2",
    kind: "DOCUMENT",
    title: "Northwind MSA Amendment 2.pdf",
    summary: "Processed 09:41 · 12 fields, 2 redacted",
    badge: "Document",
    badgeTone: "neutral" as const,
  },
  {
    id: "note_pricing",
    kind: "NOTE",
    title: "Northwind pricing history",
    summary: "Verified · from CRM + Amendment 2",
    badge: "Verified",
    badgeTone: "ok" as const,
  },
  {
    id: "note_checklist",
    kind: "NOTE",
    title: "Vendor renewal checklist",
    summary: "Not verified · proposed by research agent",
    badge: "Not verified",
    badgeTone: "warn" as const,
  },
] as const;

export const MEMORY_FIELDS = [
  {
    field: "Counterparty",
    value: "Northwind Partners",
    source: "CRM record",
    confidence: "Extracted",
    tone: "ok" as const,
  },
  {
    field: "Annual value",
    value: "$48,500.00 (change pending)",
    source: "CRM record",
    confidence: "Extracted",
    tone: "ok" as const,
  },
  {
    field: "Renewal date",
    value: "Jan 1, 2026",
    source: "CRM record",
    confidence: "Extracted",
    tone: "ok" as const,
  },
  {
    field: "Escrow percentage",
    value: "10%",
    source: "Pricing history note",
    confidence: "Inferred",
    tone: "warn" as const,
  },
  {
    field: "Signatory email",
    value: "Redacted",
    source: "Amendment 2…",
    confidence: "Personal data",
    tone: "neutral" as const,
  },
] as const;

export const AUDIT_ENTRIES = [
  {
    id: "wrm_4912",
    time: "09:41:02",
    actor: "docs-pipeline",
    action: "document.processed Q3 vendor contract",
    outcome: "12 fields, 2 redacted",
    tone: "ok" as const,
  },
  {
    id: "wrm_4911",
    time: "09:38:12",
    actor: "support-bot",
    action: "payments.transfer",
    outcome: "Blocked by policy",
    tone: "danger" as const,
  },
  {
    id: "wrm_4906",
    time: "09:27:15",
    actor: "legal-ops agent",
    action: "email.send to an outside address",
    outcome: "Blocked by information flow",
    tone: "danger" as const,
  },
  {
    id: "wrm_4905",
    time: "09:26:30",
    actor: "legal-ops agent",
    action: "adjust_contract_value Northwind MSA",
    outcome: "Mandate requested",
    tone: "warn" as const,
  },
  {
    id: "wrm_4903",
    time: "09:25:02",
    actor: "legal-ops agent",
    action: "crm.contracts.get",
    outcome: "Allowed, read",
    tone: "ok" as const,
  },
  {
    id: "wrm_4851",
    time: "Yesterday 17:44",
    actor: "Dana Reyes",
    action: "Memory erased",
    outcome: "Removed from every store; hashed reference kept",
    tone: "neutral" as const,
  },
] as const;

export const TEAM_PEOPLE = [
  {
    id: "dana",
    name: "Dana Reyes",
    email: "dana@acme.example",
    role: "Org admin",
    groups: "Engineering, Legal",
    canApprove: "Contract changes, new sources",
    keys: "2 registered",
    keysTone: "ok" as const,
    lastActive: "Now",
    action: "Edit",
  },
  {
    id: "priya",
    name: "Priya Shah",
    email: "priya@acme.example",
    role: "Member",
    groups: "Legal",
    canApprove: "Nothing",
    keys: "2 registered",
    keysTone: "ok" as const,
    lastActive: "09:22",
    action: "Edit",
  },
  {
    id: "marcus",
    name: "Marcus Lee",
    email: "marcus@acme.example",
    role: "Admin",
    groups: "Engineering",
    canApprove: "Contract changes, new sources",
    keys: "1 registered, needs 2",
    keysTone: "warn" as const,
    lastActive: "08:47",
    action: "Remind",
  },
  {
    id: "jordan",
    name: "Jordan Kim",
    email: "jordan@acme.example",
    role: "Member",
    groups: "Support",
    canApprove: "Ticket-triage decisions",
    keys: "2 registered",
    keysTone: "ok" as const,
    lastActive: "Yesterday",
    action: "Edit",
  },
  {
    id: "sam",
    name: "Sam Ortiz",
    email: "sam@acme.example",
    role: "Auditor",
    groups: "Finance",
    canApprove: "Nothing",
    keys: "Invite sent, expires in 5 days",
    keysTone: "neutral" as const,
    lastActive: "Not yet",
    action: "Resend",
  },
] as const;

export const TEAM_APPROVERS = [
  {
    id: "contract",
    title: "Contract changes",
    summary: "MEDIUM-risk writes to the CRM",
    people: "Dana Reyes, Marcus Lee",
    rule: "1 approval, with a security key, never the requester.",
  },
  {
    id: "sources",
    title: "New sources",
    summary: "APIs agents propose to add",
    people: "Dana Reyes, Marcus Lee",
    rule: "1 approval, with a security key, never the proposer.",
  },
  {
    id: "triage",
    title: "Ticket-triage decisions",
    summary: "When the decision site isn't sure",
    people: "Support group",
    rule: "Anyone in the group, no security key needed.",
  },
] as const;

export const SESSIONS = [
  {
    id: "sess_7f2a91c4",
    name: "legal-ops agent",
    meta: "Claude Code, Priya Shah, started 09:22",
    stats: "34 tool calls, $1.82, active for 19 min",
    status: "Waiting on a person",
    tone: "warn" as const,
    active: true,
  },
  {
    id: "sess_support",
    name: "support-bot",
    meta: "ChatGPT, service agent, started 09:31",
    stats: "12 tool calls, $0.41, active for 10 min",
    status: "Blocked call",
    tone: "danger" as const,
    active: true,
  },
  {
    id: "sess_docs",
    name: "docs-pipeline",
    meta: "Codex, service agent, started 09:40",
    stats: "6 tool calls, $0.22, active for 1 min",
    status: "Running",
    tone: "ok" as const,
    active: true,
  },
  {
    id: "sess_release",
    name: "release-agent",
    meta: "Cursor, Marcus Lee, started 08:47",
    stats: "58 tool calls, $2.95, ran 42 min",
    status: "Completed",
    tone: "neutral" as const,
    active: false,
  },
  {
    id: "sess_finance",
    name: "finance-digest",
    meta: "Schedule, service agent, started 08:55",
    stats: "9 tool calls, $0.12, ran 3 min",
    status: "Completed",
    tone: "neutral" as const,
    active: false,
  },
] as const;

export const AUTOMATION_SUBS = [
  {
    id: "sec_slack",
    name: "Security alerts to Slack",
    target: "hooks.slack.com",
    events: "hook.blocked, budget.exhausted",
    via: "Webhook",
    last: "Yesterday 18:02",
    health: "Failing",
    tone: "danger" as const,
  },
  {
    id: "renewals",
    name: "Contract renewals",
    target: "ChatGPT automation",
    events: "document.processed, contracts only",
    via: "Webhook",
    last: "09:41",
    health: "Healthy",
    tone: "ok" as const,
  },
  {
    id: "ops",
    name: "Ops dashboard",
    target: "2 clients connected",
    events: "All events",
    via: "Live stream",
    last: "09:41",
    health: "Healthy",
    tone: "ok" as const,
  },
  {
    id: "prs",
    name: "New pull requests",
    target: "ChatGPT automation",
    events: "stream.changed, acme/web watch",
    via: "Webhook",
    last: "09:20",
    health: "Paused: source needs sign-in",
    tone: "warn" as const,
  },
  {
    id: "finance",
    name: "Finance digest",
    target: "finance.acme.example",
    events: "schedule.completed",
    via: "Webhook",
    last: "08:55",
    health: "Healthy",
    tone: "ok" as const,
  },
] as const;

export type ApprovalPolicyRow = {
  readonly id: string;
  readonly when: string;
  readonly whenDetail: string;
  readonly who: string;
  readonly approvals: string;
  readonly securityKey: string;
  readonly waits: string;
  readonly blocked?: boolean;
  readonly blockedNote?: string;
};

export const APPROVAL_POLICIES: readonly ApprovalPolicyRow[] = [
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
    id: "pol_skill_read",
    when: "Skill promotions that only read",
    whenDetail: "Internal data, no outside network",
    who: "Automatic when evidence passes",
    approvals: "None",
    securityKey: "Not needed",
    waits: "—",
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
      "No one can approve these for an agent. Allowlist a single operation in Connections & keys if you must.",
  },
];

export const APPROVAL_POLICY_DETAIL = {
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
} as const;

export type WatchedSource = {
  readonly id: string;
  readonly watch: string;
  readonly watchDetail: string;
  readonly checks: string;
  readonly lastChange: string;
  readonly status: string;
  readonly tone: "ok" | "warn" | "danger" | "neutral";
};

export const WATCHED_SOURCES: readonly WatchedSource[] = [
  {
    id: "watch_stripe",
    watch: "Failed payments",
    watchDetail: "Stripe, read-only",
    checks: "Every 5 minutes",
    lastChange: "08:31, 2 new",
    status: "Healthy",
    tone: "ok",
  },
  {
    id: "watch_prs",
    watch: "Open pull requests",
    watchDetail: "GitHub acme/web, work account",
    checks: "Every 2 minutes",
    lastChange: "09:20, 2 new",
    status: "Paused: needs sign-in",
    tone: "warn",
  },
  {
    id: "watch_jira",
    watch: "Current sprint",
    watchDetail: "Jira, Engineering board",
    checks: "Every 10 minutes",
    lastChange: "Yesterday",
    status: "Healthy",
    tone: "ok",
  },
  {
    id: "watch_vendor",
    watch: "Vendor status page",
    watchDetail: "Public API, no sign-in",
    checks: "Every minute",
    lastChange: "Sep 30",
    status: "Healthy",
    tone: "ok",
  },
];

export const WATCHED_SOURCE_DETAIL = {
  id: "watch_stripe",
  title: "Failed payments",
  endpoint: "Stripe GET /v1/charges?status=failed",
  fields: [
    { name: "id", note: undefined },
    { name: "amount", note: undefined },
    { name: "failure_code", note: undefined },
    { name: "customer", note: "redacted" },
  ],
  howFound: "Comparing the watched fields",
  howFoundNote: "Stripe doesn't send ETags for this endpoint.",
  bursts: "Merged within 60 seconds",
  burstsNote: "Two new charges arrived 12 seconds apart.",
  rateLimits: "None hit in 7 days",
  rateLimitsNote: "We back off automatically if a limit is hit.",
  lastChangeAt: "08:31",
  rows: [
    {
      action: "Added",
      id: "ch_3Q8f…a1",
      amount: "$129.00",
      failure: "card_declined",
      customer: "cus_…91",
    },
    {
      action: "Added",
      id: "ch_3Q8g…7c",
      amount: "$49.00",
      failure: "expired_card",
      customer: "cus_…44",
    },
  ],
  footer:
    "Sent as one stream.changed event to 1 subscription: Ops dashboard, the live stream.",
} as const;

export type OntologyType = {
  readonly id: string;
  readonly name: string;
  readonly count: number;
};

export const ONTOLOGY_TYPES: readonly OntologyType[] = [
  { id: "contract", name: "Contract", count: 412 },
  { id: "invoice", name: "Invoice", count: 1904 },
  { id: "customer", name: "Customer", count: 630 },
  { id: "matter", name: "Matter", count: 88 },
  { id: "vendor", name: "Vendor", count: 77 },
];

export const ONTOLOGY_CONTRACT_FIELDS = [
  {
    name: "counterparty",
    required: true,
    type: "Text",
    filled: "100%",
    source: "CRM",
    personal: false,
  },
  {
    name: "annual_value",
    required: false,
    type: "Money",
    filled: "99%",
    source: "CRM",
    personal: false,
  },
  {
    name: "renewal_date",
    required: false,
    type: "Date",
    filled: "97%",
    source: "Extracted from documents",
    personal: false,
  },
  {
    name: "governing_law",
    required: false,
    type: "Text",
    filled: "81%, since Mar 2025",
    source: "Extracted from documents",
    personal: false,
  },
  {
    name: "escrow_pct",
    required: false,
    type: "Percent",
    filled: "64%",
    source: "Often inferred, so confidence is shown per record",
    personal: false,
  },
  {
    name: "signatory_email",
    required: false,
    type: "Email",
    filled: "92%",
    source: "Redacted before storage",
    personal: true,
  },
] as const;

export type PipelineDoc = {
  readonly id: string;
  readonly document: string;
  readonly received: string;
  readonly from: string;
  readonly pipeline: string;
  readonly result: string;
  readonly status: string;
  readonly tone: "ok" | "warn" | "danger" | "neutral";
};

export const PIPELINE_DOCS: readonly PipelineDoc[] = [
  {
    id: "pipe_globex",
    document: "Globex renewal.pdf",
    received: "10:02",
    from: "from Google Drive",
    pipeline: "Contracts",
    result: "11 fields, 1 redacted",
    status: "1 field needs a person",
    tone: "warn",
  },
  {
    id: "pipe_inv",
    document: "Invoice 88213.pdf",
    received: "10:04",
    from: "uploaded by Jordan Kim",
    pipeline: "Invoices",
    result: "Reading fields…",
    status: "Step 3 of 5",
    tone: "neutral",
  },
  {
    id: "pipe_q3",
    document: "Q3 vendor contract.pdf",
    received: "09:41",
    from: "from an agent",
    pipeline: "Contracts",
    result: "12 fields, 2 redacted",
    status: "Stored",
    tone: "ok",
  },
  {
    id: "pipe_nw",
    document: "Northwind MSA Amendment 2.pdf",
    received: "09:23",
    from: "from an agent",
    pipeline: "Contracts",
    result: "12 fields, 2 redacted",
    status: "Stored",
    tone: "ok",
  },
  {
    id: "pipe_msg",
    document: "fwd-pricing.msg",
    received: "08:50",
    from: "from email",
    pipeline: "Email attachments",
    result: "Outlook .msg files aren't supported yet. Convert to PDF or EML.",
    status: "Couldn't read",
    tone: "danger",
  },
];

export const PIPELINE_DETAIL = {
  id: "pipe_globex",
  title: "Globex renewal.pdf",
  subtitle: "Contracts pipeline, 14 pages. One field wasn't clear enough to store without a person.",
  steps: [
    { label: "Received", detail: "10:02:04", state: "done" as const },
    { label: "Converted", detail: "8 seconds · 14 pages to text", state: "done" as const },
    { label: "Fields read", detail: "21 seconds · 11 into Contract", state: "done" as const },
    { label: "Redacted", detail: "2 seconds · 1 personal email", state: "done" as const },
    { label: "Stored", detail: "Waiting · After you confirm 1 field", state: "waiting" as const },
  ],
  fieldNeed: {
    name: "escrow_pct",
    badge: "Inferred, confidence 0.61",
    quote:
      "Page 9, clause 7.2: '…Customer shall retain a holdback of ten (10) percent of each milestone payment until final acceptance…'",
    highlight: "holdback of ten (10) percent",
    question: "The pipeline read this holdback as an escrow of 10%. Is that right?",
  },
} as const;

export type KeyGroupPerm = "none" | "read" | "read-write" | "tag" | "skills";

export const KEY_GROUP_COLUMNS = [
  { id: "engineering", name: "Engineering", keys: 3 },
  { id: "operations", name: "Operations", keys: 2 },
  { id: "support", name: "Support", keys: 2 },
  { id: "legal", name: "Legal", keys: 2 },
] as const;

export const KEY_GROUP_MATRIX: readonly {
  readonly reaches: string;
  readonly cells: readonly { readonly kind: KeyGroupPerm; readonly label: string }[];
}[] = [
  {
    reaches: "GitHub",
    cells: [
      { kind: "read-write", label: "Read and write" },
      { kind: "none", label: "None" },
      { kind: "none", label: "None" },
      { kind: "none", label: "None" },
    ],
  },
  {
    reaches: "Jira",
    cells: [
      { kind: "read-write", label: "Read and write" },
      { kind: "none", label: "None" },
      { kind: "read", label: "Read" },
      { kind: "none", label: "None" },
    ],
  },
  {
    reaches: "Slack",
    cells: [
      { kind: "read-write", label: "Read and write" },
      { kind: "read-write", label: "Read and write" },
      { kind: "read-write", label: "Read and write" },
      { kind: "read", label: "Read" },
    ],
  },
  {
    reaches: "Google Drive",
    cells: [
      { kind: "read", label: "Read" },
      { kind: "none", label: "None" },
      { kind: "none", label: "None" },
      { kind: "read-write", label: "Read and write" },
    ],
  },
  {
    reaches: "CRM",
    cells: [
      { kind: "none", label: "None" },
      { kind: "read-write", label: "Read and write" },
      { kind: "read", label: "Read" },
      { kind: "read-write", label: "Read and write" },
    ],
  },
  {
    reaches: "Stripe",
    cells: [
      { kind: "none", label: "None" },
      { kind: "none", label: "None" },
      { kind: "read", label: "Read" },
      { kind: "none", label: "None" },
    ],
  },
  {
    reaches: "Memory",
    cells: [
      { kind: "read-write", label: "Read and write" },
      { kind: "none", label: "None" },
      { kind: "read", label: "Read" },
      { kind: "read-write", label: "Read and write" },
    ],
  },
  {
    reaches: "Decision sites",
    cells: [
      { kind: "tag", label: "tool-routing" },
      { kind: "none", label: "None" },
      { kind: "tag", label: "ticket-triage" },
      { kind: "tag", label: "contract-risk" },
    ],
  },
  {
    reaches: "Skills",
    cells: [
      { kind: "skills", label: "4 active" },
      { kind: "skills", label: "2 active" },
      { kind: "skills", label: "3 active" },
      { kind: "skills", label: "3 active" },
    ],
  },
];

export const AUDIT_INCIDENT = {
  entryId: "wrm_4877",
  incidentId: "inc_1005_01",
  foundAt: "03:15 today",
  summary:
    "One stored entry, wrm_4877, was changed after it was written. Found by the scheduled check at 03:15 today.",
  explanation:
    "ClawQL doesn't edit entries. Someone with write access to the log storage, or a storage corruption, changed this one. Security contacts were alerted at 03:15. Incident inc_1005_01 is open.",
  written: {
    time: "Oct 4, 22:41:09",
    actor: "support-bot",
    action: "payments.transfer, $4,800.00",
    outcome: "Blocked by policy",
    hash: "8d21…f04a",
  },
  stored: {
    time: "Oct 4, 22:41:09",
    actor: "support-bot",
    action: "payments.transfer, $4,800.00",
    outcome: "Allowed",
    hash: "3c9a…1b77",
  },
  stillHolds: [
    { ok: true, text: "Entries 1 to 4,876 match the offsite roots up to 22:00 yesterday." },
    { ok: true, text: "Everything since 03:15 is written to a new, verified segment." },
    { ok: true, text: "Approvals and mandates keep working." },
    {
      ok: false,
      text: "Entries 4,877 to 4,890 can't be proven yet. Exports label them unverified.",
    },
  ],
  paymentNote:
    "The record was altered to show a blocked payment as allowed. The payment itself never ran: the gateway blocked it at the time, and Stripe shows no transfer.",
} as const;

export const ERASURE_PREVIEW = {
  subject: "Jane Okafor",
  ticket: "#48190",
  received: "Oct 3",
  matched: "Matched on her name and two email addresses.",
  rows: [
    {
      where: "Memory notes",
      found: "3 notes and history",
      how: "Encryption keys destroyed, so copies can't be read",
    },
    {
      where: "Contract fields",
      found: "Signatory email on 2 contracts",
      how: "Fields cleared; the contracts stay",
    },
    {
      where: "Documents",
      found: "Signature page of Globex renewal.pdf",
      how: "Redacted in place",
    },
    {
      where: "Search indexes",
      found: "41 passages",
      how: "Removed and reindexed",
    },
    {
      where: "Session transcripts",
      found: "Mentions in 2 sessions",
      how: "Redacted",
    },
    {
      where: "Events",
      found: "Nothing",
      how: "Already redacted before sending",
    },
  ],
  reason: "Data subject deletion request, ticket #48190.",
} as const;

export const ERASURE_JOB = {
  subject: "Jane Okafor",
  started: "10:21",
  by: "Dana Reyes",
  jobId: "era_5d81",
  done: 5,
  total: 7,
  steps: [
    {
      id: "notes",
      title: "Memory notes made unreadable",
      detail: "Keys for 3 notes destroyed, so their history and backups can't be read.",
      at: "10:21:06",
      state: "done" as const,
    },
    {
      id: "indexes",
      title: "Search indexes cleaned",
      detail: "41 passages removed and reindexed.",
      at: "10:21:40",
      state: "done" as const,
    },
    {
      id: "fields",
      title: "Contract fields cleared",
      detail: "Signatory email on 2 contracts.",
      at: "10:21:41",
      state: "done" as const,
    },
    {
      id: "doc",
      title: "Signature page redacted",
      detail: "Globex renewal.pdf, page 14.",
      at: "10:22:03",
      state: "done" as const,
    },
    {
      id: "exports",
      title: "Blocked from training exports",
      detail: "Added to the export block list; the Sep 12 export is flagged to regenerate.",
      at: "10:22:04",
      state: "done" as const,
    },
    {
      id: "sessions",
      title: "Redacting session transcripts",
      detail: "1 of 2 done. The second retried once after a timeout; finished steps aren't repeated.",
      at: undefined,
      state: "running" as const,
    },
    {
      id: "final",
      title: "Final check across every store",
      detail:
        "Searches memory, indexes, the ontology, documents, transcripts and exports for her name and emails, to prove nothing readable remains.",
      at: undefined,
      state: "waiting" as const,
    },
  ],
} as const;
