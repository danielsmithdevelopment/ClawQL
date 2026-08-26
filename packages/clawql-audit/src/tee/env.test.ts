import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { createWormTeeSignerFromEnvEffect } from "./env.js";
import { verifyTEESignature } from "./signer.js";

describe("createWormTeeSignerFromEnvEffect", () => {
  afterEach(() => {
    delete process.env.CLAWQL_WORM_TEE;
    delete process.env.CLAWQL_WORM_TEE_PLATFORM;
    delete process.env.CLAWQL_WORM_TEE_PRIVATE_KEY_PEM;
    delete process.env.CLAWQL_WORM_TEE_PUBLIC_KEY_PEM;
  });

  it("returns undefined when CLAWQL_WORM_TEE unset", async () => {
    delete process.env.CLAWQL_WORM_TEE;
    const signer = await Effect.runPromise(createWormTeeSignerFromEnvEffect(process.env));
    expect(signer).toBeUndefined();
  });

  it("creates ephemeral simulated signer when CLAWQL_WORM_TEE=1", async () => {
    process.env.CLAWQL_WORM_TEE = "1";
    const signer = await Effect.runPromise(createWormTeeSignerFromEnvEffect(process.env));
    expect(signer).toBeDefined();
    const hash = "c".repeat(64);
    const sig = await Effect.runPromise(signer!.sign(hash));
    const entry = {
      id: "00000000-0000-7000-8000-000000000001",
      hash,
      prevHash: "0".repeat(64),
      chainIndex: 0,
      writtenAt: new Date().toISOString(),
      backendAcks: [] as string[],
      type: "SESSION_START" as const,
      timestamp: new Date().toISOString(),
      sessionId: "env-tee",
      teeSignature: sig,
    };
    const withKeys = signer as { publicKeyPem: string; attestation: { platform: string } };
    const ok = await Effect.runPromise(
      verifyTEESignature(entry, withKeys.publicKeyPem, withKeys.attestation)
    );
    expect(ok.valid).toBe(true);
  });

  it("rejects hardware platform until clawql-tee adapter is wired", async () => {
    process.env.CLAWQL_WORM_TEE = "1";
    process.env.CLAWQL_WORM_TEE_PLATFORM = "sev-snp";
    const err = await Effect.runPromise(
      createWormTeeSignerFromEnvEffect(process.env).pipe(Effect.flip)
    );
    expect(err.reason).toContain("sev-snp");
  });
});
