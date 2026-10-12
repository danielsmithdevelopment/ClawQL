import { Effect } from "effect";
import { Redirect, Tabs, usePathname } from "expo-router";
import { useEffect, useState } from "react";

import { pendingReviewCountEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { brand } from "@/src/theme";
import { TabGlyph } from "@/src/ui/TabGlyph";
import { TabAndroidIcons } from "@/src/ui/tabIcons";

export default function TabLayout() {
  const { session, loading } = useSession();
  const [pending, setPending] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    if (!session) {
      setPending(0);
      return;
    }
    void Effect.runPromise(pendingReviewCountEffect(session))
      .then(setPending)
      .catch(() => setPending(0));
  }, [session, pathname]);

  if (!loading && !session) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: brand.surface },
        headerTintColor: brand.ink,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: brand.seed,
        tabBarInactiveTintColor: brand.inkFaint,
        tabBarStyle: {
          backgroundColor: brand.card,
          borderTopColor: brand.border,
        },
        // Keep inactive screens mounted but detach inactive native views when possible.
        lazy: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: "Home",
          tabBarIcon: ({ focused }) => (
            <TabGlyph
              ios="house.fill"
              androidXml={TabAndroidIcons.home as never}
              webIcon="home"
              focused={focused}
            />
          ),
          tabBarButtonTestID: "tab-home",
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: "Review",
          tabBarLabel: "Review",
          tabBarBadge: pending > 0 ? pending : undefined,
          tabBarBadgeStyle: {
            backgroundColor: brand.danger,
            color: "#fff",
            fontSize: 10,
          },
          tabBarIcon: ({ focused }) => (
            <TabGlyph
              ios="checklist"
              androidXml={TabAndroidIcons.review as never}
              webIcon="change"
              focused={focused}
            />
          ),
          tabBarButtonTestID: "tab-review",
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarLabel: "Activity",
          tabBarIcon: ({ focused }) => (
            <TabGlyph
              ios="clock.arrow.circlepath"
              androidXml={TabAndroidIcons.activity as never}
              webIcon="activity"
              focused={focused}
            />
          ),
          tabBarButtonTestID: "tab-activity",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarLabel: "Profile",
          tabBarIcon: ({ focused }) => (
            <TabGlyph
              ios="person.crop.circle.fill"
              androidXml={TabAndroidIcons.profile as never}
              webIcon="people"
              focused={focused}
            />
          ),
          tabBarButtonTestID: "tab-profile",
        }}
      />
    </Tabs>
  );
}
