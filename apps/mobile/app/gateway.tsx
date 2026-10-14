import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import type { GatewayEndpoint } from "@/src/domain/schemas";
import { listGatewayEndpointsEffect } from "@/src/services/api";
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

export default function GatewayScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<readonly GatewayEndpoint[]>([]);

  useEffect(() => {
    if (!session) return;
    void Effect.runPromise(listGatewayEndpointsEffect(session)).then(setRows);
  }, [session]);

  if (!session) {
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
        subtitle="Inference, MCP, memory, decisions, and events — console Gateway on phone."
      />
      <SurfaceCard testID="gateway-endpoints">
        <Column spacing={space.sm}>
          {rows.map((row) => (
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
