/**
 * Thin Ready-safe surface for MCP gateway API-key checks.
 * Import `clawql-inference/keys` — not the package root — so listen does not
 * evaluate the full inference barrel (routing, payments, openai, cache, …).
 */
export { extractPresentedApiKey, validateVirtualKey, type AuthHeaderSource } from "./validate.js";
export type {
  KeyValidationResult,
  VirtualKey,
  VirtualKeyContext,
  VirtualKeyStoreFile,
} from "./types.js";
