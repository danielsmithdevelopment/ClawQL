import { describe, expect, it, vi } from "vitest";

import { enrichExceptions } from "./enrich.js";
import { createFaroHandlerState, handleFaroRequest } from "./handler.js";
import { signJwt, verifyJwt } from "./jwt.js";
import { checkRateLimit } from "./rate-limit.js";
import { validatePayload } from "./schema.js";
import type { FaroProxyEnv } from "./types.js";

const secret = "test-signing-key-at-least-32-chars-long";

const env: FaroProxyEnv = {
  JWT_SIGNING_KEY: secret,
  ALLOY_INGEST_URL: "http://alloy:8027/collect",
  ALLOWED_ORIGINS: "http://localhost:3000",
  PROJECT_ID: "clawql-local",
  RATE_LIMIT_PER_MINUTE: "60",
  MAX_BODY_BYTES: "65536",
};

describe("faro worker handler", () => {
  it("returns 204 and forwards enriched payload when JWT is valid", async () => {
    const token = await signJwt(
      {
        sub: "session-1",
        project: "clawql-local",
        origin: "http://localhost:3000",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      secret
    );

    let forwardedBody = "";
    const fetchUpstream = vi.fn(async (_url: string, init?: RequestInit) => {
      forwardedBody = String(init?.body ?? "");
      return new Response(null, { status: 204 });
    });

    const request = new Request("https://telemetry.example/collect", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "exception",
        payload: {
          exceptions: [
            {
              type: "TypeError",
              value: "boom",
              stacktrace: { frames: [{ function: "onClick", filename: "app.js" }] },
            },
          ],
        },
      }),
    });

    const response = await handleFaroRequest(request, env, createFaroHandlerState(), {
      verifyJwt,
      validatePayload,
      enrichExceptions,
      checkRateLimit,
      fetchUpstream,
      now: () => Date.now(),
    });

    expect(response.status).toBe(204);
    expect(fetchUpstream).toHaveBeenCalledOnce();
    expect(forwardedBody).toContain("error_fingerprint");
  });

  it("silently drops requests without Authorization", async () => {
    const response = await handleFaroRequest(
      new Request("https://telemetry.example/collect", { method: "POST", body: "{}" }),
      env,
      createFaroHandlerState()
    );
    expect(response.status).toBe(204);
  });
});
