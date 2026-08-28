import { createFaroHandlerState, handleFaroRequest } from "./handler.js";
import { signJwt } from "./jwt.js";
import type { FaroProxyEnv, JwtClaims } from "./types.js";

export { signJwt as signDevJwt } from "./jwt.js";
export type { FaroProxyEnv, JwtClaims } from "./types.js";

const state = createFaroHandlerState();

export default {
  async fetch(request: Request, env: FaroProxyEnv): Promise<Response> {
    return handleFaroRequest(request, env, state);
  },
};

/** Test helper — mint a telemetry JWT with explicit claims. */
export const signTelemetryJwt = (claims: JwtClaims, secret: string): Promise<string> =>
  signJwt(claims, secret);
