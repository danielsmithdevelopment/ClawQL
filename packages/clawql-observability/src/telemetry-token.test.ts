import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { verifyTelemetryJwt } from "./jwt-hs256.js";
import { makeTelemetrySigningKeyFromMemoryLayer } from "./secrets/telemetry-signing-key.js";
import { signTelemetryJwtWithResolvedKeyEffect } from "./telemetry-token.js";

describe("signTelemetryJwtWithResolvedKeyEffect", () => {
  it("mints a verifiable JWT from TelemetrySigningKeyService", async () => {
    const secret = "phase5-vault-or-env-secret-at-least-32";
    const result = await Effect.runPromise(
      signTelemetryJwtWithResolvedKeyEffect({
        claims: {
          sub: "browser-session",
          project: "clawql-local",
          origin: "http://localhost:3000",
        },
      }).pipe(Effect.provide(makeTelemetrySigningKeyFromMemoryLayer(secret)))
    );
    expect(result.keySource).toBe("memory");
    expect(result.keyLocator).toBe("memory");
    expect(result.token.split(".")).toHaveLength(3);
    const verified = await verifyTelemetryJwt(result.token, secret);
    expect(verified?.sub).toBe("browser-session");
    expect(verified?.project).toBe("clawql-local");
  });
});
