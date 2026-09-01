import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { AuthEvent } from "../audit/auth-events.js";
import { createMemorySecretStore } from "../stores/memory.js";
import {
  DomainTxtError,
  createDomainChallengeEffect,
  domainTxtHostname,
  verifyDomainTxtEffect,
} from "./domain-txt.js";

describe("domain TXT challenge", () => {
  it("creates and verifies a challenge with injectable DNS", async () => {
    const store = createMemorySecretStore();
    const events: AuthEvent[] = [];
    const challenge = await Effect.runPromise(
      createDomainChallengeEffect(store, "Example.COM", {
        now: () => 1_000_000,
        ttlSeconds: 3600,
      })
    );
    expect(challenge.domain).toBe("example.com");
    expect(challenge.challenge.startsWith("clawql-domain-verify=")).toBe(true);
    expect(domainTxtHostname("example.com")).toBe("_clawql-verify.example.com");

    const verified = await Effect.runPromise(
      verifyDomainTxtEffect(store, "example.com", {
        now: () => 1_000_000,
        resolveTxt: () => Effect.succeed([["v=spf1"], [challenge.challenge, "extra"]]),
        eventSink: (e) =>
          Effect.sync(() => {
            events.push(e);
          }),
      })
    );
    expect(verified.domain).toBe("example.com");
    expect(events.some((e) => e.type === "DOMAIN_TXT_VERIFIED")).toBe(true);
    expect(await Effect.runPromise(store.getDomainChallenge("example.com"))).toBeNull();
  });

  it("rejects missing TXT match and expired challenges", async () => {
    const store = createMemorySecretStore();
    await Effect.runPromise(
      createDomainChallengeEffect(store, "acme.test", {
        now: () => 1_000,
        ttlSeconds: 10,
      })
    );

    const mismatch = await Effect.runPromiseExit(
      verifyDomainTxtEffect(store, "acme.test", {
        now: () => 1_000,
        resolveTxt: () => Effect.succeed([["unrelated"]]),
      })
    );
    expect(mismatch._tag).toBe("Failure");
    if (mismatch._tag === "Failure" && mismatch.cause._tag === "Fail") {
      expect(mismatch.cause.error).toBeInstanceOf(DomainTxtError);
      expect((mismatch.cause.error as DomainTxtError).reason).toBe("txt_mismatch");
    }

    const expired = await Effect.runPromiseExit(
      verifyDomainTxtEffect(store, "acme.test", {
        now: () => 20_000,
        resolveTxt: () => Effect.succeed([["x"]]),
      })
    );
    expect(expired._tag).toBe("Failure");
    if (expired._tag === "Failure" && expired.cause._tag === "Fail") {
      expect((expired.cause.error as DomainTxtError).reason).toBe("challenge_expired");
    }
  });

  it("rejects invalid domains", async () => {
    const store = createMemorySecretStore();
    const exit = await Effect.runPromiseExit(createDomainChallengeEffect(store, "nodots"));
    expect(exit._tag).toBe("Failure");
  });
});
