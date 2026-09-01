/**
 * In-memory SecretStore — tests and ephemeral single-process use.
 * Map reads/writes are infallible, so the KV methods narrow the error channel to `never`.
 */

import { Effect } from "effect";

import { PathSecretStore } from "./base.js";

export class MemorySecretStore extends PathSecretStore {
  private readonly map = new Map<string, string>();

  getSecret(path: string): Effect.Effect<string | null, never> {
    return Effect.sync(() => (this.map.has(path) ? (this.map.get(path) as string) : null));
  }

  setSecret(path: string, value: string): Effect.Effect<void, never> {
    return Effect.sync(() => {
      this.map.set(path, value);
    });
  }

  deleteSecret(path: string): Effect.Effect<void, never> {
    return Effect.sync(() => {
      this.map.delete(path);
    });
  }

  listSecrets(prefix: string): Effect.Effect<string[], never> {
    return Effect.sync(() => [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort());
  }
}

export function createMemorySecretStore(): MemorySecretStore {
  return new MemorySecretStore();
}
