import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  MppVerificationService,
  type MppVerificationSuccess,
  type VerifyMppCredentialInput,
} from "./verification-service.js";
import type { MppPaymentChallenge } from "./types.js";

export type { MppVerificationSuccess, VerifyMppCredentialInput };

export async function registerMppChallenges(
  challenges: MppPaymentChallenge[],
  env?: NodeJS.ProcessEnv
): Promise<void> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const verification = yield* MppVerificationService;
      yield* verification.registerChallenges(challenges);
    }),
    env
  );
}

export async function verifyMppCredential(
  input: VerifyMppCredentialInput
): Promise<MppVerificationSuccess> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const verification = yield* MppVerificationService;
      return yield* verification.verifyCredential(input);
    }),
    input.env
  );
}
