/**
 * Minimal RFC 6238 TOTP — re-exported from clawql-auth (shared step-up primitives).
 * Secrets stay under $CLAWQL_HOME/Payments/ via the step-up store.
 */

export {
  decodeBase32,
  generateTotp,
  generateTotpSecret,
  totpOtpauthUrl,
  verifyTotp,
} from "clawql-auth";
