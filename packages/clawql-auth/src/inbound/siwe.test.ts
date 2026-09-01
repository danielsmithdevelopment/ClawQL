import { Effect } from "effect";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { createMemorySecretStore } from "../stores/memory.js";
import {
  SiweError,
  buildSiweMessage,
  issueSiweNonceEffect,
  parseSiweMessage,
  verifySiweLoginEffect,
} from "./siwe.js";

describe("SIWE primary login", () => {
  it("issues nonce and verifies a signed EIP-4361 message → ATR", async () => {
    const store = createMemorySecretStore();
    const account = privateKeyToAccount(generatePrivateKey());
    const config = {
      domain: "login.clawql.test",
      uri: "https://login.clawql.test/siwe",
      chainIds: [1],
      statement: "Sign in to ClawQL",
      now: () => 1_000_000,
      nonceTtlSeconds: 600,
    };

    const issued = await Effect.runPromise(issueSiweNonceEffect(store, config));
    const message = buildSiweMessage({
      domain: config.domain,
      address: account.address,
      uri: config.uri,
      chainId: 1,
      nonce: issued.nonce,
      statement: config.statement,
      issuedAt: new Date(1_000_000).toISOString(),
    });
    const parsed = parseSiweMessage(message);
    expect(parsed.nonce).toBe(issued.nonce);
    expect(parsed.address.toLowerCase()).toBe(account.address.toLowerCase());

    const signature = await account.signMessage({ message });
    const claims = await Effect.runPromise(
      verifySiweLoginEffect(store, { message, signature }, config)
    );
    expect(claims.sub).toBe(account.address.toLowerCase());
    expect(claims.walletAddress).toBe(account.address.toLowerCase());
    expect(claims.role).toBe("operator");

    const replay = await Effect.runPromiseExit(
      verifySiweLoginEffect(store, { message, signature }, config)
    );
    expect(replay._tag).toBe("Failure");
    if (replay._tag === "Failure" && replay.cause._tag === "Fail") {
      expect((replay.cause.error as SiweError).reason).toBe("nonce_consumed");
    }
  });

  it("rejects domain mismatch", async () => {
    const store = createMemorySecretStore();
    const account = privateKeyToAccount(generatePrivateKey());
    const config = {
      domain: "login.clawql.test",
      uri: "https://login.clawql.test/siwe",
      now: () => 1_000_000,
    };
    const issued = await Effect.runPromise(issueSiweNonceEffect(store, config));
    const message = buildSiweMessage({
      domain: "evil.example",
      address: account.address,
      uri: config.uri,
      chainId: 1,
      nonce: issued.nonce,
    });
    const signature = await account.signMessage({ message });
    const exit = await Effect.runPromiseExit(
      verifySiweLoginEffect(store, { message, signature }, config)
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect((exit.cause.error as SiweError).reason).toBe("domain_mismatch");
    }
  });
});
