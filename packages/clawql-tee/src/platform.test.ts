import { loadMcpOAuthSigningMaterialEffect } from "clawql-auth";
import { Effect } from "effect";
import { exportPKCS8, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import {
  createHardwarePlatformAdapter,
  createSimulatedPlatformAdapter,
  resolveTeePlatformFromEnv,
  teeStrictFromEnv,
} from "./platform.js";
import { createIdJagSignerFromPlatform, createSimulatedIdJagSigner } from "./id-jag.js";

describe("clawql-tee platform adapter", () => {
  it("simulated adapter returns base64 JSON report", async () => {
    const adapter = createSimulatedPlatformAdapter({ measurementId: "m1" });
    const att = await Effect.runPromise(adapter.getAttestation());
    expect(att.platform).toBe("simulated");
    expect(att.measurementId).toBe("m1");
    const decoded = JSON.parse(Buffer.from(att.reportBase64, "base64").toString("utf8"));
    expect(decoded.platform).toBe("simulated");
  });

  it("hardware adapter fails closed on attestation", async () => {
    const adapter = createHardwarePlatformAdapter("sev-snp");
    await expect(Effect.runPromise(adapter.getAttestation())).rejects.toMatchObject({
      message: expect.stringContaining("sev-snp"),
    });
  });

  it("resolveTeePlatformFromEnv defaults to simulated", async () => {
    const adapter = await Effect.runPromise(
      resolveTeePlatformFromEnv({ env: {} as NodeJS.ProcessEnv })
    );
    expect(adapter.platform).toBe("simulated");
  });

  it("createSimulatedIdJagSigner produces valid JWT", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const signing = await Effect.runPromise(
      loadMcpOAuthSigningMaterialEffect({
        privateKeyPem: await exportPKCS8(privateKey),
        keyId: "sim-kid",
      })
    );
    const signer = await Effect.runPromise(createSimulatedIdJagSigner(signing));
    expect(signer.kind).toBe("tee");
    const jwt = await Effect.runPromise(
      signer.sign({
        claims: { sub: "org-user" },
        header: { alg: "RS256", kid: "sim-kid" },
      })
    );
    expect(jwt.split(".")).toHaveLength(3);
  });

  it("CLAWQL_TEE_STRICT rejects simulated on sign", async () => {
    const adapter = createSimulatedPlatformAdapter();
    const signer = createIdJagSignerFromPlatform({
      adapter,
      sign: () => Effect.succeed("a.b.c"),
      env: { CLAWQL_TEE_STRICT: "1" } as NodeJS.ProcessEnv,
    });
    await expect(
      Effect.runPromise(signer.sign({ claims: { sub: "x" }, header: { alg: "RS256" } }))
    ).rejects.toThrow(/CLAWQL_TEE_STRICT/);
    expect(teeStrictFromEnv({ CLAWQL_TEE_STRICT: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });
});
