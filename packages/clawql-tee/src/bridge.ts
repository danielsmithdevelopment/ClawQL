/**
 * TEE-shaped ID-JAG signing bridge for Layer C.
 * Production hosts swap `sign` for attestation-gated HSM / enclave calls.
 */

import { Effect } from "effect";
import {
  createTeeIdJagAssertionSigner,
  type IdJagAssertionSigner,
  type IdJagSignRequest,
} from "clawql-auth";

export type TeeSignFn = (request: IdJagSignRequest) => Effect.Effect<string, unknown>;

export type TeeIdJagSignerOptions = {
  /** Attestation quote or measurement id logged on each sign (optional). */
  attestationId?: string;
  sign: TeeSignFn;
};

/**
 * Wrap an attestation-gated sign function as a clawql-auth {@link IdJagAssertionSigner}.
 */
export function createTeeIdJagSignerBridge(options: TeeIdJagSignerOptions): IdJagAssertionSigner {
  return createTeeIdJagAssertionSigner({
    teeSign: (request) =>
      options.sign(request).pipe(
        Effect.tap(() =>
          options.attestationId
            ? Effect.sync(() => {
                if (process.env.CLAWQL_TEE_DEBUG?.trim() === "1") {
                  process.stderr.write(
                    `[clawql-tee] signed ID-JAG attestation=${options.attestationId}\n`
                  );
                }
              })
            : Effect.void
        )
      ),
  });
}

/** Local dev stub — delegates to host-provided sign without attestation. */
export function createDevTeeIdJagSigner(sign: TeeSignFn): IdJagAssertionSigner {
  return createTeeIdJagSignerBridge({ sign, attestationId: "dev-stub" });
}
