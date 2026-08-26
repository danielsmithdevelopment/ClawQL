import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { WORMAppendInput } from "./entry.js";
import {
  appendProcessWormEffect,
  bootProcessWormFromEnvEffect,
  resetProcessWormForTests,
} from "./process-worm.js";
import { appendAuthEventToWormEffect } from "./sinks.js";

describe("process WORM", () => {
  it("no-ops when CLAWQL_WORM_ENABLED is unset", async () => {
    resetProcessWormForTests();
    const entry = await Effect.runPromise(
      appendProcessWormEffect({
        type: "AGENT_ACTION",
        timestamp: new Date().toISOString(),
        sessionId: "s1",
      })
    );
    expect(entry).toBeNull();
  });

  it("appends auth events when enabled", async () => {
    resetProcessWormForTests();
    const env = { ...process.env, CLAWQL_WORM_ENABLED: "1" };
    const ready = await Effect.runPromise(bootProcessWormFromEnvEffect(env));
    expect(ready).toBe(true);

    const entry = await Effect.runPromise(
      appendAuthEventToWormEffect({
        type: "MCP_TOKEN_ISSUED",
        timestamp: new Date().toISOString(),
        clientId: "c1",
        grantType: "id_jag",
      })
    );
    expect(entry?.type).toBe("MCP_TOKEN_ISSUED");
    expect(entry?.metadata).toMatchObject({ source: "auth", clientId: "c1" });
  });
});
