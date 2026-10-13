import { vi } from "vitest";

vi.mock("expo-constants", () => ({
  default: {
    get expoConfig() {
      return {
        extra: {
          clawqlApiBase: "https://cloud.clawql.com",
          clawqlAuthIssuer: "https://cloud.clawql.com",
          fixtureMode: process.env.EXPO_PUBLIC_CLAWQL_FIXTURE !== "0",
          reviewerBiometricDemo: false,
        },
      };
    },
  },
}));

vi.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: async (k: string, v: string) => {
      store.set(k, v);
    },
    getItemAsync: async (k: string) => store.get(k) ?? null,
    deleteItemAsync: async (k: string) => {
      store.delete(k);
    },
  };
});

vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: async () => true,
  isEnrolledAsync: async () => true,
  supportedAuthenticationTypesAsync: async () => [2], // FACIAL_RECOGNITION
  authenticateAsync: async () => ({ success: true }),
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
}));

vi.mock("expo-haptics", () => ({
  notificationAsync: async () => undefined,
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: async (k: string) => {
        store.delete(k);
      },
    },
  };
});

vi.mock("expo-notifications", () => ({
  setNotificationHandler: () => undefined,
  getPermissionsAsync: async () => ({ status: "granted" }),
  requestPermissionsAsync: async () => ({ status: "granted" }),
  getExpoPushTokenAsync: async () => ({ data: "ExponentPushToken[test]" }),
  scheduleNotificationAsync: async () => "notif_fixture_1",
  getLastNotificationResponseAsync: async () => null,
  addNotificationResponseReceivedListener: () => ({ remove: () => undefined }),
  setBadgeCountAsync: async () => true,
  getBadgeCountAsync: async () => 0,
  SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
}));

vi.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: async () => ({ granted: true, status: "granted" }),
  requestMediaLibraryPermissionsAsync: async () => ({
    granted: true,
    status: "granted",
  }),
  launchCameraAsync: async () => ({
    canceled: false,
    assets: [
      {
        uri: "file:///tmp/scan-test.jpg",
        fileName: "scan-test.jpg",
        mimeType: "image/jpeg",
        fileSize: 12_340,
      },
    ],
  }),
  launchImageLibraryAsync: async () => ({
    canceled: false,
    assets: [
      {
        uri: "file:///tmp/library-test.jpg",
        fileName: "library-test.jpg",
        mimeType: "image/jpeg",
        fileSize: 9_876,
      },
    ],
  }),
}));

vi.mock("expo-linking", () => ({
  parse: (url: string) => {
    const u = new URL(url.includes("://") ? url : `https://x/${url}`);
    return {
      path: u.pathname.replace(/^\//, ""),
      queryParams: Object.fromEntries(u.searchParams.entries()),
    };
  },
}));

vi.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: () => undefined,
  openAuthSessionAsync: async () => ({ type: "dismiss" }),
  openBrowserAsync: async () => ({ type: "opened" }),
}));

vi.mock("expo-auth-session", () => ({
  makeRedirectUri: () => "clawql://auth/callback",
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Share: {
    share: async () => ({ action: "sharedAction" }),
  },
  AppState: {
    addEventListener: () => ({ remove: () => undefined }),
  },
}));
