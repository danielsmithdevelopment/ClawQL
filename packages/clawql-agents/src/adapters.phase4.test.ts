import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentAdapter } from "./shared/types.js";
import { makeAgentWormLayer } from "./shared/worm.js";
import { PI_ATR_TEMPLATES } from "./adapters/pi/atr-templates.js";
import { makePiAdapterLayer } from "./adapters/pi/index.js";
import { DEEPSEEK_ATR_TEMPLATES } from "./adapters/deepseek/atr-templates.js";
import { gateDeepSeekPluginLoad, makeDeepSeekAdapterLayer } from "./adapters/deepseek/index.js";
import { getAdapterBundle, IMPLEMENTED_AGENTS } from "./get-adapter.js";

describe("Pi adapter", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("starts with memory_recall bootstrap hook when in scope", async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-agents-pi-"));
    const dbPath = join(dir, "worm.db");
    const layer = Layer.merge(makeAgentWormLayer(dbPath), makePiAdapterLayer());
    const atr = PI_ATR_TEMPLATES.conversational_memory;

    const session = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* AgentAdapter;
        yield* adapter.initialize({
          mcpEndpoint: "http://127.0.0.1:8080/mcp",
          wormDbPath: dbPath,
          inferenceEndpoint: "http://127.0.0.1:8091/v1",
          virtualKeyId: "vk_pi",
          teeEnabled: false,
        });
        return yield* adapter.start(atr);
      }).pipe(Effect.provide(layer))
    );

    expect(session.agent).toBe("pi");
  });
});

describe("DeepSeek adapter", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("blocks undeclared Cordis plugin loads", async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-agents-ds-"));
    const dbPath = join(dir, "worm.db");
    const layer = Layer.merge(makeAgentWormLayer(dbPath), makeDeepSeekAdapterLayer());
    const atr = DEEPSEEK_ATR_TEMPLATES.plugin_locked;

    await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* AgentAdapter;
        yield* adapter.initialize({
          mcpEndpoint: "http://127.0.0.1:8080/mcp",
          wormDbPath: dbPath,
          inferenceEndpoint: "http://127.0.0.1:8091/v1",
          virtualKeyId: "vk_ds",
          teeEnabled: false,
        });
        const s = yield* adapter.start(atr);
        yield* gateDeepSeekPluginLoad({
          pluginName: "core",
          atrScope: atr,
          sessionId: s.sessionId,
        });
        const denied = yield* gateDeepSeekPluginLoad({
          pluginName: "evil-exfil",
          atrScope: atr,
          sessionId: s.sessionId,
        }).pipe(Effect.either);
        expect(denied._tag).toBe("Left");
      }).pipe(Effect.provide(layer))
    );
  });
});

describe("getAdapterBundle all seven", () => {
  it("implements the full catalog", async () => {
    expect(IMPLEMENTED_AGENTS).toHaveLength(7);
    for (const name of IMPLEMENTED_AGENTS) {
      const bundle = await Effect.runPromise(getAdapterBundle(name, `/tmp/${name}.db`));
      expect(bundle.adapterLayer).toBeDefined();
    }
  });
});
