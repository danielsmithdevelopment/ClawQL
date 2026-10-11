/**
 * Things the compiler must refuse for gdp-ts sensitive APIs in clawql-api.
 * Type-checked but never run; held honest by gdp-mistakes-all.test.ts.
 */
import { Effect } from "effect";
import {
  ArgsHash,
  ExecutionId,
  name,
  PrincipalId,
  ProposalId,
  type Named,
  type Proof,
} from "clawql-gdp";
import type { ApproverMayApproveSource } from "./proofs/approver-may-approve-source.js";
import type { MandateArgsMatch } from "./proofs/mandate-args-match.js";
import { commitApprovedSourceEffect } from "./sources/propose-source-core.js";
import type { PendingSourceRecord } from "./sources/pending-source-types.js";
import { executeApprovedMandateEffect } from "./execute/mandate-execute.js";

interface BogusProof<A, B> extends Proof<"BogusApiProof", [A, B]> {
  readonly __proofBrand?: "BogusApiProof";
}

declare function mintApproverProof<A, P>(
  approver: Named<A, ReturnType<typeof PrincipalId>>,
  proposal: Named<P, ReturnType<typeof ProposalId>>
): ApproverMayApproveSource<A, P>;

declare function mintMandateProof<E, H>(
  execution: Named<E, ReturnType<typeof ExecutionId>>,
  hash: Named<H, ReturnType<typeof ArgsHash>>
): MandateArgsMatch<E, H>;

declare function mintBogus<A, B>(a: Named<A, unknown>, b: Named<B, unknown>): BogusProof<A, B>;

declare const commitCtx: {
  record: PendingSourceRecord;
  home: string;
  decision: "approve";
  approvedByFormatted: string;
  decidedAt: string;
};

export function sourceApproveMistakes(): Effect.Effect<void> {
  return name(
    PrincipalId("operator:dan"),
    ProposalId("psp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    ProposalId("psp_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
    (approver, proposalA, proposalB) => {
      const proofA = mintApproverProof(approver, proposalA);
      const wrongProof = mintBogus(approver, proposalA);

      // @ts-expect-error no proof at all
      void commitApprovedSourceEffect(approver, proposalA);

      // @ts-expect-error a raw id is not a named value; name it first
      void commitApprovedSourceEffect(approver, ProposalId("psp_raw"), proofA, commitCtx);

      // @ts-expect-error the proof is about proposal A, not proposal B
      void commitApprovedSourceEffect(approver, proposalB, proofA, commitCtx);

      // @ts-expect-error wrong proof kind
      void commitApprovedSourceEffect(approver, proposalA, wrongProof, commitCtx);

      void commitApprovedSourceEffect(approver, proposalA, proofA, commitCtx);
      return Effect.void;
    }
  );
}

export function mandateResumeMistakes(): Effect.Effect<void> {
  return name(
    ExecutionId("pex_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    ArgsHash("hash_a"),
    ArgsHash("hash_b"),
    (execution, hashA, hashB) => {
      const proofA = mintMandateProof(execution, hashA);
      const wrongProof = mintBogus(execution, hashA);
      const params = {
        operationId: "op",
        args: {},
        approvedExecutionId: execution.value,
      };

      // @ts-expect-error no proof at all
      void executeApprovedMandateEffect(execution, hashA);

      // @ts-expect-error a raw id is not a named value; name it first
      void executeApprovedMandateEffect(ExecutionId("pex_raw"), hashA, proofA, params);

      // @ts-expect-error the proof is about hash A, not hash B
      void executeApprovedMandateEffect(execution, hashB, proofA, params);

      // @ts-expect-error wrong proof kind
      void executeApprovedMandateEffect(execution, hashA, wrongProof, params);

      void executeApprovedMandateEffect(execution, hashA, proofA, params);
      return Effect.void;
    }
  );
}
