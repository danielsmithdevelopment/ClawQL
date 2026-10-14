/**
 * Mobile domain schemas — Effect-primary, aligned with managed ReviewItem + profile fixtures.
 */
import { Context, Data, Effect, Layer, Schema } from "effect";

export const ReviewKind = Schema.Literals(["change", "source", "decision", "skill"]);
export type ReviewKind = Schema.Schema.Type<typeof ReviewKind>;

export const BadgeTone = Schema.Literals(["warn", "neutral", "ok", "danger"]);
export type BadgeTone = Schema.Schema.Type<typeof BadgeTone>;

export const ExactChangeRow = Schema.Struct({
  field: Schema.String,
  now: Schema.String,
  after: Schema.String,
});
export type ExactChangeRow = Schema.Schema.Type<typeof ExactChangeRow>;

export const DecisionChoice = Schema.Struct({
  label: Schema.String,
  score: Schema.String,
});
export type DecisionChoice = Schema.Schema.Type<typeof DecisionChoice>;

export const ReviewItem = Schema.Struct({
  id: Schema.String,
  kind: ReviewKind,
  kindLabel: Schema.String,
  title: Schema.String,
  badge: Schema.String,
  badgeTone: BadgeTone,
  listMeta: Schema.String,
  statusLine: Schema.String,
  statusTone: BadgeTone,
  changeStatus: Schema.optional(Schema.Literals(["pending", "outcome_unknown"])),
  idempotencyCapable: Schema.optional(Schema.Boolean),
  idempotencyKey: Schema.optional(Schema.String),
  needsOutcomeAttention: Schema.optional(Schema.Boolean),
  exactChange: Schema.optional(Schema.Array(ExactChangeRow)),
  digest: Schema.optional(Schema.String),
  operationId: Schema.optional(Schema.String),
  /** Decision HITL: quoted agent context. */
  decisionQuote: Schema.optional(Schema.String),
  decisionSite: Schema.optional(Schema.String),
  decisionChoices: Schema.optional(Schema.Array(DecisionChoice)),
  /** Skill promotion evidence pills. */
  skillEvidence: Schema.optional(Schema.Array(Schema.String)),
  skillSummary: Schema.optional(Schema.String),
  /** Skill sandbox permissions (reads / writes / network / spend). */
  skillPermissions: Schema.optional(
    Schema.Struct({
      reads: Schema.String,
      writes: Schema.String,
      network: Schema.String,
      spend: Schema.String,
    })
  ),
  /** Set when moved to the decided archive (fixture + local history). */
  decidedAtMs: Schema.optional(Schema.Number),
  decidedStatus: Schema.optional(Schema.String),
});
export type ReviewItem = Schema.Schema.Type<typeof ReviewItem>;

export const DeviceSession = Schema.Struct({
  id: Schema.String,
  device: Schema.String,
  path: Schema.String,
  current: Schema.Boolean,
  lastActive: Schema.String,
  ended: Schema.Boolean,
});
export type DeviceSession = Schema.Schema.Type<typeof DeviceSession>;

export const ReviewDecision = Schema.Literals([
  "approve",
  "decline",
  "mark_applied",
  "mark_not_applied",
  "retry_with_key",
  "answer",
  "skip",
  "ask_teammate",
]);
export type ReviewDecision = Schema.Schema.Type<typeof ReviewDecision>;

export const DataSource = Schema.Literals(["live", "fixture", "cache"]);
export type DataSource = Schema.Schema.Type<typeof DataSource>;

export const ReviewListResponse = Schema.Struct({
  items: Schema.Array(ReviewItem),
  source: DataSource,
});
export type ReviewListResponse = Schema.Schema.Type<typeof ReviewListResponse>;

export const ActivityEvent = Schema.Struct({
  id: Schema.String,
  atMs: Schema.Number,
  title: Schema.String,
  detail: Schema.String,
  kind: ReviewKind,
  decision: Schema.String,
  reviewId: Schema.String,
});
export type ActivityEvent = Schema.Schema.Type<typeof ActivityEvent>;

export const ActivityListResponse = Schema.Struct({
  events: Schema.Array(ActivityEvent),
  source: DataSource,
});
export type ActivityListResponse = Schema.Schema.Type<typeof ActivityListResponse>;

export const SpendLine = Schema.Struct({
  agent: Schema.String,
  amount: Schema.String,
  note: Schema.String,
});
export type SpendLine = Schema.Schema.Type<typeof SpendLine>;

export const HomeSpend = Schema.Struct({
  label: Schema.String,
  amount: Schema.String,
  note: Schema.String,
  budget: Schema.optional(Schema.String),
  lines: Schema.optional(Schema.Array(SpendLine)),
});
export type HomeSpend = Schema.Schema.Type<typeof HomeSpend>;

export const ApprovalPolicy = Schema.Struct({
  id: Schema.String,
  when: Schema.String,
  whenDetail: Schema.String,
  who: Schema.String,
  approvals: Schema.String,
  securityKey: Schema.String,
  waits: Schema.String,
  blocked: Schema.optional(Schema.Boolean),
  blockedNote: Schema.optional(Schema.String),
});
export type ApprovalPolicy = Schema.Schema.Type<typeof ApprovalPolicy>;

export const ApprovalPolicyDetail = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  lastChanged: Schema.String,
  appliesTo: Schema.String,
  appliesHelp: Schema.String,
  whoApproves: Schema.String,
  whoHelp: Schema.String,
  approvalsNeeded: Schema.String,
  expiresAfter: Schema.String,
  expiresHelp: Schema.String,
  requireSecurityKey: Schema.Boolean,
  notify: Schema.String,
});
export type ApprovalPolicyDetail = Schema.Schema.Type<typeof ApprovalPolicyDetail>;

export const OrgSummary = Schema.Struct({
  orgId: Schema.String,
  name: Schema.String,
  plan: Schema.String,
  role: Schema.String,
  members: Schema.String,
});
export type OrgSummary = Schema.Schema.Type<typeof OrgSummary>;

export const DigestItem = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  detail: Schema.String,
  tone: BadgeTone,
});
export type DigestItem = Schema.Schema.Type<typeof DigestItem>;

export const MorningDigest = Schema.Struct({
  headline: Schema.String,
  whenLabel: Schema.String,
  summary: Schema.String,
  items: Schema.Array(DigestItem),
  awaitingYou: Schema.Number,
});
export type MorningDigest = Schema.Schema.Type<typeof MorningDigest>;

export const AgentStatus = Schema.Literals(["active", "paused", "needs_you"]);
export type AgentStatus = Schema.Schema.Type<typeof AgentStatus>;

export const AgentSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  role: Schema.String,
  status: AgentStatus,
  statusLabel: Schema.String,
  lastRun: Schema.String,
  spendToday: Schema.String,
  waiting: Schema.optional(Schema.Number),
});
export type AgentSummary = Schema.Schema.Type<typeof AgentSummary>;

export const Teammate = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  role: Schema.String,
  groups: Schema.Array(Schema.String),
  canApprove: Schema.Boolean,
  keysReady: Schema.Boolean,
  lastActive: Schema.String,
  invitePending: Schema.optional(Schema.Boolean),
});
export type Teammate = Schema.Schema.Type<typeof Teammate>;

export const TeamGroup = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  people: Schema.String,
  role: Schema.String,
  usedIn: Schema.String,
});
export type TeamGroup = Schema.Schema.Type<typeof TeamGroup>;

export const TeamRole = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  people: Schema.String,
  console: Schema.String,
  connections: Schema.String,
  policies: Schema.String,
  peopleManage: Schema.String,
  exportAudit: Schema.String,
  billing: Schema.String,
});
export type TeamRole = Schema.Schema.Type<typeof TeamRole>;

export const TeamBundle = Schema.Struct({
  people: Schema.Array(Teammate),
  groups: Schema.Array(TeamGroup),
  roles: Schema.Array(TeamRole),
  source: Schema.optional(Schema.Literals(["live", "fixture"])),
});
export type TeamBundle = Schema.Schema.Type<typeof TeamBundle>;

export const ManagedUsageTeamRow = Schema.Struct({
  team: Schema.String,
  spent: Schema.Number,
  budget: Schema.Number,
  requests: Schema.Number,
  toolCalls: Schema.Number,
  alert: Schema.optional(Schema.String),
});
export type ManagedUsageTeamRow = Schema.Schema.Type<typeof ManagedUsageTeamRow>;

export const ManagedUsage = Schema.Struct({
  monthSpent: Schema.Number,
  monthBudget: Schema.Number,
  forecast: Schema.Number,
  forecastNote: Schema.String,
  todaySpent: Schema.Number,
  todayNote: Schema.String,
  planRenews: Schema.String,
  teamRows: Schema.Array(ManagedUsageTeamRow),
  source: Schema.Literals(["live", "fixture"]),
});
export type ManagedUsage = Schema.Schema.Type<typeof ManagedUsage>;

export const InboxItem = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  body: Schema.String,
  atMs: Schema.Number,
  kind: Schema.Literals(["approval", "digest", "system"]),
  reviewId: Schema.optional(Schema.String),
  unread: Schema.Boolean,
});
export type InboxItem = Schema.Schema.Type<typeof InboxItem>;

export const SecurityKey = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  badge: Schema.String,
  detail: Schema.String,
  canApprove: Schema.Boolean,
});
export type SecurityKey = Schema.Schema.Type<typeof SecurityKey>;

export const ConnectedApp = Schema.Struct({
  clientId: Schema.String,
  name: Schema.String,
  scopes: Schema.Array(Schema.String),
  lastUsed: Schema.String,
});
export type ConnectedApp = Schema.Schema.Type<typeof ConnectedApp>;

export const NotificationPrefs = Schema.Struct({
  push: Schema.Boolean,
  slack: Schema.Boolean,
  email: Schema.Boolean,
  morningDigest: Schema.Boolean,
});
export type NotificationPrefs = Schema.Schema.Type<typeof NotificationPrefs>;

/** On-device prefs (persisted locally — not console notification prefs). */
export const DevicePrefs = Schema.Struct({
  /** Require Face ID / biometrics (or fixture unlock) when returning to the app. */
  appLock: Schema.Boolean,
  /** Haptic feedback on approve / decline / errors. */
  haptics: Schema.Boolean,
  /** Home-screen icon badge = pending review count. */
  iconBadge: Schema.Boolean,
  /** Show Voice assistant entry points (Profile + /voice). */
  voiceAssistant: Schema.Boolean,
  /** Speak assistant replies (expo-speech / web speechSynthesis). */
  voiceSpeak: Schema.Boolean,
});
export type DevicePrefs = Schema.Schema.Type<typeof DevicePrefs>;

/** Registered Expo / APNs / FCM push endpoint for this phone. */
export const PushDevice = Schema.Struct({
  id: Schema.String,
  token: Schema.String,
  platform: Schema.Literals(["ios", "android", "web"]),
  label: Schema.String,
  registeredAtMs: Schema.Number,
  fixture: Schema.Boolean,
});
export type PushDevice = Schema.Schema.Type<typeof PushDevice>;

/** Photo / scan attached to a review request (evidence for approve). */
export const DocumentAttachment = Schema.Struct({
  id: Schema.String,
  reviewId: Schema.String,
  uri: Schema.String,
  fileName: Schema.String,
  mimeType: Schema.String,
  source: Schema.Literals(["camera", "library"]),
  capturedAtMs: Schema.Number,
  bytes: Schema.optional(Schema.Number),
});
export type DocumentAttachment = Schema.Schema.Type<typeof DocumentAttachment>;

/** Memory explorer hit (console MemoryPage / MEMORY_RESULTS). */
export const MemoryResult = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["ENTITY", "DOCUMENT", "NOTE"]),
  title: Schema.String,
  summary: Schema.String,
  badge: Schema.String,
  badgeTone: BadgeTone,
});
export type MemoryResult = Schema.Schema.Type<typeof MemoryResult>;

export const MemoryField = Schema.Struct({
  field: Schema.String,
  value: Schema.String,
  source: Schema.String,
  confidence: Schema.String,
  tone: BadgeTone,
});
export type MemoryField = Schema.Schema.Type<typeof MemoryField>;

/** Gateway API key (not hardware SecurityKey / OAuth ConnectedApp). */
export const ApiKeyItem = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  expiresLabel: Schema.String,
  keyGroup: Schema.String,
  canUse: Schema.String,
  dailyCap: Schema.String,
  endsIn: Schema.optional(Schema.String),
  lastUsed: Schema.optional(Schema.String),
  capReached: Schema.optional(Schema.Boolean),
  expiresHighlight: Schema.optional(Schema.Boolean),
  revoked: Schema.optional(Schema.Boolean),
});
export type ApiKeyItem = Schema.Schema.Type<typeof ApiKeyItem>;

export const GatewayEndpoint = Schema.Struct({
  path: Schema.String,
  description: Schema.String,
});
export type GatewayEndpoint = Schema.Schema.Type<typeof GatewayEndpoint>;

export const AutomationSub = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  target: Schema.String,
  events: Schema.String,
  via: Schema.String,
  last: Schema.String,
  health: Schema.String,
  tone: BadgeTone,
});
export type AutomationSub = Schema.Schema.Type<typeof AutomationSub>;

export const AuditEntry = Schema.Struct({
  id: Schema.String,
  time: Schema.String,
  actor: Schema.String,
  action: Schema.String,
  outcome: Schema.String,
  tone: BadgeTone,
});
export type AuditEntry = Schema.Schema.Type<typeof AuditEntry>;

export const OrgSettings = Schema.Struct({
  name: Schema.String,
  consoleAddress: Schema.String,
  dataRegion: Schema.String,
  timeZone: Schema.String,
  securityContact: Schema.String,
});
export type OrgSettings = Schema.Schema.Type<typeof OrgSettings>;

export const SettingsWebhookHost = Schema.Struct({
  host: Schema.String,
  subscriptions: Schema.Number,
});
export type SettingsWebhookHost = Schema.Schema.Type<typeof SettingsWebhookHost>;

export const SettingsRetentionRow = Schema.Struct({
  label: Schema.String,
  help: Schema.String,
  value: Schema.String,
  locked: Schema.optional(Schema.Boolean),
});
export type SettingsRetentionRow = Schema.Schema.Type<typeof SettingsRetentionRow>;

export const OrgSettingsBundle = Schema.Struct({
  org: OrgSettings,
  webhookHosts: Schema.Array(SettingsWebhookHost),
  egressDomains: Schema.Array(Schema.String),
  retention: Schema.Array(SettingsRetentionRow),
});
export type OrgSettingsBundle = Schema.Schema.Type<typeof OrgSettingsBundle>;

export const AuditIncident = Schema.Struct({
  entryId: Schema.String,
  incidentId: Schema.String,
  foundAt: Schema.String,
  summary: Schema.String,
  explanation: Schema.String,
  paymentNote: Schema.String,
});
export type AuditIncident = Schema.Schema.Type<typeof AuditIncident>;

/** Agent session timeline row (console Sessions). */
export const AgentSession = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  meta: Schema.String,
  stats: Schema.String,
  status: Schema.String,
  tone: BadgeTone,
  active: Schema.Boolean,
});
export type AgentSession = Schema.Schema.Type<typeof AgentSession>;

export const ProposedSkill = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  attribution: Schema.String,
  canProve: Schema.Boolean,
  blocker: Schema.optional(Schema.String),
  blockerTone: Schema.optional(BadgeTone),
});
export type ProposedSkill = Schema.Schema.Type<typeof ProposedSkill>;

export const ActiveSkill = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  keyGroup: Schema.String,
  touchesLabel: Schema.String,
  runs7d: Schema.Number,
});
export type ActiveSkill = Schema.Schema.Type<typeof ActiveSkill>;

export const ConnectionAccount = Schema.Struct({
  id: Schema.String,
  handle: Schema.String,
  ownershipLabel: Schema.String,
  detail: Schema.String,
  action: Schema.String,
  alert: Schema.optional(Schema.Boolean),
});
export type ConnectionAccount = Schema.Schema.Type<typeof ConnectionAccount>;

export const ConnectionItem = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  summary: Schema.String,
  lastUsed: Schema.String,
  status: Schema.String,
  statusLabel: Schema.String,
  accounts: Schema.Array(ConnectionAccount),
  ops: Schema.Struct({
    readsAllowed: Schema.Number,
    writesMandate: Schema.Number,
    deletesBlocked: Schema.Number,
  }),
  usedBy: Schema.Array(Schema.String),
});
export type ConnectionItem = Schema.Schema.Type<typeof ConnectionItem>;

/** Fixture / console-parity workflow (skill program) the voice assistant can start. */
export const WorkflowProgram = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  stage: Schema.Literals(["active", "proving", "proposed", "retired"]),
});
export type WorkflowProgram = Schema.Schema.Type<typeof WorkflowProgram>;

export const WorkflowRun = Schema.Struct({
  id: Schema.String,
  workflowId: Schema.String,
  name: Schema.String,
  startedAtMs: Schema.Number,
  status: Schema.Literals(["started", "running", "done"]),
  fixture: Schema.Boolean,
});
export type WorkflowRun = Schema.Schema.Type<typeof WorkflowRun>;

export const MobileSession = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.optional(Schema.String),
  userId: Schema.String,
  email: Schema.String,
  displayName: Schema.String,
  role: Schema.String,
  orgId: Schema.String,
  /** App Store reviewer demo org — biometric approve allowed, audit-tagged. */
  reviewerDemo: Schema.Boolean,
  expiresAtMs: Schema.Number,
});
export type MobileSession = Schema.Schema.Type<typeof MobileSession>;

export const AccountDeletionResult = Schema.Struct({
  ok: Schema.Boolean,
  jobId: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
});
export type AccountDeletionResult = Schema.Schema.Type<typeof AccountDeletionResult>;

export class SchemaDecodeError extends Data.TaggedError("SchemaDecodeError")<{
  readonly message: string;
}> {}

export function decodeUnknownEffect<S extends Schema.Top>(
  schema: S,
  input: unknown
): Effect.Effect<Schema.Schema.Type<S>, SchemaDecodeError> {
  return Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError((err) => new SchemaDecodeError({ message: String(err) }))
  ) as Effect.Effect<Schema.Schema.Type<S>, SchemaDecodeError>;
}

export const CLAWQL_MOBILE_SCHEMAS_TAG = "clawql/MobileSchemas" as const;

export class MobileSchemas extends Context.Service<
  typeof CLAWQL_MOBILE_SCHEMAS_TAG,
  {
    readonly decodeReviewList: (
      input: unknown
    ) => Effect.Effect<ReviewListResponse, SchemaDecodeError>;
    readonly decodeSession: (input: unknown) => Effect.Effect<MobileSession, SchemaDecodeError>;
  }
>()(CLAWQL_MOBILE_SCHEMAS_TAG) {}

export const MobileSchemasLive = Layer.succeed(MobileSchemas, {
  decodeReviewList: (input) => decodeUnknownEffect(ReviewListResponse, input),
  decodeSession: (input) => decodeUnknownEffect(MobileSession, input),
});
