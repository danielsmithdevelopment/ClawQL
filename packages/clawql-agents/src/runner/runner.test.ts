import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { makeAcpTestPair } from "../acp/client.js";
import {
  ACP_SPIKE_CHECKLIST,
  CodingAgentRunner,
  CodingAgentRunnerLive,
  resolveCodingAgentRoute,
  resolveCodingAgentRouteEffect,
  runAcpSpikeTurnEffect,
} from "./index.js";

describe("resolveCodingAgentRoute", () => {
  it("prefers ACP for cursor-cli", () => {
    const route = resolveCodingAgentRoute({
      target: { kind: "acp", id: "cursor-cli" },
      wormDbPath: "/tmp/worm.db",
    });
    expect(route.kind).toBe("acp");
    if (route.kind === "acp") {
      expect(route.spawn.command).toBe("agent");
      expect(route.spawn.args).toEqual(["acp"]);
    }
  });

  it("auto-maps cursor → ACP", async () => {
    const route = await Effect.runPromise(
      resolveCodingAgentRouteEffect({
        target: { kind: "auto", name: "cursor" },
        wormDbPath: "/tmp/worm.db",
      })
    );
    expect(route.kind).toBe("acp");
  });

  it("routes catalog agents to native", () => {
    const route = resolveCodingAgentRoute({
      target: { kind: "auto", name: "goose" },
      wormDbPath: "/tmp/worm.db",
    });
    expect(route).toMatchObject({
      kind: "native",
      agent: "goose",
      wormDbPath: "/tmp/worm.db",
    });
  });

  it("forceNative skips ACP for catalog auto names", () => {
    const route = resolveCodingAgentRoute({
      target: { kind: "auto", name: "cline" },
      wormDbPath: "/tmp/w.db",
      forceNative: true,
    });
    expect(route.kind).toBe("native");
    if (route.kind === "native") expect(route.agent).toBe("cline");
  });
});

describe("CodingAgentRunner spike turn", () => {
  it("runs initialize → auth → session/new → prompt against fake ACP", async () => {
    expect(ACP_SPIKE_CHECKLIST[0]).toBe("initialize");
    const { clientLayer, runFakeAgent } = makeAcpTestPair();
    runFakeAgent();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const runner = yield* CodingAgentRunner;
        return yield* runner.runTurn({
          cwd: "/tmp/workspace",
          prompt: [{ type: "text", text: "hi" }],
        });
      }).pipe(Effect.provide(CodingAgentRunnerLive), Effect.provide(clientLayer))
    );

    expect(result.sessionId).toBe("sess_test_1");
    expect(result.prompt.stopReason).toBe("end_turn");
    expect(result.initialize.agentInfo?.name).toBe("fake-acp-agent");
  });

  it("runAcpSpikeTurnEffect can skip authenticate", async () => {
    const { clientLayer, runFakeAgent } = makeAcpTestPair();
    runFakeAgent();
    const result = await Effect.runPromise(
      runAcpSpikeTurnEffect({
        cwd: "/workspace",
        prompt: [{ type: "text", text: "ping" }],
        authenticateMethodId: null,
      }).pipe(Effect.provide(clientLayer))
    );
    expect(result.sessionId).toBe("sess_test_1");
  });
});
