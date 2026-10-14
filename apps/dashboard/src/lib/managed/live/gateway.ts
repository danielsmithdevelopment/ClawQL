import { Effect } from "effect";

import { GATEWAY_BASE, GATEWAY_ENDPOINTS } from "@/lib/managed/fixtures";
import { GATEWAY_ROUTES } from "@/lib/managed/fixtures-ops";

export const listManagedGatewayEffect = (): Effect.Effect<{
  readonly base: string;
  readonly endpoints: typeof GATEWAY_ENDPOINTS;
  readonly routes: typeof GATEWAY_ROUTES;
  readonly source: "fixture";
}> =>
  Effect.succeed({
    base: GATEWAY_BASE,
    endpoints: GATEWAY_ENDPOINTS,
    routes: GATEWAY_ROUTES,
    source: "fixture",
  });
