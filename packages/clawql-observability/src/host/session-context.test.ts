import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { resolveObservabilitySessionForRuntimeEffect } from "./session-context.js";

describe("resolveObservabilitySessionForRuntimeEffect", () => {
  it("uses env ATR scope when set", async () => {
    const session = await Effect.runPromise(
      resolveObservabilitySessionForRuntimeEffect({
        CLAWQL_OBSERVABILITY_ATR_SCOPE: "observability:query_logs observability:query_metrics",
        CLAWQL_OBSERVABILITY_ATR_SUB: "svc-reader",
      })
    );

    expect(session).toEqual({
      sub: "svc-reader",
      scope: ["observability:query_logs", "observability:query_metrics"],
    });
  });

  it("defaults to permissive local scope", async () => {
    const session = await Effect.runPromise(resolveObservabilitySessionForRuntimeEffect({}));

    expect(session).toEqual({ sub: "local", scope: ["*"] });
  });
});
