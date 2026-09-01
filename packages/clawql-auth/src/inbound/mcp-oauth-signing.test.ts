import { generateKeyPair, exportPKCS8 } from "jose";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { loadMcpOAuthSigningMaterialEffect } from "./mcp-oauth-signing.js";

describe("loadMcpOAuthSigningMaterialEffect", () => {
  it("loads HS256 from signing secret", async () => {
    const material = await Effect.runPromise(
      loadMcpOAuthSigningMaterialEffect({
        signingSecret: "test-mcp-oauth-signing-secret-32b!!",
      })
    );
    expect(material.algorithm).toBe("HS256");
    expect(material.jwks.keys).toHaveLength(0);
  });

  it("loads RS256 from PKCS8 PEM and exports JWKS", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const privatePem = await exportPKCS8(privateKey);

    const material = await Effect.runPromise(
      loadMcpOAuthSigningMaterialEffect({
        privateKeyPem: privatePem,
        keyId: "test-rs256-kid",
      })
    );
    expect(material.algorithm).toBe("RS256");
    expect(material.keyId).toBe("test-rs256-kid");
    expect(material.jwks.keys).toHaveLength(1);
    expect(material.jwks.keys[0]?.alg).toBe("RS256");
    expect(material.jwks.keys[0]?.kid).toBe("test-rs256-kid");
  });
});
