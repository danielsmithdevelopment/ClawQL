import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentAdapter } from "./shared/types.js";
import {
  appendClineHook,
  makeClineAdapterLayer,
  makeClineWormLayer,
} from "./adapters/cline/index.js";
import { WORMAuditTrailService } from "clawql-audit";

describe("Cline adapter", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("starts session and logs file write hook", async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-agents-"));
    const dbPath = join(dir, "worm.db");
    const layer = Layer.merge(makeClineWormLayer(dbPath), makeClineAdapterLayer());

    const session = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* AgentAdapter;
        yield* adapter.initialize({
          mcpEndpoint: "http://127.0.0.1:8080/mcp",
          wormDbPath: dbPath,
          inferenceEndpoint: "http://127.0.0.1:8091/v1",
          virtualKeyId: "vk_test",
          teeEnabled: false,
        });
        const s = yield* adapter.start({
          toolsInScope: ["memory_recall", "search", "execute"],
          toolsOutOfScope: ["sandbox_exec"],
          budget: { maxTokens: 100_000, maxUsd: 1, maxTurns: 20 },
          sessionTtl: 3600,
        });
        yield* appendClineHook({
          kind: "file_write_attempt",
          sessionId: s.sessionId,
          path: "/tmp/example.ts",
        });
        return s;
      }).pipe(Effect.provide(layer))
    );

    const verified = await Effect.runPromise(
      Effect.gen(function* () {
        const worm = yield* WORMAuditTrailService;
        return yield* worm.verify();
      }).pipe(Effect.provide(layer))
    );
    expect(session.agent).toBe("cline");
    expect(verified.valid).toBe(true);
  });
});
