import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { Effect } from "effect";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { SessionProvider, useSession } from "@/src/state/SessionContext";
import {
  parseApprovalDeepLinkEffect,
  parseApprovalNotificationDataEffect,
} from "@/src/services/push";
import { brand } from "@/src/theme";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

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
      void Effect.runPromise(parseApprovalDeepLinkEffect(url)).then(openReview);
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
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: brand.surface },
        headerTintColor: brand.ink,
        contentStyle: { backgroundColor: brand.surface },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="review/[id]" options={{ title: "Request" }} />
    </Stack>
  );
}
