import type { HashChainLink, HashChainVerifyResult } from "../hash-chain/index.js";

export type ClawqlAuditPayload = {
  ts: string;
  category: string;
  action: string;
  summary: string;
  correlationId?: string;
};

/** In-process audit line — hash-chained for the retained ring window. */
export type ClawqlAuditEntry = ClawqlAuditPayload & HashChainLink;

export type AuditAppendResult = {
  readonly total: number;
  readonly dropped: number;
};

export type AuditListResult = {
  readonly total: number;
  readonly maxEntries: number;
  readonly entries: readonly ClawqlAuditEntry[];
};

export type AuditClearResult = {
  readonly cleared: number;
};

export type AuditVerifyResult = HashChainVerifyResult;
