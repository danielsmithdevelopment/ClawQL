import { Effect } from "effect";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import type { ActivityEvent, HomeSpend, ReviewItem } from "@/src/domain/schemas";
import type { OrgSummary } from "@/src/domain/schemas";
import {
  getHomeSpendEffect,
  getOrgSummaryEffect,
  listActivityEffect,
  listReviewEffect,
} from "@/src/services/api";
import { scheduleLocalApprovalNotificationEffect } from "@/src/services/push";
import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
  Body,
  Column,
  List,
  LoadingBlock,
  Meta,
  ReviewRow,
  ScreenHost,
  SecondaryButton,
  Subtitle,
  SurfaceCard,
  Title,
} from "@/src/ui/primitives";

function formatRelative(atMs: number): string {
  const mins = Math.max(0, Math.round((Date.now() - atMs) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function HomeScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [spend, setSpend] = useState<HomeSpend | null>(null);
  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pushNote, setPushNote] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      const [review, spendRes, activityRes, orgRes] = await Promise.all([
        Effect.runPromise(listReviewEffect(session)),
        Effect.runPromise(getHomeSpendEffect(session)),
        Effect.runPromise(listActivityEffect(session)),
        Effect.runPromise(getOrgSummaryEffect(session)),
      ]);
      setItems([...review.items]);
      setSpend(spendRes);
      setActivity([...activityRes.events].slice(0, 5));
      setOrg(orgRes);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setHydrated(true);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!session || (loading && !hydrated)) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenHost testID="home-screen">
      <List
        onRefresh={async () => {
          await load();
        }}
      >
        <Column spacing={space.sm} style={{ padding: space.md }}>
          <Title>What needs you</Title>
          <Meta>
            {`Signed in as ${session.displayName}${session.reviewerDemo ? " · reviewer demo" : ""}`}
          </Meta>
          {org ? (
            <SurfaceCard testID="home-org">
              <Subtitle>{org.name}</Subtitle>
              <Meta>{`${org.plan} · ${org.role} · ${org.members}`}</Meta>
            </SurfaceCard>
          ) : null}
          {spend ? (
            <SurfaceCard testID="home-spend">
              <Subtitle>{spend.label}</Subtitle>
              <Title>{spend.amount}</Title>
              <Meta>{spend.note}</Meta>
              <SecondaryButton
                testID="home-open-spend"
                label="See spend by agent"
                onPress={() => router.push("/spend")}
              />
            </SurfaceCard>
          ) : null}
          <Column spacing={space.sm} testID="home-shortcuts">
            <SecondaryButton
              testID="home-open-agents"
              label="Your agents"
              onPress={() => router.push("/agents")}
            />
            <SecondaryButton
              testID="home-open-digest"
              label="Morning digest"
              onPress={() => router.push("/digest")}
            />
            <SecondaryButton
              testID="home-open-inbox"
              label="Notifications"
              onPress={() => router.push("/inbox")}
            />
          </Column>
          <Subtitle>Needs action</Subtitle>
          {error ? <Meta color={brand.danger}>{error}</Meta> : null}
          {items.length === 0 ? (
            <Meta testID="home-empty">Nothing waiting. You are clear.</Meta>
          ) : null}
        </Column>

        {items.map((item) => (
          <ReviewRow
            key={item.id}
            testID={`home-item-${item.id}`}
            kindLabel={item.kindLabel}
            badge={item.badge}
            badgeTone={item.badgeTone}
            title={item.title}
            listMeta={item.listMeta}
            statusLine={item.statusLine}
            onPress={() => router.push(`/review/${item.id}`)}
          />
        ))}

        <Column spacing={space.sm} style={{ padding: space.md }}>
          <Subtitle>Recent activity</Subtitle>
          {activity.length === 0 ? (
            <Meta testID="home-activity-empty">No recent decisions yet.</Meta>
          ) : null}
        </Column>

        {activity.map((event) => (
          <ReviewRow
            key={event.id}
            testID={`home-activity-${event.id}`}
            kindLabel={event.kind.toUpperCase()}
            badge={event.decision}
            badgeTone="neutral"
            title={event.title}
            listMeta={event.detail}
            statusLine={formatRelative(event.atMs)}
            onPress={() => router.push(`/review/${event.reviewId}`)}
          />
        ))}

        <Column spacing={space.sm} style={{ padding: space.md, paddingBottom: space.xl }}>
          <SecondaryButton
            testID="home-open-activity"
            label="See all activity"
            onPress={() => router.push("/(tabs)/activity")}
          />
          {items[0] ? (
            <SurfaceCard testID="home-simulate-push">
              <Subtitle>Local push (fixture)</Subtitle>
              <Meta>
                Schedule a local notification that opens the top request — no EAS or APNs needed.
              </Meta>
              <SecondaryButton
                testID="home-simulate-push-btn"
                label="Simulate approval push"
                onPress={() => {
                  void (async () => {
                    try {
                      const res = await Effect.runPromise(
                        scheduleLocalApprovalNotificationEffect({
                          requestId: items[0]!.id,
                          title: items[0]!.title,
                          delaySeconds: 1,
                        })
                      );
                      setPushNote(
                        res.simulated
                          ? `Web simulated · open /review/${items[0]!.id}`
                          : `Notification scheduled · ${res.notificationId}`
                      );
                      if (res.simulated) {
                        setTimeout(() => router.push(`/review/${items[0]!.id}`), 800);
                      }
                    } catch (e: unknown) {
                      setPushNote(e instanceof Error ? e.message : String(e));
                    }
                  })();
                }}
              />
              {pushNote ? (
                <Meta testID="home-push-note" color={brand.ok}>
                  {pushNote}
                </Meta>
              ) : null}
            </SurfaceCard>
          ) : null}
          <Body color={brand.inkFaint}>Pull to refresh the queue</Body>
        </Column>
      </List>
    </ScreenHost>
  );
}
