import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { ClawQLApi, createClawQLApi } from "./index.js";

describe("createClawQLApi", () => {
  it("registers plugins via ClawQLApi service", async () => {
    const api = createClawQLApi();
    await api.run(
      Effect.gen(function* () {
        const claw = yield* ClawQLApi;
        yield* claw.registerPlugin({ id: "demo", version: "0.0.1" });
        const plugins = claw.listPlugins();
        expect(plugins).toHaveLength(1);
        expect(plugins[0]?.id).toBe("demo");
      })
    );
  });

  it("rejects duplicate plugin ids", async () => {
    const api = createClawQLApi();
    await expect(
      api.run(
        Effect.gen(function* () {
          const claw = yield* ClawQLApi;
          yield* claw.registerPlugin({ id: "dup", version: "1" });
          yield* claw.registerPlugin({ id: "dup", version: "2" });
        })
      )
    ).rejects.toThrow();
  });
});
