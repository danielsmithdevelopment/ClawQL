import { name, type Named } from "@gdp-ts/core";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { UserId, ProposalId } from "../ids.js";
import { mintDemoApproverEffect, type DemoApprover } from "../proofs/demo-approver.js";
import { GdpService, GdpServiceLive } from "./gdp-service.js";

function sensitiveAction<U, P>(
  proposal: Named<P, ProposalId>,
  _proof: DemoApprover<U, P>
): Effect.Effect<{ ok: true; proposalId: string }> {
  return Effect.succeed({ ok: true as const, proposalId: proposal.value });
}

describe("gdp-ts + Effect", () => {
  it("name callback returns an Effect that can be yielded", async () => {
    const program = Effect.gen(function* () {
      const gdp = yield* GdpService;
      return yield* gdp.name2(UserId("operator:dan"), ProposalId("prop_1"), (user, proposal) =>
        Effect.gen(function* () {
          const proof = yield* mintDemoApproverEffect(user, proposal);
          expect(proof).not.toBeNull();
          return yield* sensitiveAction(proposal, proof!);
        })
      );
    }).pipe(Effect.provide(GdpServiceLive));

    const result = await Effect.runPromise(program);
    expect(result).toEqual({ ok: true, proposalId: "prop_1" });
  });

  it("direct name() also nests Effect.gen", async () => {
    const effect = name(UserId("operator:dan"), ProposalId("prop_2"), (user, proposal) =>
      Effect.gen(function* () {
        const proof = yield* mintDemoApproverEffect(user, proposal);
        return yield* sensitiveAction(proposal, proof!);
      })
    );
    const result = await Effect.runPromise(effect);
    expect(result.proposalId).toBe("prop_2");
  });

  it("agent principal fails to mint proof", async () => {
    const effect = name(UserId("agent:mcp"), ProposalId("prop_3"), (user, proposal) =>
      Effect.gen(function* () {
        const proof = yield* mintDemoApproverEffect(user, proposal);
        return proof;
      })
    );
    const proof = await Effect.runPromise(effect);
    expect(proof).toBeNull();
  });
});
