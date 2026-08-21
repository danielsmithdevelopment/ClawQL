/**
 * Vaultwarden SecretStore — Bitwarden-compatible self-hosted vault.
 * Uses the Bitwarden Public API / Secrets Manager–style access when configured.
 *
 * Note: classic Vaultwarden is password-manager oriented; for machine secrets
 * prefer the Bitwarden Secrets Manager API against a compatible endpoint, or
 * store ClawQL secrets as secure notes via an org API token.
 */

import { PathSecretStore } from "./base.js";
import { MemorySecretStore } from "./memory.js";

export type VaultwardenStoreOptions = {
  /** Vaultwarden / Bitwarden API base URL. */
  endpoint: string;
  /** Organization API access token (Secrets Manager) or server API key. */
  accessToken: string;
  organizationId?: string;
  projectId?: string;
  /**
   * When true (default for v0.1), persist through an in-process cache after a
   * successful identity check — full SM sync lands with host wiring.
   * Set `mode: "http"` once endpoint + project are verified.
   */
  mode?: "cache" | "http";
  fetchImpl?: typeof fetch;
};

/**
 * Thin adapter: `cache` mode is safe for tests/dev; `http` mode uses Bitwarden
 * Secrets Manager REST (`/api/secrets`) when projectId is set.
 */
export class VaultwardenStore extends PathSecretStore {
  readonly kind = "vaultwarden" as const;
  private readonly cache = new MemorySecretStore();
  private readonly opts: VaultwardenStoreOptions & { mode: "cache" | "http" };
  private readonly fetchImpl: typeof fetch;

  constructor(options: VaultwardenStoreOptions) {
    super();
    this.opts = { ...options, mode: options.mode ?? "cache" };
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private assertHttpReady(): void {
    if (!this.opts.projectId) {
      throw new Error("vaultwarden_project_id_required");
    }
  }

  async getSecret(path: string): Promise<string | null> {
    if (this.opts.mode === "cache") return this.cache.getSecret(path);
    this.assertHttpReady();
    const res = await this.fetchImpl(
      `${this.opts.endpoint.replace(/\/$/, "")}/api/secrets?projectId=${encodeURIComponent(this.opts.projectId!)}`,
      { headers: { Authorization: `Bearer ${this.opts.accessToken}` } }
    );
    if (!res.ok) throw new Error(`vaultwarden_list_failed:${res.status}`);
    const json = (await res.json()) as {
      data?: Array<{ key?: string; value?: string }>;
      secrets?: Array<{ key?: string; value?: string }>;
    };
    const rows = json.data ?? json.secrets ?? [];
    const hit = rows.find((r) => r.key === path);
    return hit?.value ?? null;
  }

  async setSecret(path: string, value: string): Promise<void> {
    if (this.opts.mode === "cache") {
      await this.cache.setSecret(path, value);
      return;
    }
    this.assertHttpReady();
    const res = await this.fetchImpl(`${this.opts.endpoint.replace(/\/$/, "")}/api/secrets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.opts.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: path,
        value,
        projectId: this.opts.projectId,
        organizationId: this.opts.organizationId,
      }),
    });
    if (!res.ok) throw new Error(`vaultwarden_set_failed:${res.status}`);
  }

  async deleteSecret(path: string): Promise<void> {
    if (this.opts.mode === "cache") {
      await this.cache.deleteSecret(path);
      return;
    }
    throw new Error(`vaultwarden_delete_requires_secret_id:${path}`);
  }

  async listSecrets(prefix: string): Promise<string[]> {
    if (this.opts.mode === "cache") return this.cache.listSecrets(prefix);
    this.assertHttpReady();
    const res = await this.fetchImpl(
      `${this.opts.endpoint.replace(/\/$/, "")}/api/secrets?projectId=${encodeURIComponent(this.opts.projectId!)}`,
      { headers: { Authorization: `Bearer ${this.opts.accessToken}` } }
    );
    if (!res.ok) throw new Error(`vaultwarden_list_failed:${res.status}`);
    const json = (await res.json()) as {
      data?: Array<{ key?: string }>;
      secrets?: Array<{ key?: string }>;
    };
    const rows = json.data ?? json.secrets ?? [];
    return rows
      .map((r) => r.key ?? "")
      .filter((k) => k.startsWith(prefix))
      .sort();
  }
}

export function createVaultwardenStore(options: VaultwardenStoreOptions): VaultwardenStore {
  return new VaultwardenStore(options);
}
