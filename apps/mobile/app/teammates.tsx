import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import type { Teammate } from "@/src/domain/schemas";
import { listTeammatesEffect } from "@/src/services/api";
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
  Subtitle,
  SurfaceCard,
  Title,
} from "@/src/ui/primitives";

export default function TeammatesScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [people, setPeople] = useState<readonly Teammate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setPeople(await Effect.runPromise(listTeammatesEffect(session)));
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

  const approvers = people.filter((p) => p.canApprove).length;
  const keysMissing = people.filter((p) => p.canApprove && !p.keysReady).length;

  return (
    <ScreenScroll testID="teammates-screen">
      <Title>Who can approve</Title>
      <Meta>
        People in approval groups. Invite and group edits stay in the web console — phone is
        read-only.
      </Meta>
      <Meta color={brand.inkMuted}>{`${approvers} approvers · ${people.length} people`}</Meta>
      {keysMissing > 0 ? (
        <Column spacing={4} testID="teammates-keys-missing">
          <Badge label={`${keysMissing} missing keys`} tone="warn" />
          <Body color={brand.inkMuted}>
            Approvers without two security keys that can approve will fail NFC / key checks.
          </Body>
        </Column>
      ) : null}

      <Column spacing={space.sm}>
        {people.map((person) => (
          <SurfaceCard key={person.id} testID={`teammate-${person.id}`}>
            <Subtitle>{person.name}</Subtitle>
            <Meta>{`${person.email} · ${person.role}`}</Meta>
            <Badge
              label={person.canApprove ? (person.keysReady ? "Can approve" : "Keys incomplete") : "Requester"}
              tone={person.canApprove ? (person.keysReady ? "ok" : "warn") : "neutral"}
            />
            <Meta>{person.groups.join(" · ")}</Meta>
            <Meta color={brand.inkFaint}>{person.lastActive}</Meta>
          </SurfaceCard>
        ))}
      </Column>

      <SecondaryButton label="Back to Profile" onPress={() => router.replace("/(tabs)/profile")} />
    </ScreenScroll>
  );
}
