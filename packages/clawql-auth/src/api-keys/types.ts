/**
 * Issued API keys for gateway / enterprise team management.
 * Secrets are shown once at issue time; only salted hashes are persisted.
 */

export type IssuedApiKeyRecord = {
  /** Public key id, e.g. `cqk_a1b2c3d4e5f67890`. */
  readonly id: string;
  /** Hex SHA-256 of `salt:rawSecret`. */
  readonly secretHash: string;
  /** Per-key salt (hex). */
  readonly salt: string;
  /** Owning human or service subject. */
  readonly subjectId: string;
  readonly role: string;
  readonly scope: string[];
  /** Enterprise org (team management). */
  readonly orgId?: string;
  /** Team within org. */
  readonly teamId?: string;
  readonly label?: string;
  readonly createdAt: string;
  /** ISO expiry; omit for non-expiring keys. */
  readonly expiresAt?: string;
  revokedAt?: string;
  lastUsedAt?: string;
};

export type IssuedApiKeyStoreFile = {
  version: 1;
  keys: IssuedApiKeyRecord[];
};

export type IssueApiKeyInput = {
  subjectId: string;
  role?: string;
  scope?: string[];
  orgId?: string;
  teamId?: string;
  label?: string;
  /** Absolute expiry; omit for non-expiring. */
  expiresAt?: Date | string;
};

export type IssueApiKeyResult = {
  /** Persisted record (no plaintext secret). */
  record: IssuedApiKeyRecord;
  /**
   * Full secret shown once: `cqk_<idHex>_<secret>`.
   * Never store this — only the hash is persisted.
   */
  secret: string;
};

export type ValidateApiKeyResult =
  | { ok: true; record: IssuedApiKeyRecord }
  | {
      ok: false;
      reason: "not_found" | "revoked" | "expired" | "bad_format" | "hash_mismatch";
      keyId?: string;
    };
