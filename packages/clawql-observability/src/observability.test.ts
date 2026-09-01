import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { defaultLgtmPlusHelmValues, readObservabilityProfileEffect } from "./config.js";
import { createErrorFingerprintEffect, normaliseErrorMessage } from "./fingerprint.js";
import { defaultLocalEndpoints, packagePaths } from "./paths.js";
import { signTelemetryJwtEffect } from "./telemetry-token.js";
import { verifyTelemetryJwt } from "./jwt-hs256.js";

describe("clawql-observability config", () => {
  it("exposes default LGTM+ helm values", () => {
    const values = defaultLgtmPlusHelmValues();
    expect(values.lgtmPlus.loki.enabled).toBe(true);
    expect(values.lgtmPlus.loki.retentionPeriod).toBe("744h");
    expect(values.lgtmPlus.mimir.ingestionRate).toBe(10_000);
  });

  it("resolves bundled profile with alloy OTLP defaults", async () => {
    process.env.CLAWQL_OBSERVABILITY_PROFILE = "bundled";
    process.env.CLAWQL_LOKI_PUSH_URL = "auto";
    delete process.env.CLAWQL_ENABLE_OTEL_TRACING;

    const profile = await Effect.runPromise(readObservabilityProfileEffect());

    expect(profile.profile).toBe("bundled");
    expect(profile.enableOtelTracing).toBe(true);
    expect(profile.enableLokiPush).toBe(true);
    expect(profile.otelCollectorUrl).toBe("http://alloy:4318");
    expect(profile.lokiPushUrl).toBe("http://loki:3100/loki/api/v1/push");
  });
});

describe("clawql-observability paths", () => {
  it("points deploy artifacts under the package root", () => {
    expect(packagePaths.alloyConfig.endsWith("alloy/config.river")).toBe(true);
    expect(packagePaths.dockerCompose.endsWith("docker/docker-compose.yaml")).toBe(true);
    expect(defaultLocalEndpoints().grafanaUrl).toBe("http://localhost:3000");
  });
});

describe("clawql-observability fingerprint", () => {
  it("normalises dynamic segments in error messages", () => {
    expect(normaliseErrorMessage("user 12345 not found at https://x.test/a")).toBe(
      "user <n> not found at <url>"
    );
  });

  it("hashes equivalent errors to the same fingerprint", async () => {
    const event = {
      payload: {
        exceptions: [
          {
            type: "TypeError",
            value: "Cannot read property 'x' of undefined",
            stacktrace: {
              frames: [{ function: "handleClick", filename: "app.js" }],
            },
          },
        ],
      },
    };

    const a = await Effect.runPromise(createErrorFingerprintEffect(event));
    const b = await Effect.runPromise(createErrorFingerprintEffect(event));
    expect(a).toBe(b);
    expect(a).toHaveLength(16);
  });
});

describe("clawql-observability telemetry token", () => {
  it("mints JWTs verifiable by the Faro worker", async () => {
    const secret = "backend-signing-key-at-least-32-chars";
    const now = Math.floor(Date.now() / 1000);
    const { token, expiresAt } = await Effect.runPromise(
      signTelemetryJwtEffect({
        signingKey: secret,
        claims: {
          sub: "session-test",
          project: "clawql-local",
          origin: "http://localhost:3000",
        },
        ttlSeconds: 600,
        now: () => now,
      })
    );

    expect(expiresAt).toBe(now + 600);
    const claims = await verifyTelemetryJwt(token, secret);
    expect(claims?.sub).toBe("session-test");
    expect(claims?.project).toBe("clawql-local");
  });
});
