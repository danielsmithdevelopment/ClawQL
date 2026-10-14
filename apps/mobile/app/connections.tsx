import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import type { ConnectionItem } from "@/src/domain/schemas";
import { listConnectionsEffect } from "@/src/services/api";
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

export default function ConnectionsScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<readonly ConnectionItem[]>([]);

  useEffect(() => {
    if (!session) return;
    void Effect.runPromise(listConnectionsEffect(session)).then(setRows);
  }, [session]);

  if (!session) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenScroll testID="connections-screen">
      <SectionHeader
        icon="console"
        title="Connections"
        subtitle="Accounts and sources — same job as Connections & keys in the cloud console."
      />
      <SurfaceCard testID="connections-list">
        <Column spacing={space.sm}>
          {rows.map((row) => (
            <SurfaceCard key={row.id} testID={`connection-row-${row.id}`} tint="soft">
              <Badge
                label={row.statusLabel}
                tone={
                  row.status === "needs-signin"
                    ? "warn"
                    : row.status === "waiting-review"
                      ? "neutral"
                      : "ok"
                }
              />
              <Body>{row.name}</Body>
              <Meta color={brand.inkFaint}>{`${row.summary} · last ${row.lastUsed}`}</Meta>
              <Meta color={brand.inkFaint}>{`Reads ${row.ops.readsAllowed} · writes ${row.ops.writesMandate} · deletes blocked ${row.ops.deletesBlocked}`}</Meta>
              {row.accounts.map((account) => (
                <Meta
                  key={account.id}
                  testID={`connection-account-${account.id}`}
                  color={account.alert ? brand.danger : brand.inkFaint}
                >{`${account.handle} · ${account.ownershipLabel} · ${account.detail}`}</Meta>
              ))}
              {row.usedBy.length > 0 ? (
                <Meta color={brand.inkFaint}>{`Used by · ${row.usedBy.join(", ")}`}</Meta>
              ) : null}
            </SurfaceCard>
          ))}
        </Column>
      </SurfaceCard>
      <SecondaryButton
        testID="connections-open-keys"
        label="API keys"
        onPress={() => router.push("/keys")}
      />
      <SecondaryButton
        testID="connections-open-settings"
        label="Org settings"
        onPress={() => router.push("/settings")}
      />
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </ScreenScroll>
  );
}