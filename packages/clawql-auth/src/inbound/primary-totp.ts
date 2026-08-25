/**
 * Phase 5 — primary TOTP login (distinct from step-up for financial tools).
 * Verifies an enrolled TOTP and returns ATR claims for MCP / gateway.
 */

import { Data, Effect } from "effect";

import type { AtrClaims } from "../gateway.js";
import { verifyTotpEffect } from "../step-up/totp.js";
import { StepUpStoreService } from "../step-up/store.js";

export class PrimaryTotpError extends Data.TaggedError("PrimaryTotpError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type PrimaryTotpLoginInput = {
  tenantId: string;
  code: string;
  /** ATR subject (defaults to tenantId). */
  subjectId?: string;
  role?: string;
  scope?: string[];
};

/**
 * Verify TOTP for an enrolled tenant and return ATR claims.
 * Requires {@link StepUpStoreService} in the environment.
 */
export function primaryTotpLoginEffect(
  input: PrimaryTotpLoginInput
): Effect.Effect<AtrClaims, PrimaryTotpError, StepUpStoreService> {
  return Effect.gen(function* () {
    const store = yield* StepUpStoreService;
    const enrollment = yield* store
      .getEnrollment(input.tenantId)
      .pipe(
        Effect.mapError(
          (cause) => new PrimaryTotpError({ reason: "enrollment_lookup_failed", cause })
        )
      );
    if (!enrollment?.secretBase32) {
      return yield* Effect.fail(new PrimaryTotpError({ reason: "not_enrolled" }));
    }
    const ok = yield* verifyTotpEffect(enrollment.secretBase32, input.code).pipe(
      Effect.mapError((cause) => new PrimaryTotpError({ reason: "totp_verify_failed", cause }))
    );
    if (!ok) {
      return yield* Effect.fail(new PrimaryTotpError({ reason: "invalid_code" }));
    }
    return {
      sub: input.subjectId ?? input.tenantId,
      role: input.role ?? "operator",
      scope: input.scope ?? ["execute", "search", "memory"],
      mfa: true,
      amr: ["otp"],
    } satisfies AtrClaims;
  });
}
