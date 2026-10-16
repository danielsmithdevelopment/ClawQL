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

      <SurfaceCard testID="settings-login-abuse">
        <Body>Login rate limits & lockouts</Body>
        <Meta color={brand.inkFaint}>
          Human password / SSO abuse controls live on your IdP (Okta / Entra /
          Supabase Auth) — not inside this app. Mobile sign-in uses the same
          issuer as the cloud console. MCP OAuth token limits are separate
          (`CLAWQL_MCP_OAUTH_RATE_LIMIT_PER_MIN`). See
          docs/security/idp-login-abuse-ownership.md.
        </Meta>
      </SurfaceCard>

      <SurfaceCard testID="settings-ai-enforcement">
        <Body>AI tool-scope enforcement</Body>
        <Meta color={brand.inkFaint}>
          Production gateways must run with blocking Panguard (or equivalent)
          pre-execute hooks. Do not set CLAWQL_ALLOW_NO_ENFORCEMENT=1 in
          production. PhoneApprove never bypasses gateway policy — approve /
          decline still go through the same ATR path. See
          docs/security/ai-enforcement-default-posture.md.
        </Meta>
      </SurfaceCard>

      <SurfaceCard testID="settings-restore-drill">
        <Body>Backup restore drill</Body>
        <Meta color={brand.inkFaint}>
          Operators run the quarterly PITR / snapshot restore drill and record
          RTO/RPO. Mobile does not start restores — follow
          docs/deployment/restore-drill.md on the platform host.
        </Meta>
      </SurfaceCard>

      <SurfaceCard testID="settings-support-view">
        <Body>Support view-as</Body>
        <Meta color={brand.inkFaint}>
          Owner/Admin “View as” is console-only and always audited. This app
          never starts support impersonation — use Team → View as on the web
          console when you need it.
        </Meta>
      </SurfaceCard>

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
      <SecondaryButton
        testID="settings-open-sessions-kill"
        label="Signed-in devices"
        onPress={() => router.push("/(tabs)/profile")}
      />
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </ScreenScroll>
  );
}