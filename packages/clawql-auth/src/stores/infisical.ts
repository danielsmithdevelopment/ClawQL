/**
 * Infisical SecretStore — enterprise customers already on Infisical.
 * Uses the Infisical REST API (machine identity) without a hard SDK dependency.
 */

import { PathSecretStore } from "./base.js";

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

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAtMs > Date.now() + 30_000) {
      return this.token.accessToken;
    }
    const res = await this.opts.fetchImpl(`${this.opts.endpoint}/v1/auth/universal-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: this.opts.clientId,
        clientSecret: this.opts.clientSecret,
      }),
    });
    if (!res.ok) throw new Error(`infisical_auth_failed:${res.status}`);
    const json = (await res.json()) as { accessToken: string; expiresIn?: number };
    this.token = {
      accessToken: json.accessToken,
      expiresAtMs: Date.now() + (json.expiresIn ?? 3600) * 1000,
    };
    return this.token.accessToken;
  }

  async getSecret(path: string): Promise<string | null> {
    const token = await this.accessToken();
    const name = this.secretName(path);
    const url = new URL(`${this.opts.endpoint}/v3/secrets/raw/${encodeURIComponent(name)}`);
    url.searchParams.set("workspaceId", this.opts.projectId);
    url.searchParams.set("environment", this.opts.environment);
    url.searchParams.set("secretPath", this.opts.secretPath);
    const res = await this.opts.fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`infisical_get_failed:${res.status}`);
    const json = (await res.json()) as { secret?: { secretValue?: string } };
    return json.secret?.secretValue ?? null;
  }

  async setSecret(path: string, value: string): Promise<void> {
    const token = await this.accessToken();
    const name = this.secretName(path);
    const body = {
      workspaceId: this.opts.projectId,
      environment: this.opts.environment,
      secretPath: this.opts.secretPath,
      secretKey: name,
      secretValue: value,
    };
    const existing = await this.getSecret(path);
    const method = existing == null ? "POST" : "PATCH";
    const url =
      method === "POST"
        ? `${this.opts.endpoint}/v3/secrets/raw/${encodeURIComponent(name)}`
        : `${this.opts.endpoint}/v3/secrets/raw/${encodeURIComponent(name)}`;
    const res = await this.opts.fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`infisical_set_failed:${res.status}`);
  }

  async deleteSecret(path: string): Promise<void> {
    const token = await this.accessToken();
    const name = this.secretName(path);
    const url = new URL(`${this.opts.endpoint}/v3/secrets/raw/${encodeURIComponent(name)}`);
    url.searchParams.set("workspaceId", this.opts.projectId);
    url.searchParams.set("environment", this.opts.environment);
    url.searchParams.set("secretPath", this.opts.secretPath);
    const res = await this.opts.fetchImpl(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return;
    if (!res.ok) throw new Error(`infisical_delete_failed:${res.status}`);
  }

  async listSecrets(prefix: string): Promise<string[]> {
    const token = await this.accessToken();
    const url = new URL(`${this.opts.endpoint}/v3/secrets/raw`);
    url.searchParams.set("workspaceId", this.opts.projectId);
    url.searchParams.set("environment", this.opts.environment);
    url.searchParams.set("secretPath", this.opts.secretPath);
    const res = await this.opts.fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`infisical_list_failed:${res.status}`);
    const json = (await res.json()) as {
      secrets?: Array<{ secretKey?: string }>;
    };
    const keys = (json.secrets ?? [])
      .map((s) => (s.secretKey ?? "").replace(/__/g, "/"))
      .filter((p) => p.startsWith(prefix));
    return keys.sort();
  }
}

export function createInfisicalStore(options: InfisicalStoreOptions): InfisicalStore {
  return new InfisicalStore(options);
}
