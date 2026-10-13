/**
 * Phone-native UX — app lock, haptics, home-screen icon badge, Face ID / Touch ID.
 * Fixture / web: biometrics unlock with a one-tap fixture path (no Face ID hardware).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { Context, Data, Effect, Layer } from "effect";
import { Platform } from "react-native";

import type { DevicePrefs } from "../domain/schemas";
import { FIXTURE_DEVICE_PREFS } from "../domain/fixtures";
import { loadMobileConfigEffect } from "./config";

const PREFS_KEY = "clawql.mobile.devicePrefs.v1";

export class DeviceUxError extends Data.TaggedError("DeviceUxError")<{
  readonly reason: string;
}> {}

/** Preferred unlock label for the current device (Face ID, Touch ID, …). */
export type BiometricKind = "face" | "fingerprint" | "iris" | "none";

export type BiometricCapability = {
  readonly available: boolean;
  readonly enrolled: boolean;
  readonly kind: BiometricKind;
  /** Short UI label — "Face ID", "Touch ID", "Fingerprint", "Biometrics". */
  readonly label: string;
  /** Fixture / web always reports a synthetic Face ID capability for demos. */
  readonly fixture: boolean;
};

export function loadDevicePrefsEffect(): Effect.Effect<DevicePrefs, DeviceUxError> {
  return Effect.tryPromise({
    try: async () => {
      const raw = await AsyncStorage.getItem(PREFS_KEY);
      if (!raw) return { ...FIXTURE_DEVICE_PREFS };
      const parsed = JSON.parse(raw) as Partial<DevicePrefs>;
      return {
        appLock: Boolean(parsed.appLock),
        haptics: parsed.haptics !== false,
        iconBadge: parsed.iconBadge !== false,
      };
    },
    catch: (cause) =>
      new DeviceUxError({
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
  });
}

export function saveDevicePrefsEffect(
  prefs: DevicePrefs
): Effect.Effect<DevicePrefs, DeviceUxError> {
  return Effect.tryPromise({
    try: async () => {
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      return prefs;
    },
    catch: (cause) =>
      new DeviceUxError({
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
  });
}

export function hapticSuccessEffect(): Effect.Effect<void> {
  return Effect.gen(function* () {
    const prefs = yield* loadDevicePrefsEffect().pipe(
      Effect.catch(() => Effect.succeed({ ...FIXTURE_DEVICE_PREFS }))
    );
    if (!prefs.haptics || Platform.OS === "web") return;
    yield* Effect.tryPromise({
      try: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      catch: () => new DeviceUxError({ reason: "haptic_failed" }),
    }).pipe(Effect.catch(() => Effect.void));
  });
}

export function hapticErrorEffect(): Effect.Effect<void> {
  return Effect.gen(function* () {
    const prefs = yield* loadDevicePrefsEffect().pipe(
      Effect.catch(() => Effect.succeed({ ...FIXTURE_DEVICE_PREFS }))
    );
    if (!prefs.haptics || Platform.OS === "web") return;
    yield* Effect.tryPromise({
      try: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
      catch: () => new DeviceUxError({ reason: "haptic_failed" }),
    }).pipe(Effect.catch(() => Effect.void));
  });
}

export function hapticWarningEffect(): Effect.Effect<void> {
  return Effect.gen(function* () {
    const prefs = yield* loadDevicePrefsEffect().pipe(
      Effect.catch(() => Effect.succeed({ ...FIXTURE_DEVICE_PREFS }))
    );
    if (!prefs.haptics || Platform.OS === "web") return;
    yield* Effect.tryPromise({
      try: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
      catch: () => new DeviceUxError({ reason: "haptic_failed" }),
    }).pipe(Effect.catch(() => Effect.void));
  });
}

/** Sync iOS/Android home-screen badge with pending review count. */
export function syncIconBadgeEffect(pendingCount: number): Effect.Effect<void> {
  return Effect.gen(function* () {
    const prefs = yield* loadDevicePrefsEffect().pipe(
      Effect.catch(() => Effect.succeed({ ...FIXTURE_DEVICE_PREFS }))
    );
    if (!prefs.iconBadge || Platform.OS === "web") return;
    const n = Math.max(0, Math.floor(pendingCount));
    yield* Effect.tryPromise({
      try: () => Notifications.setBadgeCountAsync(n),
      catch: () => new DeviceUxError({ reason: "badge_failed" }),
    }).pipe(Effect.catch(() => Effect.void));
  });
}

export function clearIconBadgeEffect(): Effect.Effect<void> {
  return syncIconBadgeEffect(0);
}

function kindFromTypes(types: readonly LocalAuthentication.AuthenticationType[]): BiometricKind {
  // expo: FACIAL_RECOGNITION = 2, FINGERPRINT = 1, IRIS = 3 (numeric enums).
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "face";
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "fingerprint";
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return "iris";
  return "none";
}

function labelForKind(kind: BiometricKind, os: string): string {
  if (kind === "face") return os === "ios" ? "Face ID" : "Face unlock";
  if (kind === "fingerprint") return os === "ios" ? "Touch ID" : "Fingerprint";
  if (kind === "iris") return "Iris";
  return "Biometrics";
}

/** Probe Face ID / Touch ID / fingerprint availability for Profile + App Lock copy. */
export function biometricCapabilityEffect(): Effect.Effect<BiometricCapability, DeviceUxError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (config.fixtureMode || Platform.OS === "web") {
      return {
        available: true,
        enrolled: true,
        kind: "face" as const,
        label: Platform.OS === "android" ? "Face unlock" : "Face ID",
        fixture: true,
      };
    }
    const hasHardware = yield* Effect.tryPromise({
      try: () => LocalAuthentication.hasHardwareAsync(),
      catch: (cause) =>
        new DeviceUxError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });
    const enrolled = yield* Effect.tryPromise({
      try: () => LocalAuthentication.isEnrolledAsync(),
      catch: (cause) =>
        new DeviceUxError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });
    const types = yield* Effect.tryPromise({
      try: () => LocalAuthentication.supportedAuthenticationTypesAsync(),
      catch: (cause) =>
        new DeviceUxError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });
    const kind = kindFromTypes(types);
    return {
      available: hasHardware,
      enrolled,
      kind,
      label: labelForKind(kind, Platform.OS),
      fixture: false,
    };
  });
}

/**
 * Prompt for device biometrics (or fixture unlock on web / fixture mode).
 * Returns true when the user unlocked successfully.
 */
export function unlockAppEffect(promptMessage?: string): Effect.Effect<boolean, DeviceUxError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    const cap = yield* biometricCapabilityEffect();
    if (config.fixtureMode || Platform.OS === "web") {
      return true;
    }
    if (!cap.available || !cap.enrolled) {
      return yield* Effect.fail(new DeviceUxError({ reason: "biometric_unavailable" }));
    }
    const message =
      promptMessage ??
      (cap.kind === "face"
        ? "Unlock with Face ID"
        : cap.kind === "fingerprint"
          ? Platform.OS === "ios"
            ? "Unlock with Touch ID"
            : "Unlock with fingerprint"
          : "Unlock ClawQL");
    const result = yield* Effect.tryPromise({
      try: () =>
        LocalAuthentication.authenticateAsync({
          promptMessage: message,
          cancelLabel: "Cancel",
          disableDeviceFallback: false,
          biometricsSecurityLevel: "strong",
        }),
      catch: (cause) =>
        new DeviceUxError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });
    return result.success === true;
  });
}

/** Confirm a sensitive action (subscribe, restore) with Face ID / Touch ID. */
export function confirmWithBiometricsEffect(
  purpose: string
): Effect.Effect<boolean, DeviceUxError> {
  return unlockAppEffect(purpose);
}

export const CLAWQL_DEVICE_UX_TAG = "clawql/MobileDeviceUx" as const;

export class MobileDeviceUx extends Context.Service<
  typeof CLAWQL_DEVICE_UX_TAG,
  {
    readonly loadPrefs: () => Effect.Effect<DevicePrefs, DeviceUxError>;
    readonly savePrefs: (prefs: DevicePrefs) => Effect.Effect<DevicePrefs, DeviceUxError>;
    readonly hapticSuccess: () => Effect.Effect<void>;
    readonly hapticError: () => Effect.Effect<void>;
    readonly syncIconBadge: (pendingCount: number) => Effect.Effect<void>;
    readonly unlockApp: (promptMessage?: string) => Effect.Effect<boolean, DeviceUxError>;
    readonly biometricCapability: () => Effect.Effect<BiometricCapability, DeviceUxError>;
    readonly confirmWithBiometrics: (purpose: string) => Effect.Effect<boolean, DeviceUxError>;
  }
>()(CLAWQL_DEVICE_UX_TAG) {}

export const MobileDeviceUxLive = Layer.succeed(MobileDeviceUx, {
  loadPrefs: loadDevicePrefsEffect,
  savePrefs: saveDevicePrefsEffect,
  hapticSuccess: hapticSuccessEffect,
  hapticError: hapticErrorEffect,
  syncIconBadge: syncIconBadgeEffect,
  unlockApp: unlockAppEffect,
  biometricCapability: biometricCapabilityEffect,
  confirmWithBiometrics: confirmWithBiometricsEffect,
});
