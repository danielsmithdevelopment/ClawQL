/**
 * Infisical SecretStore — enterprise customers already on Infisical.
 * Uses the Infisical REST API (machine identity) without a hard SDK dependency.
 * All network IO runs via `Effect.tryPromise` inside Effect methods, failing with
 * {@link SecretStoreError}.
 */

import { Effect } from "effect";

import { PathSecretStore } from "./base.js";
import { SecretStoreError } from "./types.js";

export type InfisicalStoreOptions = {
  clientId: string;
  clientSecret: string;
  projectId: string;
  /** Infisical API base (default https://app.infisical.com/api). */
  endpoint?: string;
  environment?: string;
  secretPath?: string;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
};

type TokenCache = { accessToken: string; expiresAtMs: number };

function errMsg(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Maps ClawQL logical paths to Infisical secret names under `secretPath`.
 * Full Infisical folder sync is host-specific; this adapter stores JSON values
 * as Infisical secrets named by path (slashes → `__`).
 */
export class InfisicalStore extends PathSecretStore {
  readonly kind = "infisical" as const;
  private readonly opts: Required<
    Pick<InfisicalStoreOptions, "clientId" | "clientSecret" | "projectId">
  > & {
    endpoint: string;
    environment: string;
    secretPath: string;
    fetchImpl: typeof fetch;
  };
  private token: TokenCache | null = null;

  constructor(options: InfisicalStoreOptions) {
    super();
    this.opts = {
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      projectId: options.projectId,
      endpoint: (options.endpoint ?? "https://app.infisical.com/api").replace(/\/$/, ""),
      environment: options.environment ?? "prod",
      secretPath: options.secretPath ?? "/clawql",
      fetchImpl: options.fetchImpl ?? fetch,
    };
  }

  private secretName(path: string): string {
    return path.replace(/^\/+/, "").replace(/\//g, "__");
  }

  private accessToken(): Effect.Effect<string, SecretStoreError> {
    return Effect.gen(this, function* () {
      if (this.token && this.token.expiresAtMs > Date.now() + 30_000) {
        return this.token.accessToken;
      }
      const res = yield* Effect.tryPromise({
        try: () =>
          this.opts.fetchImpl(`${this.opts.endpoint}/v1/auth/universal-auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId: this.opts.clientId,
              clientSecret: this.opts.clientSecret,
            }),
          }),
        catch: (cause) =>
          new SecretStoreError({ reason: `infisical_auth_failed: ${errMsg(cause)}`, cause }),
      });
      if (!res.ok) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `infisical_auth_failed:${res.status}` })
        );
      }
      const json = yield* Effect.tryPromise({
        try: () => res.json() as Promise<{ accessToken: string; expiresIn?: number }>,
        catch: (cause) =>
          new SecretStoreError({ reason: `infisical_auth_parse_failed: ${errMsg(cause)}`, cause }),
      });
      this.token = {
        accessToken: json.accessToken,
        expiresAtMs: Date.now() + (json.expiresIn ?? 3600) * 1000,
      };
      return this.token.accessToken;
    });
  }

  getSecret(path: string): Effect.Effect<string | null, SecretStoreError> {
    return Effect.gen(this, function* () {
      const token = yield* this.accessToken();
      const name = this.secretName(path);
      const url = new URL(`${this.opts.endpoint}/v3/secrets/raw/${encodeURIComponent(name)}`);
      url.searchParams.set("workspaceId", this.opts.projectId);
      url.searchParams.set("environment", this.opts.environment);
      url.searchParams.set("secretPath", this.opts.secretPath);
      const res = yield* Effect.tryPromise({
        try: () => this.opts.fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } }),
        catch: (cause) =>
          new SecretStoreError({ reason: `infisical_get_failed: ${errMsg(cause)}`, cause }),
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `infisical_get_failed:${res.status}` })
        );
      }
      const json = yield* Effect.tryPromise({
        try: () => res.json() as Promise<{ secret?: { secretValue?: string } }>,
        catch: (cause) =>
          new SecretStoreError({ reason: `infisical_get_parse_failed: ${errMsg(cause)}`, cause }),
      });
      return json.secret?.secretValue ?? null;
    });
  }

  setSecret(path: string, value: string): Effect.Effect<void, SecretStoreError> {
    return Effect.gen(this, function* () {
      const token = yield* this.accessToken();
      const name = this.secretName(path);
      const body = {
        workspaceId: this.opts.projectId,
        environment: this.opts.environment,
        secretPath: this.opts.secretPath,
        secretKey: name,
        secretValue: value,
      };
      const existing = yield* this.getSecret(path);
      const method = existing == null ? "POST" : "PATCH";
      const url = `${this.opts.endpoint}/v3/secrets/raw/${encodeURIComponent(name)}`;
      const res = yield* Effect.tryPromise({
        try: () =>
          this.opts.fetchImpl(url, {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }),
        catch: (cause) =>
          new SecretStoreError({ reason: `infisical_set_failed: ${errMsg(cause)}`, cause }),
      });
      if (!res.ok) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `infisical_set_failed:${res.status}` })
        );
      }
    });
  }

  deleteSecret(path: string): Effect.Effect<void, SecretStoreError> {
    return Effect.gen(this, function* () {
      const token = yield* this.accessToken();
      const name = this.secretName(path);
      const url = new URL(`${this.opts.endpoint}/v3/secrets/raw/${encodeURIComponent(name)}`);
      url.searchParams.set("workspaceId", this.opts.projectId);
      url.searchParams.set("environment", this.opts.environment);
      url.searchParams.set("secretPath", this.opts.secretPath);
      const res = yield* Effect.tryPromise({
        try: () =>
          this.opts.fetchImpl(url, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }),
        catch: (cause) =>
          new SecretStoreError({ reason: `infisical_delete_failed: ${errMsg(cause)}`, cause }),
      });
      if (res.status === 404) return;
      if (!res.ok) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `infisical_delete_failed:${res.status}` })
        );
      }
    });
  }

  listSecrets(prefix: string): Effect.Effect<string[], SecretStoreError> {
    return Effect.gen(this, function* () {
      const token = yield* this.accessToken();
      const url = new URL(`${this.opts.endpoint}/v3/secrets/raw`);
      url.searchParams.set("workspaceId", this.opts.projectId);
      url.searchParams.set("environment", this.opts.environment);
      url.searchParams.set("secretPath", this.opts.secretPath);
      const res = yield* Effect.tryPromise({
        try: () => this.opts.fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } }),
        catch: (cause) =>
          new SecretStoreError({ reason: `infisical_list_failed: ${errMsg(cause)}`, cause }),
      });
      if (!res.ok) {
        return yield* Effect.fail(
          new SecretStoreError({ reason: `infisical_list_failed:${res.status}` })
        );
      }
      const json = yield* Effect.tryPromise({
        try: () => res.json() as Promise<{ secrets?: Array<{ secretKey?: string }> }>,
        catch: (cause) =>
          new SecretStoreError({ reason: `infisical_list_parse_failed: ${errMsg(cause)}`, cause }),
      });
      const keys = (json.secrets ?? [])
        .map((s) => (s.secretKey ?? "").replace(/__/g, "/"))
        .filter((p) => p.startsWith(prefix));
      return keys.sort();
    });
  }
}

export function createInfisicalStore(options: InfisicalStoreOptions): InfisicalStore {
  return new InfisicalStore(options);
}
