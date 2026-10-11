import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  agentPrincipalFromSessionIdEffect,
  assertApproverMayApproveEffect,
  formatSourceProposalPrincipalEffect,
  OPERATOR_PRINCIPAL_ENV,
  parseSourceProposalPrincipalEffect,
  resolveOperatorPrincipalEffect,
  SOURCES_APPROVE_CAPABILITY,
} from "./source-proposal-principal.js";

describe("source proposal principals", () => {
  it("formats and parses agent/operator principals", async () => {
    const formatted = await Effect.runPromise(
      formatSourceProposalPrincipalEffect({ kind: "agent", id: "sess-1" })
    );
    expect(formatted).toBe("agent:sess-1");
    const parsed = await Effect.runPromise(parseSourceProposalPrincipalEffect(formatted));
    expect(parsed).toEqual({ kind: "agent", id: "sess-1" });
  });

  it("defaults MCP session to agent:mcp", async () => {
    const p = await Effect.runPromise(agentPrincipalFromSessionIdEffect(undefined));
    expect(p).toEqual({ kind: "agent", id: "mcp" });
  });

  it("resolves operator from CLAWQL_OPERATOR_ID", async () => {
    const p = await Effect.runPromise(
      resolveOperatorPrincipalEffect({ [OPERATOR_PRINCIPAL_ENV]: "alice" } as NodeJS.ProcessEnv)
    );
    expect(p).toEqual({ kind: "operator", id: "alice" });
  });

  it("refuses agent approvers even when the id differs", async () => {
    const result = await Effect.runPromise(
      Effect.result(
        assertApproverMayApproveEffect({
          proposedBy: "agent:one",
          approvedBy: { kind: "agent", id: "two" },
        })
      )
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(String(result.failure)).toMatch(/operator-only/i);
    }
  });

  it("refuses the proposing principal even when they are an operator", async () => {
    const result = await Effect.runPromise(
      Effect.result(
        assertApproverMayApproveEffect({
          proposedBy: "operator:alice",
          approvedBy: { kind: "operator", id: "alice" },
        })
      )
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(String(result.failure)).toMatch(/cannot approve/i);
    }
  });

  it("allows a distinct operator to approve an agent proposal", async () => {
    await Effect.runPromise(
      assertApproverMayApproveEffect({
        proposedBy: "agent:mcp-session",
        approvedBy: { kind: "operator", id: "alice" },
      })
    );
  });

  it("fails closed when proposedBy is missing", async () => {
    const result = await Effect.runPromise(
      Effect.result(
        assertApproverMayApproveEffect({
          proposedBy: null,
          approvedBy: { kind: "operator", id: "alice" },
        })
      )
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(String(result.failure)).toMatch(/missing proposedBy/i);
    }
  });

  it("names the operator-only approve capability", () => {
    expect(SOURCES_APPROVE_CAPABILITY).toBe("sources_approve");
  });
});
