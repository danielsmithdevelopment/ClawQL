import { Effect } from "effect";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import type { HomeSpend, ManagedUsage } from "@/src/domain/schemas";
import { getHomeSpendEffect, getManagedUsageEffect } from "@/src/services/api";
import { loadEntitlementsEffect, type MobileEntitlements } from "@/src/services/entitlements";
import { loadReleasePolicyEffect } from "@/src/services/release-policy";
import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
  Badge,
  Body,
  Column,
  IconBubble,
  LoadingBlock,
  Meta,
  PrimaryButton,
  ScreenHost,
  ScreenScroll,
  SecondaryButton,
  SectionHeader,
  Subtitle,
  SurfaceCard,
  Title,
} from "@/src/ui/primitives";

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export default function SpendScreen() {
  const { session } = useSession();
  const router = useRouter();
  const [spend, setSpend] = useState<HomeSpend | null>(null);
  const [usage, setUsage] = useState<ManagedUsage | null>(null);
  const [entitlements, setEntitlements] = useState<MobileEntitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCommerce, setShowCommerce] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [s, u, ent, policy] = await Promise.all([
        Effect.runPromise(getHomeSpendEffect(session)),
        Effect.runPromise(getManagedUsageEffect(session)),
        Effect.runPromise(loadEntitlementsEffect()),
        Effect.runPromise(loadReleasePolicyEffect()),
      ]);
      setSpend(s);
      setUsage(u);
      setEntitlements(ent);
      setShowCommerce(policy.allowsInAppCommerce);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session || loading || !spend) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  const monthPct =
    usage && usage.monthBudget > 0
      ? Math.round((usage.monthSpent / usage.monthBudget) * 100)
      : null;

  return (
    <ScreenScroll
      testID="spend-screen"
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        try {
          await load();
        } finally {
          setRefreshing(false);
        }
      }}
    >
      <SectionHeader icon="spend" title={spend.label} subtitle={spend.note} />
      <SurfaceCard tint="seed" elevated>
        <Title testID="spend-amount">{spend.amount}</Title>
        {spend.budget ? <Meta>{`Budget ${spend.budget}`}</Meta> : null}
        {entitlements ? (
          <Meta testID="spend-plan-label">
            {showCommerce
              ? `Plan · ${entitlements.planLabel} (${entitlements.billingMode})`
              : `Plan · ${entitlements.planLabel}`}
          </Meta>
        ) : null}
      </SurfaceCard>

      {usage ? (
        <SurfaceCard testID="spend-usage-month" tint="soft">
          <Subtitle>This month</Subtitle>
          <Title testID="spend-month-amount">{money(usage.monthSpent)}</Title>
          <Meta testID="spend-month-budget">
            {`${money(usage.monthBudget)} budget${monthPct != null ? ` · ${monthPct}%` : ""}`}
          </Meta>
          <Meta testID="spend-forecast">{`Forecast ${money(usage.forecast)}`}</Meta>
          <Body color={brand.inkMuted}>{usage.forecastNote}</Body>
          <Meta testID="spend-usage-source" color={brand.inkFaint}>
            {`Usage source · ${usage.source} · ${usage.planRenews}`}
          </Meta>
        </SurfaceCard>
      ) : null}

      <SurfaceCard testID="spend-plan-readonly" tint="soft">
        <Subtitle>Plan</Subtitle>
        <Meta testID="spend-plan-readonly-note">
          {showCommerce
            ? "Demo build — sandbox subscribe lives on Profile. Store builds show plan status only."
            : "Plan status is shown for reference. This app does not sell subscriptions or upgrades."}
        </Meta>
        {showCommerce && entitlements?.planId === "free" ? (
          <Meta testID="spend-upgrade-cta" color={brand.inkFaint}>
            Demo sandbox: open Profile to exercise Subscribe Pro / Team.
          </Meta>
        ) : null}
        <PrimaryButton
          testID="spend-open-plan-billing"
          label="View plan status"
          onPress={() => router.push("/(tabs)/profile")}
        />
      </SurfaceCard>

      <SurfaceCard testID="spend-by-agent">
        <Subtitle>{usage ? "By team" : "By agent"}</Subtitle>
        <Column spacing={space.sm}>
          {(spend.lines ?? []).map((line) => (
            <Column key={line.agent} spacing={4} testID={`spend-line-${line.agent}`}>
              <Column spacing={space.sm}>
                <IconBubble name="agents" tone="seed" size={28} iconSize={14} />
                <Body>{`${line.agent} · ${line.amount}`}</Body>
                <Meta>{line.note}</Meta>
              </Column>
            </Column>
          ))}
        </Column>
      </SurfaceCard>

      {usage ? (
        <SurfaceCard testID="spend-team-rows">
          <Subtitle>Team budgets</Subtitle>
          <Column spacing={space.sm}>
            {usage.teamRows.map((row) => (
              <Column key={row.team} spacing={4} testID={`spend-team-${row.team}`}>
                <Body>{`${row.team} · ${money(row.spent)} / ${money(row.budget)}`}</Body>
                <Meta>{`${row.requests.toLocaleString()} requests · ${row.toolCalls.toLocaleString()} tool calls`}</Meta>
                {row.alert ? <Badge label={row.alert} tone="warn" /> : null}
              </Column>
            ))}
          </Column>
        </SurfaceCard>
      ) : null}

      <Meta color={brand.inkFaint}>
        Caps and invoices deepen here from /api/managed/usage. Phone shows today plus month
        forecast and team budgets.
      </Meta>
      <SecondaryButton label="Back to Home" onPress={() => router.replace("/(tabs)")} />
    </ScreenScroll>
  );
}
