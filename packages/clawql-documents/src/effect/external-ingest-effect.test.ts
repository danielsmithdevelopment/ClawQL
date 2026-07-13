import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { documentsServicesLiveLayer } from "./documents-effect-runtime.js";
import { executeExternalIngestEffect } from "./external-ingest-effect.js";

describe("executeExternalIngestEffect", () => {
  it("returns disabled stub when CLAWQL_EXTERNAL_INGEST is unset", async () => {
    const saved = process.env.CLAWQL_EXTERNAL_INGEST;
    delete process.env.CLAWQL_EXTERNAL_INGEST;
    try {
      const result = await Effect.runPromise(
        executeExternalIngestEffect({ source: "notion" }).pipe(
          Effect.provide(documentsServicesLiveLayer())
        )
      );
      expect(result.ok).toBe(false);
      expect(result.enabled).toBe(false);
      expect(result.stub).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.CLAWQL_EXTERNAL_INGEST;
      else process.env.CLAWQL_EXTERNAL_INGEST = saved;
    }
  });
});
