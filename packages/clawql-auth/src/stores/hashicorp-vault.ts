/**
 * HashiCorp Vault KV v2 SecretStore — enterprise TEE default (alongside OpenBao).
 * Uses fetch against the Vault HTTP API; no `node-vault` required at runtime.
 */

import { PathSecretStore } from "./base.js";

export type VaultHttpResponse = {
  status: number;
  json: unknown;
};

export type VaultHttpClient = {
  request(input: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<VaultHttpResponse>;
};

export type HashiCorpVaultStoreOptions = {
  endpoint: string;
  token: string;
  /** KV secrets engine mount (default `secret`). */
  mountPath?: string;
  /** Logical prefix under the mount (default `clawql`). */
  pathPrefix?: string;
  /** Injectable HTTP for tests. */
  http?: VaultHttpClient;
};

function trimSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, "");
}

function defaultHttp(): VaultHttpClient {
  return {
    async request({ method, url, headers, body }) {
      const res = await fetch(url, { method, headers, body });
      let json: unknown = null;
      const text = await res.text();
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = { raw: text };
        }
      }
      return { status: res.status, json };
    },
  };
}

export class HashiCorpVaultStore extends PathSecretStore {
  readonly kind: "hashicorp-vault" | "openbao" = "hashicorp-vault";
  private readonly endpoint: string;
  private readonly token: string;
  private readonly mount: string;
  private readonly prefix: string;
  private readonly http: VaultHttpClient;

  constructor(options: HashiCorpVaultStoreOptions) {
    super();
    this.endpoint = options.endpoint.replace(/\/$/, "");
    this.token = options.token;
    this.mount = trimSlashes(options.mountPath ?? "secret");
    this.prefix = trimSlashes(options.pathPrefix ?? "clawql");
    this.http = options.http ?? defaultHttp();
  }

  protected logicalPath(path: string): string {
    const rest = trimSlashes(path);
    return this.prefix ? `${this.prefix}/${rest}` : rest;
  }

  protected dataUrl(path: string): string {
    return `${this.endpoint}/v1/${this.mount}/data/${this.logicalPath(path)}`;
  }

  protected metadataListUrl(prefix: string): string {
    const logical = this.logicalPath(prefix);
    const base = `${this.endpoint}/v1/${this.mount}/metadata`;
    return logical ? `${base}/${logical}?list=true` : `${base}?list=true`;
  }

  protected headers(json = false): Record<string, string> {
    const h: Record<string, string> = { "X-Vault-Token": this.token };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  async getSecret(path: string): Promise<string | null> {
    const res = await this.http.request({
      method: "GET",
      url: this.dataUrl(path),
      headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`vault_get_failed:${res.status}`);
    }
    const data = (res.json as { data?: { data?: { value?: string } } })?.data?.data;
    return typeof data?.value === "string" ? data.value : null;
  }

  async setSecret(path: string, value: string): Promise<void> {
    const res = await this.http.request({
      method: "POST",
      url: this.dataUrl(path),
      headers: this.headers(true),
      body: JSON.stringify({ data: { value } }),
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`vault_set_failed:${res.status}`);
    }
  }

  async deleteSecret(path: string): Promise<void> {
    const metaUrl = `${this.endpoint}/v1/${this.mount}/metadata/${this.logicalPath(path)}`;
    const res = await this.http.request({
      method: "DELETE",
      url: metaUrl,
      headers: this.headers(),
    });
    if (res.status === 404) return;
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`vault_delete_failed:${res.status}`);
    }
  }

  async listSecrets(prefix: string): Promise<string[]> {
    const res = await this.http.request({
      method: "GET",
      url: this.metadataListUrl(prefix),
      headers: this.headers(),
    });
    if (res.status === 404) return [];
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`vault_list_failed:${res.status}`);
    }
    const keys =
      ((res.json as { data?: { keys?: string[] } })?.data?.keys as string[] | undefined) ?? [];
    const base = trimSlashes(prefix);
    return keys
      .map((k) => {
        const name = k.replace(/\/$/, "");
        return base ? `${base}/${name}` : name;
      })
      .sort();
  }
}

export function createHashiCorpVaultStore(
  options: HashiCorpVaultStoreOptions
): HashiCorpVaultStore {
  return new HashiCorpVaultStore(options);
}
