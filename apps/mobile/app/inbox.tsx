import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import type { InboxItem } from "@/src/domain/schemas";
import { listInboxEffect } from "@/src/services/api";
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

function formatWhen(atMs: number): string {
  const mins = Math.max(0, Math.round((Date.now() - atMs) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function kindLabel(kind: InboxItem["kind"]): string {
  if (kind === "approval") return "Approval";
  if (kind === "digest") return "Digest";
  return "System";
}

export default function InboxScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<readonly InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setItems(await Effect.runPromise(listInboxEffect(session)));
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

  const unread = items.filter((i) => i.unread).length;

  return (
    <ScreenScroll testID="inbox-screen">
      <Title>Notifications</Title>
      <Meta>
        Local inbox for approval pushes, digests, and system reminders — no APNs required in
        fixture mode.
      </Meta>
      {unread > 0 ? <Badge label={`${unread} unread`} tone="warn" /> : null}

      <Column spacing={space.sm}>
        {items.map((item) => (
          <SurfaceCard key={item.id} testID={`inbox-${item.id}`}>
            <Badge label={kindLabel(item.kind)} tone={item.unread ? "warn" : "neutral"} />
            <Subtitle>{item.title}</Subtitle>
            <Body>{item.body}</Body>
            <Meta color={brand.inkFaint}>{formatWhen(item.atMs)}</Meta>
            {item.kind === "approval" && item.reviewId ? (
              <SecondaryButton
                testID={`inbox-open-${item.id}`}
                label="Open request"
                onPress={() => router.push(`/review/${item.reviewId}`)}
              />
            ) : null}
            {item.kind === "digest" ? (
              <SecondaryButton
                testID={`inbox-open-digest-${item.id}`}
                label="Open digest"
                onPress={() => router.push("/digest")}
              />
            ) : null}
          </SurfaceCard>
        ))}
      </Column>

      <SecondaryButton label="Back to Home" onPress={() => router.replace("/(tabs)")} />
    </ScreenScroll>
  );
}
