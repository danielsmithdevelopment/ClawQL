/**
 * 1Password Secrets Automation — enterprise customers already on 1Password
 * Teams/Business. No credential migration: ClawQL reads vault items via the
 * Connect / Secrets Automation API.
 *
 * All network IO runs via `Effect.tryPromise` inside Effect methods, failing with
 * {@link SecretStoreError}.
 */

import { Effect } from "effect";

import { PathSecretStore } from "./base.js";
import { SecretStoreError } from "./types.js";

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

function errMsg(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

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

  private refreshIndex(): Effect.Effect<void, SecretStoreError> {
    return Effect.gen(this, function* () {
      const res = yield* Effect.tryPromise({
        try: () =>
          this.fetchImpl(`${this.endpoint}/v1/vaults/${this.vaultId}/items`, {
            headers: this.headers(),
          }),
        catch: (cause) =>
          new SecretStoreError({ reason: `onepassword_list_failed: ${errMsg(cause)}`, cause }),
      });
      if (!res.ok) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `onepassword_list_failed:${res.status}` })
        );
      }
      const items = yield* Effect.tryPromise({
        try: () => res.json() as Promise<Array<{ id: string; title?: string }>>,
        catch: (cause) =>
          new SecretStoreError({
            reason: `onepassword_list_parse_failed: ${errMsg(cause)}`,
            cause,
          }),
      });
      this.titleToId.clear();
      for (const item of items) {
        if (item.title) this.titleToId.set(item.title, item.id);
      }
    });
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

  getSecret(path: string): Effect.Effect<string | null, SecretStoreError> {
    return Effect.gen(this, function* () {
      yield* this.refreshIndex();
      const id = this.titleToId.get(this.titleFor(path));
      if (!id) return null;
      const res = yield* Effect.tryPromise({
        try: () =>
          this.fetchImpl(`${this.endpoint}/v1/vaults/${this.vaultId}/items/${id}`, {
            headers: this.headers(),
          }),
        catch: (cause) =>
          new SecretStoreError({ reason: `onepassword_get_failed: ${errMsg(cause)}`, cause }),
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `onepassword_get_failed:${res.status}` })
        );
      }
      const json = yield* Effect.tryPromise({
        try: () => res.json() as Promise<{ fields?: Array<{ value?: string }> }>,
        catch: (cause) =>
          new SecretStoreError({
            reason: `onepassword_get_parse_failed: ${errMsg(cause)}`,
            cause,
          }),
      });
      return this.extractValue(json);
    });
  }

  setSecret(path: string, value: string): Effect.Effect<void, SecretStoreError> {
    return Effect.gen(this, function* () {
      yield* this.refreshIndex();
      const title = this.titleFor(path);
      const existingId = this.titleToId.get(title);
      const body = {
        title,
        category: "LOGIN",
        fields: [{ id: "value", type: "CONCEALED", purpose: "PASSWORD", label: "value", value }],
        vault: { id: this.vaultId },
      };
      if (existingId) {
        const res = yield* Effect.tryPromise({
          try: () =>
            this.fetchImpl(`${this.endpoint}/v1/vaults/${this.vaultId}/items/${existingId}`, {
              method: "PUT",
              headers: this.headers(true),
              body: JSON.stringify({ ...body, id: existingId }),
            }),
          catch: (cause) =>
            new SecretStoreError({ reason: `onepassword_set_failed: ${errMsg(cause)}`, cause }),
        });
        if (!res.ok) {
          return yield* Effect.fail(
            new SecretStoreError({ reason: `onepassword_set_failed:${res.status}` })
          );
        }
        return;
      }
      const res = yield* Effect.tryPromise({
        try: () =>
          this.fetchImpl(`${this.endpoint}/v1/vaults/${this.vaultId}/items`, {
            method: "POST",
            headers: this.headers(true),
            body: JSON.stringify(body),
          }),
        catch: (cause) =>
          new SecretStoreError({ reason: `onepassword_create_failed: ${errMsg(cause)}`, cause }),
      });
      if (!res.ok) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `onepassword_create_failed:${res.status}` })
        );
      }
    });
  }

  deleteSecret(path: string): Effect.Effect<void, SecretStoreError> {
    return Effect.gen(this, function* () {
      yield* this.refreshIndex();
      const id = this.titleToId.get(this.titleFor(path));
      if (!id) return;
      const res = yield* Effect.tryPromise({
        try: () =>
          this.fetchImpl(`${this.endpoint}/v1/vaults/${this.vaultId}/items/${id}`, {
            method: "DELETE",
            headers: this.headers(),
          }),
        catch: (cause) =>
          new SecretStoreError({ reason: `onepassword_delete_failed: ${errMsg(cause)}`, cause }),
      });
      if (res.status === 404) return;
      if (!res.ok) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `onepassword_delete_failed:${res.status}` })
        );
      }
    });
  }

  listSecrets(prefix: string): Effect.Effect<string[], SecretStoreError> {
    return Effect.gen(this, function* () {
      yield* this.refreshIndex();
      const fullPrefix = this.titleFor(prefix);
      return [...this.titleToId.keys()]
        .filter((t) => t.startsWith(fullPrefix))
        .map((t) => t.slice(this.itemPrefix.length))
        .sort();
    });
  }
}

export function createOnePasswordStore(options: OnePasswordStoreOptions): OnePasswordStore {
  return new OnePasswordStore(options);
}
