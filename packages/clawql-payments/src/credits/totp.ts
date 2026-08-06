/**
 * Minimal RFC 6238 TOTP — Effect wrappers over clawql-auth (shared step-up primitives).
 * Secrets stay under $CLAWQL_HOME/Payments/ via the step-up store.
 *
 * clawql-auth still exposes these as sync functions, so we wrap them as `Effect.sync`
 * here to keep the payments credits surface Effect-first. Swap to re-exporting auth's
 * Effect APIs once clawql-auth's TOTP is converted.
 */

import { Effect } from "effect";
import {
  decodeBase32 as decodeBase32Sync,
  generateTotp as generateTotpSync,
  generateTotpSecret as generateTotpSecretSync,
  totpOtpauthUrl as totpOtpauthUrlSync,
  verifyTotp as verifyTotpSync,
} from "clawql-auth";

export const generateTotpSecret = (bytes?: number): Effect.Effect<string> =>
  Effect.sync(() => generateTotpSecretSync(bytes));

export const decodeBase32 = (secret: string): Effect.Effect<Buffer, Error> =>
  Effect.try(() => decodeBase32Sync(secret));

export const generateTotp = (
  secretBase32: string,
  options?: { timeMs?: number; stepSec?: number; digits?: number }
): Effect.Effect<string, Error> => Effect.try(() => generateTotpSync(secretBase32, options));

export const verifyTotp = (
  secretBase32: string,
  token: string,
  options?: { timeMs?: number; stepSec?: number; digits?: number; window?: number }
): Effect.Effect<boolean, Error> => Effect.try(() => verifyTotpSync(secretBase32, token, options));

export const totpOtpauthUrl = (input: {
  secretBase32: string;
  accountName: string;
  issuer?: string;
}): Effect.Effect<string> => Effect.sync(() => totpOtpauthUrlSync(input));
