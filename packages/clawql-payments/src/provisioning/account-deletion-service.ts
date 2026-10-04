/**
 * Cascade account deletion: ClawQL user, provisioned orgs, Stripe customer,
 * Supabase Auth user, vault notes (crypto-shred), API keys. WORM keeps hashed refs only.
 */

import { createHash } from "node:crypto";
import { IdentityStoreService, IssuedApiKeyStoreService } from "clawql-auth";
import { Context, Data, Effect, Layer } from "effect";
import { memoryEraseProgram } from "clawql-memory/erase/erase";
import { getObsidianVaultPath } from "clawql-memory/vault/config";
import { listVaultMarkdownRelPathsEffect } from "clawql-memory/vault/slug-index";
import { SupabaseAuthService } from "clawql-supabase";
import { buildAccountDeletedEntry } from "../audit/events.js";
import { OrgCreditsService } from "../credits/org.js";
import { PaymentError } from "../errors/payment-errors.js";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import { StripeBillingService } from "../stripe/stripe-billing-service.js";
import { StripeNotConfigured } from "../stripe/stripe-errors.js";

export class AccountDeletionError extends Data.TaggedError("AccountDeletionError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type DeleteAccountInput = {
  readonly clawqlUserId: string;
  readonly correlationId?: string;
  readonly env?: NodeJS.ProcessEnv;
};

export type DeleteAccountResult = {
  readonly userIdHash: string;
  readonly orgsDeleted: number;
  readonly stripeCustomersDeleted: number;
  readonly supabaseUserDeleted: boolean;
  readonly vaultNotesErased: number;
  readonly keysRevoked: number;
};

const sha256HexEffect = (value: string): Effect.Effect<string> =>
  Effect.sync(() => createHash("sha256").update(value, "utf8").digest("hex"));

export class AccountDeletionService extends Context.Service<
  AccountDeletionService,
  {
    readonly deleteAccount: (
      input: DeleteAccountInput
    ) => Effect.Effect<DeleteAccountResult, AccountDeletionError | PaymentError>;
  }
>()("clawql/AccountDeletionService") {}

export function accountDeletionLiveLayer(): Layer.Layer<
  AccountDeletionService,
  never,
  | IdentityStoreService
  | OrgCreditsService
  | IssuedApiKeyStoreService
  | PaymentAuditService
  | StripeBillingService
  | SupabaseAuthService
> {
  return Layer.effect(
    AccountDeletionService,
    Effect.gen(function* () {
      const identities = yield* IdentityStoreService;
      const orgs = yield* OrgCreditsService;
      const apiKeys = yield* IssuedApiKeyStoreService;
      const audit = yield* PaymentAuditService;
      const stripe = yield* StripeBillingService;
      const supabase = yield* SupabaseAuthService;

      const deleteAccount = (input: DeleteAccountInput) =>
        Effect.gen(function* () {
          const userId = input.clawqlUserId.trim();
          if (!userId) {
            return yield* Effect.fail(
              new AccountDeletionError({ reason: "clawqlUserId is required" })
            );
          }
          const user = yield* identities.getByUserId(userId);
          if (!user) {
            return yield* Effect.fail(new AccountDeletionError({ reason: "unknown ClawQL user" }));
          }

          const orgIds = [...user.orgIds];
          const tenantOrgs = yield* orgs
            .findForTenant(userId)
            .pipe(
              Effect.mapError(
                (cause) => new AccountDeletionError({ reason: "failed to list orgs", cause })
              )
            );
          for (const org of tenantOrgs) {
            if (!orgIds.includes(org.orgId)) orgIds.push(org.orgId);
          }

          let keysRevoked = 0;
          let stripeCustomersDeleted = 0;
          const stripeIds = new Set<string>();
          if (user.stripeCustomerId?.trim()) stripeIds.add(user.stripeCustomerId.trim());

          for (const orgId of orgIds) {
            const org = yield* orgs
              .get(orgId)
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new AccountDeletionError({ reason: `failed to load org ${orgId}`, cause })
                )
              );
            if (!org) continue;
            if (org.stripeCustomerId?.trim()) stripeIds.add(org.stripeCustomerId.trim());

            const active = yield* apiKeys.listActive({ orgId: org.orgId });
            for (const key of active.filter((k) => k.subjectId === userId)) {
              const revoked = yield* apiKeys.revoke(key.id).pipe(
                Effect.mapError(
                  (cause) =>
                    new AccountDeletionError({
                      reason: `failed to revoke key ${key.id}`,
                      cause,
                    })
                )
              );
              if (revoked) keysRevoked += 1;
            }

            yield* orgs
              .deleteOrg(org.orgId)
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new AccountDeletionError({ reason: `failed to delete org ${orgId}`, cause })
                )
              );
          }

          for (const customerId of stripeIds) {
            const deleted = yield* stripe.deleteCustomer(customerId).pipe(Effect.result);
            if (deleted._tag === "Success") {
              stripeCustomersDeleted += 1;
            } else if (!(deleted.failure instanceof StripeNotConfigured)) {
              // Missing Stripe config is a skip; other errors fail the cascade.
              return yield* Effect.fail(
                new AccountDeletionError({
                  reason: "stripe customer delete failed",
                  cause: deleted.failure,
                })
              );
            }
          }

          const supabaseSubjects = user.identities
            .filter((i) => i.provider === "supabase")
            .map((i) => i.subject);
          let supabaseUserDeleted = false;
          for (const subject of supabaseSubjects) {
            const del = yield* supabase.deleteAuthUser(subject, input.env).pipe(Effect.result);
            if (del._tag === "Success") {
              supabaseUserDeleted = true;
            }
          }

          let vaultNotesErased = 0;
          const vault = getObsidianVaultPath();
          if (vault) {
            const needles = [userId, ...orgIds].filter(Boolean);
            const paths = yield* listVaultMarkdownRelPathsEffect(vault, "Memory", 5000).pipe(
              Effect.catch(() => Effect.succeed([] as string[]))
            );
            for (const rel of paths) {
              const hit = needles.some((n) => rel.includes(n));
              if (!hit) continue;
              const erased = yield* memoryEraseProgram({
                path: rel,
                correlationId: input.correlationId,
              });
              if (erased.ok) vaultNotesErased += 1;
            }
          }

          const userIdHash = yield* sha256HexEffect(userId);
          const orgHash = yield* sha256HexEffect(orgIds.sort().join(","));
          const supabaseHash = yield* sha256HexEffect(supabaseSubjects.sort().join(","));
          const stripeHash = yield* sha256HexEffect([...stripeIds].sort().join(","));

          yield* identities
            .deleteUser(userId)
            .pipe(
              Effect.mapError(
                (cause) => new AccountDeletionError({ reason: "failed to delete identity", cause })
              )
            );

          yield* audit.appendEntry(
            buildAccountDeletedEntry({
              userIdHash,
              orgIdsHash: orgHash,
              supabaseSubjectHash: supabaseHash,
              stripeCustomerHash: stripeHash,
              correlationId: input.correlationId,
            })
          );

          return {
            userIdHash,
            orgsDeleted: orgIds.length,
            stripeCustomersDeleted,
            supabaseUserDeleted,
            vaultNotesErased,
            keysRevoked,
          } satisfies DeleteAccountResult;
        });

      return AccountDeletionService.of({ deleteAccount });
    })
  );
}
