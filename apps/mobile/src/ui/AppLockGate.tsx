/**
 * Full-screen unlock gate when Profile app-lock is on.
 * Fixture / web: one-tap unlock (no Face ID hardware required).
 */
import { Effect } from "effect";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  loadDevicePrefsEffect,
  unlockAppEffect,
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

  const refreshPref = useCallback(async () => {
    const prefs = await Effect.runPromise(loadDevicePrefsEffect()).catch(() => null);
    setAppLockOn(Boolean(prefs?.appLock));
    return Boolean(prefs?.appLock);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLocked(false);
      setAppLockOn(false);
      return;
    }
    void (async () => {
      const on = await refreshPref();
      if (on) setLocked(true);
    })();
  }, [enabled, refreshPref]);

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
    };
    // Profile "Lock now" — works on web demos where AppState never backgrounds.
    globalThis.addEventListener?.("clawql-app-lock-now", onLockNow);
    globalThis.addEventListener?.("clawql-device-prefs-changed", onPrefsChanged);
    return () => {
      sub.remove();
      globalThis.removeEventListener?.("clawql-app-lock-now", onLockNow);
      globalThis.removeEventListener?.("clawql-device-prefs-changed", onPrefsChanged);
    };
  }, [enabled, refreshPref]);

  const unlock = async () => {
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
  };

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
              <Subtitle>Unlock to approve with your security key.</Subtitle>
              <Meta>
                App Lock is on in Profile. Returning from the background requires unlock.
              </Meta>
              <PrimaryButton
                testID="app-lock-unlock"
                label={busy ? "Unlocking…" : "Unlock"}
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
