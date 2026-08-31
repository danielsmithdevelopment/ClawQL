import { Effect } from "effect";

import { ObservabilityError } from "../errors.js";

/**
 * Structural River validation — brace balance and required component markers.
 * Full `alloy fmt` / dry-run belongs at the apply host when Alloy CLI is available.
 */
export const validateAlloyRiverEffect = (
  river: string
): Effect.Effect<void, ObservabilityError> =>
  Effect.gen(function* () {
    const trimmed = river.trim();
    if (trimmed === "") {
      return yield* Effect.fail(new ObservabilityError({ reason: "River config is empty" }));
    }

    let depth = 0;
    for (const char of trimmed) {
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      if (depth < 0) {
        return yield* Effect.fail(
          new ObservabilityError({ reason: "River config has unmatched closing brace" })
        );
      }
    }
    if (depth !== 0) {
      return yield* Effect.fail(
        new ObservabilityError({ reason: "River config has unmatched opening brace" })
      );
    }

    const required = [
      "otelcol.receiver.otlp",
      "otelcol.processor.batch",
    ] as const;
    for (const marker of required) {
      if (!trimmed.includes(marker)) {
        return yield* Effect.fail(
          new ObservabilityError({
            reason: `River config missing required component: ${marker}`,
          })
        );
      }
    }

    if (
      !trimmed.includes("otelcol.exporter.") &&
      !trimmed.includes("prometheus.remote_write")
    ) {
      return yield* Effect.fail(
        new ObservabilityError({ reason: "River config has no exporters" })
      );
    }
  });

export const validateAlloyRiver = (river: string): void =>
  Effect.runSync(validateAlloyRiverEffect(river));
