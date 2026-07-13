import { Effect } from "effect";
import { InMemoryEventStore } from "../in-memory-event-store.js";
import { describe, expect, it } from "vitest";
import { Layer } from "effect";
import { ouroborosFromPromise } from "./ouroboros-effect-utils.js";
import { OuroborosEventStoreService } from "./ouroboros-event-store-service.js";

describe("OuroborosEventStoreService", () => {
  it("append and getLineage round-trip via in-memory store", async () => {
    const store = new InMemoryEventStore();
    const layer = Layer.succeed(
      OuroborosEventStoreService,
      OuroborosEventStoreService.of({
        getStore: () => store,
        append: (event) => ouroborosFromPromise(() => store.append(event)),
        getLineage: (seedId) => ouroborosFromPromise(() => store.getLineage(seedId)),
      })
    );
    const lineage = await Effect.runPromise(
      Effect.gen(function* () {
        const es = yield* OuroborosEventStoreService;
        yield* es.append({
          type: "generation_completed",
          seed_id: "seed-test",
          data: {
            generation_number: 1,
            seed: { metadata: { seed_id: "seed-test" } },
            execution_output: "out",
            evaluation_summary: { final_approved: true, score: 1, ac_results: [] },
            phase: "completed",
            ontology_schema: { name: "o", description: "d", fields: [] },
          },
        });
        return yield* es.getLineage("seed-test");
      }).pipe(Effect.provide(layer))
    );
    expect(lineage.seed_id).toBe("seed-test");
  });
});
