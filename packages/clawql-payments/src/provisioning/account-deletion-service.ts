/**
 * Cascade account deletion as a resumable job across five systems
 * (keys, org, Stripe, vault, Supabase). Identity + WORM complete only after
 * every system step succeeds. ACCOUNT_DELETED is written once.
 */

import { createHash } from "node:crypto";
import { IdentityStoreService, IssuedApiKeyStoreService } from "clawql-auth";
import { Context, Data, Effect, Layer } from "effect";
import { name, PrincipalId, VaultPath } from "clawql-gdp";
import { eraseAuthorizedEffect, memoryEraseProgram } from "clawql-memory/erase/erase";
import { getObsidianVaultPath } from "clawql-memory/vault/config";
import { listVaultMarkdownRelPathsEffect } from "clawql-memory/vault/slug-index";
import { SupabaseAuthService } from "clawql-supabase";
import { buildAccountDeletedEntry } from "../audit/events.js";
import { OrgCreditsService } from "../credits/org.js";
import { PaymentError } from "../errors/payment-errors.js";
import { PaymentAuditService } from "../plugin/payment-audit-service.js";
import { StripeBillingService } from "../stripe/stripe-billing-service.js";
import { StripeNotConfigured } from "../stripe/stripe-errors.js";
import {
  ACCOUNT_DELETION_STEPS,
  AccountDeletionJobStoreError,
  AccountDeletionJobStoreService,
  accountDeletionSystemsCompleteEffect,
  emptyAccountDeletionStepsEffect,
  generateAccountDeletionJobIdEffect,
  isAccountDeletionJobIdEffect,
  type AccountDeletionJob,
  type AccountDeletionStepId,
  type AccountDeletionStepState,
} from "./account-deletion-job-store.js";

export class AccountDeletionError extends Data.TaggedError("AccountDeletionError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export class AccountDeletionIncompleteError extends Data.TaggedError(
  "AccountDeletionIncompleteError"
)<{
  readonly reason: string;
  readonly job: AccountDeletionJob;
}> {}

export type DeleteAccountInput = {
  readonly clawqlUserId?: string;
  readonly jobId?: string;
  readonly correlationId?: string;
  readonly env?: NodeJS.ProcessEnv;
};

export type DeleteAccountResult = {
  readonly jobId: string;
  readonly status: AccountDeletionJob["status"];
  readonly userIdHash: string;
  readonly orgsDeleted: number;
  readonly stripeCustomersDeleted: number;
  readonly supabaseUserDeleted: boolean;
  readonly vaultNotesErased: number;
  readonly keysRevoked: number;
  readonly steps: AccountDeletionJob["steps"];
  readonly wormWritten: boolean;
};

const sha256HexEffect = (value: string): Effect.Effect<string> =>
  Effect.sync(() => createHash("sha256").update(value, "utf8").digest("hex"));

const nowIsoEffect = (): Effect.Effect<string> => Effect.sync(() => new Date().toISOString());

const stepDone = (state: AccountDeletionStepState): boolean =>
  state.status === "completed" || state.status === "skipped";

const resultFromJobEffect = (job: AccountDeletionJob): Effect.Effect<DeleteAccountResult> =>
  Effect.gen(function* () {
    const userIdHash = yield* sha256HexEffect(job.clawqlUserId);
    return {
      jobId: job.jobId,
      status: job.status,
      userIdHash,
      orgsDeleted: job.steps.org.orgsDeleted ?? job.orgIds.length,
      stripeCustomersDeleted: job.steps.stripe.stripeCustomersDeleted ?? 0,
      supabaseUserDeleted: job.steps.supabase.supabaseUserDeleted === true,
      vaultNotesErased: job.steps.vault.vaultNotesErased ?? 0,
      keysRevoked: job.steps.keys.keysRevoked ?? 0,
      steps: job.steps,
      wormWritten: job.wormWritten,
    } satisfies DeleteAccountResult;
  });

const patchStep = (
  job: AccountDeletionJob,
  id: AccountDeletionStepId,
  patch: AccountDeletionStepState
): Effect.Effect<AccountDeletionJob> =>
  Effect.gen(function* () {
    const updatedAt = yield* nowIsoEffect();
    return {
      ...job,
      status: "in_progress" as const,
      updatedAt,
      steps: { ...job.steps, [id]: patch },
    };
  });

export class AccountDeletionService extends Context.Service<
  AccountDeletionService,
  {
    readonly deleteAccount: (
      input: DeleteAccountInput
    ) => Effect.Effect<
      DeleteAccountResult,
      | AccountDeletionError
      | AccountDeletionIncompleteError
      | PaymentError
      | AccountDeletionJobStoreError
    >;
    readonly resumeDeletion: (
      jobId: string
    ) => Effect.Effect<
      DeleteAccountResult,
      | AccountDeletionError
      | AccountDeletionIncompleteError
      | PaymentError
      | AccountDeletionJobStoreError
    >;
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
  | AccountDeletionJobStoreService
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
      const jobs = yield* AccountDeletionJobStoreService;

      const persist = (job: AccountDeletionJob) => jobs.save(job);

      const failStep = (job: AccountDeletionJob, id: AccountDeletionStepId, reason: string) =>
        Effect.gen(function* () {
          const updatedAt = yield* nowIsoEffect();
          const failed: AccountDeletionJob = {
            ...job,
            status: "failed",
            updatedAt,
            steps: {
              ...job.steps,
              [id]: { ...job.steps[id], status: "failed", error: reason, completedAt: updatedAt },
            },
          };
          const saved = yield* persist(failed);
          return yield* Effect.fail(new AccountDeletionIncompleteError({ reason, job: saved }));
        });

      const runKeys = (job: AccountDeletionJob) =>
        Effect.gen(function* () {
          if (stepDone(job.steps.keys)) return job;
          let keysRevoked = 0;
          for (const orgId of job.orgIds) {
            const active = yield* apiKeys
              .listActive({ orgId })
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new AccountDeletionError({ reason: `failed to list keys for ${orgId}`, cause })
                )
              );
            for (const key of active.filter((k) => k.subjectId === job.clawqlUserId)) {
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
          }
          const completedAt = yield* nowIsoEffect();
          return yield* persist(
            yield* patchStep(job, "keys", {
              status: "completed",
              keysRevoked,
              completedAt,
            })
          );
        });

      const runOrg = (job: AccountDeletionJob) =>
        Effect.gen(function* () {
          if (stepDone(job.steps.org)) return job;
          let orgsDeleted = 0;
          for (const orgId of job.orgIds) {
            const org = yield* orgs
              .get(orgId)
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new AccountDeletionError({ reason: `failed to load org ${orgId}`, cause })
                )
              );
            if (!org) {
              orgsDeleted += 1;
              continue;
            }
            yield* orgs
              .deleteOrg(org.orgId)
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new AccountDeletionError({ reason: `failed to delete org ${orgId}`, cause })
                )
              );
            orgsDeleted += 1;
          }
          const completedAt = yield* nowIsoEffect();
          return yield* persist(
            yield* patchStep(job, "org", {
              status: "completed",
              orgsDeleted,
              completedAt,
            })
          );
        });

      const runStripe = (job: AccountDeletionJob) =>
        Effect.gen(function* () {
          if (stepDone(job.steps.stripe)) return job;
          if (job.stripeCustomerIds.length === 0) {
            const completedAt = yield* nowIsoEffect();
            return yield* persist(
              yield* patchStep(job, "stripe", {
                status: "skipped",
                stripeCustomersDeleted: 0,
                completedAt,
              })
            );
          }
          let stripeCustomersDeleted = 0;
          for (const customerId of job.stripeCustomerIds) {
            const deleted = yield* stripe.deleteCustomer(customerId).pipe(Effect.result);
            if (deleted._tag === "Success") {
              stripeCustomersDeleted += 1;
              continue;
            }
            if (deleted.failure instanceof StripeNotConfigured) {
              const completedAt = yield* nowIsoEffect();
              return yield* persist(
                yield* patchStep(job, "stripe", {
                  status: "skipped",
                  stripeCustomersDeleted,
                  completedAt,
                })
              );
            }
            return yield* failStep(
              job,
              "stripe",
              deleted.failure && typeof deleted.failure === "object" && "reason" in deleted.failure
                ? String((deleted.failure as { reason: string }).reason)
                : "stripe customer delete failed"
            );
          }
          const completedAt = yield* nowIsoEffect();
          return yield* persist(
            yield* patchStep(job, "stripe", {
              status: "completed",
              stripeCustomersDeleted,
              completedAt,
            })
          );
        });

      const runVault = (job: AccountDeletionJob) =>
        Effect.gen(function* () {
          if (stepDone(job.steps.vault)) return job;
          let vaultNotesErased = 0;
          const vault = getObsidianVaultPath();
          if (!vault) {
            const completedAt = yield* nowIsoEffect();
            return yield* persist(
              yield* patchStep(job, "vault", {
                status: "skipped",
                vaultNotesErased: 0,
                completedAt,
              })
            );
          }
          const needles = [job.clawqlUserId, ...job.orgIds].filter(Boolean);
          const paths = yield* listVaultMarkdownRelPathsEffect(vault, "Memory", 5000).pipe(
            Effect.catch(() => Effect.succeed([] as string[]))
          );
          for (const rel of paths) {
            const hit = needles.some((n) => rel.includes(n));
            if (!hit) continue;
            const principalId = `operator:account-deletion:${job.clawqlUserId}`;
            const erased = yield* name(
              PrincipalId(principalId),
              VaultPath(rel),
              (principal, path) =>
                Effect.gen(function* () {
                  const proof = yield* eraseAuthorizedEffect(principal, path, {
                    principalId,
                    vaultPath: rel,
                  });
                  if (!proof) {
                    return { ok: false as const };
                  }
                  return yield* memoryEraseProgram(principal, path, proof, {
                    path: rel,
                    correlationId: job.correlationId,
                  });
                })
            );
            if (erased.ok) vaultNotesErased += 1;
          }
          const completedAt = yield* nowIsoEffect();
          return yield* persist(
            yield* patchStep(job, "vault", {
              status: "completed",
              vaultNotesErased,
              completedAt,
            })
          );
        });

      const runSupabase = (job: AccountDeletionJob, env?: NodeJS.ProcessEnv) =>
        Effect.gen(function* () {
          if (stepDone(job.steps.supabase)) return job;
          if (job.supabaseSubjects.length === 0) {
            const completedAt = yield* nowIsoEffect();
            return yield* persist(
              yield* patchStep(job, "supabase", {
                status: "skipped",
                supabaseUserDeleted: false,
                completedAt,
              })
            );
          }
          let supabaseUserDeleted = false;
          for (const subject of job.supabaseSubjects) {
            const del = yield* supabase.deleteAuthUser(subject, env).pipe(Effect.result);
            if (del._tag === "Success") {
              supabaseUserDeleted = true;
              continue;
            }
            const reason =
              del.failure && typeof del.failure === "object" && "reason" in del.failure
                ? String((del.failure as { reason: string }).reason)
                : "supabase auth user delete failed";
            return yield* failStep(job, "supabase", reason);
          }
          const completedAt = yield* nowIsoEffect();
          return yield* persist(
            yield* patchStep(job, "supabase", {
              status: "completed",
              supabaseUserDeleted,
              completedAt,
            })
          );
        });

      const finalize = (job: AccountDeletionJob) =>
        Effect.gen(function* () {
          const systemsDone = yield* accountDeletionSystemsCompleteEffect(job);
          if (!systemsDone) {
            return yield* Effect.fail(
              new AccountDeletionIncompleteError({
                reason: "deletion systems incomplete",
                job,
              })
            );
          }

          let next = job;
          if (!next.identityDeleted) {
            yield* identities
              .deleteUser(next.clawqlUserId)
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new AccountDeletionError({ reason: "failed to delete identity", cause })
                )
              );
            const updatedAt = yield* nowIsoEffect();
            next = yield* persist({ ...next, identityDeleted: true, updatedAt });
          }

          if (!next.wormWritten) {
            const userIdHash = yield* sha256HexEffect(next.clawqlUserId);
            const orgHash = yield* sha256HexEffect([...next.orgIds].sort().join(","));
            const supabaseHash = yield* sha256HexEffect(
              [...next.supabaseSubjects].sort().join(",")
            );
            const stripeHash = yield* sha256HexEffect([...next.stripeCustomerIds].sort().join(","));
            yield* audit.appendEntry(
              buildAccountDeletedEntry({
                userIdHash,
                orgIdsHash: orgHash,
                supabaseSubjectHash: supabaseHash,
                stripeCustomerHash: stripeHash,
                correlationId: next.correlationId,
              })
            );
            const updatedAt = yield* nowIsoEffect();
            next = yield* persist({
              ...next,
              wormWritten: true,
              status: "completed",
              updatedAt,
            });
          } else if (next.status !== "completed") {
            const updatedAt = yield* nowIsoEffect();
            next = yield* persist({ ...next, status: "completed", updatedAt });
          }

          return yield* resultFromJobEffect(next);
        });

      const runJob = (job: AccountDeletionJob, env?: NodeJS.ProcessEnv) =>
        Effect.gen(function* () {
          if (job.status === "completed" && job.wormWritten) {
            return yield* resultFromJobEffect(job);
          }
          let current = job;
          for (const step of ACCOUNT_DELETION_STEPS) {
            if (step === "keys") current = yield* runKeys(current);
            else if (step === "org") current = yield* runOrg(current);
            else if (step === "stripe") current = yield* runStripe(current);
            else if (step === "vault") current = yield* runVault(current);
            else current = yield* runSupabase(current, env);
          }
          return yield* finalize(current);
        });

      const snapshotTargets = (userId: string) =>
        Effect.gen(function* () {
          const user = yield* identities
            .getByUserId(userId)
            .pipe(
              Effect.mapError(
                (cause) => new AccountDeletionError({ reason: "failed to load ClawQL user", cause })
              )
            );
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
            if (org?.stripeCustomerId?.trim()) stripeIds.add(org.stripeCustomerId.trim());
          }
          const supabaseSubjects = user.identities
            .filter((i) => i.provider === "supabase")
            .map((i) => i.subject);
          return { user, orgIds, stripeIds: [...stripeIds], supabaseSubjects };
        });

      const createJob = (input: DeleteAccountInput & { clawqlUserId: string }) =>
        Effect.gen(function* () {
          const snap = yield* snapshotTargets(input.clawqlUserId);
          const jobId = yield* generateAccountDeletionJobIdEffect();
          const now = yield* nowIsoEffect();
          const steps = yield* emptyAccountDeletionStepsEffect();
          const job: AccountDeletionJob = {
            jobId,
            clawqlUserId: input.clawqlUserId.trim(),
            status: "pending",
            orgIds: snap.orgIds,
            stripeCustomerIds: snap.stripeIds,
            supabaseSubjects: snap.supabaseSubjects,
            steps,
            identityDeleted: false,
            wormWritten: false,
            createdAt: now,
            updatedAt: now,
            correlationId: input.correlationId,
          };
          return yield* jobs.create(job);
        });

      const deleteAccount = (input: DeleteAccountInput) =>
        Effect.gen(function* () {
          const jobId = input.jobId?.trim();
          if (jobId) {
            const valid = yield* isAccountDeletionJobIdEffect(jobId);
            if (!valid) {
              return yield* Effect.fail(
                new AccountDeletionError({ reason: "invalid deletion job id" })
              );
            }
            const existing = yield* jobs.get(jobId);
            if (!existing) {
              return yield* Effect.fail(
                new AccountDeletionError({ reason: "unknown deletion job" })
              );
            }
            return yield* runJob(existing, input.env);
          }

          const userId = input.clawqlUserId?.trim();
          if (!userId) {
            return yield* Effect.fail(
              new AccountDeletionError({ reason: "clawqlUserId is required" })
            );
          }
          const open = yield* jobs.findOpenByUserId(userId);
          const job = open ?? (yield* createJob({ ...input, clawqlUserId: userId }));
          return yield* runJob(job, input.env);
        });

      const resumeDeletion = (jobId: string) => deleteAccount({ jobId });

      return AccountDeletionService.of({ deleteAccount, resumeDeletion });
    })
  );
}
