import { Effect } from "effect";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import type { ApprovalPolicyDetail } from "@/src/domain/schemas";
import { getPolicyDetailEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
  Badge,
  Body,
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

export default function PolicyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const router = useRouter();
  const [detail, setDetail] = useState<ApprovalPolicyDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session || !id) return;
    try {
      const found = await Effect.runPromise(getPolicyDetailEffect(session, id));
      setDetail(found);
    } finally {
      setLoading(false);
    }
  }, [session, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  if (!detail) {
    return (
      <ScreenScroll testID="policy-detail-missing">
        <SectionHeader icon="policies" title="Policy not found" subtitle="It may have been removed in the web console." />
        <SecondaryButton label="Back to policies" onPress={() => router.replace("/policies")} />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll testID="policy-detail-screen">
      <SectionHeader icon="policies" title={detail.title} subtitle={detail.lastChanged} />

      <SurfaceCard testID="policy-applies" tint="soft">
        <IconBubble name="change" tone="neutral" size={28} iconSize={14} />
        <Subtitle>Applies to</Subtitle>
        <Body>{detail.appliesTo}</Body>
        <Meta>{detail.appliesHelp}</Meta>
      </SurfaceCard>

      <SurfaceCard testID="policy-who">
        <IconBubble name="people" tone="seed" size={28} iconSize={14} />
        <Subtitle>Who approves</Subtitle>
        <Body>{detail.whoApproves}</Body>
        <Meta>{detail.whoHelp}</Meta>
      </SurfaceCard>

      <SurfaceCard testID="policy-rules">
        <IconBubble name="key" tone={detail.requireSecurityKey ? "warn" : "neutral"} size={28} iconSize={14} />
        <Subtitle>Rules</Subtitle>
        <Meta>{`Approvals needed · ${detail.approvalsNeeded}`}</Meta>
        <Meta>{`Expires after · ${detail.expiresAfter}`}</Meta>
        <Meta>{detail.expiresHelp}</Meta>
        {detail.requireSecurityKey ? (
          <Badge label="Security key required" tone="warn" />
        ) : (
          <Badge label="No security key" tone="neutral" />
        )}
        <Meta color={brand.inkMuted}>{`Notify · ${detail.notify}`}</Meta>
      </SurfaceCard>

      <Meta color={brand.inkFaint}>Edit policies in the web console — phone is read-only.</Meta>
      <SecondaryButton
        testID="policy-back"
        label="All policies"
        onPress={() => router.replace("/policies")}
      />
    </ScreenScroll>
  );
}
