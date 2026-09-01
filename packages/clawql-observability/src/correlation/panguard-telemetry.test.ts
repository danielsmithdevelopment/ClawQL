import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  buildPanguardTelemetryAttributesEffect,
  emitPanguardTelemetryEffect,
  formatPanguardLokiLineEffect,
} from "./panguard-telemetry.js";

describe("panguard telemetry correlation", () => {
  it("builds shared correlation attributes", async () => {
    const attrs = await Effect.runPromise(
      buildPanguardTelemetryAttributesEffect({
        toolName: "sandbox_exec",
        verdict: "deny",
        reason: "policy blocked",
        correlationId: "corr-1",
      })
    );
    expect(attrs["clawql.correlation_id"]).toBe("corr-1");
    expect(attrs["clawql.tool_name"]).toBe("sandbox_exec");
    expect(attrs["clawql.panguard.verdict"]).toBe("deny");
    expect(attrs["service.name"]).toBe("clawql-panguard");
  });

  it("formats a Loki line and emits without push URL", async () => {
    const line = await Effect.runPromise(
      formatPanguardLokiLineEffect({
        toolName: "web_fetch",
        verdict: "allow",
      })
    );
    expect(line).toContain("panguard_allow");
    const result = await Effect.runPromise(
      emitPanguardTelemetryEffect({ toolName: "web_fetch", verdict: "allow" })
    );
    expect(result.attributes["clawql.panguard.verdict"]).toBe("allow");
  });
});
