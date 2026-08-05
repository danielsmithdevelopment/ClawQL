/**
 * Org inference spend waterfall:
 *   1. Debit / hold member balance
 *   2. Fall through to company pool for the remainder
 *   3. Record Stripe overage intent when still short (billing admin)
 *
 * Does not charge Stripe here — returns `overageCents` for the caller / meter path.
 */

import {
  getCreditAccount,
  holdCredits,
  spendableBalanceCents,
  type CreditHold,
  type CreditLedgerEntry,
} from "./ledger.js";
import { findMembership, getOrg } from "./org.js";
import { recordOrgWaterfallOverage, recordOrgWaterfallSplit } from "./org-waterfall-metrics.js";

export type WaterfallSourceKind = "member" | "pool" | "overage";

export type WaterfallSlice = {
  kind: WaterfallSourceKind;
  tenantId: string;
  amountCents: number;
  holdId?: string;
  idempotencyKey?: string;
};

export type OrgWaterfallHoldResult = {
  orgId: string;
  memberTenantId: string;
  requestedCents: number;
  slices: WaterfallSlice[];
  memberHold?: { hold: CreditHold; entry: CreditLedgerEntry };
  poolHold?: { hold: CreditHold; entry: CreditLedgerEntry };
  overageCents: number;
  fullyCoveredByCredits: boolean;
};

export type HoldOrgWaterfallInput = {
  orgId: string;
  memberTenantId: string;
  amountCents: number;
  idempotencyKey: string;
  resource?: string;
  correlationId?: string;
  note?: string;
  /**
   * When true (default), allow spend beyond member+pool and return overageCents
   * for Stripe meter / invoice. When false, throw if credits are insufficient.
   */
  allowOverage?: boolean;
};

/**
 * Authorize spend with member → pool → overage hierarchy.
 */
export async function holdOrgWaterfall(
  input: HoldOrgWaterfallInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgWaterfallHoldResult> {
  const amount = Math.round(input.amountCents);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amountCents must be > 0");
  }

  const org = await getOrg(input.orgId, env);
  if (!org) throw new Error(`Unknown org: ${input.orgId}`);
  const member = findMembership(org, input.memberTenantId);
  if (!member) throw new Error(`Not an active member: ${input.memberTenantId}`);

  const allowOverage = input.allowOverage !== false;
  const memberAcct = await getCreditAccount(member.memberTenantId, env);
  const poolAcct = await getCreditAccount(org.poolTenantId, env);
  const memberAvail = Math.max(0, spendableBalanceCents(memberAcct));
  const poolAvail = Math.max(0, spendableBalanceCents(poolAcct));

  const fromMember = Math.min(memberAvail, amount);
  const remainderAfterMember = amount - fromMember;
  const fromPool = Math.min(poolAvail, remainderAfterMember);
  const overageCents = remainderAfterMember - fromPool;

  if (overageCents > 0 && !allowOverage) {
    throw new Error(
      `Insufficient org credits for ${input.memberTenantId}: need ${amount}c, ` +
        `member ${memberAvail}c + pool ${poolAvail}c (short ${overageCents}c)`
    );
  }

  const baseKey = input.idempotencyKey.trim();
  const slices: WaterfallSlice[] = [];
  let memberHold: OrgWaterfallHoldResult["memberHold"];
  let poolHold: OrgWaterfallHoldResult["poolHold"];

  if (fromMember > 0) {
    const key = `${baseKey}:member`;
    const result = await holdCredits(
      {
        tenantId: member.memberTenantId,
        amountCents: fromMember,
        idempotencyKey: key,
        resource: input.resource,
        correlationId: input.correlationId,
        note: input.note ?? `org ${org.orgId} waterfall member`,
      },
      env
    );
    memberHold = { hold: result.hold, entry: result.entry };
    slices.push({
      kind: "member",
      tenantId: member.memberTenantId,
      amountCents: fromMember,
      holdId: result.hold.id,
      idempotencyKey: key,
    });
  }

  if (fromPool > 0) {
    const key = `${baseKey}:pool`;
    const result = await holdCredits(
      {
        tenantId: org.poolTenantId,
        amountCents: fromPool,
        idempotencyKey: key,
        resource: input.resource,
        correlationId: input.correlationId,
        note: input.note ?? `org ${org.orgId} waterfall pool fallthrough`,
      },
      env
    );
    poolHold = { hold: result.hold, entry: result.entry };
    slices.push({
      kind: "pool",
      tenantId: org.poolTenantId,
      amountCents: fromPool,
      holdId: result.hold.id,
      idempotencyKey: key,
    });
  }

  if (overageCents > 0) {
    slices.push({
      kind: "overage",
      tenantId: org.billingAdminTenantIds[0] ?? org.poolTenantId,
      amountCents: overageCents,
    });
    recordOrgWaterfallOverage(org.orgId, overageCents);
  }

  recordOrgWaterfallSplit(org.orgId, fromMember, fromPool, overageCents);

  return {
    orgId: org.orgId,
    memberTenantId: member.memberTenantId,
    requestedCents: amount,
    slices,
    memberHold,
    poolHold,
    overageCents,
    fullyCoveredByCredits: overageCents === 0,
  };
}
