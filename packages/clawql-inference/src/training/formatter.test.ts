import { describe, expect, it } from "vitest";
import { TraceFormatter } from "./data/formatter.js";
import type { ObtRecord } from "./types.js";

function makeTrace(partial: {
  task_id: string;
  cpr: number;
  response: string;
  arm?: string;
  tool?: string;
  payload?: unknown;
}): ObtRecord {
  return {
    task_id: partial.task_id,
    benchmark: "harvey-lab-v1",
    arm: partial.arm,
    rtp: {
      verdict: { criterionPassRate: partial.cpr, allPass: partial.cpr >= 1 },
      turnSequence: [
        {
          intent: { rawPrompt: "You are a legal research agent." },
          reasoning: { seedChain: partial.response },
          execution: partial.tool
            ? {
                toolName: partial.tool,
                payload: partial.payload ?? { schema: "Matter", filters: { gte: 1 } },
                result: { ok: true },
              }
            : undefined,
        },
      ],
    },
  };
}

describe("TraceFormatter", () => {
  it("builds SFT pairs from high-CPR traces with tool evidence", () => {
    const formatter = new TraceFormatter({
      minCriterionPassRate: 0.85,
      requireToolEvidenceForSft: ["clawql_memory_recall"],
    });
    const traces = [
      makeTrace({
        task_id: "t1",
        cpr: 0.95,
        response: "found matters",
        tool: "clawql_memory_recall",
      }),
      makeTrace({ task_id: "t2", cpr: 0.5, response: "miss", tool: "clawql_memory_recall" }),
      makeTrace({ task_id: "t3", cpr: 0.99, response: "lucky guess" }),
    ];
    const ds = formatter.forSFT(traces);
    expect(ds).toHaveLength(1);
    expect(ds[0]!.prompt).toContain("legal research");
    expect(ds[0]!.response).toContain("clawql_memory_recall");
  });

  it("drops DPO pairs that fail the length ratio guard", () => {
    const formatter = new TraceFormatter({ maxChosenRejectedRatio: 2 });
    const short = "ok";
    const long = "x".repeat(100);
    const traces = [
      makeTrace({ task_id: "same", cpr: 1.0, response: long, arm: "clawql" }),
      makeTrace({ task_id: "same", cpr: 0.2, response: short, arm: "baseline" }),
    ];
    const pairs = formatter.forDPO(traces, "standard");
    expect(pairs).toHaveLength(0);
  });

  it("keeps balanced DPO pairs and records CPR metadata", () => {
    const formatter = new TraceFormatter({ maxChosenRejectedRatio: 2 });
    const traces = [
      makeTrace({
        task_id: "same",
        cpr: 0.9,
        response: "used structured recall carefully",
        arm: "clawql",
      }),
      makeTrace({
        task_id: "same",
        cpr: 0.3,
        response: "read docs sequentially slowly",
        arm: "baseline",
      }),
    ];
    const pairs = formatter.forDPO(traces, "standard");
    expect(pairs).toHaveLength(1);
    if ("chosen" in pairs[0]!) {
      expect(pairs[0].chosenCPR).toBe(0.9);
      expect(pairs[0].rejectedCPR).toBe(0.3);
    }
  });

  it("formats KTO labels without pairing", () => {
    const formatter = new TraceFormatter();
    const traces = [
      makeTrace({ task_id: "a", cpr: 0.9, response: "good" }),
      makeTrace({ task_id: "b", cpr: 0.2, response: "bad" }),
    ];
    const ds = formatter.forDPO(traces, "kto");
    expect(ds).toHaveLength(2);
    expect(ds.every((x) => "label" in x)).toBe(true);
  });

  it("dedupes GRPO prompts by task_id", () => {
    const formatter = new TraceFormatter();
    const traces = [
      makeTrace({ task_id: "t1", cpr: 0.5, response: "a" }),
      makeTrace({ task_id: "t1", cpr: 0.9, response: "b" }),
      makeTrace({ task_id: "t2", cpr: 0.1, response: "c" }),
    ];
    expect(formatter.forGRPO(traces)).toHaveLength(2);
  });

  it("builds SPIN pairs from current vs previous rounds", () => {
    const formatter = new TraceFormatter();
    const current = [makeTrace({ task_id: "t1", cpr: 0.9, response: "round3 better path" })];
    const previous = [makeTrace({ task_id: "t1", cpr: 0.6, response: "round2 earlier path" })];
    const pairs = formatter.forSPIN(current, previous);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.chosen).toContain("round3");
    expect(pairs[0]!.rejected).toContain("round2");
  });
});
