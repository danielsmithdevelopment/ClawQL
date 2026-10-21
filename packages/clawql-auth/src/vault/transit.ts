/**
 * Phase 7 — Vault / OpenBao Transit encrypt / decrypt / rewrap.
 * Keeps encryption keys inside Vault; ClawQL (or an inner SecretStore) holds
 * only ciphertext. Distinct from KV SecretStore and from dynamic leases.
 *
 * Effect-primary; uses the same Vault HTTP client shape as HashiCorpVaultStore.
 */

import { Context, Data, Effect, Layer } from "effect";

import type { VaultHttpClient } from "../stores/hashicorp-vault.js";

export class VaultTransitError extends Data.TaggedError("VaultTransitError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type VaultTransitProviderOptions = {
  vaultAddr: string;
  vaultToken: string;
  /** Transit secrets engine mount (default `transit`). */
  mountPath?: string;
  /** Named encryption key in the mount (required for encrypt/decrypt/rewrap). */
  keyName: string;
  http?: VaultHttpClient;
};

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

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

/** Vault Transit ciphertext tokens look like `vault:v1:…` / `vault:v2:…`. */
export function isVaultTransitCiphertext(value: string): boolean {
  return /^vault:v\d+:/.test(value);
}

function toBase64Utf8(plaintext: string): string {
  return Buffer.from(plaintext, "utf8").toString("base64");
}

function fromBase64Utf8(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf8");
}

export class VaultTransitProvider {
  private readonly http: VaultHttpClient;
  private readonly addr: string;
  private readonly token: string;
  private readonly mount: string;
  private readonly keyName: string;

  constructor(private readonly options: VaultTransitProviderOptions) {
    this.http = options.http ?? defaultHttp();
    this.addr = trimSlash(options.vaultAddr);
    this.token = options.vaultToken;
    this.mount = trimSlashes(options.mountPath ?? "transit");
    this.keyName = trimSlashes(options.keyName);
    if (!this.keyName) {
      throw new Error("vault_transit_requires_keyName");
    }
  }

  private headers(): Record<string, string> {
    return {
      "X-Vault-Token": this.token,
      "Content-Type": "application/json",
    };
  }

  private keyUrl(op: "encrypt" | "decrypt" | "rewrap"): string {
    return `${this.addr}/v1/${this.mount}/${op}/${this.keyName}`;
  }

  private request(input: {
    method: string;
    url: string;
    body?: string;
  }): Effect.Effect<{ status: number; json: unknown }, VaultTransitError> {
    return Effect.tryPromise({
      try: () =>
        this.http.request({
          method: input.method,
          url: input.url,
          headers: this.headers(),
          body: input.body,
        }),
      catch: (cause) =>
        new VaultTransitError({ reason: `vault_transit_request_failed: ${errMsg(cause)}`, cause }),
    });
  }

  /** Encrypt plaintext → Vault Transit ciphertext (`vault:vN:…`). */
  encrypt(plaintext: string): Effect.Effect<string, VaultTransitError> {
    return Effect.gen({ self: this }, function* () {
      const res = yield* this.request({
        method: "POST",
        url: this.keyUrl("encrypt"),
        body: JSON.stringify({ plaintext: toBase64Utf8(plaintext) }),
      });
      if (res.status < 200 || res.status >= 300) {
        return yield* Effect.fail(
          new VaultTransitError({ reason: `vault_transit_encrypt_failed: ${res.status}` })
        );
      }
      const ciphertext = (res.json as { data?: { ciphertext?: string } })?.data?.ciphertext;
      if (typeof ciphertext !== "string" || !ciphertext) {
        return yield* Effect.fail(
          new VaultTransitError({ reason: "vault_transit_encrypt_missing_ciphertext" })
        );
      }
      return ciphertext;
    });
  }

  /** Decrypt Vault Transit ciphertext → UTF-8 plaintext. */
  decrypt(ciphertext: string): Effect.Effect<string, VaultTransitError> {
    return Effect.gen({ self: this }, function* () {
      const res = yield* this.request({
        method: "POST",
        url: this.keyUrl("decrypt"),
        body: JSON.stringify({ ciphertext }),
      });
      if (res.status < 200 || res.status >= 300) {
        return yield* Effect.fail(
          new VaultTransitError({ reason: `vault_transit_decrypt_failed: ${res.status}` })
        );
      }
      const plaintextB64 = (res.json as { data?: { plaintext?: string } })?.data?.plaintext;
      if (typeof plaintextB64 !== "string" || !plaintextB64) {
        return yield* Effect.fail(
          new VaultTransitError({ reason: "vault_transit_decrypt_missing_plaintext" })
        );
      }
      return fromBase64Utf8(plaintextB64);
    });
  }

  /**
   * Re-wrap ciphertext under the latest key version (after Transit key rotation).
   * Does not expose plaintext to the caller.
   */
  rewrap(ciphertext: string): Effect.Effect<string, VaultTransitError> {
    return Effect.gen({ self: this }, function* () {
      const res = yield* this.request({
        method: "POST",
        url: this.keyUrl("rewrap"),
        body: JSON.stringify({ ciphertext }),
      });
      if (res.status < 200 || res.status >= 300) {
        return yield* Effect.fail(
          new VaultTransitError({ reason: `vault_transit_rewrap_failed: ${res.status}` })
        );
      }
      const next = (res.json as { data?: { ciphertext?: string } })?.data?.ciphertext;
      if (typeof next !== "string" || !next) {
        return yield* Effect.fail(
          new VaultTransitError({ reason: "vault_transit_rewrap_missing_ciphertext" })
        );
      }
      return next;
    });
  }
}

export function createVaultTransitProvider(
  options: VaultTransitProviderOptions
): VaultTransitProvider {
  return new VaultTransitProvider(options);
}

export class VaultTransitService extends Context.Service<
  VaultTransitService,
  {
    readonly encrypt: (plaintext: string) => Effect.Effect<string, VaultTransitError>;
    readonly decrypt: (ciphertext: string) => Effect.Effect<string, VaultTransitError>;
    readonly rewrap: (ciphertext: string) => Effect.Effect<string, VaultTransitError>;
  }
>()("clawql/VaultTransitService") {}

export function createVaultTransitServiceLayer(
  options: VaultTransitProviderOptions
): Layer.Layer<VaultTransitService> {
  const provider = createVaultTransitProvider(options);
  return Layer.succeed(VaultTransitService, {
    encrypt: (plaintext) => provider.encrypt(plaintext),
    decrypt: (ciphertext) => provider.decrypt(ciphertext),
    rewrap: (ciphertext) => provider.rewrap(ciphertext),
  });
}
