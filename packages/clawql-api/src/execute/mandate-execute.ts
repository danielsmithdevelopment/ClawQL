/**
 * Approved-mandate execute gate (gdp-ts MandateArgsMatch).
 */

import { Effect } from "effect";
import type { ArgsHash, ExecutionId, Named } from "clawql-gdp";
import type { MandateArgsMatch } from "../proofs/mandate-args-match.js";
import type { LoadSpecFn } from "../search/search-core.js";
import { loadSpec } from "../spec/spec-loader.js";
import { executeClawqlOperationEffect } from "./execute-core.js";
import type { ExecuteClawqlOperationParams, McpTextContent } from "./types.js";

/**
 * Sensitive: run execute for an approved pending mandate. Demands MandateArgsMatch
 * about the exact named execution + args hash (gdp-ts).
 */
export function executeApprovedMandateEffect<E, H>(
  execution: Named<E, ExecutionId>,
  expectedHash: Named<H, ArgsHash>,
  _proof: MandateArgsMatch<E, H>,
  params: ExecuteClawqlOperationParams,
  loadSpecFn: LoadSpecFn = loadSpec
): Effect.Effect<McpTextContent[], Error> {
  return Effect.gen(function* () {
    const approvedId = params.approvedExecutionId?.trim();
    if (!approvedId || approvedId !== execution.value) {
      return yield* Effect.fail(
        new Error("Named execution does not match approvedExecutionId")
      );
    }
    // Proof already attested argsHash; execute-core re-validates pending record.
    void expectedHash;
    return yield* executeClawqlOperationEffect(params, loadSpecFn);
  });
}
