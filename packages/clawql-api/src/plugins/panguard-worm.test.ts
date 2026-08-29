import { bootProcessWormFromEnvEffect, resetProcessWormForTests } from "clawql-audit";
import { WormAuditSink } from "clawql-core";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { createPanguardProxyPlugin } from "./panguard-proxy-plugin.js";

const emptySession = { id: "t", atrScope: new Set<string>() };
const noopWorm = { append: () => Effect.void };

describe("Panguard → process WORM dual-write", () => {
  afterEach(async () => {
    await Effect.runPromise(resetProcessWormForTests());
    delete process.env.CLAWQL_WORM_ENABLED;
    delete process.env.CLAWQL_WORM_LOCAL;
    delete process.env.CLAWQL_WORM_REMOTE;
    delete process.env.CLAWQL_WORM_RECONCILE_MS;
    delete process.env.CLAWQL_PANGUARD_IN_PROCESS;
    delete process.env.CLAWQL_PANGUARD_BLOCK_TOOLS;
  });

  it("appends PANGUARD_DENY when a tool is blocked", async () => {
    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";
    process.env.CLAWQL_WORM_RECONCILE_MS = "0";
    process.env.CLAWQL_PANGUARD_IN_PROCESS = "1";
    process.env.CLAWQL_PANGUARD_BLOCK_TOOLS = "memory_ingest";

    const svc = await Effect.runPromise(bootProcessWormFromEnvEffect());
    expect(svc).not.toBeNull();

    const plugin = createPanguardProxyPlugin();
    const hook = plugin.hooks![0]!;
    const blocked = await Effect.runPromise(
      hook.handler({ session: emptySession, toolName: "memory_ingest", args: {} }).pipe(
        Effect.provideService(WormAuditSink, noopWorm)
      )
    );
    expect(blocked.allow).toBe(false);

    const entries = await Effect.runPromise(svc!.query({ type: "PANGUARD_DENY" }));
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0]?.metadata?.toolName).toBe("memory_ingest");
  });
});
