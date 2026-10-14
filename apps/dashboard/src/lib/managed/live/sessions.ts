import { Effect } from "effect";

import { SESSIONS } from "@/lib/managed/fixtures-ops";

export type ManagedSessionRow = (typeof SESSIONS)[number];

export const listManagedSessionsEffect = (): Effect.Effect<{
  readonly sessions: readonly ManagedSessionRow[];
  readonly source: "fixture";
}> => Effect.succeed({ sessions: SESSIONS, source: "fixture" });
