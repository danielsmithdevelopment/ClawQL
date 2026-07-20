/**
 * Transaction Sandbox — ATR → mandate (MEDIUM) → snapshot → execute/deny → audit
 * (essay gaps 3.3–3.4).
 */

import {
  checkKineticWriteAllowed,
  resolveKineticAtrClaimsForRuntime,
  type KineticAtrClaims,
} from "./atr-check.js";
import {
  checkKineticMandate,
  resolveChangeLimit,
  type KineticMandate,
  type MandatePolicy,
} from "./mandate-check.js";
import { appendKineticAudit, type KineticAuditEntry } from "./worm-audit.js";
import {
  getContract,
  updateContractStatus,
  updateContractValue,
  type FixtureContract,
} from "../fixture-store.js";

export type KineticWriteRequest = {
  tool: string;
  entity: string;
  recordId: string;
  field: string;
  nextValue: unknown;
  executor?: string;
  kineticLevel?: string;
  claims?: KineticAtrClaims | null;
  mandate?: KineticMandate | null;
  mandatePolicy?: MandatePolicy;
  /** When set, used instead of fixture mutators (tests). */
  execute?: (args: {
    recordId: string;
    field: string;
    nextValue: unknown;
    before: unknown;
  }) => Promise<{ after: unknown }> | { after: unknown };
  readBefore?: (recordId: string, field: string) => unknown;
};

/** @deprecated alias — prefer {@link KineticWriteRequest} */
export type LowKineticWriteRequest = KineticWriteRequest;

export type KineticWriteResult =
  | {
      ok: true;
      status: "committed";
      before: unknown;
      after: unknown;
      audit: KineticAuditEntry;
    }
  | {
      ok: false;
      status: "denied" | "not_found" | "error" | "mandate_required";
      reason: string;
      before?: unknown;
      audit?: KineticAuditEntry;
    };

/** @deprecated alias */
export type LowKineticWriteResult = KineticWriteResult;

function defaultReadBefore(recordId: string, field: string): unknown {
  const row = getContract(recordId);
  if (!row) return undefined;
  if (field === "value" || field === "value.amount") return row.value?.amount;
  return (row as Record<string, unknown>)[field];
}

async function defaultExecute(args: {
  recordId: string;
  field: string;
  nextValue: unknown;
}): Promise<{ after: unknown }> {
  if (args.field === "status") {
    const updated = updateContractStatus(
      args.recordId,
      String(args.nextValue) as FixtureContract["status"]
    );
    if (!updated) throw new Error("not_found");
    return { after: updated.status };
  }
  if (args.field === "value" || args.field === "value.amount") {
    const amount = Number(args.nextValue);
    if (!Number.isFinite(amount)) throw new Error("invalid_amount");
    const updated = updateContractValue(args.recordId, amount);
    if (!updated) throw new Error("not_found");
    return { after: updated.value.amount };
  }
  throw new Error(`unsupported_field:${args.field}`);
}

function moneyDelta(before: unknown, next: unknown): number | undefined {
  const b = typeof before === "number" ? before : Number(before);
  const n = typeof next === "number" ? next : Number(next);
  if (!Number.isFinite(b) || !Number.isFinite(n)) return undefined;
  return Math.abs(n - b);
}

/**
 * Run one native kinetic write with ATR + optional MEDIUM mandate gate.
 */
export async function runKineticTransaction(
  req: KineticWriteRequest
): Promise<KineticWriteResult> {
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

  const policy: MandatePolicy = {
    requiresMandate: req.mandatePolicy?.requiresMandate,
    mandateType: req.mandatePolicy?.mandateType,
    changeLimit: req.mandatePolicy?.changeLimit,
    changeAmount:
      req.mandatePolicy?.changeAmount ?? moneyDelta(before, req.nextValue),
  };
  const mandate = checkKineticMandate({
    policy,
    mandate: req.mandate,
    claims,
  });
  if (!mandate.allowed) {
    const audit = appendKineticAudit({
      action: "KINETIC_DENIED",
      tool: req.tool,
      entity: req.entity,
      recordId: req.recordId,
      subject: claims?.sub,
      reason: mandate.reason,
      snapshot: { field: req.field, before },
      executor: req.executor ?? "NATIVE",
    });
    return {
      ok: false,
      status: "mandate_required",
      reason: mandate.reason,
      before,
      audit,
    };
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
      reason: mandate.mandateRequired ? mandate.reason : atr.reason,
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

/** @deprecated prefer {@link runKineticTransaction} */
export async function runLowKineticTransaction(
  req: KineticWriteRequest
): Promise<KineticWriteResult> {
  return runKineticTransaction(req);
}

export { resolveChangeLimit };
