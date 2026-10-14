import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import type { OrgSettings } from "@/src/domain/schemas";
import { getOrgSettingsEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
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

export default function SettingsScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [org, setOrg] = useState<OrgSettings | null>(null);

  useEffect(() => {
    if (!session) return;
    void Effect.runPromise(getOrgSettingsEffect(session)).then(setOrg);
  }, [session]);

  if (!session) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenScroll testID="settings-screen">
      <SectionHeader
        icon="org"
        title="Settings"
        subtitle="Org general settings — network/privacy panes deepen next."
      />
      <SurfaceCard testID="settings-org">
        {org ? (
          <Column spacing={space.sm}>
            <Body testID="settings-org-name">{org.name}</Body>
            <Meta color={brand.inkFaint}>{`Console · ${org.consoleAddress}`}</Meta>
            <Meta color={brand.inkFaint}>{`Region · ${org.dataRegion}`}</Meta>
            <Meta color={brand.inkFaint}>{`Time zone · ${org.timeZone}`}</Meta>
            <Meta color={brand.inkFaint}>{`Security · ${org.securityContact}`}</Meta>
          </Column>
        ) : (
          <LoadingBlock />
        )}
      </SurfaceCard>
      <SecondaryButton
        testID="settings-open-keys"
        label="API keys"
        onPress={() => router.push("/keys")}
      />
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </ScreenScroll>
  );
}