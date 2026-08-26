import { Effect } from "effect";
import {
  bootProcessWormFromEnvEffect,
  resetProcessWormForTests,
} from "clawql-audit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runMcpProxyBeforeCallTool } from "./clawql-api-adapters.js";
import { wrapRegisteredMcpToolHandler } from "./mcp-tool-wrap.js";

vi.mock("./clawql-api-adapters.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./clawql-api-adapters.js")>();
  return {
    ...actual,
    runMcpProxyBeforeCallTool: vi.fn(async () => undefined),
  };
});

describe("wrapRegisteredMcpToolHandler WORM audit", () => {
  afterEach(async () => {
    await Effect.runPromise(resetProcessWormForTests());
    delete process.env.CLAWQL_WORM_ENABLED;
    delete process.env.CLAWQL_WORM_LOCAL;
    delete process.env.CLAWQL_WORM_REMOTE;
    delete process.env.CLAWQL_WORM_RECONCILE_MS;
  });

  it("appends TOOL_CALL_ATTEMPT/RESULT for search when WORM enabled", async () => {
    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";
    process.env.CLAWQL_WORM_RECONCILE_MS = "0";

    const svc = await Effect.runPromise(bootProcessWormFromEnvEffect());
    expect(svc).not.toBeNull();

    const wrapped = wrapRegisteredMcpToolHandler("search", async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));

    await wrapped({ query: "worm", limit: 1 });

    const attempts = await Effect.runPromise(svc!.query({ type: "TOOL_CALL_ATTEMPT" }));
    const results = await Effect.runPromise(svc!.query({ type: "TOOL_CALL_RESULT" }));
    expect(attempts.some((e) => e.metadata?.toolName === "search")).toBe(true);
    expect(attempts.some((e) => e.metadata?.source === "mcp")).toBe(true);
    expect(results.some((e) => e.metadata?.toolName === "search" && e.metadata?.ok === true)).toBe(
      true
    );
  });

  it("skips WORM for execute (handled by ExecuteLive)", async () => {
    process.env.CLAWQL_WORM_ENABLED = "1";
    process.env.CLAWQL_WORM_LOCAL = "memory";
    process.env.CLAWQL_WORM_REMOTE = "memory";
    process.env.CLAWQL_WORM_RECONCILE_MS = "0";

    const svc = await Effect.runPromise(bootProcessWormFromEnvEffect());

    const wrapped = wrapRegisteredMcpToolHandler("execute", async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));

    await wrapped({ operationId: "x" });

    const attempts = await Effect.runPromise(svc!.query({ type: "TOOL_CALL_ATTEMPT" }));
    expect(attempts.some((e) => e.metadata?.toolName === "execute")).toBe(false);
  });
});
