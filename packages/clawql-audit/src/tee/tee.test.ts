import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  createMemoryBackend,
  createSimulatedTeeSigner,
  createWORMAuditTrail,
  generateTeeKeyPairPem,
  verifyTEESignature,
} from "../index.js";

describe("Phase 3 TEE ECDSA", () => {
  it("signs and verifies entry hashes with simulated signer", async () => {
    const signer = await Effect.runPromise(createSimulatedTeeSigner());
    const hash = "a".repeat(64);
    const sig = await Effect.runPromise(signer.sign(hash));
    expect(sig.length).toBeGreaterThan(40);

    const entry = {
      id: "00000000-0000-7000-8000-000000000099",
      hash,
      prev_hash: "0".repeat(64),
      seq: 0,
      writtenAt: new Date().toISOString(),
      backendAcks: [] as const,
      type: "SESSION_START" as const,
      timestamp: new Date().toISOString(),
      sessionId: "tee-test",
      teeSignature: sig,
    };

    const ok = await Effect.runPromise(
      verifyTEESignature(entry, signer.publicKeyPem, signer.attestation)
    );
    expect(ok.valid).toBe(true);
    expect(ok.reason).toMatch(/simulated/i);
  });

  it("rejects wrong public key", async () => {
    const a = await Effect.runPromise(createSimulatedTeeSigner());
    const b = await Effect.runPromise(generateTeeKeyPairPem());
    const hash = "b".repeat(64);
    const sig = await Effect.runPromise(a.sign(hash));
    const result = await Effect.runPromise(
      verifyTEESignature(
        {
          id: "x",
          hash,
          prev_hash: "0".repeat(64),
          seq: 0,
          writtenAt: new Date().toISOString(),
          backendAcks: [],
          type: "SESSION_START",
          timestamp: new Date().toISOString(),
          sessionId: "s",
          teeSignature: sig,
        },
        b.publicKeyPem
      )
    );
    expect(result.valid).toBe(false);
  });

  it("createWORMAuditTrail appends teeSignature when tee configured", async () => {
    const signer = await Effect.runPromise(createSimulatedTeeSigner());
    const worm = await createWORMAuditTrail({
      local: createMemoryBackend(),
      remote: createMemoryBackend(),
      tee: signer,
    });
    const entry = await Effect.runPromise(
      worm.append({
        type: "SESSION_START",
        timestamp: new Date().toISOString(),
        sessionId: "tee-trail",
      })
    );
    expect(entry.teeSignature).toBeTruthy();
    const verified = await Effect.runPromise(
      verifyTEESignature(entry, signer.publicKeyPem, signer.attestation)
    );
    expect(verified.valid).toBe(true);
  });
});
