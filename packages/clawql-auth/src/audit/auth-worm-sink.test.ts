import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { AuthEvent } from "./auth-events.js";
import { createAuthEventSinkFromEnv, resetAuthEventSinkCacheForTests } from "./auth-worm-sink.js";
import { resetProcessWormForTests } from "../../../clawql-audit/src/process-worm.js";
import { resetAuthWormStoreForTests } from "./auth-worm.js";

describe("createAuthEventSinkFromEnv dual-write", () => {
  it("completes when CLAWQL_WORM_ENABLED=1 (best-effort process trail)", async () => {
    resetAuthEventSinkCacheForTests();
    resetAuthWormStoreForTests();
    resetProcessWormForTests();

    const env = {
      ...process.env,
      CLAWQL_AUTH_AUDIT_STORE: "memory",
      CLAWQL_WORM_ENABLED: "1",
    };

    const sink = createAuthEventSinkFromEnv(env);
    const event: AuthEvent = {
      type: "MCP_TOKEN_ISSUED",
      clientId: "c1",
      grantType: "id_jag",
      scope: ["execute"],
      expiresAt: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      subjectId: "user-1",
    };

    await expect(Effect.runPromise(sink(event))).resolves.toBeUndefined();
  });
});
