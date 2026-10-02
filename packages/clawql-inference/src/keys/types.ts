export type RateLimitSpec = {
  /** Maximum requests allowed in the window. */
  maxRequests: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

/** Persisted virtual key record (secret stored as hash only). */
export type VirtualKey = {
  id: string;
  team: string;
  label?: string;
  secretHash: string;
  budgetUsd?: number;
  spentUsd: number;
  rateLimit?: RateLimitSpec;
  /**
   * When true, this key may opt into chat memory enrichment (header/env).
   * When false/undefined, enrichment is forbidden even if the client sends
   * `x-clawql-memory-enrich` — key policy outranks the header.
   */
  memoryEnrichment?: boolean;
  /**
   * Vault folder under `Memory/` for this key's scope (defaults to `team`).
   * Enrichment/list/search only see notes under `Memory/<scope>/`.
   */
  memoryScope?: string;
  createdAt: string;
  revokedAt?: string;
};

export type VirtualKeyStoreFile = {
  keys: VirtualKey[];
};

export type KeysConfig = {
  enabled: boolean;
};

/** Resolved key context attached to inference requests after auth. */
export type VirtualKeyContext = {
  id: string;
  team: string;
  budgetUsd?: number;
  memoryEnrichment?: boolean;
  memoryScope?: string;
};

export type KeyValidationResult =
  | { ok: true; context: VirtualKeyContext }
  | { ok: false; status: 401 | 402 | 429; message: string; type: string };
