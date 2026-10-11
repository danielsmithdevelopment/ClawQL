/**
 * Internal ClawQL user identity with linked IdP subjects.
 * Org ownership keys off `userId` (`usr_…`), never a provider id (`supabase:…`).
 */

export type LinkedIdentityProvider = "supabase" | "okta" | "entra" | (string & {});

export type LinkedIdentity = {
  readonly provider: LinkedIdentityProvider;
  /** Provider-native subject (Supabase `sub`, Okta `sub`, …) — not used as a tenant id. */
  readonly subject: string;
  readonly linkedAt: string;
};

export type ClawqlUserRecord = {
  /** Internal ClawQL id (`usr_<16 hex>`). Also the CPC owner member tenant id. */
  readonly userId: string;
  readonly email?: string;
  readonly identities: readonly LinkedIdentity[];
  readonly orgIds: readonly string[];
  readonly stripeCustomerId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt?: string;
};

export type IdentityStoreFile = {
  readonly version: 1;
  readonly users: readonly ClawqlUserRecord[];
};

export type GetOrCreateLinkedIdentityInput = {
  readonly provider: LinkedIdentityProvider;
  readonly subject: string;
  readonly email?: string;
};
