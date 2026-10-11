/**
 * Org inference spend waterfall:
 *   1. Debit / hold member balance
 *   2. Fall through to company pool for the remainder
 *   3. Record Stripe overage intent when still short (billing admin)
 *
 * Does not charge Stripe here — returns `overageCents` for the caller / meter path.
 */

import { Context, Data, Effect, Layer } from "effect";
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

export class OrgWaterfallError extends Data.TaggedError("OrgWaterfallError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/**
 * Authorize spend with member → pool → overage hierarchy (Effect-primary).
 */
export function holdOrgWaterfallEffect(
  input: HoldOrgWaterfallInput,
  env: NodeJS.ProcessEnv = process.env
): Effect.Effect<OrgWaterfallHoldResult, OrgWaterfallError> {
  return Effect.gen(function* () {
    const amount = Math.round(input.amountCents);
    if (!Number.isFinite(amount) || amount <= 0) {
      return yield* Effect.fail(new OrgWaterfallError({ reason: "amountCents must be > 0" }));
    }

    const org = yield* Effect.tryPromise({
      try: () => getOrg(input.orgId, env),
      catch: (cause) =>
        new OrgWaterfallError({
          reason: cause instanceof Error ? cause.message : "Failed to load org",
          cause,
        }),
    });
    if (!org) {
      return yield* Effect.fail(new OrgWaterfallError({ reason: `Unknown org: ${input.orgId}` }));
    }
    const member = findMembership(org, input.memberTenantId);
    if (!member) {
      return yield* Effect.fail(
        new OrgWaterfallError({ reason: `Not an active member: ${input.memberTenantId}` })
      );
    }

    const allowOverage = input.allowOverage !== false;
    const memberAcct = yield* Effect.tryPromise({
      try: () => getCreditAccount(member.memberTenantId, env),
      catch: (cause) =>
        new OrgWaterfallError({
          reason: cause instanceof Error ? cause.message : "Failed to load member account",
          cause,
        }),
    });
    const poolAcct = yield* Effect.tryPromise({
      try: () => getCreditAccount(org.poolTenantId, env),
      catch: (cause) =>
        new OrgWaterfallError({
          reason: cause instanceof Error ? cause.message : "Failed to load pool account",
          cause,
        }),
    });
    const memberAvail = Math.max(0, spendableBalanceCents(memberAcct));
    const poolAvail = Math.max(0, spendableBalanceCents(poolAcct));

    const fromMember = Math.min(memberAvail, amount);
    const remainderAfterMember = amount - fromMember;
    const fromPool = Math.min(poolAvail, remainderAfterMember);
    const overageCents = remainderAfterMember - fromPool;

    if (overageCents > 0 && !allowOverage) {
      return yield* Effect.fail(
        new OrgWaterfallError({
          reason:
            `Insufficient org credits for ${input.memberTenantId}: need ${amount}c, ` +
            `member ${memberAvail}c + pool ${poolAvail}c (short ${overageCents}c)`,
        })
      );
    }

    const baseKey = input.idempotencyKey.trim();
    const slices: WaterfallSlice[] = [];
    let memberHold: OrgWaterfallHoldResult["memberHold"];
    let poolHold: OrgWaterfallHoldResult["poolHold"];

    if (fromMember > 0) {
      const key = `${baseKey}:member`;
      const result = yield* Effect.tryPromise({
        try: () =>
          holdCredits(
            {
              tenantId: member.memberTenantId,
              amountCents: fromMember,
              idempotencyKey: key,
              resource: input.resource,
              correlationId: input.correlationId,
              note: input.note ?? `org ${org.orgId} waterfall member`,
            },
            env
          ),
        catch: (cause) =>
          new OrgWaterfallError({
            reason: cause instanceof Error ? cause.message : "Member hold failed",
            cause,
          }),
      });
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
      const result = yield* Effect.tryPromise({
        try: () =>
          holdCredits(
            {
              tenantId: org.poolTenantId,
              amountCents: fromPool,
              idempotencyKey: key,
              resource: input.resource,
              correlationId: input.correlationId,
              note: input.note ?? `org ${org.orgId} waterfall pool fallthrough`,
            },
            env
          ),
        catch: (cause) =>
          new OrgWaterfallError({
            reason: cause instanceof Error ? cause.message : "Pool hold failed",
            cause,
          }),
      });
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
  });
}

/** Promise façade for callers that still await waterfall authorization. */
export async function holdOrgWaterfall(
  input: HoldOrgWaterfallInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<OrgWaterfallHoldResult> {
  return Effect.runPromise(holdOrgWaterfallEffect(input, env));
}

/** Effect surface over org member → pool → overage spend waterfall. */
export class OrgWaterfallService extends Context.Service<
  OrgWaterfallService,
  {
    readonly hold: (
      input: HoldOrgWaterfallInput
    ) => Effect.Effect<OrgWaterfallHoldResult, OrgWaterfallError>;
  }
>()("clawql/OrgWaterfallService") {}

export function orgWaterfallLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<OrgWaterfallService> {
  return Layer.succeed(
    OrgWaterfallService,
    OrgWaterfallService.of({
      hold: (input) => holdOrgWaterfallEffect(input, env),
    })
  );
}
