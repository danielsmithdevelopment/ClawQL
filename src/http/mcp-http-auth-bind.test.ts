/**
 * Unit coverage for MCP HTTP auth-bind gate (also asserted in regulated-refusals e2e).
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  assertMcpHttpAuthBindPolicyEffect,
  isLoopbackBindHostEffect,
} from "./mcp-http-auth-bind.js";

describe("assertMcpHttpAuthBindPolicyEffect", () => {
  it("treats 127.0.0.1 / localhost / ::1 as loopback", async () => {
    expect(await Effect.runPromise(isLoopbackBindHostEffect("127.0.0.1"))).toBe(true);
    expect(await Effect.runPromise(isLoopbackBindHostEffect("localhost"))).toBe(true);
    expect(await Effect.runPromise(isLoopbackBindHostEffect("::1"))).toBe(true);
    expect(await Effect.runPromise(isLoopbackBindHostEffect("0.0.0.0"))).toBe(false);
  });

  it("regulated refuses noAuth on loopback", async () => {
    await expect(
      Effect.runPromise(
        assertMcpHttpAuthBindPolicyEffect({
          listenHost: "127.0.0.1",
          authMode: "noAuth",
          env: { CLAWQL_TIER: "regulated" },
        })
      )
    ).rejects.toThrow(/regulated.*noAuth/i);
  });

  it("standard refuses noAuth on non-loopback without allow flag", async () => {
    await expect(
      Effect.runPromise(
        assertMcpHttpAuthBindPolicyEffect({
          listenHost: "0.0.0.0",
          authMode: "noAuth",
          env: { CLAWQL_TIER: "standard" },
        })
      )
    ).rejects.toThrow(/non-loopback/i);
  });

  it("allows apiKey on non-loopback", async () => {
    await Effect.runPromise(
      assertMcpHttpAuthBindPolicyEffect({
        listenHost: "0.0.0.0",
        authMode: "apiKey",
        env: { CLAWQL_TIER: "regulated" },
      })
    );
  });
});
