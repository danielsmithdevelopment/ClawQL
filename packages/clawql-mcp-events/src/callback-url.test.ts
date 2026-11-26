import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { assertSafeCallbackUrl, readCallbackUrlPolicy } from "./callback-url.js";

describe("assertSafeCallbackUrl (audit 5.07 → clawql-core egress)", () => {
  it("blocks private HTTPS callbacks when localhost allow is off", async () => {
    const policy = await Effect.runPromise(
      readCallbackUrlPolicy({ CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST: undefined })
    );
    const exit = await Effect.runPromiseExit(
      assertSafeCallbackUrl("https://127.0.0.1/cb", policy)
    );
    expect(exit._tag).toBe("Failure");
  });

  it("requires HTTPS unless allowLocalhost", async () => {
    const policy = await Effect.runPromise(
      readCallbackUrlPolicy({ CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST: undefined })
    );
    const exit = await Effect.runPromiseExit(
      assertSafeCallbackUrl("http://example.com/cb", policy)
    );
    expect(exit._tag).toBe("Failure");
  });

  it("allows public HTTPS via core egress", async () => {
    const policy = await Effect.runPromise(
      readCallbackUrlPolicy({ CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST: undefined })
    );
    const url = await Effect.runPromise(
      assertSafeCallbackUrl("https://example.com/hooks/clawql", policy)
    );
    expect(url.hostname).toBe("example.com");
  });

  it("allowLocalhost permits loopback HTTP for tests", async () => {
    const policy = await Effect.runPromise(
      readCallbackUrlPolicy({ CLAWQL_MCP_EVENTS_ALLOW_LOCALHOST: "1" })
    );
    const url = await Effect.runPromise(
      assertSafeCallbackUrl("http://127.0.0.1:9999/cb", policy)
    );
    expect(url.hostname).toBe("127.0.0.1");
  });
});
