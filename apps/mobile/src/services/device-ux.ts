/**
 * Phone-native UX — app lock, haptics, home-screen icon badge.
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

/**
 * Prompt for device biometrics (or fixture unlock on web / fixture mode).
 * Returns true when the user unlocked successfully.
 */
export function unlockAppEffect(): Effect.Effect<boolean, DeviceUxError> {
  return Effect.gen(function* () {
    const config = yield* loadMobileConfigEffect();
    if (config.fixtureMode || Platform.OS === "web") {
      return true;
    }
    const hasHardware = yield* Effect.tryPromise({
      try: () => LocalAuthentication.hasHardwareAsync(),
      catch: (cause) =>
        new DeviceUxError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });
    if (!hasHardware) {
      return yield* Effect.fail(new DeviceUxError({ reason: "biometric_unavailable" }));
    }
    const result = yield* Effect.tryPromise({
      try: () =>
        LocalAuthentication.authenticateAsync({
          promptMessage: "Unlock ClawQL",
          cancelLabel: "Cancel",
          disableDeviceFallback: false,
        }),
      catch: (cause) =>
        new DeviceUxError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    });
    return result.success === true;
  });
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
    readonly unlockApp: () => Effect.Effect<boolean, DeviceUxError>;
  }
>()(CLAWQL_DEVICE_UX_TAG) {}

export const MobileDeviceUxLive = Layer.succeed(MobileDeviceUx, {
  loadPrefs: loadDevicePrefsEffect,
  savePrefs: saveDevicePrefsEffect,
  hapticSuccess: hapticSuccessEffect,
  hapticError: hapticErrorEffect,
  syncIconBadge: syncIconBadgeEffect,
  unlockApp: unlockAppEffect,
});
