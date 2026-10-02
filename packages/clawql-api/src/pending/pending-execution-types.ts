import type { OperationRisk } from "../risk/operation-risk-types.js";

export type PendingExecutionStatus =
  "pending" | "approved" | "declined" | "completed" | "failed" | "expired";

export type PendingExecutionRecord = {
  readonly version: 1;
  readonly executionId: string;
  readonly operationId: string;
  readonly args: Record<string, unknown>;
  readonly fields: readonly string[] | null;
  readonly argsHash: string;
  readonly risk: OperationRisk;
  readonly status: PendingExecutionStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly approvedAt: string | null;
  readonly completedAt: string | null;
  readonly lastError: string | null;
};

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
