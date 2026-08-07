/**
 * Minimal RFC 6238 TOTP — re-exported from clawql-auth's Effect step-up primitives.
 * Secrets stay under $CLAWQL_HOME/Payments/ via the step-up store.
 *
 * clawql-auth's public API is Effect-only, so the credits surface just re-exports the auth
 * Effect functions under the local names used across payments.
 */

export {
  decodeBase32Effect as decodeBase32,
  generateTotpEffect as generateTotp,
  generateTotpSecretEffect as generateTotpSecret,
  totpOtpauthUrlEffect as totpOtpauthUrl,
  verifyTotpEffect as verifyTotp,
} from "clawql-auth";
