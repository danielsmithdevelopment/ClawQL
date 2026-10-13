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
  IconBubble,
  List,
  ListItem,
  LoadingBlock,
  Meta,
  ScreenHost,
  SectionHeader,
} from "@/src/ui/primitives";
import { Icons } from "@/src/ui/icons";
import { Icon } from "@expo/ui";

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
      <List
        onRefresh={async () => {
          await load();
        }}
      >
        <Column spacing={space.sm} style={{ padding: space.md }}>
          <SectionHeader
            icon="policies"
            title="Approval policies"
            subtitle="What waits on a person. Agents can't edit or skip these — every change is recorded."
          />
        </Column>
        {policies.map((pol) => (
          <ListItem
            key={pol.id}
            testID={`policy-${pol.id}`}
            onPress={() => router.push(`/policies/${pol.id}`)}
            leading={
              <IconBubble
                name={pol.blocked ? "shield" : "policies"}
                tone="seed"
                size={36}
                iconSize={18}
              />
            }
            trailing={<Icon name={Icons.chevron} size={14} color={brand.inkFaint} />}
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
