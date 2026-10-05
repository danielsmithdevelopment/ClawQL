/**
 * Trusted module: mint MandateArgsMatch — pending execution argsHash matches live args.
 */

import { defineProof, type Named, type Proof, type ArgsHash, type ExecutionId } from "clawql-gdp";
import { Effect } from "effect";
import { hashPendingArgsEffect, type PendingArgsPayload } from "../pending/args-hash.js";

const MandateArgsMatchProver = defineProof("MandateArgsMatch");

export interface MandateArgsMatch<E, H> extends Proof<"MandateArgsMatch", [E, H]> {}

export function mandateArgsMatchEffect<E, H>(
  execution: Named<E, ExecutionId>,
  expectedHash: Named<H, ArgsHash>,
  liveArgs: PendingArgsPayload
): Effect.Effect<MandateArgsMatch<E, H> | null, Error> {
  return Effect.gen(function* () {
    const live = yield* hashPendingArgsEffect(liveArgs);
    if (live !== expectedHash.value) {
      return null;
    }
    if (!execution.value.startsWith("pex_")) {
      return null;
    }
    return MandateArgsMatchProver.prove(execution, expectedHash) as MandateArgsMatch<E, H>;
  });
}
