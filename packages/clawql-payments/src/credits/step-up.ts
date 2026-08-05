/**
 * Per-tenant TOTP step-up enrollment for high-impact credit transfers.
 * Uses clawql-auth shared file store — never put secrets in the payment WORM.
 */

import {
  createFileStepUpStore,
  createStepUpStoreLayer,
  StepUpStoreError,
  StepUpStoreService,
  type StepUpTotpEnrollment as AuthEnrollment,
} from "clawql-auth";
import { join } from "node:path";
import { Context, Data, Effect, Layer } from "effect";
import { resolvePaymentsDir } from "../config/paths.js";

export type StepUpTotpEnrollment = {
  readonly tenantId: string;
  readonly secretBase32: string;
  readonly enrolledAt: string;
  readonly label?: string;
};

export function resolveStepUpTotpPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolvePaymentsDir(env), "step-up-totp.json");
}

function store(env: NodeJS.ProcessEnv = process.env) {
  return createFileStepUpStore(resolveStepUpTotpPath(env));
}

function toTenantEnrollment(row: AuthEnrollment): StepUpTotpEnrollment {
  return {
    tenantId: row.subjectId,
    secretBase32: row.secretBase32,
    enrolledAt: row.enrolledAt,
    label: row.label,
  };
}

/** @deprecated Promise façade — prefer CreditsStepUpService / Effect APIs. Forced edge only. */
export async function getStepUpEnrollment(
  tenantId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<StepUpTotpEnrollment | undefined> {
  const row = await store(env).getEnrollment(tenantId);
  return row ? toTenantEnrollment(row) : undefined;
}

/** @deprecated Promise façade — prefer CreditsStepUpService / Effect APIs. Forced edge only. */
export async function enrollStepUpTotp(
  input: { tenantId: string; label?: string; secretBase32?: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<{ enrollment: StepUpTotpEnrollment; otpauthUrl: string; created: boolean }> {
  const result = await store(env).enroll({
    subjectId: input.tenantId,
    label: input.label,
    secretBase32: input.secretBase32,
    issuer: "ClawQL Payments",
  });
  return {
    enrollment: toTenantEnrollment(result.enrollment),
    otpauthUrl: result.otpauthUrl,
    created: result.created,
  };
}

/** @deprecated Promise façade — prefer CreditsStepUpService / Effect APIs. Forced edge only. */
export async function verifyStepUpTotp(
  tenantId: string,
  token: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  return store(env).verify(tenantId, token);
}

/** @deprecated Promise façade — prefer CreditsStepUpService / Effect APIs. Forced edge only. */
export async function requireStepUpTotp(
  tenantId: string,
  token: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await store(env).require(tenantId, token, stepUpEnrollHint(tenantId));
}

function stepUpEnrollHint(tenantId: string): string {
  return `TOTP step-up required but tenant ${tenantId} is not enrolled — run: clawql payments credits step-up enroll --tenant-id ${tenantId}`;
}

export class CreditsStepUpError extends Data.TaggedError("CreditsStepUpError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

/**
 * Effect surface over per-tenant TOTP step-up enrollment.
 * Backed by the shared clawql-auth {@link StepUpStoreService}; tenantId maps to subjectId.
 */
export class CreditsStepUpService extends Context.Tag("clawql/CreditsStepUpService")<
  CreditsStepUpService,
  {
    readonly getEnrollment: (
      tenantId: string
    ) => Effect.Effect<StepUpTotpEnrollment | undefined, CreditsStepUpError>;
    readonly enroll: (input: {
      tenantId: string;
      label?: string;
      secretBase32?: string;
    }) => Effect.Effect<
      { enrollment: StepUpTotpEnrollment; otpauthUrl: string; created: boolean },
      CreditsStepUpError
    >;
    readonly verify: (
      tenantId: string,
      token: string
    ) => Effect.Effect<boolean, CreditsStepUpError>;
    readonly require: (
      tenantId: string,
      token: string | undefined
    ) => Effect.Effect<void, CreditsStepUpError>;
  }
>() {}

/**
 * Live step-up service backed by the shared clawql-auth store at the payments path.
 * Provides {@link StepUpStoreService} internally (never the Promise createFileStepUpStore).
 */
export function creditsStepUpLiveLayer(
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<CreditsStepUpService> {
  return Layer.effect(
    CreditsStepUpService,
    Effect.gen(function* () {
      const storeService = yield* StepUpStoreService;
      const toStepUpError = (error: StepUpStoreError) =>
        new CreditsStepUpError({ reason: error.reason, cause: error.cause });

      return CreditsStepUpService.of({
        getEnrollment: (tenantId) =>
          storeService.getEnrollment(tenantId).pipe(
            Effect.map((row) => (row ? toTenantEnrollment(row) : undefined)),
            Effect.mapError(toStepUpError)
          ),
        enroll: (input) =>
          storeService
            .enroll({
              subjectId: input.tenantId,
              label: input.label,
              secretBase32: input.secretBase32,
              issuer: "ClawQL Payments",
            })
            .pipe(
              Effect.map((result) => ({
                enrollment: toTenantEnrollment(result.enrollment),
                otpauthUrl: result.otpauthUrl,
                created: result.created,
              })),
              Effect.mapError(toStepUpError)
            ),
        verify: (tenantId, token) =>
          storeService.verify(tenantId, token).pipe(Effect.mapError(toStepUpError)),
        require: (tenantId, token) =>
          storeService
            .require(tenantId, token, stepUpEnrollHint(tenantId))
            .pipe(Effect.mapError(toStepUpError)),
      });
    })
  ).pipe(Layer.provide(createStepUpStoreLayer(resolveStepUpTotpPath(env))));
}
