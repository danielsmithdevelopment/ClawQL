/**
 * In-memory SecretStore — tests and ephemeral single-process use.
 */

import { PathSecretStore } from "./base.js";

export class MemorySecretStore extends PathSecretStore {
  private readonly map = new Map<string, string>();

  async getSecret(path: string): Promise<string | null> {
    return this.map.has(path) ? (this.map.get(path) as string) : null;
  }

  async setSecret(path: string, value: string): Promise<void> {
    this.map.set(path, value);
  }

  async deleteSecret(path: string): Promise<void> {
    this.map.delete(path);
  }

  async listSecrets(prefix: string): Promise<string[]> {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
}

export function createMemorySecretStore(): MemorySecretStore {
  return new MemorySecretStore();
}
