import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  formatHttpLayerBanner,
  resolveHttpLayerFlags,
} from "./mcp-http-layer-diag.js";

describe("mcp-http-layer-diag", () => {
  it("resolves kill switches and board-default suspects", () => {
    const flags = Effect.runSync(
      resolveHttpLayerFlags({
        CLAWQL_AUTH_MODE: "noAuth",
        CLAWQL_HTTP_SKIP_AUTH: "1",
        CLAWQL_HTTP_SKIP_PRUNE: "1",
        CLAWQL_HTTP_SKIP_REQUEST_CONTEXT: "true",
        CLAWQL_HTTP_LAYER_EVENTS: "1",
        CLAWQL_ENABLE_OTEL_TRACING: "0",
        CLAWQL_AUDIT_TOOL_CALLS: "0",
        CLAWQL_HTTP_SKIP_PAYMENTS: "1",
        CLAWQL_HTTP_SKIP_GRAPHQL: "1",
      })
    );
    expect(flags.skipAuth).toBe(true);
    expect(flags.skipPrune).toBe(true);
    expect(flags.skipRequestContext).toBe(true);
    expect(flags.layerEvents).toBe(true);
    expect(flags.authMode).toBe("noAuth");
    expect(flags.otelTracing).toBe(false);
    expect(flags.auditToolCalls).toBe(false);
    expect(flags.sessionIdleMs).toBe(0);
    expect(formatHttpLayerBanner(flags)).toContain("auth_mode=noAuth");
    expect(formatHttpLayerBanner(flags)).toContain("skip_auth=1");
    expect(formatHttpLayerBanner(flags)).toContain("otel=0");
  });

  it("treats missing CLAWQL_AUDIT_TOOL_CALLS as enabled (product default)", () => {
    const flags = Effect.runSync(resolveHttpLayerFlags({}));
    expect(flags.auditToolCalls).toBe(true);
    expect(flags.skipAuth).toBe(false);
    expect(flags.skipPrune).toBe(false);
  });
});
