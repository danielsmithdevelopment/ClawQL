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
