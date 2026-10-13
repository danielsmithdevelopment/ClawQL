import { Stack, useRouter, type Href } from "expo-router";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { Effect } from "effect";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { SessionProvider, useSession } from "@/src/state/SessionContext";
import {
  hrefForDeepLink,
  parseAppDeepLinkEffect,
  parseApprovalNotificationDataEffect,
} from "@/src/services/push";
import { color } from "@/src/theme";
import { AppLockGate } from "@/src/ui/AppLockGate";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

/**
 * No custom font gate — system UI + system monospace keep first paint unblocked
 * (RN perf playbook: don't stall splash on remote/local font loads).
 */
export default function RootLayout() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </SessionProvider>
  );
}

function RootNavigator() {
  const { session, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    const openReview = (id: string | null) => {
      if (id) router.push(`/review/${id}`);
    };
    const handleUrl = (url: string) => {
      void Effect.runPromise(parseAppDeepLinkEffect(url)).then((target) => {
        if (!target) return;
        router.push(hrefForDeepLink(target) as Href);
      });
    };
    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    void Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    const notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
      void Effect.runPromise(
        parseApprovalNotificationDataEffect(response.notification.request.content.data)
      ).then(openReview);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      void Effect.runPromise(
        parseApprovalNotificationDataEffect(response.notification.request.content.data)
      ).then(openReview);
    });

    return () => {
      sub.remove();
      notifSub.remove();
    };
  }, [router]);

  // Keep session/loading referenced so auth changes remount navigation options.
  void session;
  void loading;

  return (
    <AppLockGate enabled={Boolean(session) && !loading}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: color.surface },
          headerTintColor: color.onSurface,
          contentStyle: { backgroundColor: color.surface },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="review/[id]" options={{ title: "Request" }} />
        <Stack.Screen name="policies/index" options={{ title: "Policies" }} />
        <Stack.Screen name="policies/[id]" options={{ title: "Policy" }} />
        <Stack.Screen name="spend" options={{ title: "Spend" }} />
        <Stack.Screen name="agents" options={{ title: "Agents" }} />
        <Stack.Screen name="digest" options={{ title: "Morning digest" }} />
        <Stack.Screen name="teammates" options={{ title: "Team" }} />
        <Stack.Screen name="inbox" options={{ title: "Notifications" }} />
      </Stack>
    </AppLockGate>
  );
}
