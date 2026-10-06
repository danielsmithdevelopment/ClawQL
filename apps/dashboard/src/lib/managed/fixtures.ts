/** Acme Robotics fixture data matching ClawQL Cloud mockups. Replace with live APIs next. */

export type HomeStatusTone = "ok" | "warn" | "danger";

export type HomeStatusCard = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly tone: HomeStatusTone;
  readonly href?: string;
  readonly linkLabel?: string;
  readonly progress?: { readonly value: number; readonly max: number };
};

export type HomeActionItem = {
  readonly id: string;
  readonly title: string;
  readonly badge: string;
  readonly badgeTone: "warn" | "neutral";
  readonly body: string;
  readonly meta: string;
  readonly evidenceHref?: string;
};

export type HomeActivityItem = {
  readonly id: string;
  readonly kind: string;
  readonly summary: string;
};

export type GatewayEndpoint = {
  readonly path: string;
  readonly description: string;
};

export type ConnectionStatus = "connected" | "needs-signin" | "waiting-review";

export type ConnectionAccount = {
  readonly id: string;
  readonly handle: string;
  readonly ownership: "org" | "personal";
  readonly ownershipLabel: string;
  readonly detail: string;
  readonly action: "reconnect" | "manage";
  readonly alert?: boolean;
};

export type ConnectionItem = {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly lastUsed: string;
  readonly status: ConnectionStatus;
  readonly statusLabel: string;
  readonly detailTitle: string;
  readonly detailSubtitle: string;
  readonly accounts: ConnectionAccount[];
  readonly ops: {
    readonly readsAllowed: number;
    readonly writesMandate: number;
    readonly deletesBlocked: number;
  };
  readonly usedBy: readonly string[];
};

export type ApiKeyItem = {
  readonly id: string;
  readonly name: string;
  readonly expiresLabel: string;
  readonly keyGroup: string;
  readonly canUse: string;
  readonly dailyCap: string;
  /** Optional fixture polish for Keys mockup. */
  readonly endsIn?: string;
  readonly lastUsed?: string;
  readonly capReached?: boolean;
  readonly expiresHighlight?: boolean;
};

export type DailySpendPoint = {
  readonly label: string;
  readonly amount: number;
  readonly weekend?: boolean;
  readonly today?: boolean;
};

export type TeamSpendRow = {
  readonly team: string;
  readonly spent: number;
  readonly budget: number;
  readonly requests: number;
  readonly toolCalls: number;
  readonly alert?: string;
};

export const HOME_STATUS: readonly HomeStatusCard[] = [
  { id: "inference", label: "Inference", value: "Healthy", tone: "ok" },
  {
    id: "events",
    label: "Event deliveries",
    value: "1 failing",
    tone: "danger",
    href: "/automations",
    linkLabel: "Open in Automations",
  },
  {
    id: "connections",
    label: "Connections",
    value: "1 needs sign-in",
    tone: "warn",
    href: "/connections",
    linkLabel: "Reconnect GitHub",
  },
  {
    id: "budget",
    label: "Budget, October",
    value: "$1,284 of $3,000",
    tone: "warn",
    progress: { value: 1284, max: 3000 },
  },
  { id: "audit", label: "Audit chain", value: "Verified", tone: "ok" },
];

export const HOME_ACTIONS: readonly HomeActionItem[] = [
  {
    id: "act_contract",
    title: "Change a contract's value",
    badge: "MEDIUM risk",
    badgeTone: "warn",
    body: "legal-ops agent wants to change the Northwind MSA from $48,500.00 to $52,000.00.",
    meta: "adjust_contract_value, requested 18 min ago",
    evidenceHref: "/review",
  },
  {
    id: "act_linear",
    title: "Add a new source: Linear API",
    badge: "Proposed by an agent",
    badgeTone: "neutral",
    body: "support-bot proposed it after a ticket needed Linear fields ClawQL can't reach yet.",
    meta: "sources_propose, requested 41 min ago",
  },
];

export const HOME_ACTIVITY: readonly HomeActivityItem[] = [
  { id: "a1", kind: "document.processed", summary: "Q3 vendor contract — 12 fields extracted, 2 redacted" },
  { id: "a2", kind: "hook.blocked", summary: "payments.transfer denied by policy" },
  { id: "a3", kind: "stream.changed", summary: "GitHub pull requests — 3 new events" },
  { id: "a4", kind: "schedule.paused", summary: "GitHub watch needs sign-in" },
  { id: "a5", kind: "schedule.completed", summary: "Daily spend digest" },
  { id: "a6", kind: "notification.sent", summary: "Slack digest to #ops" },
];

export const GATEWAY_BASE = "https://acme.cloud.clawql.com";

export const GATEWAY_ENDPOINTS: readonly GatewayEndpoint[] = [
  { path: "/v1", description: "OpenAI-compatible inference" },
  { path: "/mcp", description: "Every connected tool for MCP clients (Claude, Cursor, …)" },
  { path: "/memory", description: "Ingest, search, and erase team memory" },
  { path: "/decision", description: "Fast, calibrated decisions (System One compatible)" },
  { path: "/events", description: "Subscribe by webhook or stream live events" },
];

export const CONNECTIONS: readonly ConnectionItem[] = [
  {
    id: "github",
    name: "GitHub",
    summary: "2 accounts: work, personal",
    lastUsed: "09:20",
    status: "needs-signin",
    statusLabel: "1 needs sign-in",
    detailTitle: "GitHub",
    detailSubtitle: "REST API, imported from GitHub's OpenAPI spec",
    accounts: [
      {
        id: "gh_work",
        handle: "dana-acme",
        ownership: "org",
        ownershipLabel: "Org data",
        detail: "OAuth sign-in expired at 08:58. The acme/web watch is paused.",
        action: "reconnect",
        alert: true,
      },
      {
        id: "gh_personal",
        handle: "danareyes",
        ownership: "personal",
        ownershipLabel: "Private to Dana",
        detail: "Connected, last used yesterday",
        action: "manage",
      },
    ],
    ops: { readsAllowed: 604, writesMandate: 431, deletesBlocked: 47 },
    usedBy: ["release-agent key", "New pull requests automation", "Engineering key group"],
  },
  {
    id: "slack",
    name: "Slack",
    summary: "Acme workspace",
    lastUsed: "08:12",
    status: "connected",
    statusLabel: "Connected",
    detailTitle: "Slack",
    detailSubtitle: "Workspace messaging and notifications",
    accounts: [],
    ops: { readsAllowed: 120, writesMandate: 40, deletesBlocked: 0 },
    usedBy: ["Operations key group"],
  },
  {
    id: "gdrive",
    name: "Google Drive",
    summary: "Shared drives",
    lastUsed: "09:23",
    status: "connected",
    statusLabel: "Connected",
    detailTitle: "Google Drive",
    detailSubtitle: "Shared drives and documents",
    accounts: [],
    ops: { readsAllowed: 88, writesMandate: 12, deletesBlocked: 4 },
    usedBy: ["documents key"],
  },
  {
    id: "crm",
    name: "CRM",
    summary: "Contracts and accounts",
    lastUsed: "09:25",
    status: "connected",
    statusLabel: "Connected",
    detailTitle: "CRM",
    detailSubtitle: "Contracts and accounts",
    accounts: [],
    ops: { readsAllowed: 210, writesMandate: 95, deletesBlocked: 8 },
    usedBy: ["legal-ops key"],
  },
  {
    id: "stripe",
    name: "Stripe",
    summary: "Read-only access",
    lastUsed: "yesterday",
    status: "connected",
    statusLabel: "Connected",
    detailTitle: "Stripe",
    detailSubtitle: "Read-only payments access",
    accounts: [],
    ops: { readsAllowed: 64, writesMandate: 0, deletesBlocked: 12 },
    usedBy: ["billing-sync key"],
  },
  {
    id: "linear",
    name: "Linear",
    summary: "Proposed by support-bot",
    lastUsed: "Not connected yet",
    status: "waiting-review",
    statusLabel: "Waiting in Review",
    detailTitle: "Linear",
    detailSubtitle: "Proposed by support-bot — waiting in Review",
    accounts: [],
    ops: { readsAllowed: 0, writesMandate: 0, deletesBlocked: 0 },
    usedBy: [],
  },
];

export const API_KEYS: readonly ApiKeyItem[] = [
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
    id: "key_release",
    name: "release-agent",
    endsIn: "c801",
    expiresLabel: "Jan 22, 2027",
    keyGroup: "Engineering",
    canUse: "Models, tools",
    dailyCap: "$60",
    lastUsed: "Yesterday",
  },
  {
    id: "key_ci",
    name: "ci-pipeline",
    endsIn: "3b91",
    expiresLabel: "Dec 12",
    keyGroup: "Engineering",
    canUse: "Models, tools",
    dailyCap: "$100",
    lastUsed: "Yesterday",
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
    id: "key_support",
    name: "support-bot",
    endsIn: "e44a",
    expiresLabel: "Jan 15, 2027",
    keyGroup: "Support",
    canUse: "Models, tools",
    dailyCap: "$40",
    lastUsed: "09:31",
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
  {
    id: "key_research",
    name: "research",
    endsIn: "88c0",
    expiresLabel: "Mar 8, 2027",
    keyGroup: "Engineering",
    canUse: "Models, tools, memory",
    dailyCap: "$80",
    lastUsed: "08:12",
  },
  {
    id: "key_finance",
    name: "finance-digest",
    endsIn: "b2d9",
    expiresLabel: "Apr 1, 2027",
    keyGroup: "Operations",
    canUse: "Models, events",
    dailyCap: "$30",
    lastUsed: "08:55",
  },
];

export const DAILY_SPEND: readonly DailySpendPoint[] = [
  { label: "Sep 22", amount: 210 },
  { label: "Sep 23", amount: 236 },
  { label: "Sep 24", amount: 248 },
  { label: "Sep 25", amount: 251 },
  { label: "Sep 26", amount: 92, weekend: true },
  { label: "Sep 27", amount: 88, weekend: true },
  { label: "Sep 28", amount: 266 },
  { label: "Sep 29", amount: 274 },
  { label: "Sep 30", amount: 258 },
  { label: "Oct 1", amount: 402 },
  { label: "Oct 2", amount: 398 },
  { label: "Oct 3", amount: 190, weekend: true },
  { label: "Oct 4", amount: 188, weekend: true },
  { label: "Today", amount: 96, today: true },
];

export const TEAM_SPEND: readonly TeamSpendRow[] = [
  { team: "documents", spent: 612, budget: 1200, requests: 22410, toolCalls: 8904 },
  { team: "support", spent: 341, budget: 800, requests: 31088, toolCalls: 5216 },
  { team: "operations", spent: 209, budget: 500, requests: 9730, toolCalls: 3051 },
  {
    team: "experiments",
    spent: 122,
    budget: 150,
    requests: 4206,
    toolCalls: 1233,
    alert: "Daily cap reached today",
  },
];

export const USAGE_SUMMARY = {
  monthSpent: 1284,
  monthBudget: 3000,
  forecast: 7800,
  forecastNote: "At this pace you'll pass the budget around Oct 11.",
  todaySpent: 96.4,
  todayNote: "Weekdays usually land between $250 and $400",
  planRenews: "Team plan, renews Nov 1",
} as const;
