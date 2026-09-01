import { createHash } from "node:crypto";
import { Effect } from "effect";
import { ontologySync } from "../effect/ontology-errors.js";

/** SHA-256 hex digest (Effect.sync). */
export function sha256Hex(input: string): Effect.Effect<string> {
  return ontologySync(() => createHash("sha256").update(input, "utf8").digest("hex"));
}

export function sha256HexSync(input: string): string {
  return Effect.runSync(sha256Hex(input));
}
