/**
 * Full-screen unlock gate when Profile app-lock is on.
 * Native: Face ID / Touch ID / fingerprint via expo-local-authentication.
 * Fixture / web: one-tap unlock (no Face ID hardware required).
 */
import { Effect } from "effect";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  biometricCapabilityEffect,
  loadDevicePrefsEffect,
  unlockAppEffect,
  type BiometricCapability,
} from "@/src/services/device-ux";
import { brand, color, space } from "@/src/theme";
import {
  Column,
  Fill,
  IconBubble,
  Meta,
  PrimaryButton,
  ScreenHost,
  Subtitle,
  Title,
} from "@/src/ui/primitives";

export function AppLockGate({
  enabled,
  children,
}: {
  /** When false, never gate (signed out). */
  enabled: boolean;
  children: ReactNode;
}) {
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appLockOn, setAppLockOn] = useState(false);
  const [bio, setBio] = useState<BiometricCapability | null>(null);

  const refreshPref = useCallback(async () => {
    const prefs = await Effect.runPromise(loadDevicePrefsEffect()).catch(() => null);
    setAppLockOn(Boolean(prefs?.appLock));
    return Boolean(prefs?.appLock);
  }, []);

  const refreshBio = useCallback(async () => {
    const cap = await Effect.runPromise(biometricCapabilityEffect()).catch(() => null);
    setBio(cap);
    return cap;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      setAppLockOn(false);
      return;
    }
    void (async () => {
      const on = await refreshPref();
      await refreshBio();
      if (on) setLocked(true);
    })();
  }, [enabled, refreshPref, refreshBio]);

  useEffect(() => {
    if (!enabled) return;
    const onChange = (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        void refreshPref().then((on) => {
          if (on) {
            setLocked(true);
            setError(null);
          }
        });
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    const onLockNow = () => {
      void refreshPref().then((on) => {
        if (on) {
          setLocked(true);
          setError(null);
        }
      });
    };
    const onPrefsChanged = () => {
      void refreshPref();
      void refreshBio();
    };
    // Profile "Lock now" — works on web demos where AppState never backgrounds.
    globalThis.addEventListener?.("clawql-app-lock-now", onLockNow);
    globalThis.addEventListener?.("clawql-device-prefs-changed", onPrefsChanged);
    return () => {
      sub.remove();
      globalThis.removeEventListener?.("clawql-app-lock-now", onLockNow);
      globalThis.removeEventListener?.("clawql-device-prefs-changed", onPrefsChanged);
    };
  }, [enabled, refreshPref, refreshBio]);

  const unlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await Effect.runPromise(unlockAppEffect());
      if (ok) setLocked(false);
      else setError("Unlock cancelled");
    } catch (e: unknown) {
      setError(
        e && typeof e === "object" && "reason" in e
          ? String((e as { reason: string }).reason)
          : e instanceof Error
            ? e.message
            : String(e)
      );
    } finally {
      setBusy(false);
    }
  }, []);

  // Auto-prompt Face ID / Touch ID when the lock screen appears (native + enrolled).
  useEffect(() => {
    if (!(enabled && appLockOn && locked) || busy) return;
    if (!bio || bio.fixture || !bio.available || !bio.enrolled) return;
    void unlock();
    // Only when we first become locked with known bio capability.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot on lock
  }, [enabled, appLockOn, locked, bio?.available, bio?.enrolled, bio?.fixture]);

  const unlockLabel = bio?.label
    ? busy
      ? `Unlocking with ${bio.label}…`
      : `Unlock with ${bio.label}`
    : busy
      ? "Unlocking…"
      : "Unlock";

  // Keep children mounted under the gate so unlock restores the same screen
  // (unmounting the Stack would drop Profile / Review navigation state).
  return (
    <>
      {children}
      {enabled && appLockOn && locked ? (
        <Fill
          testID="app-lock-screen"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            backgroundColor: color.surface,
            justifyContent: "center",
            padding: space.lg,
          }}
        >
          <ScreenHost>
            <Column spacing={space.md}>
              <IconBubble name="key" tone="seed" size={56} iconSize={28} />
              <Title>ClawQL is locked</Title>
              <Subtitle>
                {bio?.label
                  ? `Use ${bio.label} to approve with your security key.`
                  : "Unlock to approve with your security key."}
              </Subtitle>
              <Meta testID="app-lock-bio-meta">
                {bio?.fixture
                  ? "Fixture mode — one-tap unlock stands in for Face ID / Touch ID."
                  : bio?.available && bio.enrolled
                    ? `App Lock uses ${bio.label} when you leave and come back.`
                    : "App Lock is on. Enroll Face ID or Touch ID in system settings for biometric unlock."}
              </Meta>
              <PrimaryButton
                testID="app-lock-unlock"
                label={unlockLabel}
                disabled={busy}
                onPress={() => void unlock()}
              />
              {error ? (
                <Meta testID="app-lock-error" color={brand.danger}>
                  {error}
                </Meta>
              ) : null}
            </Column>
          </ScreenHost>
        </Fill>
      ) : null}
    </>
  );
}
