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
});
export type ReviewItem = Schema.Schema.Type<typeof ReviewItem>;

export const ReviewDecision = Schema.Literals([
  "approve",
  "decline",
  "mark_applied",
  "mark_not_applied",
  "retry_with_key",
]);
export type ReviewDecision = Schema.Schema.Type<typeof ReviewDecision>;

export const ReviewListResponse = Schema.Struct({
  items: Schema.Array(ReviewItem),
  source: Schema.Literals(["live", "fixture"]),
});
export type ReviewListResponse = Schema.Schema.Type<typeof ReviewListResponse>;

export const HomeSpend = Schema.Struct({
  label: Schema.String,
  amount: Schema.String,
  note: Schema.String,
});
export type HomeSpend = Schema.Schema.Type<typeof HomeSpend>;

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
