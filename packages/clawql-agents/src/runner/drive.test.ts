import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Effect, Layer } from "effect";
import { WORMAuditTrailService } from "clawql-audit";
import { makeAcpTestPair } from "../acp/client.js";
import { makeAgentWormLayer } from "../shared/worm.js";
import { CodingAgentRunnerLive } from "./acp-session.js";
import { CodingAgentDrive, CodingAgentDriveLive, prepareCodingAgentStackEffect } from "./drive.js";

describe("CodingAgentDrive (combined Ontologiql stack)", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("runAcpTurn resolves ACP, runs spike turn, and writes WORM lifecycle", async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-drive-"));
    const wormDbPath = join(dir, "worm.db");
    const { clientLayer, runFakeAgent } = makeAcpTestPair();
    runFakeAgent();

    const layer = Layer.mergeAll(
      clientLayer,
      CodingAgentRunnerLive,
      CodingAgentDriveLive,
      makeAgentWormLayer(wormDbPath)
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const drive = yield* CodingAgentDrive;
        return yield* drive.runAcpTurn({
          target: { kind: "acp", id: "cursor-cli" },
          wormDbPath,
          turn: {
            cwd: "/tmp/ws",
            prompt: [{ type: "text", text: "hello" }],
          },
        });
      }).pipe(Effect.provide(layer))
    );

    expect(result.route.kind).toBe("acp");
    expect(result.turn.sessionId).toBe("sess_test_1");
    expect(result.worm?.start?.type).toBe("SESSION_START");
    expect(result.worm?.end?.type).toBe("SESSION_END");
    expect(result.worm?.start?.agentName).toBe("acp:cursor-cli");

    const entries = await Effect.runPromise(
      Effect.gen(function* () {
        const worm = yield* WORMAuditTrailService;
        return yield* worm.query({ sessionId: result.turn.sessionId });
      }).pipe(Effect.provide(makeAgentWormLayer(wormDbPath)))
    );
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });

  it("prepareCodingAgentStackEffect picks native for goose", async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-drive-n-"));
    const prepared = await Effect.runPromise(
      prepareCodingAgentStackEffect({
        target: { kind: "auto", name: "goose" },
        wormDbPath: join(dir, "worm.db"),
      })
    );
    expect(prepared.route.kind).toBe("native");
    if (prepared.route.kind === "native") {
      expect(prepared.route.agent).toBe("goose");
    }
  });

  it("prepareCodingAgentStackEffect picks ACP for cursor-cli", async () => {
    dir = await mkdtemp(join(tmpdir(), "clawql-drive-a-"));
    const prepared = await Effect.runPromise(
      prepareCodingAgentStackEffect({
        target: { kind: "auto", name: "cursor-cli" },
        wormDbPath: join(dir, "worm.db"),
      })
    );
    expect(prepared.route.kind).toBe("acp");
  });
});
