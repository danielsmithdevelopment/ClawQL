/**
 * Minimal LOW Transaction Sandbox — ATR → snapshot → execute/deny → audit (essay 3.3).
 */

import {
  checkKineticWriteAllowed,
  resolveKineticAtrClaimsForRuntime,
  type KineticAtrClaims,
} from "./atr-check.js";
import { appendKineticAudit, type KineticAuditEntry } from "./worm-audit.js";
import { getContract, updateContractStatus, type FixtureContract } from "../fixture-store.js";

export type LowKineticWriteRequest = {
  tool: string;
  entity: string;
  recordId: string;
  field: string;
  nextValue: unknown;
  executor?: string;
  claims?: KineticAtrClaims | null;
  /** When set, used instead of fixture mutators (tests). */
  execute?: (args: {
    recordId: string;
    field: string;
    nextValue: unknown;
    before: unknown;
  }) => Promise<{ after: unknown }> | { after: unknown };
  readBefore?: (recordId: string, field: string) => unknown;
};

export type LowKineticWriteResult =
  | {
      ok: true;
      status: "committed";
      before: unknown;
      after: unknown;
      audit: KineticAuditEntry;
    }
  | {
      ok: false;
      status: "denied" | "not_found" | "error";
      reason: string;
      before?: unknown;
      audit?: KineticAuditEntry;
    };

function defaultReadBefore(recordId: string, field: string): unknown {
  const row = getContract(recordId);
  if (!row) return undefined;
  return (row as Record<string, unknown>)[field];
}

async function defaultExecute(args: {
  recordId: string;
  field: string;
  nextValue: unknown;
}): Promise<{ after: unknown }> {
  if (args.field !== "status") {
    throw new Error(`unsupported_field:${args.field}`);
  }
  const updated = updateContractStatus(
    args.recordId,
    String(args.nextValue) as FixtureContract["status"]
  );
  if (!updated) throw new Error("not_found");
  return { after: updated.status };
}

/**
 * Run one LOW native kinetic write with ATR gate + field snapshot + audit chain.
 */
export async function runLowKineticTransaction(
  req: LowKineticWriteRequest
): Promise<LowKineticWriteResult> {
  const claims = req.claims === undefined ? resolveKineticAtrClaimsForRuntime() : req.claims;
  const atr = checkKineticWriteAllowed(claims);
  const before =
    req.readBefore?.(req.recordId, req.field) ?? defaultReadBefore(req.recordId, req.field);

  if (before === undefined && !req.readBefore) {
    const audit = appendKineticAudit({
      action: "KINETIC_DENIED",
      tool: req.tool,
      entity: req.entity,
      recordId: req.recordId,
      subject: claims?.sub,
      reason: "not_found",
      executor: req.executor ?? "NATIVE",
    });
    return { ok: false, status: "not_found", reason: "not_found", audit };
  }

  if (!atr.allowed) {
    const audit = appendKineticAudit({
      action: "KINETIC_DENIED",
      tool: req.tool,
      entity: req.entity,
      recordId: req.recordId,
      subject: claims?.sub,
      reason: atr.reason,
      snapshot: { field: req.field, before },
      executor: req.executor ?? "NATIVE",
    });
    return { ok: false, status: "denied", reason: atr.reason, before, audit };
  }

  try {
    const exec = req.execute ?? defaultExecute;
    const { after } = await exec({
      recordId: req.recordId,
      field: req.field,
      nextValue: req.nextValue,
      before,
    });
    const audit = appendKineticAudit({
      action: "KINETIC_COMMITTED",
      tool: req.tool,
      entity: req.entity,
      recordId: req.recordId,
      subject: claims?.sub,
      reason: atr.reason,
      snapshot: { field: req.field, before, after },
      executor: req.executor ?? "NATIVE",
    });
    return { ok: true, status: "committed", before, after, audit };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    const audit = appendKineticAudit({
      action: "KINETIC_DENIED",
      tool: req.tool,
      entity: req.entity,
      recordId: req.recordId,
      subject: claims?.sub,
      reason,
      snapshot: { field: req.field, before },
      executor: req.executor ?? "NATIVE",
    });
    return { ok: false, status: "error", reason, before, audit };
  }
}
