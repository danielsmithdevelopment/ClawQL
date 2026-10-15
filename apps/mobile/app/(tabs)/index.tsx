import { Effect } from "effect";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import type { ActivityEvent, HomeSpend, ReviewItem } from "@/src/domain/schemas";
import type { OrgSummary } from "@/src/domain/schemas";
import type { DataSource } from "@/src/domain/schemas";
import {
  getHomeSpendEffect,
  getOrgSummaryEffect,
  listActivityEffect,
  listInboxEffect,
  listReviewEffect,
  prependInboxItemEffect,
} from "@/src/services/api";
import { listReviewFromCacheEffect, loadOfflineSnapshotEffect } from "@/src/services/offline-cache";
import { scheduleLocalApprovalNotificationEffect } from "@/src/services/push";
import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
  Body,
  Column,
  IconBubble,
  List,
  LoadingBlock,
  Meta,
  NavRow,
  ReviewRow,
  ScreenHost,
  SecondaryButton,
  SectionHeader,
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
  const [dataSource, setDataSource] = useState<DataSource>("fixture");
  const [hydrated, setHydrated] = useState(false);
  const [inboxUnread, setInboxUnread] = useState(0);

  const load = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      const [review, spendRes, activityRes, orgRes, inbox] = await Promise.all([
        Effect.runPromise(listReviewEffect(session)),
        Effect.runPromise(getHomeSpendEffect(session)),
        Effect.runPromise(listActivityEffect(session)),
        Effect.runPromise(getOrgSummaryEffect(session)),
        Effect.runPromise(listInboxEffect(session)),
      ]);
      setItems([...review.items]);
      setDataSource(review.source);
      setSpend(spendRes);
      setActivity([...activityRes.events].slice(0, 5));
      setOrg(orgRes);
      setInboxUnread(inbox.filter((i) => i.unread).length);
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
        <Column spacing={space.md} style={{ padding: space.md }}>
          <SectionHeader
            icon="shield"
            tone="seed"
            title="What needs you"
            subtitle={`Signed in as ${session.displayName}${session.reviewerDemo ? " · reviewer demo" : ""}`}
          />
          {org ? (
            <SurfaceCard testID="home-org" tint="soft">
              <Column spacing={space.sm}>
                <Column spacing={4}>
                  <IconBubble name="org" tone="seed" size={36} iconSize={18} />
                  <Subtitle>{org.name}</Subtitle>
                  <Meta>{`${org.plan} · ${org.role} · ${org.members}`}</Meta>
                </Column>
              </Column>
            </SurfaceCard>
          ) : null}
          {spend ? (
            <SurfaceCard testID="home-spend" tint="seed" elevated>
              <Column spacing={space.sm}>
                <IconBubble name="spend" tone="seed" size={40} iconSize={20} />
                <Meta>{spend.label}</Meta>
                <Title>{spend.amount}</Title>
                <Meta>{spend.note}</Meta>
                <SecondaryButton
                  testID="home-open-spend"
                  label="See spend by agent"
                  onPress={() => router.push("/spend")}
                />
              </Column>
            </SurfaceCard>
          ) : null}
        </Column>

        <NavRow
          testID="home-open-agents"
          icon="agents"
          label="Your agents"
          help="Who is running and who is waiting on you"
          onPress={() => router.push("/agents")}
        />
        <NavRow
          testID="home-open-digest"
          icon="digest"
          label="Morning digest"
          help="Overnight from your agents"
          onPress={() => router.push("/digest")}
        />
        <NavRow
          testID="home-open-inbox"
          icon="inbox"
          label="Notifications"
          help={
            inboxUnread > 0
              ? `${inboxUnread} unread · approval pushes and reminders`
              : "Approval pushes and reminders"
          }
          onPress={() => router.push("/inbox")}
        />

        <Column spacing={space.sm} style={{ padding: space.md }}>
          <SectionHeader icon="change" title="Needs action" tone="seed" />
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
          <SectionHeader icon="activity" title="Recent activity" tone="seed" />
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
          {dataSource === "cache" ? (
            <SurfaceCard testID="home-offline-banner" tint="soft">
              <Meta color={brand.warn} testID="home-offline-meta">
                Showing offline cache — browse only. Approving needs a live connection
                (digest binding rejects stale screens). Pull to refresh when online.
              </Meta>
            </SurfaceCard>
          ) : null}
          <SurfaceCard testID="home-offline-tools" tint="soft">
            <IconBubble name="shield" tone="seed" size={32} iconSize={16} />
            <Subtitle>Offline cache</Subtitle>
            <Meta>{`Queue snapshots save automatically. Source: ${dataSource}.`}</Meta>
            <SecondaryButton
              testID="home-show-offline-cache"
              label="Show offline cache"
              onPress={() => {
                void (async () => {
                  const [cached, snap] = await Promise.all([
                    Effect.runPromise(listReviewFromCacheEffect()),
                    Effect.runPromise(loadOfflineSnapshotEffect()),
                  ]);
                  if (!cached) {
                    setPushNote("No offline snapshot yet — open Review once first");
                    return;
                  }
                  setItems([...cached.items]);
                  setDataSource("cache");
                  setPushNote(
                    `Offline cache · ${cached.items.length} items · saved ${
                      snap ? new Date(snap.savedAtMs).toLocaleString() : "just now"
                    }`
                  );
                })();
              }}
            />
            {pushNote && dataSource === "cache" ? (
              <Meta testID="home-offline-note" color={brand.ok}>
                {pushNote}
              </Meta>
            ) : null}
          </SurfaceCard>
          {items[0] ? (
            <SurfaceCard testID="home-simulate-push" tint="soft">
              <IconBubble name="inbox" tone="seed" size={32} iconSize={16} />
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
                      const top = items[0]!;
                      const res = await Effect.runPromise(
                        scheduleLocalApprovalNotificationEffect({
                          requestId: top.id,
                          title: top.title,
                          delaySeconds: 1,
                        })
                      );
                      await Effect.runPromise(
                        prependInboxItemEffect({
                          id: `inbox_sim_${Date.now().toString(36)}`,
                          title: top.title,
                          body: "Local push simulation — open the request to approve with your security key.",
                          atMs: Date.now(),
                          kind: "approval",
                          reviewId: top.id,
                          unread: true,
                        })
                      );
                      setPushNote(
                        res.simulated
                          ? `Web simulated · open Notifications or /review/${top.id}`
                          : `Notification scheduled · ${res.notificationId}`
                      );
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
