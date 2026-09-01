import { Effect } from "effect";

import { ObservabilityError } from "../errors.js";

/** River component names must be identifiers: letters, digits, underscore. */
export const sanitizeRiverComponentNameEffect = (
  providerId: string
): Effect.Effect<string, ObservabilityError> =>
  Effect.gen(function* () {
    const trimmed = providerId.trim();
    if (trimmed === "") {
      return yield* Effect.fail(
        new ObservabilityError({ reason: "provider id must not be empty for River naming" })
      );
    }
    const sanitized = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");
    if (sanitized === "" || /^[0-9]/.test(sanitized)) {
      return yield* Effect.fail(
        new ObservabilityError({
          reason: `cannot derive River component name from provider id: ${providerId}`,
        })
      );
    }
    return sanitized;
  });

export const sanitizeRiverComponentName = (providerId: string): string =>
  Effect.runSync(sanitizeRiverComponentNameEffect(providerId));
