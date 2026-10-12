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

export const ReviewListResponse = Schema.Struct({
  items: Schema.Array(ReviewItem),
  source: Schema.Literals(["live", "fixture"]),
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
  source: Schema.Literals(["live", "fixture"]),
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
