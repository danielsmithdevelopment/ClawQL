import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  callRemoteLayaEffect,
  isLayaBackendId,
  LAYA_BACKEND_ID,
  selfHostedLayaAvailable,
} from "./remote-laya.js";

describe("remote-laya", () => {
  it("resolves backend id and self-host availability", () => {
    expect(isLayaBackendId(LAYA_BACKEND_ID)).toBe(true);
    expect(isLayaBackendId("gliner2")).toBe(false);
    expect(selfHostedLayaAvailable({ CLAWQL_LAYA_SYSTEMONE_URL: "http://127.0.0.1:8000" })).toBe(
      true
    );
    expect(selfHostedLayaAvailable({})).toBe(false);
  });

  it("SystemOne envelope → OpenAI answers", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          model: "laya-rl-agent",
          answers: {
            route: {
              type: "choice",
              choice: "mcp.search",
              confidence: 0.88,
              probabilities: { "mcp.search": 0.88, "mcp.execute": 0.12 },
            },
          },
        }),
        { status: 200 }
      );

    const out = await Effect.runPromise(
      callRemoteLayaEffect(
        {
          model: "english",
          input: "find stripe endpoints",
          use_site_id: "search_provider_tool_routing",
          questions: [
            {
              type: "choice",
              name: "route",
              instructions: "pick",
              choices: [
                { value: "mcp.search", description: "search" },
                { value: "mcp.execute", description: "execute" },
              ],
            },
          ],
        },
        {
          env: { CLAWQL_LAYA_SYSTEMONE_URL: "http://127.0.0.1:8000" },
          fetchImpl,
        }
      )
    );
    expect(out.backend_id).toBe(LAYA_BACKEND_ID);
    expect(out.answers[0]).toMatchObject({ type: "choice", choice: "mcp.search" });
  });
});
