/**
 * Toolkit packaging types — named presets over packs / ATR / optional API key scopes.
 */

import type { ClawqlProvidersComposition } from "../config/providers-composition.js";

/** First-class toolkit definition (seeded registry). */
export type ClawqlToolkit = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Provider stack — same shape as instance `providers`. */
  readonly providers: ClawqlProvidersComposition;
  /** ATR `toolsInScope` allowlist for this toolkit. */
  readonly atrToolsInScope: readonly string[];
  /** Optional scopes for issued API keys (plan/product naming). */
  readonly apiKeyScopes?: readonly string[];
};

/** Providers-only expansion used by spec-loader. */
export type ToolkitProvidersComposition = ClawqlProvidersComposition;
