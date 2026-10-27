import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { AgentClientProtocol, makeAcpTestPair } from "./client.js";
import { ACP_PROTOCOL_VERSION } from "./types.js";

describe("AgentClientProtocol", () => {
  it("initialize → authenticate → session/new → prompt against fake agent", async () => {
    const updates: string[] = [];
    const { clientLayer, runFakeAgent } = makeAcpTestPair({
      onUpdate: (update) => {
        const text = update.content?.text;
        if (typeof text === "string") updates.push(text);
      },
    });
    runFakeAgent();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const acp = yield* AgentClientProtocol;
        const init = yield* acp.initialize();
        expect(init.protocolVersion).toBe(ACP_PROTOCOL_VERSION);
        expect(init.agentInfo?.name).toBe("fake-acp-agent");
        yield* acp.authenticate("cursor_login");
        const session = yield* acp.newSession({ cwd: "/tmp/workspace" });
        expect(session.sessionId).toBe("sess_test_1");
        const prompt = yield* acp.prompt({
          sessionId: session.sessionId,
          prompt: [{ type: "text", text: "Say hello" }],
        });
        expect(prompt.stopReason).toBe("end_turn");
        yield* acp.close();
        return { sessionId: session.sessionId, updates };
      }).pipe(Effect.provide(clientLayer))
    );

    expect(result.sessionId).toBe("sess_test_1");
    expect(result.updates.join("")).toContain("hello from fake agent");
  });
});
