/**
 * File-backed TOTP step-up enrollment store.
 * Callers choose the path (e.g. `$CLAWQL_HOME/Payments/step-up-totp.json`).
 * Never put secrets in payment WORM or audit logs.
 *
 * IO is Effect-based via {@link StepUpStoreService}; hosts provide {@link createStepUpStoreLayer}
 * (e.g. clawql-payments' CreditsStepUpService) and run it at their own boundary.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Context, Data, Effect, Layer } from "effect";

import { generateTotpSecretEffect, totpOtpauthUrlEffect, verifyTotpEffect } from "./totp.js";

export type StepUpTotpEnrollment = {
  readonly subjectId: string;
  readonly secretBase32: string;
  readonly enrolledAt: string;
  readonly label?: string;
};

type StepUpFile = {
  subjects: Record<string, StepUpTotpEnrollment>;
};

export type StepUpEnrollInput = {
  subjectId: string;
  label?: string;
  secretBase32?: string;
  issuer?: string;
};

export type StepUpEnrollResult = {
  enrollment: StepUpTotpEnrollment;
  otpauthUrl: string;
  created: boolean;
};

/** Typed failure for step-up store IO (Effect failure channel). */
export class StepUpStoreError extends Data.TaggedError("StepUpStoreError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

function errMsg(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function parseStepUpFile(raw: string): StepUpFile {
  const parsed = JSON.parse(raw) as StepUpFile & {
    /** @deprecated payments used `tenants` before the shared store. */
    tenants?: Record<string, StepUpTotpEnrollment & { tenantId?: string }>;
  };
  if (!parsed || typeof parsed !== "object") return { subjects: {} };
  if (parsed.subjects && typeof parsed.subjects === "object") {
    return { subjects: parsed.subjects };
  }
  // Migrate legacy payments shape `{ tenants: { [id]: { tenantId, ... } } }`
  if (parsed.tenants && typeof parsed.tenants === "object") {
    const subjects: Record<string, StepUpTotpEnrollment> = {};
    for (const [id, row] of Object.entries(parsed.tenants)) {
      subjects[id] = {
        subjectId: row.subjectId ?? row.tenantId ?? id,
        secretBase32: row.secretBase32,
        enrolledAt: row.enrolledAt,
        label: row.label,
      };
    }
    return { subjects };
  }
  return { subjects: {} };
}

function loadFileEffect(path: string): Effect.Effect<StepUpFile, StepUpStoreError> {
  return Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (cause) =>
      new StepUpStoreError({ reason: `Failed to read step-up store: ${errMsg(cause)}`, cause }),
  }).pipe(
    Effect.catchIf(
      (err) => (err.cause as NodeJS.ErrnoException | undefined)?.code === "ENOENT",
      () => Effect.succeed<string | undefined>(undefined)
    ),
    Effect.flatMap((raw) =>
      raw === undefined
        ? Effect.succeed<StepUpFile>({ subjects: {} })
        : Effect.try({
            try: () => parseStepUpFile(raw),
            catch: (cause) =>
              new StepUpStoreError({
                reason: `Invalid step-up store JSON: ${errMsg(cause)}`,
                cause,
              }),
          })
    )
  );
}

function saveFileEffect(path: string, file: StepUpFile): Effect.Effect<void, StepUpStoreError> {
  return Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    },
    catch: (cause) =>
      new StepUpStoreError({ reason: `Failed to write step-up store: ${errMsg(cause)}`, cause }),
  });
}

export class StepUpStoreService extends Context.Tag("clawql/StepUpStoreService")<
  StepUpStoreService,
  {
    readonly path: string;
    readonly getEnrollment: (
      subjectId: string
    ) => Effect.Effect<StepUpTotpEnrollment | undefined, StepUpStoreError>;
    readonly enroll: (
      input: StepUpEnrollInput
    ) => Effect.Effect<StepUpEnrollResult, StepUpStoreError>;
    readonly verify: (subjectId: string, token: string) => Effect.Effect<boolean, StepUpStoreError>;
    readonly require: (
      subjectId: string,
      token: string | undefined,
      enrollHint?: string
    ) => Effect.Effect<void, StepUpStoreError>;
  }
>() {}

export function stepUpStoreServiceFromPath(path: string) {
  const getEnrollment = (
    subjectId: string
  ): Effect.Effect<StepUpTotpEnrollment | undefined, StepUpStoreError> =>
    Effect.gen(function* () {
      const id = subjectId.trim();
      if (!id) return undefined;
      const file = yield* loadFileEffect(path);
      return file.subjects[id];
    });

  return StepUpStoreService.of({
    path,
    getEnrollment,
    enroll: (input) =>
      Effect.gen(function* () {
        const subjectId = input.subjectId.trim();
        if (!subjectId) {
          return yield* Effect.fail(new StepUpStoreError({ reason: "subjectId required" }));
        }
        const file = yield* loadFileEffect(path);
        const existing = file.subjects[subjectId];
        const issuer = input.issuer ?? "ClawQL";
        if (existing) {
          const otpauthUrl = yield* totpOtpauthUrlEffect({
            secretBase32: existing.secretBase32,
            accountName: subjectId,
            issuer,
          });
          return {
            enrollment: existing,
            otpauthUrl,
            created: false,
          } satisfies StepUpEnrollResult;
        }
        const secretBase32 = input.secretBase32?.trim() || (yield* generateTotpSecretEffect());
        const enrollment: StepUpTotpEnrollment = {
          subjectId,
          secretBase32,
          enrolledAt: new Date().toISOString(),
          label: input.label?.trim() || undefined,
        };
        file.subjects[subjectId] = enrollment;
        yield* saveFileEffect(path, file);
        const otpauthUrl = yield* totpOtpauthUrlEffect({
          secretBase32,
          accountName: subjectId,
          issuer,
        });
        return {
          enrollment,
          otpauthUrl,
          created: true,
        } satisfies StepUpEnrollResult;
      }),
    verify: (subjectId, token) =>
      getEnrollment(subjectId).pipe(
        Effect.flatMap((enrollment) =>
          enrollment
            ? verifyTotpEffect(enrollment.secretBase32, token).pipe(
                Effect.mapError(
                  (err) => new StepUpStoreError({ reason: err.reason, cause: err.cause })
                )
              )
            : Effect.succeed(false)
        )
      ),
    require: (subjectId, token, enrollHint) =>
      Effect.gen(function* () {
        const enrollment = yield* getEnrollment(subjectId);
        if (!enrollment) {
          return yield* Effect.fail(
            new StepUpStoreError({
              reason:
                enrollHint ??
                `TOTP step-up required but subject ${subjectId} is not enrolled — enroll via clawql-auth step-up`,
            })
          );
        }
        if (!token?.trim()) {
          return yield* Effect.fail(new StepUpStoreError({ reason: "TOTP code required" }));
        }
        const valid = yield* verifyTotpEffect(enrollment.secretBase32, token).pipe(
          Effect.mapError((err) => new StepUpStoreError({ reason: err.reason, cause: err.cause }))
        );
        if (!valid) {
          return yield* Effect.fail(new StepUpStoreError({ reason: "Invalid TOTP code" }));
        }
      }),
  });
}

/** Build an isolated step-up store service layer for a given file path. */
export function createStepUpStoreLayer(path: string): Layer.Layer<StepUpStoreService> {
  return Layer.succeed(StepUpStoreService, stepUpStoreServiceFromPath(path));
}
