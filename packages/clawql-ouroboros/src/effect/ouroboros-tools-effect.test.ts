import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import type { OuroborosContext } from "../mcp-hooks.js";
import { OuroborosContextService } from "./ouroboros-context-service.js";
import { executeCreateSeedFromDocumentEffect } from "./ouroboros-tools-effect.js";
import { OuroborosToolsService, ouroborosToolsLiveLayer } from "./ouroboros-tools-service.js";

const stubContext = {} as OuroborosContext;

const testLayer = Layer.mergeAll(
  Layer.succeed(
    OuroborosContextService,
    OuroborosContextService.of({ getContext: () => stubContext })
  ),
  ouroborosToolsLiveLayer()
);

describe("executeCreateSeedFromDocumentEffect", () => {
  it("builds a seed via OuroborosToolsService", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const tools = yield* OuroborosToolsService;
        return yield* tools.createSeedFromDocument({
          documentId: "doc-effect",
          extractedText: "Effect bridge test document with enough tokens",
          goalHint: "Effect goal",
          metadata: {},
          taskType: "analysis",
        });
      }).pipe(Effect.provide(testLayer))
    );
    expect(result).toMatchObject({ success: true });
    if ("success" in result && result.success) {
      expect(result.seed.goal).toBe("Effect goal");
    }
  });

  it("executeCreateSeedFromDocumentEffect uses context service", async () => {
    const result = await Effect.runPromise(
      executeCreateSeedFromDocumentEffect({
        documentId: "doc-ctx",
        extractedText: "Context service wiring validation text",
        metadata: {},
        taskType: "ingest",
      }).pipe(Effect.provide(testLayer))
    );
    expect(result).toMatchObject({ success: true });
  });
});
