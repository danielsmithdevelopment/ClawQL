/**
 * Effect Tag + Layer for sources propose / approve.
 */

import { Context, Effect, Layer } from "effect";
import {
  approveSourceEffect,
  proposeSourceEffect,
  type ApproveSourceParams,
  type ApproveSourceResult,
  type ProposeSourceParams,
} from "./propose-source-core.js";
import type { SourcesProposePreview } from "./pending-source-types.js";

export class ProposeSourceService extends Context.Tag("clawql/ProposeSourceService")<
  ProposeSourceService,
  {
    readonly propose: (params: ProposeSourceParams) => Effect.Effect<SourcesProposePreview, Error>;
    readonly approve: (params: ApproveSourceParams) => Effect.Effect<ApproveSourceResult, Error>;
  }
>() {}

export const ProposeSourceLive = Layer.succeed(ProposeSourceService, {
  propose: (params) => proposeSourceEffect(params),
  approve: (params) => approveSourceEffect(params),
});
