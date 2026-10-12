import { Effect } from "effect";
import { Redirect, Tabs, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";

import { pendingReviewCountEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { colors } from "@/src/theme";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: focused ? "700" : "500",
        color: focused ? colors.accent : colors.inkFaint,
      }}
    >
      {label}
    </Text>
  );
}

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
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarShowLabel: false,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} />,
          tabBarButtonTestID: "tab-home",
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: "Review",
          tabBarBadge: pending > 0 ? pending : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.danger,
            color: "#fff",
            fontSize: 10,
          },
          tabBarIcon: ({ focused }) => <TabIcon label="Review" focused={focused} />,
          tabBarButtonTestID: "tab-review",
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: "Activity",
          tabBarIcon: ({ focused }) => <TabIcon label="Activity" focused={focused} />,
          tabBarButtonTestID: "tab-activity",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => <TabIcon label="Profile" focused={focused} />,
          tabBarButtonTestID: "tab-profile",
        }}
      />
    </Tabs>
  );
}
