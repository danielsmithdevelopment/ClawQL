import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { AuthEvent } from "../audit/auth-events.js";
import type { VaultHttpClient } from "../stores/hashicorp-vault.js";
import { createMemorySecretStore } from "../stores/memory.js";
import { createTransitEncryptedSecretStore } from "../stores/transit-encrypted.js";
import {
  migratePlaintextSecretsEffect,
  rewrapAllSecretsEffect,
  scanPlaintextSecretsEffect,
} from "./transit-migrate.js";
import {
  VaultTransitError,
  createVaultTransitProvider,
  encodeTransitContext,
  isVaultTransitCiphertext,
  resolveTransitTenantId,
} from "./transit.js";

function mockHttp(
  handlers: Record<
    string,
    { status: number; json: unknown } | ((body?: string) => { status: number; json: unknown })
  >
): VaultHttpClient {
  return {
    async request({ method, url, body }) {
      const key = `${method} ${url}`;
      const hit = handlers[key];
      if (!hit) throw new Error(`unexpected request: ${key}${body ? ` body=${body}` : ""}`);
      return typeof hit === "function" ? hit(body) : hit;
    },
  };
}

describe("Transit context binding", () => {
  it("encodes stable tenant+path context and parses tenants/ paths", () => {
    const a = encodeTransitContext({ tenantId: "acme", secretPath: "providers/openai/key" });
    const b = encodeTransitContext({ tenantId: "acme", secretPath: "providers/openai/key" });
    expect(a).toBe(b);
    expect(Buffer.from(a, "base64").toString("utf8")).toContain("tenant=acme");
    expect(resolveTransitTenantId("tenants/acme/providers/x", "default")).toBe("acme");
    expect(resolveTransitTenantId("providers/x", "default")).toBe("default");
  });

  it("sends context on encrypt/decrypt and fails closed without it", async () => {
    const seen: string[] = [];
    const http = mockHttp({
      "POST https://vault.test/v1/transit/encrypt/clawql-secrets": (body) => {
        seen.push(body ?? "");
        return { status: 200, json: { data: { ciphertext: "vault:v1:abc" } } };
      },
      "POST https://vault.test/v1/transit/decrypt/clawql-secrets": (body) => {
        seen.push(body ?? "");
        return {
          status: 200,
          json: { data: { plaintext: Buffer.from("sk-live", "utf8").toString("base64") } },
        };
      },
    });
    const transit = createVaultTransitProvider({
      vaultAddr: "https://vault.test",
      vaultToken: "t",
      keyName: "clawql-secrets",
      http,
    });
    await expect(Effect.runPromise(transit.encrypt("sk-live"))).rejects.toMatchObject({
      reason: "vault_transit_context_required",
    });
    expect(
      await Effect.runPromise(
        transit.encrypt("sk-live", { tenantId: "acme", secretPath: "providers/openai/key" })
      )
    ).toBe("vault:v1:abc");
    expect(seen[0]).toContain('"context"');
    expect(
      await Effect.runPromise(
        transit.decrypt("vault:v1:abc", { tenantId: "acme", secretPath: "providers/openai/key" })
      )
    ).toBe("sk-live");
  });
});

describe("TransitEncryptedSecretStore", () => {
  it("binds ciphertext to path context and uses decrypt cache across Vault blips", async () => {
    let decryptCalls = 0;
    const http = mockHttp({
      "POST https://vault.test/v1/transit/decrypt/clawql-secrets": () => {
        decryptCalls += 1;
        if (decryptCalls === 1) {
          return {
            status: 200,
            json: {
              data: { plaintext: Buffer.from("xoxb-secret", "utf8").toString("base64") },
            },
          };
        }
        return { status: 503, json: { errors: ["sealed"] } };
      },
    });
    const inner = createMemorySecretStore();
    // Seed ciphertext without going through setSecret (which also warms the cache).
    await Effect.runPromise(inner.setSecret("providers/slack/token", "vault:v1:ct"));
    const store = createTransitEncryptedSecretStore({
      inner,
      tenantId: "acme",
      decryptCacheTtlMs: 60_000,
      now: () => 1_000_000,
      transit: createVaultTransitProvider({
        vaultAddr: "https://vault.test",
        vaultToken: "t",
        keyName: "clawql-secrets",
        http,
      }),
    });

    expect(await Effect.runPromise(store.getSecret("providers/slack/token"))).toBe("xoxb-secret");
    // Second read hits cache even though Vault would 503
    expect(await Effect.runPromise(store.getSecret("providers/slack/token"))).toBe("xoxb-secret");
    expect(decryptCalls).toBe(1);
  });

  it("rejects plaintext when rejectPlaintext is set and alerts on decrypt failure", async () => {
    const events: AuthEvent[] = [];
    const inner = createMemorySecretStore();
    await Effect.runPromise(inner.setSecret("providers/openai/key", "sk-legacy"));
    const store = createTransitEncryptedSecretStore({
      inner,
      rejectPlaintext: true,
      eventSink: (e) =>
        Effect.sync(() => {
          events.push(e);
        }),
      transit: createVaultTransitProvider({
        vaultAddr: "https://vault.test",
        vaultToken: "t",
        keyName: "clawql-secrets",
        http: mockHttp({}),
      }),
    });
    await expect(Effect.runPromise(store.getSecret("providers/openai/key"))).rejects.toMatchObject({
      reason: expect.stringContaining("plaintext_rejected"),
    });
    expect(events.some((e) => e.type === "VAULT_TRANSIT_PLAINTEXT_REJECTED")).toBe(true);

    await Effect.runPromise(inner.setSecret("providers/openai/key", "vault:v1:x"));
    const failStore = createTransitEncryptedSecretStore({
      inner,
      decryptCacheTtlMs: 0,
      eventSink: (e) =>
        Effect.sync(() => {
          events.push(e);
        }),
      transit: createVaultTransitProvider({
        vaultAddr: "https://vault.test",
        vaultToken: "t",
        keyName: "clawql-secrets",
        http: mockHttp({
          "POST https://vault.test/v1/transit/decrypt/clawql-secrets": {
            status: 500,
            json: {},
          },
        }),
      }),
    });
    await expect(
      Effect.runPromise(failStore.getSecret("providers/openai/key"))
    ).rejects.toBeInstanceOf(Error);
    expect(events.some((e) => e.type === "VAULT_TRANSIT_DECRYPT_FAILED")).toBe(true);
  });

  it("migrates plaintext, scans clean, and rewraps ciphertext", async () => {
    const events: AuthEvent[] = [];
    const inner = createMemorySecretStore();
    await Effect.runPromise(inner.setSecret("a", "plain-a"));
    await Effect.runPromise(inner.setSecret("b", "vault:v1:old"));
    const http = mockHttp({
      "POST https://vault.test/v1/transit/encrypt/clawql-secrets": {
        status: 200,
        json: { data: { ciphertext: "vault:v1:new" } },
      },
      "POST https://vault.test/v1/transit/rewrap/clawql-secrets": {
        status: 200,
        json: { data: { ciphertext: "vault:v2:rewrapped" } },
      },
    });
    const store = createTransitEncryptedSecretStore({
      inner,
      tenantId: "acme",
      eventSink: (e) =>
        Effect.sync(() => {
          events.push(e);
        }),
      transit: createVaultTransitProvider({
        vaultAddr: "https://vault.test",
        vaultToken: "t",
        keyName: "clawql-secrets",
        http,
      }),
    });

    const before = await Effect.runPromise(scanPlaintextSecretsEffect(store));
    expect(before.plaintextPaths).toContain("a");
    expect(before.ciphertextPaths).toContain("b");

    const mig = await Effect.runPromise(
      migratePlaintextSecretsEffect(store, {
        eventSink: (e) =>
          Effect.sync(() => {
            events.push(e);
          }),
      })
    );
    expect(mig.migrated).toBe(1);
    expect(mig.alreadyCiphertext).toBe(1);
    expect(await Effect.runPromise(inner.getSecret("a"))).toBe("vault:v1:new");

    const after = await Effect.runPromise(scanPlaintextSecretsEffect(store));
    expect(after.plaintextPaths).toEqual([]);

    const rewrap = await Effect.runPromise(
      rewrapAllSecretsEffect(store, {
        eventSink: (e) =>
          Effect.sync(() => {
            events.push(e);
          }),
      })
    );
    expect(rewrap).toMatchObject({ rewrapped: 2, skipped: 0, failed: 0 });
    expect(await Effect.runPromise(inner.getSecret("b"))).toBe("vault:v2:rewrapped");
    expect(events.some((e) => e.type === "VAULT_TRANSIT_MIGRATE_COMPLETED")).toBe(true);
    expect(events.some((e) => e.type === "VAULT_TRANSIT_REWRAP_COMPLETED")).toBe(true);
    expect(isVaultTransitCiphertext("vault:v2:rewrapped")).toBe(true);
  });
});

describe("VaultTransitProvider errors", () => {
  it("fails closed on non-2xx Transit responses", async () => {
    const transit = createVaultTransitProvider({
      vaultAddr: "https://vault.test",
      vaultToken: "t",
      keyName: "clawql-secrets",
      http: mockHttp({
        "POST https://vault.test/v1/transit/encrypt/clawql-secrets": {
          status: 403,
          json: { errors: ["permission denied"] },
        },
      }),
    });

    await expect(
      Effect.runPromise(transit.encrypt("x", { tenantId: "t", secretPath: "p" }))
    ).rejects.toBeInstanceOf(VaultTransitError);
  });
});
