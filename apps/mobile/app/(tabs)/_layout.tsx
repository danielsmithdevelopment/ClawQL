import { Effect } from "effect";
import { Redirect, Tabs, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { SymbolView } from "expo-symbols";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { pendingReviewCountEffect } from "@/src/services/api";
import { useSession } from "@/src/state/SessionContext";
import { brand } from "@/src/theme";

function TabGlyph({
  ios,
  android,
  focused,
}: {
  ios: string;
  android: keyof typeof MaterialIcons.glyphMap;
  focused: boolean;
}) {
  const color = focused ? brand.seed : brand.inkFaint;
  if (Platform.OS === "ios") {
    return (
      <SymbolView
        name={ios as never}
        size={22}
        tintColor={color}
        weight={focused ? "semibold" : "regular"}
      />
    );
  }
  return <MaterialIcons name={android} size={22} color={color} />;
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
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: "Home",
          tabBarIcon: ({ focused }) => (
            <TabGlyph ios="house.fill" android="home" focused={focused} />
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
            <TabGlyph ios="checklist" android="rate-review" focused={focused} />
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
            <TabGlyph ios="clock.arrow.circlepath" android="history" focused={focused} />
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
            <TabGlyph ios="person.crop.circle.fill" android="person" focused={focused} />
          ),
          tabBarButtonTestID: "tab-profile",
        }}
      />
    </Tabs>
  );
}
