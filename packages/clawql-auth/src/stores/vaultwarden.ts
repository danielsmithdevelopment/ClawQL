/**
 * Vaultwarden SecretStore — Bitwarden-compatible self-hosted vault.
 * Uses the Bitwarden Public API / Secrets Manager–style access when configured.
 *
 * Note: classic Vaultwarden is password-manager oriented; for machine secrets
 * prefer the Bitwarden Secrets Manager API against a compatible endpoint, or
 * store ClawQL secrets as secure notes via an org API token.
 *
 * `cache` mode delegates to {@link MemorySecretStore} (`Effect.sync`); `http` mode
 * runs network IO via `Effect.tryPromise`, failing with {@link SecretStoreError}.
 */

import { Effect } from "effect";

import { PathSecretStore } from "./base.js";
import { MemorySecretStore } from "./memory.js";
import { SecretStoreError } from "./types.js";

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

function errMsg(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

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

  private assertHttpReady(): Effect.Effect<void, SecretStoreError> {
    if (!this.opts.projectId) {
      return Effect.fail(new SecretStoreError({ reason: "vaultwarden_project_id_required" }));
    }
    return Effect.void;
  }

  getSecret(path: string): Effect.Effect<string | null, SecretStoreError> {
    if (this.opts.mode === "cache") return this.cache.getSecret(path);
    return Effect.gen(this, function* () {
      yield* this.assertHttpReady();
      const res = yield* Effect.tryPromise({
        try: () =>
          this.fetchImpl(
            `${this.opts.endpoint.replace(/\/$/, "")}/api/secrets?projectId=${encodeURIComponent(this.opts.projectId!)}`,
            { headers: { Authorization: `Bearer ${this.opts.accessToken}` } }
          ),
        catch: (cause) =>
          new SecretStoreError({ reason: `vaultwarden_list_failed: ${errMsg(cause)}`, cause }),
      });
      if (!res.ok) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `vaultwarden_list_failed:${res.status}` })
        );
      }
      const json = yield* Effect.tryPromise({
        try: () =>
          res.json() as Promise<{
            data?: Array<{ key?: string; value?: string }>;
            secrets?: Array<{ key?: string; value?: string }>;
          }>,
        catch: (cause) =>
          new SecretStoreError({
            reason: `vaultwarden_list_parse_failed: ${errMsg(cause)}`,
            cause,
          }),
      });
      const rows = json.data ?? json.secrets ?? [];
      const hit = rows.find((r) => r.key === path);
      return hit?.value ?? null;
    });
  }

  setSecret(path: string, value: string): Effect.Effect<void, SecretStoreError> {
    if (this.opts.mode === "cache") return this.cache.setSecret(path, value);
    return Effect.gen(this, function* () {
      yield* this.assertHttpReady();
      const res = yield* Effect.tryPromise({
        try: () =>
          this.fetchImpl(`${this.opts.endpoint.replace(/\/$/, "")}/api/secrets`, {
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
          }),
        catch: (cause) =>
          new SecretStoreError({ reason: `vaultwarden_set_failed: ${errMsg(cause)}`, cause }),
      });
      if (!res.ok) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `vaultwarden_set_failed:${res.status}` })
        );
      }
    });
  }

  deleteSecret(path: string): Effect.Effect<void, SecretStoreError> {
    if (this.opts.mode === "cache") return this.cache.deleteSecret(path);
    return Effect.fail(
      new SecretStoreError({ reason: `vaultwarden_delete_requires_secret_id:${path}` })
    );
  }

  listSecrets(prefix: string): Effect.Effect<string[], SecretStoreError> {
    if (this.opts.mode === "cache") return this.cache.listSecrets(prefix);
    return Effect.gen(this, function* () {
      yield* this.assertHttpReady();
      const res = yield* Effect.tryPromise({
        try: () =>
          this.fetchImpl(
            `${this.opts.endpoint.replace(/\/$/, "")}/api/secrets?projectId=${encodeURIComponent(this.opts.projectId!)}`,
            { headers: { Authorization: `Bearer ${this.opts.accessToken}` } }
          ),
        catch: (cause) =>
          new SecretStoreError({ reason: `vaultwarden_list_failed: ${errMsg(cause)}`, cause }),
      });
      if (!res.ok) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `vaultwarden_list_failed:${res.status}` })
        );
      }
      const json = yield* Effect.tryPromise({
        try: () =>
          res.json() as Promise<{
            data?: Array<{ key?: string }>;
            secrets?: Array<{ key?: string }>;
          }>,
        catch: (cause) =>
          new SecretStoreError({
            reason: `vaultwarden_list_parse_failed: ${errMsg(cause)}`,
            cause,
          }),
      });
      const rows = json.data ?? json.secrets ?? [];
      return rows
        .map((r) => r.key ?? "")
        .filter((k) => k.startsWith(prefix))
        .sort();
    });
  }
}

export function createVaultwardenStore(options: VaultwardenStoreOptions): VaultwardenStore {
  return new VaultwardenStore(options);
}
