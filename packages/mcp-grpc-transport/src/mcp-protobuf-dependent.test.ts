import { describe, expect, it } from "vitest";
import { fulfillDependentRequests, runUnaryWithDependents } from "./mcp-protobuf-dependent.js";

describe("mcp-protobuf-dependent", () => {
  it("fulfillDependentRequests maps sampling round-trip", async () => {
    const out = await fulfillDependentRequests(
      {
        r1: {
          sampling_create_message: {
            messages: [{ role: "ROLE_USER", text: { text: "hello" } }],
          },
        },
      },
      {
        samplingCreateMessage: async () => ({
          role: "assistant",
          content: { type: "text", text: "world" },
          model: "test-model",
          stopReason: "endTurn",
        }),
      }
    );
    expect(out.r1?.sampling_create_message_result?.model).toBe("test-model");
    expect(out.r1?.sampling_create_message_result?.message?.text?.text).toBe("world");
  });

  it("runUnaryWithDependents merges dependent_responses until clear", async () => {
    let calls = 0;
    const final = await runUnaryWithDependents(
      { cursor: "" },
      async (common) => {
        calls++;
        if (calls === 1) {
          expect((common as { dependent_responses?: unknown }).dependent_responses).toBeUndefined();
          return {
            common: {
              dependent_requests: {
                a: {
                  list_roots_request: {},
                  notify_on_root_list_update: false,
                },
              },
            },
          };
        }
        expect((common as { dependent_responses?: Record<string, unknown> }).dependent_responses).toBeDefined();
        return { common: {}, tools: [{ name: "t" }] };
      },
      {
        listRoots: async () => ({ roots: [{ uri: "file:///x", name: "x" }] }),
      }
    );
    expect(calls).toBe(2);
    expect((final as { tools?: { name?: string }[] }).tools?.[0]?.name).toBe("t");
  });
});
