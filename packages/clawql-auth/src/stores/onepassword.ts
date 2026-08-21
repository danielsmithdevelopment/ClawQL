/**
 * 1Password Secrets Automation — enterprise customers already on 1Password
 * Teams/Business. No credential migration: ClawQL reads vault items via the
 * Connect / Secrets Automation API.
 */

import { PathSecretStore } from "./base.js";

export type OnePasswordStoreOptions = {
  /** 1Password Connect host, e.g. http://op-connect:8080 */
  endpoint: string;
  /** Connect token (`OP_CONNECT_TOKEN`). */
  token: string;
  /** Vault id that holds ClawQL secrets. */
  vaultId: string;
  /** Optional item title prefix (default `clawql/`). */
  itemPrefix?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Stores each logical path as a 1Password item title under `itemPrefix`,
 * with the secret in a field named `value` (or `credential` / `password` fallback).
 */
export class OnePasswordStore extends PathSecretStore {
  readonly kind = "onepassword" as const;
  private readonly endpoint: string;
  private readonly token: string;
  private readonly vaultId: string;
  private readonly itemPrefix: string;
  private readonly fetchImpl: typeof fetch;
  private titleToId = new Map<string, string>();

  constructor(options: OnePasswordStoreOptions) {
    super();
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.token = options.token;
    this.vaultId = options.vaultId;
    this.itemPrefix = options.itemPrefix ?? "clawql/";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
    };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  private titleFor(path: string): string {
    return `${this.itemPrefix}${path.replace(/^\/+/, "")}`;
  }

  private async refreshIndex(): Promise<void> {
    const res = await this.fetchImpl(`${this.endpoint}/v1/vaults/${this.vaultId}/items`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`onepassword_list_failed:${res.status}`);
    const items = (await res.json()) as Array<{ id: string; title?: string }>;
    this.titleToId.clear();
    for (const item of items) {
      if (item.title) this.titleToId.set(item.title, item.id);
    }
  }

  private extractValue(item: {
    fields?: Array<{ id?: string; label?: string; value?: string; purpose?: string }>;
  }): string | null {
    const fields = item.fields ?? [];
    const byLabel = (label: string) =>
      fields.find((f) => (f.label ?? "").toLowerCase() === label)?.value;
    return (
      byLabel("value") ??
      byLabel("credential") ??
      byLabel("password") ??
      fields.find((f) => f.purpose === "PASSWORD")?.value ??
      fields[0]?.value ??
      null
    );
  }

  async getSecret(path: string): Promise<string | null> {
    await this.refreshIndex();
    const id = this.titleToId.get(this.titleFor(path));
    if (!id) return null;
    const res = await this.fetchImpl(
      `${this.endpoint}/v1/vaults/${this.vaultId}/items/${id}`,
      { headers: this.headers() }
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`onepassword_get_failed:${res.status}`);
    return this.extractValue((await res.json()) as { fields?: Array<{ value?: string }> });
  }

  async setSecret(path: string, value: string): Promise<void> {
    await this.refreshIndex();
    const title = this.titleFor(path);
    const existingId = this.titleToId.get(title);
    const body = {
      title,
      category: "LOGIN",
      fields: [
        { id: "value", type: "CONCEALED", purpose: "PASSWORD", label: "value", value },
      ],
      vault: { id: this.vaultId },
    };
    if (existingId) {
      const res = await this.fetchImpl(
        `${this.endpoint}/v1/vaults/${this.vaultId}/items/${existingId}`,
        {
          method: "PUT",
          headers: this.headers(true),
          body: JSON.stringify({ ...body, id: existingId }),
        }
      );
      if (!res.ok) throw new Error(`onepassword_set_failed:${res.status}`);
      return;
    }
    const res = await this.fetchImpl(`${this.endpoint}/v1/vaults/${this.vaultId}/items`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`onepassword_create_failed:${res.status}`);
  }

  async deleteSecret(path: string): Promise<void> {
    await this.refreshIndex();
    const id = this.titleToId.get(this.titleFor(path));
    if (!id) return;
    const res = await this.fetchImpl(
      `${this.endpoint}/v1/vaults/${this.vaultId}/items/${id}`,
      { method: "DELETE", headers: this.headers() }
    );
    if (res.status === 404) return;
    if (!res.ok) throw new Error(`onepassword_delete_failed:${res.status}`);
  }

  async listSecrets(prefix: string): Promise<string[]> {
    await this.refreshIndex();
    const fullPrefix = this.titleFor(prefix);
    return [...this.titleToId.keys()]
      .filter((t) => t.startsWith(fullPrefix))
      .map((t) => t.slice(this.itemPrefix.length))
      .sort();
  }
}

export function createOnePasswordStore(options: OnePasswordStoreOptions): OnePasswordStore {
  return new OnePasswordStore(options);
}
