import Constants from "expo-constants";
import { Context, Effect, Layer } from "effect";

export type MobileConfig = {
  readonly apiBase: string;
  readonly authIssuer: string;
  readonly fixtureMode: boolean;
  readonly reviewerBiometricDemo: boolean;
  readonly appScheme: string;
  readonly consoleUrl: string;
};

function readExtra(): Record<string, unknown> {
  const extra = Constants.expoConfig?.extra ?? {};
  return extra as Record<string, unknown>;
}

export function loadMobileConfigEffect(): Effect.Effect<MobileConfig> {
  return Effect.sync(() => {
    const extra = readExtra();
    const apiBase =
      (typeof extra.clawqlApiBase === "string" && extra.clawqlApiBase) ||
      process.env.EXPO_PUBLIC_CLAWQL_API_BASE ||
      "https://cloud.clawql.com";
    const authIssuer =
      (typeof extra.clawqlAuthIssuer === "string" && extra.clawqlAuthIssuer) ||
      process.env.EXPO_PUBLIC_CLAWQL_AUTH_ISSUER ||
      apiBase;
    // Env wins when set: "0"/"false" forces live NFC path even if extra was baked true.
    const envFixture = process.env.EXPO_PUBLIC_CLAWQL_FIXTURE;
    const fixtureMode =
      envFixture === "0" || envFixture === "false"
        ? false
        : extra.fixtureMode === true || envFixture === "1";
    const envReviewer = process.env.EXPO_PUBLIC_CLAWQL_REVIEWER_BIOMETRIC;
    const reviewerBiometricDemo =
      envReviewer === "0" || envReviewer === "false"
        ? false
        : extra.reviewerBiometricDemo === true || envReviewer === "1";
    return {
      apiBase: apiBase.replace(/\/$/, ""),
      authIssuer: authIssuer.replace(/\/$/, ""),
      fixtureMode,
      reviewerBiometricDemo,
      appScheme: "clawql",
      consoleUrl: `${apiBase.replace(/\/$/, "")}/home`,
    };
  });
}

export const CLAWQL_MOBILE_CONFIG_TAG = "clawql/MobileConfig" as const;

export class MobileConfigService extends Context.Service<
  typeof CLAWQL_MOBILE_CONFIG_TAG,
  {
    readonly load: () => Effect.Effect<MobileConfig>;
  }
>()(CLAWQL_MOBILE_CONFIG_TAG) {}

export const MobileConfigLive = Layer.succeed(MobileConfigService, {
  load: loadMobileConfigEffect,
});
