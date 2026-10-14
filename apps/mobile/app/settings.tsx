import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import type { OrgSettingsBundle } from "@/src/domain/schemas";
import { getOrgSettingsBundleEffect } from "@/src/services/api";
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
  const [bundle, setBundle] = useState<OrgSettingsBundle | null>(null);

  useEffect(() => {
    if (!session) return;
    void Effect.runPromise(getOrgSettingsBundleEffect(session)).then(setBundle);
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
        subtitle="Org general, network allowlist, and retention — console Settings on phone."
      />
      <SurfaceCard testID="settings-org">
        {bundle ? (
          <Column spacing={space.sm}>
            <Body testID="settings-org-name">{bundle.org.name}</Body>
            <Meta color={brand.inkFaint}>{`Console · ${bundle.org.consoleAddress}`}</Meta>
            <Meta color={brand.inkFaint}>{`Region · ${bundle.org.dataRegion}`}</Meta>
            <Meta color={brand.inkFaint}>{`Time zone · ${bundle.org.timeZone}`}</Meta>
            <Meta color={brand.inkFaint}>{`Security · ${bundle.org.securityContact}`}</Meta>
          </Column>
        ) : (
          <LoadingBlock />
        )}
      </SurfaceCard>

      {bundle ? (
        <SurfaceCard testID="settings-network">
          <Body>Network</Body>
          <Meta color={brand.inkFaint}>Webhook hosts</Meta>
          {bundle.webhookHosts.map((host) => (
            <Meta key={host.host} testID={`settings-webhook-${host.host}`}>
              {`${host.host} · ${host.subscriptions} subscription${host.subscriptions === 1 ? "" : "s"}`}
            </Meta>
          ))}
          <Meta color={brand.inkFaint}>Egress domains</Meta>
          {bundle.egressDomains.map((domain) => (
            <Meta key={domain} testID={`settings-egress-${domain}`} color={brand.inkFaint}>
              {domain}
            </Meta>
          ))}
        </SurfaceCard>
      ) : null}

      {bundle ? (
        <SurfaceCard testID="settings-privacy">
          <Body>Data & privacy</Body>
          {bundle.retention.map((row) => (
            <Column key={row.label} spacing={4}>
              <Body>{`${row.label} · ${row.value}`}</Body>
              <Meta color={brand.inkFaint}>
                {row.locked ? `${row.help} (locked)` : row.help}
              </Meta>
            </Column>
          ))}
        </SurfaceCard>
      ) : null}

      <SecondaryButton
        testID="settings-open-keys"
        label="API keys"
        onPress={() => router.push("/keys")}
      />
      <SecondaryButton
        testID="settings-open-connections"
        label="Connections"
        onPress={() => router.push("/connections")}
      />
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </ScreenScroll>
  );
}