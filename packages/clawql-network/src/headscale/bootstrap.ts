import { Effect } from "effect";

import { NetworkNotImplementedError } from "../errors.js";

export type HeadscaleBootstrapConfig = {
  readonly controlPlaneHost: string;
  readonly derpMapPath?: string;
};

/** Stand up self-hosted Headscale control plane (spec §4 — stub). */
export const bootstrapHeadscale = (
  _config: HeadscaleBootstrapConfig
): Effect.Effect<void, NetworkNotImplementedError> =>
  Effect.fail(
    new NetworkNotImplementedError({
      operation: "bootstrapHeadscale",
      message:
        "Headscale bootstrap not implemented in v0.1 scaffold — see docs/specs/network/clawql-network-v0.1.md",
    })
  );
