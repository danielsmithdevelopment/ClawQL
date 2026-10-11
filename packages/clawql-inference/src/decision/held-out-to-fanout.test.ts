/**
 * Held-out → fan-out / flip-rate conversion.
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { HeldOutCaseSpec, HeldOutSuiteManifest } from "clawql-core/classifier";
import {
  applyFrontierLabels,
  heldOutCaseToFanout,
  heldOutCasesToFanout,
  heldOutCasesToFlipRate,
} from "./held-out-to-fanout.js";

const sampleCase: HeldOutCaseSpec = {
  caseId: "route-v04-001",
  useSiteId: "search_provider_tool_routing",
  query: "I don't know which operationId handles refunding yet; find candidates.",
  candidates: [
    {
      candidateId: "mcp.search",
      features: {
        label: "search",
        description: "Discover operationIds from natural language",
      },
    },
    {
      candidateId: "mcp.execute",
      features: {
        label: "execute",
        description: "Run a known operationId",
      },
    },
  ],
  groundTruthCandidateId: "mcp.search",
  adjudicated: false,
};

describe("held-out-to-fanout", () => {
  it("maps held-out case to fan-out choice question with expected route", async () => {
    const mapped = await Effect.runPromise(heldOutCaseToFanout(sampleCase));
    expect("error" in mapped).toBe(false);
    if ("error" in mapped) return;
    expect(mapped.caseId).toBe("route-v04-001");
    expect(mapped.state).toContain("refunding");
    expect(mapped.questions[0]?.type).toBe("choice");
    expect(mapped.questions[0]?.name).toBe("route");
    expect(mapped.expected?.[0]).toEqual({ name: "route", answer: "mcp.search" });
    expect(mapped.questions[0] && "options" in mapped.questions[0]).toBe(true);
    if (mapped.questions[0] && mapped.questions[0].type === "choice") {
      expect(mapped.questions[0].options.map((o) => o.id)).toEqual([
        "mcp.search",
        "mcp.execute",
      ]);
    }
  });

  it("rejects missing ground truth or empty candidates", async () => {
    const noGt = await Effect.runPromise(
      heldOutCaseToFanout({ ...sampleCase, groundTruthCandidateId: "" })
    );
    expect(noGt).toEqual({ error: "case route-v04-001: groundTruthCandidateId required" });

    const empty = await Effect.runPromise(
      heldOutCaseToFanout({ ...sampleCase, candidates: [] })
    );
    expect(empty).toEqual({ error: "case route-v04-001: candidates required" });
  });

  it("applies frontier labels over provisional suite GT", async () => {
    const suite: HeldOutSuiteManifest = {
      suiteId: "fast-decision-held-out-v0.4-routing-fresh",
      description: "test",
      cases: [sampleCase, { ...sampleCase, caseId: "route-v04-002", groundTruthCandidateId: "mcp.search" }],
    };
    const labeled = await Effect.runPromise(
      applyFrontierLabels(suite, {
        labels: [
          {
            caseId: "route-v04-002",
            groundTruthCandidateId: "mcp.execute",
            adjudicated: true,
          },
        ],
      })
    );
    expect("error" in labeled).toBe(false);
    if ("error" in labeled) return;
    expect(labeled.cases[0]?.groundTruthCandidateId).toBe("mcp.search");
    expect(labeled.cases[1]?.groundTruthCandidateId).toBe("mcp.execute");
    expect(labeled.cases[1]?.adjudicationKind).toBe("live");
  });

  it("builds flip-rate cases without expected answers", async () => {
    const flip = await Effect.runPromise(heldOutCasesToFlipRate([sampleCase]));
    expect("error" in flip).toBe(false);
    if ("error" in flip) return;
    expect(flip).toHaveLength(1);
    expect(flip[0]?.caseId).toBe("route-v04-001");
    expect(flip[0]?.questions[0]?.name).toBe("route");
  });

  it("converts batch of cases", async () => {
    const batch = await Effect.runPromise(
      heldOutCasesToFanout([sampleCase, { ...sampleCase, caseId: "route-v04-002" }])
    );
    expect("error" in batch).toBe(false);
    if ("error" in batch) return;
    expect(batch).toHaveLength(2);
  });
});
