import type { Effect } from "effect";
import type { ClawQLError } from "../errors/clawql-error.js";

/**
 * Vertical / horizontal extension contract (enablement §5.4).
 * `ClawQLApi` is provided at registration time — full hook surface grows in Phase 2+.
 */
export interface Plugin {
  readonly id: string;
  readonly version: string;
  readonly vertical?: string;

  onRegister?: () => Effect.Effect<void, ClawQLError>;
  onTeardown?: () => Effect.Effect<void, ClawQLError>;
}
