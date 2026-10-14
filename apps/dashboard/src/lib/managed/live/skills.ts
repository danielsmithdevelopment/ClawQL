import { Effect } from "effect";

import { SKILLS_ACTIVE, SKILLS_PROPOSED } from "@/lib/managed/fixtures-ops";

export type ManagedProposedSkill = (typeof SKILLS_PROPOSED)[number];
export type ManagedActiveSkill = (typeof SKILLS_ACTIVE)[number];

export const listManagedSkillsEffect = (): Effect.Effect<{
  readonly proposed: readonly ManagedProposedSkill[];
  readonly active: readonly ManagedActiveSkill[];
  readonly source: "fixture";
}> =>
  Effect.succeed({
    proposed: SKILLS_PROPOSED,
    active: SKILLS_ACTIVE,
    source: "fixture",
  });
