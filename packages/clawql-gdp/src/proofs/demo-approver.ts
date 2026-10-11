/**
 * Trusted demo prover for clawql-gdp Effect + name tests only.
 */

import { defineProof, type Named, type Proof } from "@gdp-ts/core";
import { Effect } from "effect";
import type { ProposalId, UserId } from "../ids.js";

const DemoApproverProver = defineProof("DemoApprover");

export interface DemoApprover<U, P> extends Proof<"DemoApprover", [U, P]> {
  readonly __proofBrand?: "DemoApprover";
}

export function mintDemoApproverEffect<U, P>(
  user: Named<U, UserId>,
  proposal: Named<P, ProposalId>
): Effect.Effect<DemoApprover<U, P> | null> {
  return Effect.sync(() => {
    if (user.value.startsWith("agent:")) return null;
    return DemoApproverProver.prove(user, proposal) as DemoApprover<U, P>;
  });
}
