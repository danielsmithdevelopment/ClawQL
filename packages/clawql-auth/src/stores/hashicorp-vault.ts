/**
 * HashiCorp Vault KV v2 SecretStore — enterprise TEE default (alongside OpenBao).
 * Uses fetch against the Vault HTTP API; no `node-vault` required at runtime.
 * All network IO runs via `Effect.tryPromise` inside Effect methods, failing with
 * {@link SecretStoreError}.
 */

import { Effect } from "effect";

import { PathSecretStore } from "./base.js";
import { SecretStoreError } from "./types.js";

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

function errMsg(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
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

  private request(input: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  }): Effect.Effect<VaultHttpResponse, SecretStoreError> {
    return Effect.tryPromise({
      try: () => this.http.request(input),
      catch: (cause) =>
        new SecretStoreError({ reason: `vault_request_failed: ${errMsg(cause)}`, cause }),
    });
  }

  getSecret(path: string): Effect.Effect<string | null, SecretStoreError> {
    return Effect.gen(this, function* () {
      const res = yield* this.request({
        method: "GET",
        url: this.dataUrl(path),
        headers: this.headers(),
      });
      if (res.status === 404) return null;
      if (res.status < 200 || res.status >= 300) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `vault_get_failed:${res.status}` })
        );
      }
      const data = (res.json as { data?: { data?: { value?: string } } })?.data?.data;
      return typeof data?.value === "string" ? data.value : null;
    });
  }

  setSecret(path: string, value: string): Effect.Effect<void, SecretStoreError> {
    return Effect.gen(this, function* () {
      const res = yield* this.request({
        method: "POST",
        url: this.dataUrl(path),
        headers: this.headers(true),
        body: JSON.stringify({ data: { value } }),
      });
      if (res.status < 200 || res.status >= 300) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `vault_set_failed:${res.status}` })
        );
      }
    });
  }

  deleteSecret(path: string): Effect.Effect<void, SecretStoreError> {
    return Effect.gen(this, function* () {
      const metaUrl = `${this.endpoint}/v1/${this.mount}/metadata/${this.logicalPath(path)}`;
      const res = yield* this.request({
        method: "DELETE",
        url: metaUrl,
        headers: this.headers(),
      });
      if (res.status === 404) return;
      if (res.status < 200 || res.status >= 300) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `vault_delete_failed:${res.status}` })
        );
      }
    });
  }

  listSecrets(prefix: string): Effect.Effect<string[], SecretStoreError> {
    return Effect.gen(this, function* () {
      const res = yield* this.request({
        method: "GET",
        url: this.metadataListUrl(prefix),
        headers: this.headers(),
      });
      if (res.status === 404) return [];
      if (res.status < 200 || res.status >= 300) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `vault_list_failed:${res.status}` })
        );
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
    });
  }
}

export function createHashiCorpVaultStore(
  options: HashiCorpVaultStoreOptions
): HashiCorpVaultStore {
  return new HashiCorpVaultStore(options);
}
