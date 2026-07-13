import { Context, Layer } from "effect";
import type { OuroborosContext } from "../mcp-hooks.js";
import { getOuroborosContext } from "../plugin/context.js";

/** Effect service for the Ouroboros loop + event store context. */
export class OuroborosContextService extends Context.Tag("clawql/OuroborosContextService")<
  OuroborosContextService,
  {
    readonly getContext: () => OuroborosContext;
  }
>() {}

export function ouroborosContextLiveLayer(): Layer.Layer<OuroborosContextService> {
  return Layer.succeed(
    OuroborosContextService,
    OuroborosContextService.of({
      getContext: getOuroborosContext,
    })
  );
}
