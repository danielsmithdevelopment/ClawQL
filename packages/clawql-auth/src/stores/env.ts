/**
 * Env SecretStore — minimal CI / smoke only.
 * Reads `CLAWQL_SECRET_<PATH>` (slashes → underscores, uppercased).
 * Writes are rejected except for an optional in-process overlay used by tests.
 *
 * Map/env reads are infallible (`Effect.sync`); readonly-write rejection is a typed
 * {@link SecretStoreError} failure rather than a thrown exception.
 */

import { Effect } from "effect";

import { PathSecretStore } from "./base.js";
import { SecretStoreError } from "./types.js";

export type EnvSecretStoreOptions = {
  /** Prefix for env keys (default `CLAWQL_SECRET_`). */
  envPrefix?: string;
  /** Allow ephemeral writes into a memory overlay (default false). */
  allowOverlayWrites?: boolean;
};

function envKey(prefix: string, path: string): string {
  const cleaned = path
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
  return `${prefix}${cleaned}`;
}

export class EnvSecretStore extends PathSecretStore {
  private readonly prefix: string;
  private readonly allowOverlayWrites: boolean;
  private readonly overlay = new Map<string, string>();

  constructor(options: EnvSecretStoreOptions = {}) {
    super();
    this.prefix = options.envPrefix ?? "CLAWQL_SECRET_";
    this.allowOverlayWrites = options.allowOverlayWrites ?? false;
  }

  getSecret(path: string): Effect.Effect<string | null, never> {
    return Effect.sync(() => {
      if (this.overlay.has(path)) return this.overlay.get(path) as string;
      const v = process.env[envKey(this.prefix, path)];
      return v === undefined || v === "" ? null : v;
    });
  }

  setSecret(path: string, value: string): Effect.Effect<void, SecretStoreError> {
    if (!this.allowOverlayWrites) {
      return Effect.fail(new SecretStoreError({ reason: "env_secret_store_readonly" }));
    }
    return Effect.sync(() => {
      this.overlay.set(path, value);
    });
  }

  deleteSecret(path: string): Effect.Effect<void, SecretStoreError> {
    if (!this.allowOverlayWrites) {
      return Effect.fail(new SecretStoreError({ reason: "env_secret_store_readonly" }));
    }
    return Effect.sync(() => {
      this.overlay.delete(path);
    });
  }

  listSecrets(prefix: string): Effect.Effect<string[], never> {
    return Effect.sync(() => {
      const keys = new Set<string>([...this.overlay.keys()]);
      const needle = envKey(this.prefix, prefix);
      for (const k of Object.keys(process.env)) {
        if (!k.startsWith(this.prefix)) continue;
        // Best-effort: only return overlay paths that match; env enumeration of
        // logical paths is lossy. Prefer SQLite/Vault for listSecrets.
        if (k.startsWith(needle) || prefix === "") {
          keys.add(k.slice(this.prefix.length).toLowerCase().replace(/_/g, "/"));
        }
      }
      return [...keys].filter((p) => p.startsWith(prefix)).sort();
    });
  }
}

export function createEnvSecretStore(options?: EnvSecretStoreOptions): EnvSecretStore {
  return new EnvSecretStore(options);
}
