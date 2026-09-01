import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { Effect } from "effect";

import { ObservabilityError } from "../errors.js";
import {
  logAlloyConfigAppliedEffect,
  type ObservabilityGovernanceSink,
} from "../governance/worm.js";
import {
  ObservabilityAuthError,
  requireObservabilityScopeEffect,
  type ObservabilitySessionContext,
} from "../scopes.js";
import { generateAlloyRiverEffect } from "./generate.js";
import type { AlloyGenerationInput, AlloyGeneratedConfig } from "./types.js";
import { validateAlloyRiverEffect } from "./validate.js";

export type ApplyAlloyConfigInput = {
  readonly session: ObservabilitySessionContext;
  readonly actorId: string;
  readonly generation: AlloyGenerationInput;
  /** Destination path for the generated River file. */
  readonly outputPath: string;
  /**
   * Optional reload hook (SIGHUP / K8s rollout). Called after successful write + validate.
   * Hosts that cannot reload may omit this — config is still written and audited.
   */
  readonly reload?: () => Effect.Effect<void, ObservabilityError>;
};

export type ApplyAlloyConfigResult = {
  readonly generated: AlloyGeneratedConfig;
  readonly outputPath: string;
};

export const applyAlloyConfigEffect = (
  input: ApplyAlloyConfigInput
): Effect.Effect<
  ApplyAlloyConfigResult,
  ObservabilityError | ObservabilityAuthError,
  ObservabilityGovernanceSink
> =>
  Effect.gen(function* () {
    yield* requireObservabilityScopeEffect(input.session, "observability:configure");

    const generated = yield* generateAlloyRiverEffect(input.generation);
    yield* validateAlloyRiverEffect(generated.river);

    yield* Effect.tryPromise({
      try: async () => {
        await mkdir(dirname(input.outputPath), { recursive: true });
        await writeFile(input.outputPath, generated.river, "utf8");
      },
      catch: (cause) =>
        new ObservabilityError({
          reason: `failed to write Alloy config to ${input.outputPath}`,
          cause,
        }),
    });

    if (input.reload) {
      yield* input.reload();
    }

    yield* logAlloyConfigAppliedEffect({
      actorId: input.actorId,
      detail: {
        outputPath: input.outputPath,
        providerIds: [...generated.providerIds],
        logExporters: generated.exporterRefs.logs.length,
        metricExporters: generated.exporterRefs.metrics.length,
        traceExporters: generated.exporterRefs.traces.length,
      },
    });

    return { generated, outputPath: input.outputPath };
  });
