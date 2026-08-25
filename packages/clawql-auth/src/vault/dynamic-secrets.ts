/**
 * Phase 6 — Vault / OpenBao dynamic secret leases (distinct from SecretStore KV).
 * Effect-primary; uses the same Vault HTTP client shape as HashiCorpVaultStore.
 */

import { Context, Data, Effect, Layer } from "effect";

import {
  emitAuthEventEffect,
  noopAuthEventSink,
  type AuthEventSink,
} from "../audit/auth-events.js";
import type { VaultHttpClient } from "../stores/hashicorp-vault.js";

export class VaultDynamicSecretError extends Data.TaggedError("VaultDynamicSecretError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type VaultDynamicLease = {
  leaseId: string;
  leaseDurationSec: number;
  data: Record<string, string>;
  renewable: boolean;
  /** Absolute expiry hint for proactive renew (ms since epoch). */
  expiresAtMs: number;
  rolePath: string;
};

export type VaultDynamicSecretProviderOptions = {
  vaultAddr: string;
  vaultToken: string;
  http?: VaultHttpClient;
  eventSink?: AuthEventSink;
  now?: () => number;
  /** Renew when remaining TTL ≤ this many seconds (default 60). */
  proactiveRenewSeconds?: number;
};

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
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

function stringifyData(data: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data) return out;
  for (const [k, v] of Object.entries(data)) {
    if (v == null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

export class VaultDynamicSecretProvider {
  private readonly http: VaultHttpClient;
  private readonly eventSink: AuthEventSink;
  private readonly now: () => number;
  private readonly proactiveRenewSeconds: number;
  private readonly addr: string;
  private readonly token: string;

  constructor(private readonly options: VaultDynamicSecretProviderOptions) {
    this.http = options.http ?? defaultHttp();
    this.eventSink = options.eventSink ?? noopAuthEventSink;
    this.now = options.now ?? Date.now;
    this.proactiveRenewSeconds = options.proactiveRenewSeconds ?? 60;
    this.addr = trimSlash(options.vaultAddr);
    this.token = options.vaultToken;
  }

  getDynamicSecret(
    rolePath: string
  ): Effect.Effect<VaultDynamicLease, VaultDynamicSecretError> {
    return Effect.gen(this, function* () {
      const path = rolePath.replace(/^\/+/, "");
      const res = yield* Effect.tryPromise({
        try: () =>
          this.http.request({
            method: "GET",
            url: `${this.addr}/v1/${path}`,
            headers: { "X-Vault-Token": this.token },
          }),
        catch: (cause) =>
          new VaultDynamicSecretError({ reason: "vault_request_failed", cause }),
      });
      if (res.status < 200 || res.status >= 300) {
        return yield* Effect.fail(
          new VaultDynamicSecretError({ reason: `vault_dynamic_secret_failed: ${res.status}` })
        );
      }
      const json = res.json as {
        lease_id?: string;
        lease_duration?: number;
        renewable?: boolean;
        data?: Record<string, unknown>;
      };
      const leaseDurationSec = Number(json.lease_duration ?? 0);
      const lease: VaultDynamicLease = {
        leaseId: String(json.lease_id ?? ""),
        leaseDurationSec,
        renewable: Boolean(json.renewable),
        data: stringifyData(json.data),
        expiresAtMs: this.now() + leaseDurationSec * 1000,
        rolePath: path,
      };
      yield* emitAuthEventEffect(this.eventSink, {
        type: "VAULT_LEASE_ISSUED",
        leaseId: lease.leaseId,
        rolePath: path,
        leaseDurationSec,
        timestamp: new Date(this.now()).toISOString(),
      });
      return lease;
    });
  }

  /**
   * Renew when remaining TTL ≤ proactive window (same idea as OAuthTokenStore).
   * Non-renewable or healthy leases are returned unchanged.
   */
  renewIfNeeded(
    lease: VaultDynamicLease
  ): Effect.Effect<VaultDynamicLease, VaultDynamicSecretError> {
    return Effect.gen(this, function* () {
      const remainingSec = Math.floor((lease.expiresAtMs - this.now()) / 1000);
      if (!lease.renewable || remainingSec > this.proactiveRenewSeconds) {
        return lease;
      }
      const res = yield* Effect.tryPromise({
        try: () =>
          this.http.request({
            method: "POST",
            url: `${this.addr}/v1/sys/leases/renew`,
            headers: {
              "X-Vault-Token": this.token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ lease_id: lease.leaseId }),
          }),
        catch: (cause) =>
          new VaultDynamicSecretError({ reason: "vault_renew_request_failed", cause }),
      });
      if (res.status < 200 || res.status >= 300) {
        return yield* Effect.fail(
          new VaultDynamicSecretError({ reason: `vault_lease_renew_failed: ${res.status}` })
        );
      }
      const json = res.json as { lease_duration?: number };
      const leaseDurationSec = Number(json.lease_duration ?? lease.leaseDurationSec);
      const next: VaultDynamicLease = {
        ...lease,
        leaseDurationSec,
        expiresAtMs: this.now() + leaseDurationSec * 1000,
      };
      yield* emitAuthEventEffect(this.eventSink, {
        type: "VAULT_LEASE_RENEWED",
        leaseId: next.leaseId,
        rolePath: next.rolePath,
        leaseDurationSec,
        timestamp: new Date(this.now()).toISOString(),
      });
      return next;
    });
  }
}

export function createVaultDynamicSecretProvider(
  options: VaultDynamicSecretProviderOptions
): VaultDynamicSecretProvider {
  return new VaultDynamicSecretProvider(options);
}

export class VaultDynamicSecretService extends Context.Tag("clawql/VaultDynamicSecretService")<
  VaultDynamicSecretService,
  {
    readonly getDynamicSecret: (
      rolePath: string
    ) => Effect.Effect<VaultDynamicLease, VaultDynamicSecretError>;
    readonly renewIfNeeded: (
      lease: VaultDynamicLease
    ) => Effect.Effect<VaultDynamicLease, VaultDynamicSecretError>;
  }
>() {}

export function createVaultDynamicSecretServiceLayer(
  options: VaultDynamicSecretProviderOptions
): Layer.Layer<VaultDynamicSecretService> {
  const provider = createVaultDynamicSecretProvider(options);
  return Layer.succeed(VaultDynamicSecretService, {
    getDynamicSecret: (rolePath) => provider.getDynamicSecret(rolePath),
    renewIfNeeded: (lease) => provider.renewIfNeeded(lease),
  });
}
