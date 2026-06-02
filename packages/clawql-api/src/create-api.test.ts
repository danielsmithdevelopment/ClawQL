import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { ClawQLApi, createClawQLApi } from "./index.js";
import { PANGUARD_PROXY_PLUGIN_ID } from "./plugins/panguard-proxy-plugin.js";

describe("createClawQLApi", () => {
  it("registers Panguard proxy plugin by default", () => {
    const api = createClawQLApi();
    const plugins = api.registry.list();
    expect(plugins.some((p) => p.id === PANGUARD_PROXY_PLUGIN_ID)).toBe(true);
  });

  it("registers plugins via ClawQLApi service", async () => {
    const api = createClawQLApi({ plugins: [] });
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
    const api = createClawQLApi({ plugins: [] });
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
