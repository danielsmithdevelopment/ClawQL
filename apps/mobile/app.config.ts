import type { ExpoConfig, ConfigContext } from "expo/config";

const APP_SCHEME = "clawql";
const BUNDLE_ID = "com.clawql.app";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "ClawQL",
  slug: "clawql",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: APP_SCHEME,
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: false,
    bundleIdentifier: BUNDLE_ID,
    associatedDomains: ["applinks:cloud.clawql.com", "applinks:acme.cloud.clawql.com"],
    infoPlist: {
      NFCReaderUsageDescription:
        "ClawQL reads your security key over NFC to approve exact-change requests.",
      NSFaceIDUsageDescription: "ClawQL uses Face ID for the App Store reviewer demo org only.",
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
          NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
        },
      ],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyTracking: false,
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: "#0B1220",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: "https",
            host: "cloud.clawql.com",
            pathPrefix: "/app",
          },
          {
            scheme: "https",
            host: "acme.cloud.clawql.com",
            pathPrefix: "/app",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
    permissions: [
      "android.permission.NFC",
      "android.permission.USE_BIOMETRIC",
      "android.permission.POST_NOTIFICATIONS",
    ],
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-local-authentication",
      {
        faceIDPermission: "Allow ClawQL to use Face ID for the reviewer demo org.",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
        color: "#0B1220",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#0B1220",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? "00000000-0000-4000-8000-000000000001",
    },
    clawqlApiBase: process.env.EXPO_PUBLIC_CLAWQL_API_BASE ?? "https://cloud.clawql.com",
    clawqlAuthIssuer:
      process.env.EXPO_PUBLIC_CLAWQL_AUTH_ISSUER ?? "https://cloud.clawql.com",
    fixtureMode: process.env.EXPO_PUBLIC_CLAWQL_FIXTURE === "1",
    reviewerBiometricDemo: process.env.EXPO_PUBLIC_CLAWQL_REVIEWER_BIOMETRIC === "1",
  },
  owner: "clawql",
});
