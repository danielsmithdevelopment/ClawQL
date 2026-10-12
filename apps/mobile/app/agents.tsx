import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import type { AgentSummary } from "@/src/domain/schemas";
import { listAgentsEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
  Badge,
  Body,
  Column,
  IconBubble,
  LoadingBlock,
  Meta,
  ScreenHost,
  ScreenScroll,
  SecondaryButton,
  SectionHeader,
  Subtitle,
  SurfaceCard,
} from "@/src/ui/primitives";

function toneFor(status: AgentSummary["status"]): "ok" | "warn" | "neutral" {
  if (status === "needs_you") return "warn";
  if (status === "active") return "ok";
  return "neutral";
}

export default function AgentsScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [agents, setAgents] = useState<readonly AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setAgents(await Effect.runPromise(listAgentsEffect(session)));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session || loading) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  const needsYou = agents.filter((a) => a.status === "needs_you").length;

  return (
    <ScreenScroll testID="agents-screen">
      <SectionHeader
        icon="agents"
        title="Your agents"
        subtitle="Who is running, who is waiting on you, and today's spend."
      />
      {needsYou > 0 ? (
        <Column spacing={4} testID="agents-needs-you">
          <Badge label={`${needsYou} need you`} tone="warn" />
          <Body color={brand.inkMuted}>
            Those agents stay blocked until someone with a key decides in Review.
          </Body>
        </Column>
      ) : null}

      <Column spacing={space.sm}>
        {agents.map((agent) => (
          <SurfaceCard key={agent.id} testID={`agent-${agent.id}`} elevated={agent.status === "needs_you"}>
            <Column spacing={space.sm}>
              <IconBubble
                name="agents"
                tone={toneFor(agent.status)}
                size={36}
                iconSize={18}
              />
              <Subtitle>{agent.name}</Subtitle>
              <Badge label={agent.statusLabel} tone={toneFor(agent.status)} />
              <Meta>{agent.role}</Meta>
              <Meta>{`${agent.spendToday} today · last run ${agent.lastRun}`}</Meta>
            </Column>
          </SurfaceCard>
        ))}
      </Column>

      <SecondaryButton
        testID="agents-open-review"
        label="Open Review"
        onPress={() => router.replace("/(tabs)/review")}
      />
      <SecondaryButton label="Back to Home" onPress={() => router.replace("/(tabs)")} />
    </ScreenScroll>
  );
}
