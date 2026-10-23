/**
 * SIWE (Sign-In with Ethereum) — optional inbound login surface.
 * Import `clawql-auth/siwe` explicitly; kept off the package root / gateway
 * Ready graph so viem is not evaluated at listen.
 */
export {
  SiweError,
  buildSiweMessage,
  issueSiweNonceEffect,
  parseSiweMessage,
  verifySiweLoginEffect,
  type SiweConfig,
  type SiweNonceIssue,
  type SiweVerifyInput,
} from "../inbound/siwe.js";
