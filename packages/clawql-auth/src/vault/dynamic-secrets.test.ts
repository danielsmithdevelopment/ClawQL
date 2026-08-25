import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { AuthEvent } from "../audit/auth-events.js";
import type { VaultHttpClient } from "../stores/hashicorp-vault.js";
import {
  VaultDynamicSecretError,
  createVaultDynamicSecretProvider,
} from "./dynamic-secrets.js";

function mockHttp(handlers: Record<string, { status: number; json: unknown }>): VaultHttpClient {
  return {
    async request({ method, url }) {
      const key = `${method} ${url}`;
      const hit = handlers[key];
      if (!hit) throw new Error(`unexpected request: ${key}`);
      return hit;
    },
  };
}

describe("VaultDynamicSecretProvider", () => {
  it("issues a lease and renews when within proactive window", async () => {
    const events: AuthEvent[] = [];
    const http = mockHttp({
      "GET https://vault.test/v1/database/creds/readonly": {
        status: 200,
        json: {
          lease_id: "lease-1",
          lease_duration: 120,
          renewable: true,
          data: { username: "u1", password: "p1" },
        },
      },
      "POST https://vault.test/v1/sys/leases/renew": {
        status: 200,
        json: { lease_duration: 300 },
      },
    });

    const provider = createVaultDynamicSecretProvider({
      vaultAddr: "https://vault.test",
      vaultToken: "t",
      http,
      now: () => 1_000_000,
      proactiveRenewSeconds: 60,
      eventSink: (e) =>
        Effect.sync(() => {
          events.push(e);
        }),
    });

    const lease = await Effect.runPromise(provider.getDynamicSecret("database/creds/readonly"));
    expect(lease.leaseId).toBe("lease-1");
    expect(lease.data.username).toBe("u1");
    expect(lease.expiresAtMs).toBe(1_000_000 + 120_000);
    expect(events.some((e) => e.type === "VAULT_LEASE_ISSUED")).toBe(true);

    // Remaining TTL = 50s → renew
    const providerNearExpiry = createVaultDynamicSecretProvider({
      vaultAddr: "https://vault.test",
      vaultToken: "t",
      http,
      now: () => lease.expiresAtMs - 50_000,
      proactiveRenewSeconds: 60,
      eventSink: (e) =>
        Effect.sync(() => {
          events.push(e);
        }),
    });
    const renewed = await Effect.runPromise(providerNearExpiry.renewIfNeeded(lease));
    expect(renewed.leaseDurationSec).toBe(300);
    expect(events.some((e) => e.type === "VAULT_LEASE_RENEWED")).toBe(true);
  });

  it("skips renew when healthy or non-renewable", async () => {
    const provider = createVaultDynamicSecretProvider({
      vaultAddr: "https://vault.test",
      vaultToken: "t",
      http: mockHttp({}),
      now: () => 1_000_000,
      proactiveRenewSeconds: 60,
    });
    const lease = {
      leaseId: "l",
      leaseDurationSec: 600,
      data: {},
      renewable: true,
      expiresAtMs: 1_000_000 + 600_000,
      rolePath: "db/creds/x",
    };
    const same = await Effect.runPromise(provider.renewIfNeeded(lease));
    expect(same).toEqual(lease);
  });

  it("fails on non-2xx vault responses", async () => {
    const provider = createVaultDynamicSecretProvider({
      vaultAddr: "https://vault.test",
      vaultToken: "t",
      http: mockHttp({
        "GET https://vault.test/v1/database/creds/readonly": {
          status: 403,
          json: { errors: ["denied"] },
        },
      }),
    });
    const exit = await Effect.runPromiseExit(
      provider.getDynamicSecret("database/creds/readonly")
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(VaultDynamicSecretError);
    }
  });
});
