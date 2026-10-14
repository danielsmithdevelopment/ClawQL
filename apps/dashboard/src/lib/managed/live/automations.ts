import { Effect } from "effect";

import { AUTOMATION_SUBS } from "@/lib/managed/fixtures-ops";

export const listManagedAutomationsEffect = (): Effect.Effect<{
  readonly automations: typeof AUTOMATION_SUBS;
  readonly source: "fixture";
}> => Effect.succeed({ automations: AUTOMATION_SUBS, source: "fixture" });
