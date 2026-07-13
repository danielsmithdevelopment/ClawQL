import { Effect } from "effect";
import { runPaymentsEffect } from "../runtime/payments-effect-runtime.js";
import {
  MppOpenApiService,
  composeMppOpenApiDocument,
  type BuildMppOpenApiOptions,
} from "./openapi-service.js";

export type { BuildMppOpenApiOptions };
export { composeMppOpenApiDocument };

export async function buildMppOpenApiDocument(
  options: BuildMppOpenApiOptions = {}
): Promise<Record<string, unknown>> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const mpp = yield* MppOpenApiService;
      return yield* mpp.buildDocument(options);
    }),
    options.env
  );
}

export async function renderMppOpenApiJson(options: BuildMppOpenApiOptions = {}): Promise<string> {
  return runPaymentsEffect(
    Effect.gen(function* () {
      const mpp = yield* MppOpenApiService;
      return yield* mpp.renderJson(options);
    }),
    options.env
  );
}
