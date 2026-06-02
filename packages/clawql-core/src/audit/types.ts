export type ClawqlAuditEntry = {
  ts: string;
  category: string;
  action: string;
  summary: string;
  correlationId?: string;
};

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
