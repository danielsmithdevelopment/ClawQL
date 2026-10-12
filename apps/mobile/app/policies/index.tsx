import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import type { ApprovalPolicy } from "@/src/domain/schemas";
import { listPoliciesEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
  Badge,
  Body,
  Column,
  List,
  ListItem,
  LoadingBlock,
  Meta,
  ScreenHost,
  Title,
} from "@/src/ui/primitives";

export default function PoliciesScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [policies, setPolicies] = useState<readonly ApprovalPolicy[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const rows = await Effect.runPromise(listPoliciesEffect(session));
      setPolicies(rows);
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

  return (
    <ScreenHost testID="policies-screen">
      <List>
        <Column spacing={space.sm} style={{ padding: space.md }}>
          <Title>Approval policies</Title>
          <Meta>
            {"What waits on a person. Agents can't edit or skip these — every change is recorded."}
          </Meta>
        </Column>
        {policies.map((pol) => (
          <ListItem
            key={pol.id}
            testID={`policy-${pol.id}`}
            onPress={() => router.push(`/policies/${pol.id}`)}
            supportingText={`${pol.who} · ${pol.approvals} approval${pol.approvals === "1" ? "" : "s"} · key ${pol.securityKey}`}
          >
            {pol.when}
          </ListItem>
        ))}
        <Column spacing={space.sm} style={{ padding: space.md, paddingBottom: space.xl }}>
          {policies.some((p) => p.blocked) ? (
            <Column spacing={4} testID="policies-blocked-note">
              <Badge label="Blocked" tone="danger" />
              <Body color={brand.inkMuted}>
                Deletes and payments stay blocked for agents unless you allowlist a single operation
                in the console.
              </Body>
            </Column>
          ) : null}
        </Column>
      </List>
    </ScreenHost>
  );
}
