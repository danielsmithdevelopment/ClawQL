/**
 * Pending custom-source proposals (v0.1).
 * @see docs/specs/risk/sources-propose-v0.1.md
 */

import type { CustomSourceEntry } from "../spec/custom-sources-types.js";
import type { OperationRisk } from "../risk/operation-risk-types.js";

export type PendingSourceStatus = "pending" | "approved" | "declined" | "expired";

export type SourceRiskSummary = {
  readonly allow: number;
  readonly mandate: number;
  readonly block: number;
  readonly total: number;
};

export type ProposedOperationSample = {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly risk: OperationRisk | null;
};

export type PendingSourceRecord = {
  readonly version: 1;
  readonly proposalId: string;
  readonly entry: CustomSourceEntry;
  readonly riskSummary: SourceRiskSummary;
  readonly sampleOperations: readonly ProposedOperationSample[];
  readonly status: PendingSourceStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly decidedAt: string | null;
};

export type SourcesProposePreview = {
  readonly ok: true;
  readonly dryRun: boolean;
  readonly proposalId: string | null;
  readonly entry: Pick<CustomSourceEntry, "id" | "name" | "kind" | "url" | "mcpUrl" | "cachePath">;
  readonly riskSummary: SourceRiskSummary;
  readonly sampleOperations: readonly ProposedOperationSample[];
  readonly expiresAt: string | null;
  readonly approval: {
    readonly cli: string;
    readonly declineCli: string;
    readonly tool: "sources_approve";
  } | null;
};
