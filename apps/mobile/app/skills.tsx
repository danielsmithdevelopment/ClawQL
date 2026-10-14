import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import type { ActiveSkill, ProposedSkill } from "@/src/domain/schemas";
import { listActiveSkillsEffect, listProposedSkillsEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
  Badge,
  Body,
  Column,
  LoadingBlock,
  Meta,
  ScreenHost,
  ScreenScroll,
  SecondaryButton,
  SectionHeader,
  SurfaceCard,
} from "@/src/ui/primitives";

export default function SkillsScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [proposed, setProposed] = useState<readonly ProposedSkill[]>([]);
  const [active, setActive] = useState<readonly ActiveSkill[]>([]);

  useEffect(() => {
    if (!session) return;
    void Promise.all([
      Effect.runPromise(listProposedSkillsEffect(session)),
      Effect.runPromise(listActiveSkillsEffect(session)),
    ]).then(([p, a]) => {
      setProposed(p);
      setActive(a);
    });
  }, [session]);

  if (!session) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenScroll testID="skills-screen">
      <SectionHeader
        icon="skill"
        title="Skills"
        subtitle="Proposed queue and active skills — console Skills on phone."
      />

      <SurfaceCard testID="skills-proposed">
        <Body>Proposed</Body>
        <Column spacing={space.sm}>
          {proposed.map((skill) => (
            <SurfaceCard key={skill.id} testID={`skill-proposed-${skill.id}`} tint="soft">
              <Body>{skill.name}</Body>
              <Meta color={brand.inkFaint}>{skill.description}</Meta>
              <Meta color={brand.inkFaint}>{skill.attribution}</Meta>
              {skill.blocker ? (
                <Badge label={skill.blocker} tone={skill.blockerTone ?? "warn"} />
              ) : (
                <Badge label={skill.canProve ? "Ready to prove" : "Blocked"} tone="ok" />
              )}
            </SurfaceCard>
          ))}
        </Column>
      </SurfaceCard>

      <SurfaceCard testID="skills-active">
        <Body>Active</Body>
        <Column spacing={space.sm}>
          {active.map((skill) => (
            <SurfaceCard key={skill.id} testID={`skill-active-${skill.id}`} tint="soft">
              <Body>{skill.name}</Body>
              <Meta color={brand.inkFaint}>{skill.description}</Meta>
              <Meta color={brand.inkFaint}>{`${skill.keyGroup} · ${skill.touchesLabel} · ${skill.runs7d} runs / 7d`}</Meta>
            </SurfaceCard>
          ))}
        </Column>
      </SurfaceCard>

      <SecondaryButton
        testID="skills-open-workflows"
        label="Start a workflow"
        onPress={() => router.push("/workflows")}
      />
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
