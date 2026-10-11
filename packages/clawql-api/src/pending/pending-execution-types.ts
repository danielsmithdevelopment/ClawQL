import type { OperationRisk } from "../risk/operation-risk-types.js";

/**
 * Mandate lifecycle statuses.
 *
 * `outcome_unknown` = atomically consumed for execute; side-effect result not yet
 * recorded (crash between consume and finalize). Review surfaces it only after a
 * grace threshold. Automatic retry is allowed only when `idempotencyCapable`.
 */
export type PendingExecutionStatus =
  "pending" | "approved" | "declined" | "completed" | "failed" | "expired" | "outcome_unknown";

/** Grace before Review treats outcome_unknown as needing attention (ms). */
export const OUTCOME_UNKNOWN_ATTENTION_MS = 60_000;

export type PendingExecutionRecord = {
  readonly version: 1;
  readonly executionId: string;
  readonly operationId: string;
  readonly args: Record<string, unknown>;
  readonly fields: readonly string[] | null;
  /** Optional JMESPath bound into argsHash when set. */
  readonly where: string | null;
  readonly argsHash: string;
  readonly risk: OperationRisk;
  readonly status: PendingExecutionStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly approvedAt: string | null;
  readonly completedAt: string | null;
  readonly lastError: string | null;
  /** Set by atomic consume (approved → outcome_unknown). */
  readonly consumedAt: string | null;
  /** Replica / process id that won the consume CAS. */
  readonly consumedBy: string | null;
  /**
   * When true, automatic retry after outcome_unknown may attach
   * `mandateIdempotencyKey` (connector honors Idempotency-Key). When false,
   * only a person may mark applied / not applied / retry-with-key-touch in Review.
   */
  readonly idempotencyCapable: boolean;
};

export type OutcomeUnknownResolve = "mark_applied" | "mark_not_applied" | "retry_with_key";

export type ParkExecuteResult = {
  readonly ok: false;
  readonly status: "mandate_required";
  readonly reason: string;
  readonly operationId: string;
  readonly executionId: string;
  readonly argsHash: string;
  readonly risk: OperationRisk;
  readonly approval: {
    readonly cli: string;
    readonly tool: "resume";
    readonly declineCli: string;
  };
  readonly expiresAt: string;
};

/** Downstream APIs that support idempotency should use this key (Stripe, etc.). */
export function mandateIdempotencyKey(executionId: string): string {
  return `clawql-mandate:${executionId.trim()}`;
}
