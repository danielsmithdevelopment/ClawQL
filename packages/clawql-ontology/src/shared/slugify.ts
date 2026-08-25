import { Effect } from "effect";
import { ontologySync } from "../effect/ontology-errors.js";

/** Slugify labels into CQE field / entity name tokens. */
export function slugify(input: string): Effect.Effect<string> {
  return ontologySync(
    () =>
      input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_") || "field"
  );
}

export function slugifySync(input: string): string {
  return Effect.runSync(slugify(input));
}
