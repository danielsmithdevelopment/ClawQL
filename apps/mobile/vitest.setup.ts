import { vi } from "vitest";

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        clawqlApiBase: "https://cloud.clawql.com",
        clawqlAuthIssuer: "https://cloud.clawql.com",
        fixtureMode: true,
        reviewerBiometricDemo: false,
      },
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
  hasHardwareAsync: async () => false,
  authenticateAsync: async () => ({ success: true }),
}));

vi.mock("expo-notifications", () => ({
  setNotificationHandler: () => undefined,
  getPermissionsAsync: async () => ({ status: "granted" }),
  requestPermissionsAsync: async () => ({ status: "granted" }),
  getExpoPushTokenAsync: async () => ({ data: "ExponentPushToken[test]" }),
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
}));
