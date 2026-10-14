import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import type { GatewayBundle } from "@/src/domain/schemas";
import { getGatewayBundleEffect } from "@/src/services/api";
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

export default function GatewayScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [bundle, setBundle] = useState<GatewayBundle | null>(null);

  useEffect(() => {
    if (!session) return;
    void Effect.runPromise(getGatewayBundleEffect(session)).then(setBundle);
  }, [session]);

  if (!session || !bundle) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenScroll testID="gateway-screen">
      <SectionHeader
        icon="console"
        title="Gateway"
        subtitle="Inference routes, MCP, memory, decisions, and events — console Gateway on phone."
      />
      <Meta testID="gateway-base" mono color={brand.inkFaint}>
        {bundle.base}
      </Meta>

      <SurfaceCard testID="gateway-routes">
        <Body>Model routes</Body>
        <Column spacing={space.sm}>
          {bundle.routes.map((row) => (
            <SurfaceCard key={row.id} testID={`gateway-route-${row.id}`} tint="soft">
              <Badge label={row.status} tone={row.tone} />
              <Meta mono>{row.label}</Meta>
              <Meta color={brand.inkFaint}>{row.chain}</Meta>
            </SurfaceCard>
          ))}
        </Column>
      </SurfaceCard>

      <SurfaceCard testID="gateway-endpoints">
        <Body>Endpoints</Body>
        <Column spacing={space.sm}>
          {bundle.endpoints.map((row) => (
            <SurfaceCard key={row.path} testID={`gateway-row-${row.path.replace("/", "")}`} tint="soft">
              <Meta mono>{row.path}</Meta>
              <Meta color={brand.inkFaint}>{row.description}</Meta>
            </SurfaceCard>
          ))}
        </Column>
      </SurfaceCard>
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
