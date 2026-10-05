/**
 * Trusted module: mint ApproverMayApproveSource.
 * Runtime check = two-party operator gate (see source-proposal-principal).
 */

import { defineProof, type Named, type Proof } from "clawql-gdp";
import { Effect } from "effect";
import type { PrincipalId, ProposalId } from "clawql-gdp";
import {
  assertApproverMayApproveEffect,
  formatSourceProposalPrincipalEffect,
  type SourceProposalPrincipal,
} from "../sources/source-proposal-principal.js";

const ApproverMayApproveSourceProver = defineProof("ApproverMayApproveSource");

export interface ApproverMayApproveSource<A, P> extends Proof<
  "ApproverMayApproveSource",
  [A, P]
> {}

export type ApproverMayApproveSourceContext = {
  readonly proposedBy: string | null | undefined;
  readonly approvedBy: SourceProposalPrincipal;
};

/**
 * Prove the named approver may approve the named proposal (operator + ≠ proposer).
 */
export function approverMayApproveSourceEffect<A, P>(
  approver: Named<A, PrincipalId>,
  proposal: Named<P, ProposalId>,
  ctx: ApproverMayApproveSourceContext
): Effect.Effect<ApproverMayApproveSource<A, P> | null, Error> {
  return Effect.gen(function* () {
    yield* assertApproverMayApproveEffect({
      proposedBy: ctx.proposedBy,
      approvedBy: ctx.approvedBy,
    });
    const formatted = yield* formatSourceProposalPrincipalEffect(ctx.approvedBy);
    if (formatted !== approver.value) {
      return yield* Effect.fail(
        new Error("Approver principal does not match named approver value")
      );
    }
    if (proposal.value !== proposal.value.trim()) {
      return null;
    }
    return ApproverMayApproveSourceProver.prove(approver, proposal) as ApproverMayApproveSource<
      A,
      P
    >;
  }).pipe(Effect.catch(() => Effect.succeed(null)));
}
