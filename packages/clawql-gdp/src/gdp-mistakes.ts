/**
 * Things the compiler must refuse for GdpService / Effect name wrappers.
 * Type-checked but never run; held honest by gdp-mistakes-all.test.ts.
 *
 * If name1/name2/name3 ever collapse name parameters (or let Named escape),
 * a proof about proposal A would be accepted for proposal B — these lines catch that.
 */
import { name, type Named, type Proof } from "@gdp-ts/core";
import { Effect } from "effect";
import { ProposalId, UserId } from "./ids.js";
import type { DemoApprover } from "./proofs/demo-approver.js";

interface BogusProof<U, P> extends Proof<"BogusGdpProof", [U, P]> {
  readonly __proofBrand?: "BogusGdpProof";
}

declare function mintDemo<U, P>(
  user: Named<U, ReturnType<typeof UserId>>,
  proposal: Named<P, ReturnType<typeof ProposalId>>
): DemoApprover<U, P>;

declare function mintBogus<U, P>(
  user: Named<U, unknown>,
  proposal: Named<P, unknown>
): BogusProof<U, P>;

declare function sensitiveAction<U, P>(
  proposal: Named<P, ProposalId>,
  proof: DemoApprover<U, P>
): Effect.Effect<{ ok: true }>;

/**
 * Mirrors GdpService.name2 / name(): fresh names must not be interchangeable.
 */
export function effectNameWrapperMistakes(): Effect.Effect<void> {
  return name(
    UserId("operator:dan"),
    ProposalId("prop_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    ProposalId("prop_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    (user, proposalA, proposalB) => {
      const proofA = mintDemo(user, proposalA);
      const wrongProof = mintBogus(user, proposalA);

      // @ts-expect-error no proof at all
      void sensitiveAction(proposalA);

      // @ts-expect-error a raw id is not a named value; name it first
      void sensitiveAction(ProposalId("prop_raw"), proofA);

      // @ts-expect-error the proof is about proposal A, not proposal B
      void sensitiveAction(proposalB, proofA);

      // @ts-expect-error wrong proof kind
      void sensitiveAction(proposalA, wrongProof);

      void sensitiveAction(proposalA, proofA);
      return Effect.void;
    }
  );
}
