import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";

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
          tabBarIcon: ({ focused }) => <TabIcon label="Review" focused={focused} />,
          tabBarButtonTestID: "tab-review",
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
