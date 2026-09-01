import { Effect } from "effect";

import { NetworkNotImplementedError } from "../errors.js";

export type MeshIdentity = {
  readonly nodeId: string;
  readonly meshAddress: string;
  readonly namespace: string;
};

/** Register this node with the Headscale mesh (spec §4 — stub). */
export const joinMesh = (
  _nodeId: string
): Effect.Effect<MeshIdentity, NetworkNotImplementedError> =>
  Effect.fail(
    new NetworkNotImplementedError({
      operation: "joinMesh",
      message: "Headscale node registration not implemented in v0.1 scaffold",
    })
  );
