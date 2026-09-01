import { Effect } from "effect";

import { NetworkNotImplementedError } from "../../errors.js";

export type DerperHandle = {
  readonly region: string;
  readonly stop: () => Effect.Effect<void, NetworkNotImplementedError>;
};

/** Optional self-hosted DERP relay (spec §5.2 — stub). */
export const startSelfHostedDerper = (
  region: string
): Effect.Effect<DerperHandle, NetworkNotImplementedError> =>
  Effect.fail(
    new NetworkNotImplementedError({
      operation: "startSelfHostedDerper",
      message: `Self-hosted derper (${region}) not implemented in v0.1 scaffold`,
    })
  );
