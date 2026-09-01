import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import {
  makeTelemetrySigningKeyFromMemoryLayer,
  makeTelemetrySigningKeyFromVaultLayer,
  resolveTelemetrySigningKeyEffect,
  TelemetrySigningKeyFromEnvLive,
} from "./telemetry-signing-key.js";

describe("telemetry signing key service", () => {
  it("resolves from memory layer", async () => {
    const material = await Effect.runPromise(
      resolveTelemetrySigningKeyEffect().pipe(
        Effect.provide(makeTelemetrySigningKeyFromMemoryLayer("test-secret-key"))
      )
    );
    expect(material.key).toBe("test-secret-key");
    expect(material.source).toBe("memory");
  });

  it("fails env layer when key missing", async () => {
    const prev = process.env.TELEMETRY_JWT_SIGNING_KEY;
    const prev2 = process.env.JWT_SIGNING_KEY;
    delete process.env.TELEMETRY_JWT_SIGNING_KEY;
    delete process.env.JWT_SIGNING_KEY;
    try {
      const exit = await Effect.runPromiseExit(
        resolveTelemetrySigningKeyEffect().pipe(Effect.provide(TelemetrySigningKeyFromEnvLive))
      );
      expect(Exit.isFailure(exit)).toBe(true);
    } finally {
      if (prev !== undefined) process.env.TELEMETRY_JWT_SIGNING_KEY = prev;
      if (prev2 !== undefined) process.env.JWT_SIGNING_KEY = prev2;
    }
  });

  it("reads key field from Vault KV JSON", async () => {
    const material = await Effect.runPromise(
      resolveTelemetrySigningKeyEffect().pipe(
        Effect.provide(
          makeTelemetrySigningKeyFromVaultLayer({
            endpoint: "http://vault.example",
            token: "root",
            secretPath: "clawql/observability/worker",
            fetchImpl: async () =>
              new Response(JSON.stringify({ data: { data: { jwt_signing_key: "vault-key" } } }), {
                status: 200,
              }),
          })
        )
      )
    );
    expect(material.source).toBe("vault");
    expect(material.key).toBe("vault-key");
  });
});
