import { createLocalIdJagAssertionSigner, loadMcpOAuthSigningMaterialEffect } from "clawql-auth";
import { Effect } from "effect";
import { exportPKCS8, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import { createDevTeeIdJagSigner, createTeeIdJagSignerBridge } from "./index.js";

describe("clawql-tee ID-JAG bridge", () => {
  it("createDevTeeIdJagSigner wraps host sign as kind tee", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const signing = await Effect.runPromise(
      loadMcpOAuthSigningMaterialEffect({
        privateKeyPem: await exportPKCS8(privateKey),
        keyId: "tee-kid",
      })
    );
    const local = createLocalIdJagAssertionSigner(signing);
    const tee = createDevTeeIdJagSigner((req) => local.sign(req));
    expect(tee.kind).toBe("tee");
    const jwt = await Effect.runPromise(
      tee.sign({
        claims: { sub: "u1", iss: "https://iss.test", aud: "aud" },
        header: { alg: "RS256", kid: "tee-kid" },
      })
    );
    expect(jwt.split(".")).toHaveLength(3);
  });

  it("createTeeIdJagSignerBridge preserves attestation id option", () => {
    const bridge = createTeeIdJagSignerBridge({
      attestationId: "quote-1",
      sign: () => Effect.succeed("a.b.c"),
    });
    expect(bridge.kind).toBe("tee");
  });
});
