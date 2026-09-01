import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { bootProcessWormFromEnvEffect, resetProcessWormForTests } from "clawql-audit";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildGatewayAuthConfig,
  getClawqlGatewayAuth,
  resetClawqlGatewayAuthForTests,
} from "./gateway-auth.js";

describe("gateway-auth WORM sink", () => {
  afterEach(async () => {
    resetClawqlGatewayAuthForTests();
    await Effect.runPromise(resetProcessWormForTests());
    delete process.env.CLAWQL_WORM_ENABLED;
    delete process.env.CLAWQL_WORM_LOCAL;
    delete process.env.CLAWQL_WORM_REMOTE;
    delete process.env.CLAWQL_WORM_RECONCILE_MS;
    delete process.env.CLAWQL_AUTH_API_KEY_STORE_PATH;
    delete process.env.CLAWQL_AUTH_MODE;
  });

  it("wires authEventSink into issued API key store", async () => {
    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";
    process.env.CLAWQL_WORM_RECONCILE_MS = "0";
    process.env.CLAWQL_AUTH_MODE = "apiKey";
    const dir = mkdtempSync(join(tmpdir(), "clawql-auth-worm-"));
    process.env.CLAWQL_AUTH_API_KEY_STORE_PATH = join(dir, "api-keys.json");

    await Effect.runPromise(bootProcessWormFromEnvEffect());

    const auth = getClawqlGatewayAuth();
    expect(auth.apiKeys).toBeDefined();
    expect(buildGatewayAuthConfig().mode).toBe("apiKey");

    const { secret } = await Effect.runPromise(
      auth.apiKeys!.issue({
        subjectId: "alice@test",
        role: "operator",
        scope: ["search"],
        label: "test",
      })
    );

    const svc = await Effect.runPromise(bootProcessWormFromEnvEffect());
    const issued = await Effect.runPromise(svc!.query({ type: "API_KEY_ISSUED" }));
    expect(issued.length).toBeGreaterThanOrEqual(1);

    const validated = Effect.runSync(auth.apiKeys!.validate(secret));
    expect(validated.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 20));

    const used = await Effect.runPromise(svc!.query({ type: "API_KEY_USED" }));
    expect(used.length).toBeGreaterThanOrEqual(1);
  });
});
