import { vi } from "vitest";

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

vi.mock("expo-modules-core", () => ({
  requireNativeModule: () => {
    throw new Error("native module unavailable in vitest");
  },
  NativeModule: class {},
  Platform: { OS: "ios" },
  UnavailabilityError: class UnavailabilityError extends Error {},
}));

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
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
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

vi.mock("expo-speech", () => ({
  speak: (_text: string, opts?: { onDone?: () => void }) => {
    opts?.onDone?.();
  },
  stop: () => undefined,
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
      multiRemove: async (keys: string[]) => {
        for (const k of keys) store.delete(k);
      },
    },
  };
});

vi.mock("expo-clipboard", () => {
  let value = "";
  return {
    setStringAsync: async (text: string) => {
      value = text;
      return true;
    },
    getStringAsync: async () => value,
  };
});

vi.mock("expo-file-system", () => {
  const files = new Map<string, string>();
  class Directory {
    constructor(..._parts: unknown[]) {}
  }
  class File {
    readonly uri: string;
    constructor(...parts: unknown[]) {
      const name = String(parts[parts.length - 1] ?? "file");
      this.uri = `file:///cache/${name}`;
    }
    get exists() {
      return files.has(this.uri);
    }
    create() {
      if (!files.has(this.uri)) files.set(this.uri, "");
    }
    write(content: string) {
      files.set(this.uri, content);
    }
    async text() {
      return files.get(this.uri) ?? "";
    }
    delete() {
      files.delete(this.uri);
    }
  }
  return {
    File,
    Paths: { cache: new Directory("cache") },
  };
});

vi.mock("../../modules/clawql-secure-clipboard/src", () => ({
  setSecretLocalOnly: async () => false,
  excludePathFromBackup: async () => true,
  isSecureClipboardAvailable: async () => false,
  getSecureClipboardNative: () => null,
}));

vi.mock("@/modules/clawql-secure-clipboard/src", () => ({
  setSecretLocalOnly: async () => false,
  excludePathFromBackup: async () => true,
  isSecureClipboardAvailable: async () => false,
  getSecureClipboardNative: () => null,
}));

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
