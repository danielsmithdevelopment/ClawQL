import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { VaultHttpClient } from "../stores/hashicorp-vault.js";
import { createMemorySecretStore } from "../stores/memory.js";
import { createTransitEncryptedSecretStore } from "../stores/transit-encrypted.js";
import {
  VaultTransitError,
  createVaultTransitProvider,
  isVaultTransitCiphertext,
} from "./transit.js";

function mockHttp(handlers: Record<string, { status: number; json: unknown }>): VaultHttpClient {
  return {
    async request({ method, url, body }) {
      const key = `${method} ${url}`;
      const hit = handlers[key];
      if (!hit) throw new Error(`unexpected request: ${key}${body ? ` body=${body}` : ""}`);
      return hit;
    },
  };
}

describe("VaultTransitProvider", () => {
  it("encrypts and decrypts via Transit HTTP API", async () => {
    const http = mockHttp({
      "POST https://vault.test/v1/transit/encrypt/clawql-secrets": {
        status: 200,
        json: { data: { ciphertext: "vault:v1:abc" } },
      },
      "POST https://vault.test/v1/transit/decrypt/clawql-secrets": {
        status: 200,
        json: { data: { plaintext: Buffer.from("sk-live", "utf8").toString("base64") } },
      },
      "POST https://vault.test/v1/transit/rewrap/clawql-secrets": {
        status: 200,
        json: { data: { ciphertext: "vault:v2:xyz" } },
      },
    });

    const transit = createVaultTransitProvider({
      vaultAddr: "https://vault.test",
      vaultToken: "t",
      keyName: "clawql-secrets",
      http,
    });

    expect(await Effect.runPromise(transit.encrypt("sk-live"))).toBe("vault:v1:abc");
    expect(await Effect.runPromise(transit.decrypt("vault:v1:abc"))).toBe("sk-live");
    expect(await Effect.runPromise(transit.rewrap("vault:v1:abc"))).toBe("vault:v2:xyz");
    expect(isVaultTransitCiphertext("vault:v1:abc")).toBe(true);
    expect(isVaultTransitCiphertext("sk-live")).toBe(false);
  });

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

    await expect(Effect.runPromise(transit.encrypt("x"))).rejects.toBeInstanceOf(VaultTransitError);
  });
});

describe("TransitEncryptedSecretStore", () => {
  it("stores ciphertext in the inner store and returns plaintext to callers", async () => {
    const inner = createMemorySecretStore();
    const http = mockHttp({
      "POST https://vault.test/v1/transit/encrypt/clawql-secrets": {
        status: 200,
        json: { data: { ciphertext: "vault:v1:ct" } },
      },
      "POST https://vault.test/v1/transit/decrypt/clawql-secrets": {
        status: 200,
        json: {
          data: { plaintext: Buffer.from("xoxb-secret", "utf8").toString("base64") },
        },
      },
    });
    const transit = createVaultTransitProvider({
      vaultAddr: "https://vault.test",
      vaultToken: "t",
      keyName: "clawql-secrets",
      http,
    });
    const store = createTransitEncryptedSecretStore({ inner, transit });

    await Effect.runPromise(store.setSecret("providers/slack/token", "xoxb-secret"));
    expect(await Effect.runPromise(inner.getSecret("providers/slack/token"))).toBe("vault:v1:ct");
    expect(await Effect.runPromise(store.getSecret("providers/slack/token"))).toBe("xoxb-secret");
  });

  it("reads legacy plaintext without calling Transit decrypt", async () => {
    const inner = createMemorySecretStore();
    await Effect.runPromise(inner.setSecret("providers/openai/key", "sk-legacy"));
    const store = createTransitEncryptedSecretStore({
      inner,
      transit: createVaultTransitProvider({
        vaultAddr: "https://vault.test",
        vaultToken: "t",
        keyName: "clawql-secrets",
        http: mockHttp({}),
      }),
    });
    expect(await Effect.runPromise(store.getSecret("providers/openai/key"))).toBe("sk-legacy");
  });

  it("rewraps ciphertext in place", async () => {
    const inner = createMemorySecretStore();
    await Effect.runPromise(inner.setSecret("k", "vault:v1:old"));
    const http = mockHttp({
      "POST https://vault.test/v1/transit/rewrap/clawql-secrets": {
        status: 200,
        json: { data: { ciphertext: "vault:v2:new" } },
      },
    });
    const store = createTransitEncryptedSecretStore({
      inner,
      transit: createVaultTransitProvider({
        vaultAddr: "https://vault.test",
        vaultToken: "t",
        keyName: "clawql-secrets",
        http,
      }),
    });
    expect(await Effect.runPromise(store.rewrapSecret("k"))).toBe(true);
    expect(await Effect.runPromise(inner.getSecret("k"))).toBe("vault:v2:new");
  });
});
