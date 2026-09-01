import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WORMAuditTrailService } from "clawql-audit";
import { AgentAdapter } from "./shared/types.js";
import { makeAgentWormLayer } from "./shared/worm.js";
import { GOOSE_ATR_TEMPLATES } from "./adapters/goose/atr-templates.js";
import { gateGooseFileWrite, makeGooseAdapterLayer } from "./adapters/goose/index.js";
import { OPENHANDS_ATR_TEMPLATES } from "./adapters/openhands/atr-templates.js";
import { makeOpenHandsBudgetEnforcer } from "./adapters/openhands/budget-enforcer.js";
import { makeOpenHandsAdapterLayer } from "./adapters/openhands/index.js";
import { getAdapterBundle } from "./get-adapter.js";

describe("Goose adapter", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("allows in-scope paths and denies out-of-scope writes", async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-agents-goose-"));
    const dbPath = join(dir, "worm.db");
    const layer = Layer.merge(makeAgentWormLayer(dbPath), makeGooseAdapterLayer());
    const atr = GOOSE_ATR_TEMPLATES.scoped_coder;

    await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* AgentAdapter;
        yield* adapter.initialize({
          mcpEndpoint: "http://127.0.0.1:8080/mcp",
          wormDbPath: dbPath,
          inferenceEndpoint: "http://127.0.0.1:8091/v1",
          virtualKeyId: "vk_goose",
          teeEnabled: false,
        });
        const s = yield* adapter.start(atr);
        yield* gateGooseFileWrite({
          path: "/workspace/src/main.ts",
          atrScope: atr,
          sessionId: s.sessionId,
        });
        const denied = yield* gateGooseFileWrite({
          path: "/etc/passwd",
          atrScope: atr,
          sessionId: s.sessionId,
        }).pipe(Effect.either);
        expect(denied._tag).toBe("Left");
      }).pipe(Effect.provide(layer))
    );
  });
});

describe("OpenHands budget enforcer", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("emits BUDGET_EXHAUSTED when token ceiling is hit", async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-agents-oh-"));
    const dbPath = join(dir, "worm.db");
    const layer = Layer.merge(makeAgentWormLayer(dbPath), makeOpenHandsAdapterLayer());
    const atr = {
      ...OPENHANDS_ATR_TEMPLATES.bounded_engineer,
      budget: { maxTokens: 100, maxUsd: 10, maxTurns: 50 },
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* AgentAdapter;
        yield* adapter.initialize({
          mcpEndpoint: "http://127.0.0.1:8080/mcp",
          wormDbPath: dbPath,
          inferenceEndpoint: "http://127.0.0.1:8091/v1",
          virtualKeyId: "vk_oh",
          teeEnabled: false,
        });
        const session = yield* adapter.start(atr);
        const enforcer = yield* makeOpenHandsBudgetEnforcer({
          budget: atr.budget,
          session,
        });
        yield* enforcer.checkBudget({
          type: "agent:inference",
          inputTokens: 40,
          outputTokens: 40,
          costUsd: 0.01,
        });
        return yield* enforcer
          .checkBudget({
            type: "agent:inference",
            inputTokens: 40,
            outputTokens: 40,
            costUsd: 0.01,
          })
          .pipe(Effect.either);
      }).pipe(Effect.provide(layer))
    );

    expect(result._tag).toBe("Left");
    const verified = await Effect.runPromise(
      Effect.gen(function* () {
        const worm = yield* WORMAuditTrailService;
        return yield* worm.verify();
      }).pipe(Effect.provide(layer))
    );
    expect(verified.valid).toBe(true);
  });
});

describe("getAdapterBundle phase 3", () => {
  it("resolves goose and openhands", async () => {
    const goose = await Effect.runPromise(getAdapterBundle("goose", "/tmp/g.db"));
    const oh = await Effect.runPromise(getAdapterBundle("openhands", "/tmp/o.db"));
    expect(goose.adapterLayer).toBeDefined();
    expect(oh.adapterLayer).toBeDefined();
  });
});
