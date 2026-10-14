import { Effect } from "effect";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Linking, Platform } from "react-native";

import type {
  ConnectedApp,
  DevicePrefs,
  DeviceSession,
  NotificationPrefs,
  PushDevice,
  SecurityKey,
} from "@/src/domain/schemas";
import {
  clearPushDevicesEffect,
  deleteAccountEffect,
  endOtherDeviceSessionsEffect,
  getNotificationPrefsEffect,
  listConnectedAppsEffect,
  listDeviceSessionsEffect,
  listPushDevicesEffect,
  listSecurityKeysEffect,
  openBillingPortalEffect,
  revokeConnectedAppEffect,
  setNotificationPrefsEffect,
} from "@/src/services/api";
import { loadMobileConfigEffect } from "@/src/services/config";
import {
  biometricCapabilityEffect,
  confirmWithBiometricsEffect,
  loadDevicePrefsEffect,
  saveDevicePrefsEffect,
  type BiometricCapability,
} from "@/src/services/device-ux";
import {
  loadEntitlementsEffect,
  type MobileEntitlements,
} from "@/src/services/entitlements";
import {
  openManageSubscriptionsEffect,
  purchaseStorePlanEffect,
  restoreStorePurchasesEffect,
} from "@/src/services/store-iap";
import { registerForPushEffect } from "@/src/services/push";
import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
  Badge,
  Body,
  Column,
  FieldGroup,
  IconBubble,
  LoadingBlock,
  Meta,
  PrefRow,
  PrimaryButton,
  ScreenHost,
  ScreenScroll,
  SecondaryButton,
  SectionHeader,
  Subtitle,
  SurfaceCard,
} from "@/src/ui/primitives";

export default function ProfileScreen() {
  const { session, signOut, refreshSession } = useSession();
  const router = useRouter();
  const [keys, setKeys] = useState<readonly SecurityKey[]>([]);
  const [apps, setApps] = useState<readonly ConnectedApp[]>([]);
  const [deviceSessions, setDeviceSessions] = useState<readonly DeviceSession[]>([]);
  const [pushDevices, setPushDevices] = useState<readonly PushDevice[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [devicePrefs, setDevicePrefs] = useState<DevicePrefs | null>(null);
  const [entitlements, setEntitlements] = useState<MobileEntitlements | null>(null);
  const [bio, setBio] = useState<BiometricCapability | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalNote, setPortalNote] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [k, a, p, s, d, dp, ent, cap] = await Promise.all([
        Effect.runPromise(listSecurityKeysEffect(session)),
        Effect.runPromise(listConnectedAppsEffect(session)),
        Effect.runPromise(getNotificationPrefsEffect(session)),
        Effect.runPromise(listDeviceSessionsEffect(session)),
        Effect.runPromise(listPushDevicesEffect(session)),
        Effect.runPromise(loadDevicePrefsEffect()),
        Effect.runPromise(loadEntitlementsEffect()),
        Effect.runPromise(biometricCapabilityEffect()),
      ]);
      setKeys(k);
      setApps(a);
      setPrefs(p);
      setDeviceSessions(s);
      setPushDevices(d);
      setDevicePrefs(dp);
      setEntitlements(ent);
      setBio(cap);
    } finally {
      setLoading(false);
      setHydrated(true);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!session || (loading && !hydrated) || !prefs || !devicePrefs || !entitlements) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  const bioLabel = bio?.label ?? "Face ID / Touch ID";
  const appLockHelp = bio?.fixture
    ? `Require ${bioLabel} when you leave and come back. Fixture mode uses a one-tap unlock that stands in for ${bioLabel}.`
    : `Require ${bioLabel} when you leave and come back.`;

  const onSubscribeSandbox = (planId: "pro" | "team") => {
    void (async () => {
      setBusy(true);
      setNote(null);
      try {
        const ok = await Effect.runPromise(
          confirmWithBiometricsEffect(`Confirm ${planId === "pro" ? "Pro" : "Team"} with ${bioLabel}`)
        );
        if (!ok) {
          setNote("Subscribe cancelled");
          return;
        }
        const next = await Effect.runPromise(purchaseStorePlanEffect(planId));
        setEntitlements(next);
        setNote(
          `Subscribed to ${next.planLabel} (fixture store_iap · ${next.productId ?? "sandbox"})`
        );
      } catch (e: unknown) {
        setNote(
          e && typeof e === "object" && "reason" in e
            ? String((e as { reason: string }).reason)
            : e instanceof Error
              ? e.message
              : String(e)
        );
      } finally {
        setBusy(false);
      }
    })();
  };

  const onRestorePurchases = () => {
    void (async () => {
      setBusy(true);
      setNote(null);
      try {
        const ok = await Effect.runPromise(
          confirmWithBiometricsEffect(`Restore purchases with ${bioLabel}`)
        );
        if (!ok) {
          setNote("Restore cancelled");
          return;
        }
        const next = await Effect.runPromise(restoreStorePurchasesEffect());
        setEntitlements(next);
        setNote(
          next.planId === "free"
            ? "No purchases to restore"
            : `Restored ${next.planLabel} (${next.billingMode})`
        );
      } catch (e: unknown) {
        setNote(
          e && typeof e === "object" && "reason" in e
            ? String((e as { reason: string }).reason)
            : e instanceof Error
              ? e.message
              : String(e)
        );
      } finally {
        setBusy(false);
      }
    })();
  };

  const openConsole = async () => {
    const config = await Effect.runPromise(loadMobileConfigEffect());
    await WebBrowser.openBrowserAsync(config.consoleUrl);
  };

  const onRevoke = (clientId: string) => {
    Alert.alert("Revoke connected app?", "The app will need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await Effect.runPromise(revokeConnectedAppEffect({ session, clientId }));
              setNote(`Revoked ${clientId}`);
              await load();
            } catch (e: unknown) {
              setNote(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const onDeleteAccount = () => {
    Alert.alert(
      "Delete your account?",
      "This runs the full cascade: keys → org → Stripe → vault → auth. It cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                const res = await Effect.runPromise(deleteAccountEffect(session));
                setNote(res.message ?? `Deletion ${res.status ?? "started"}`);
                await signOut();
                router.replace("/sign-in");
              } catch (e: unknown) {
                setNote(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  };

  return (
    <ScreenScroll
      testID="profile-screen"
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        try {
          await load();
        } finally {
          setRefreshing(false);
        }
      }}
    >
      <SectionHeader
        icon="people"
        title={session.displayName}
        subtitle={`${session.email} · ${session.role}${session.reviewerDemo ? " · reviewer demo" : ""}`}
      />

      <SurfaceCard testID="profile-security-keys">
        <IconBubble name="key" tone="seed" size={32} iconSize={16} />
        <Subtitle>Your security keys</Subtitle>
        <Meta>You need two keys that can approve.</Meta>
        <Meta testID="profile-keys-honesty" color={brand.inkFaint}>
          Hardware security keys on this phone. Gateway API keys are under Cloud
          console on phone → API keys.
        </Meta>
        {keys.map((key) => (
          <Column key={key.id} spacing={4} testID="profile-security-key">
            <Body>{key.name}</Body>
            <Badge label={key.badge} tone={key.canApprove ? "ok" : "neutral"} />
            <Meta>{key.detail}</Meta>
          </Column>
        ))}
      </SurfaceCard>

      <SurfaceCard testID="profile-sessions">
        <IconBubble name="sessions" tone="seed" size={32} iconSize={16} />
        <Subtitle>Where you are signed in</Subtitle>
        <Meta>End other sessions if a device is lost or shared.</Meta>
        <Meta testID="profile-session-expiry">
          {`This device access expires ${new Date(session.expiresAtMs).toLocaleString()}`}
        </Meta>
        <SecondaryButton
          testID="profile-refresh-session"
          label={busy ? "Working…" : "Refresh session"}
          disabled={busy}
          onPress={() => {
            void (async () => {
              setBusy(true);
              try {
                const next = await refreshSession();
                setNote(
                  next
                    ? `Session refreshed · expires ${new Date(next.expiresAtMs).toLocaleString()}`
                    : "Session expired — sign in again"
                );
                if (!next) {
                  router.replace("/sign-in");
                  return;
                }
                await load();
              } catch (e: unknown) {
                setNote(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            })();
          }}
        />
        {deviceSessions.map((row) => (
          <Column key={row.id} spacing={2} testID={`device-session-${row.id}`}>
            <Body>{`${row.device}${row.current ? " · this device" : ""}`}</Body>
            <Meta>{`${row.path} · ${row.lastActive}`}</Meta>
          </Column>
        ))}
        {deviceSessions.filter((s) => !s.current).length > 0 ? (
          <SecondaryButton
            testID="profile-end-other-sessions"
            label={busy ? "Working…" : "Sign out everywhere else"}
            disabled={busy}
            onPress={() => {
              void (async () => {
                setBusy(true);
                try {
                  const res = await Effect.runPromise(endOtherDeviceSessionsEffect(session));
                  setNote(`Ended ${res.ended} other session${res.ended === 1 ? "" : "s"}`);
                  await load();
                } catch (e: unknown) {
                  setNote(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              })();
            }}
          />
        ) : (
          <Meta testID="profile-sessions-only-this">Only this device is signed in.</Meta>
        )}
      </SurfaceCard>

      <SurfaceCard testID="profile-connected-apps">
        <Subtitle>Connected apps</Subtitle>
        <Meta>Revoke access for agents and IDEs.</Meta>
        {apps.map((app) => (
          <Column key={app.clientId} spacing={space.sm} testID={`connected-app-${app.clientId}`}>
            <Body>{app.name}</Body>
            <Meta>{`${app.scopes.join(", ")} · ${app.lastUsed}`}</Meta>
            <SecondaryButton
              testID={`revoke-${app.clientId}`}
              label="Revoke"
              disabled={busy}
              onPress={() => onRevoke(app.clientId)}
            />
          </Column>
        ))}
        {apps.length === 0 ? (
          <Meta testID="connected-apps-empty">No connected apps.</Meta>
        ) : null}
      </SurfaceCard>

      <FieldGroup>
        <FieldGroup.Section title="On this phone">
          <PrefRow
            testID="pref-app-lock"
            label="App Lock"
            help={appLockHelp}
            value={devicePrefs.appLock}
            onChange={(appLock) => {
              const next = { ...devicePrefs, appLock };
              setDevicePrefs(next);
              void Effect.runPromise(saveDevicePrefsEffect(next)).then(() => {
                globalThis.dispatchEvent?.(new Event("clawql-device-prefs-changed"));
                setNote(
                  appLock
                    ? `App Lock on — ${bioLabel} after background`
                    : "App Lock off"
                );
              });
            }}
          />
          <Meta testID="profile-bio-capability" color={brand.inkFaint}>
            {bio?.fixture
              ? `${bioLabel} ready (fixture)`
              : bio?.available && bio.enrolled
                ? `${bioLabel} ready on this phone`
                : bio?.available
                  ? `${bioLabel} hardware found — enroll in system settings`
                  : "No Face ID / Touch ID hardware detected"}
          </Meta>
          {devicePrefs.appLock ? (
            <SecondaryButton
              testID="profile-lock-now"
              label="Lock now"
              onPress={() => {
                // AppLockGate listens for a custom event on web / fixture demos.
                globalThis.dispatchEvent?.(new Event("clawql-app-lock-now"));
                setNote(`Locked — unlock with ${bioLabel}`);
              }}
            />
          ) : null}
          <PrefRow
            testID="pref-haptics"
            label="Haptics"
            help="Vibrate lightly on approve, decline, and errors."
            value={devicePrefs.haptics}
            onChange={(haptics) => {
              const next = { ...devicePrefs, haptics };
              setDevicePrefs(next);
              void Effect.runPromise(saveDevicePrefsEffect(next)).then(() => {
                globalThis.dispatchEvent?.(new Event("clawql-device-prefs-changed"));
              });
            }}
          />
          <PrefRow
            testID="pref-icon-badge"
            label="Home screen badge"
            help="Show the pending review count on the app icon."
            value={devicePrefs.iconBadge}
            onChange={(iconBadge) => {
              const next = { ...devicePrefs, iconBadge };
              setDevicePrefs(next);
              void Effect.runPromise(saveDevicePrefsEffect(next)).then(() => {
                globalThis.dispatchEvent?.(new Event("clawql-device-prefs-changed"));
                setNote(iconBadge ? "Icon badge on" : "Icon badge off");
              });
            }}
          />
          <PrefRow
            testID="pref-voice-assistant"
            label="Voice assistant"
            help="Dictate or type commands — list pending, read next, decline. Approve still needs your security key. Siri App Intents land after Day-0."
            value={devicePrefs.voiceAssistant}
            onChange={(voiceAssistant) => {
              const next = { ...devicePrefs, voiceAssistant };
              setDevicePrefs(next);
              void Effect.runPromise(saveDevicePrefsEffect(next)).then(() => {
                setNote(voiceAssistant ? "Voice assistant on" : "Voice assistant off");
              });
            }}
          />
          <PrefRow
            testID="pref-voice-speak"
            label="Speak replies"
            help="Read assistant answers aloud (Siri-style TTS in-app)."
            value={devicePrefs.voiceSpeak}
            onChange={(voiceSpeak) => {
              const next = { ...devicePrefs, voiceSpeak };
              setDevicePrefs(next);
              void Effect.runPromise(saveDevicePrefsEffect(next));
            }}
          />
          {devicePrefs.voiceAssistant ? (
            <SecondaryButton
              testID="profile-open-voice"
              label="Open voice assistant"
              onPress={() => router.push("/voice")}
            />
          ) : null}
        </FieldGroup.Section>
      </FieldGroup>

      <FieldGroup>
        <FieldGroup.Section title="When something needs you">
          <PrefRow
            testID="pref-push"
            label="Push to the ClawQL app"
            help="Approve from your phone by tapping your YubiKey to it."
            value={prefs.push}
            onChange={(push) => {
              const next = { ...prefs, push };
              setPrefs(next);
              void (async () => {
                await Effect.runPromise(setNotificationPrefsEffect({ session, prefs: next }));
                if (push) {
                  await Effect.runPromise(registerForPushEffect(session)).catch(() => undefined);
                } else {
                  await Effect.runPromise(clearPushDevicesEffect(session));
                }
                const devices = await Effect.runPromise(listPushDevicesEffect(session));
                setPushDevices(devices);
              })();
            }}
          />
          <PrefRow
            testID="pref-slack"
            label="Slack direct message"
            help="A link to the request. Approving still happens with your key."
            value={prefs.slack}
            onChange={(slack) => {
              const next = { ...prefs, slack };
              setPrefs(next);
              void Effect.runPromise(setNotificationPrefsEffect({ session, prefs: next }));
            }}
          />
          <PrefRow
            testID="pref-email"
            label="Email"
            help="For requests still waiting after 30 minutes."
            value={prefs.email}
            onChange={(email) => {
              const next = { ...prefs, email };
              setPrefs(next);
              void Effect.runPromise(setNotificationPrefsEffect({ session, prefs: next }));
            }}
          />
          <PrefRow
            testID="pref-digest"
            label="Morning digest"
            help="What your agents did overnight."
            value={prefs.morningDigest}
            onChange={(morningDigest) => {
              const next = { ...prefs, morningDigest };
              setPrefs(next);
              void Effect.runPromise(setNotificationPrefsEffect({ session, prefs: next }));
            }}
          />
        </FieldGroup.Section>
      </FieldGroup>

      <SurfaceCard testID="profile-push-devices">
        <IconBubble name="inbox" tone="seed" size={32} iconSize={16} />
        <Subtitle>Push on this phone</Subtitle>
        {pushDevices.length === 0 ? (
          <Meta testID="push-devices-empty">
            Not registered yet. Turn on “Push to the ClawQL app” above, or register now.
          </Meta>
        ) : (
          pushDevices.map((device) => (
            <Column key={device.id} spacing={4} testID={`push-device-${device.id}`}>
              <Body>{device.label}</Body>
              <Meta mono>{device.token}</Meta>
              <Meta>
                {`${device.platform}${device.fixture ? " · fixture token" : ""} · ${new Date(
                  device.registeredAtMs
                ).toLocaleString()}`}
              </Meta>
            </Column>
          ))
        )}
        <SecondaryButton
          testID="profile-register-push"
          label={pushDevices.length ? "Re-register push" : "Register for push"}
          disabled={busy}
          onPress={() => {
            void (async () => {
              setBusy(true);
              try {
                const res = await Effect.runPromise(registerForPushEffect(session));
                const devices = await Effect.runPromise(listPushDevicesEffect(session));
                setPushDevices(devices);
                setNote(
                  res.token
                    ? res.fixture
                      ? "Fixture push token registered"
                      : "Push token registered"
                    : "Push permission not granted"
                );
              } catch (e: unknown) {
                setNote(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            })();
          }}
        />
        {note ? (
          <Meta testID="profile-push-note" color={brand.ok}>
            {note}
          </Meta>
        ) : null}
      </SurfaceCard>

      <SurfaceCard testID="profile-policies" tint="soft">
        <IconBubble name="policies" tone="seed" size={32} iconSize={16} />
        <Subtitle>Approval policies</Subtitle>
        <Meta>What waits on a person — read-only on phone.</Meta>
        <SecondaryButton
          testID="profile-open-policies"
          label="View policies"
          onPress={() => router.push("/policies")}
        />
      </SurfaceCard>

      <SurfaceCard testID="profile-digest" tint="soft">
        <IconBubble name="digest" tone="seed" size={32} iconSize={16} />
        <Subtitle>Morning digest</Subtitle>
        <Meta>What your agents did overnight — same story as the email/Slack digest.</Meta>
        <SecondaryButton
          testID="profile-open-digest"
          label="Preview digest"
          onPress={() => router.push("/digest")}
        />
      </SurfaceCard>

      <SurfaceCard testID="profile-teammates" tint="soft">
        <IconBubble name="people" tone="seed" size={32} iconSize={16} />
        <Subtitle>Team</Subtitle>
        <Meta>Invite people, review roles and groups — same job as the cloud console Team page.</Meta>
        <SecondaryButton
          testID="profile-open-teammates"
          label="Open team"
          onPress={() => router.push("/teammates")}
        />
      </SurfaceCard>

      <SurfaceCard testID="profile-plan-billing" tint="soft">
        <IconBubble name="spend" tone="seed" size={32} iconSize={16} />
        <Subtitle>Plan & billing</Subtitle>
        <Body testID="profile-plan-label">{`Current plan · ${entitlements.planLabel}`}</Body>
        <Meta testID="profile-plan-mode">
          {`${entitlements.billingMode}${entitlements.productId ? ` · ${entitlements.productId}` : ""}${
            entitlements.seats ? ` · ${entitlements.seats} seat${entitlements.seats === 1 ? "" : "s"}` : ""
          }`}
        </Meta>
        <Meta testID="profile-plan-honesty" color={brand.inkFaint}>
          Fixture sandbox uses store_iap entitlements. Live App Store / Play sheets
          land after Day-0 enrollment — web Stripe Checkout stays for browser signup.
        </Meta>
        {entitlements.planId === "free" ? (
          <Column spacing={space.sm}>
            <PrimaryButton
              testID="profile-subscribe-pro"
              label="Subscribe Pro (sandbox)"
              disabled={busy}
              onPress={() => onSubscribeSandbox("pro")}
            />
            <SecondaryButton
              testID="profile-subscribe-team"
              label="Subscribe Team (sandbox)"
              disabled={busy}
              onPress={() => onSubscribeSandbox("team")}
            />
          </Column>
        ) : (
          <Badge
            label={`${entitlements.planLabel} · ${entitlements.billingMode}`}
            tone="ok"
          />
        )}
        <SecondaryButton
          testID="profile-restore-purchases"
          label="Restore purchases"
          disabled={busy}
          onPress={onRestorePurchases}
        />
        <SecondaryButton
          testID="profile-manage-subscriptions"
          label="Manage in App Store / Play"
          disabled={busy}
          onPress={() => {
            void Effect.runPromise(openManageSubscriptionsEffect()).catch((e: unknown) => {
              setNote(
                e && typeof e === "object" && "reason" in e
                  ? String((e as { reason: string }).reason)
                  : e instanceof Error
                    ? e.message
                    : String(e)
              );
            });
          }}
        />
        <SecondaryButton
          testID="profile-open-billing-portal"
          label={portalBusy ? "Opening…" : "Open billing portal (Stripe)"}
          disabled={portalBusy || busy}
          onPress={() => {
            setPortalBusy(true);
            setPortalNote(null);
            void Effect.runPromise(openBillingPortalEffect(session))
              .then(async (out) => {
                if (out.source === "fixture" || out.url.startsWith("fixture://")) {
                  setPortalNote(
                    "Fixture mode — Stripe portal needs CLAWQL_STRIPE_CUSTOMER_ID on a live session."
                  );
                  return;
                }
                if (Platform.OS === "web") {
                  globalThis.location?.assign?.(out.url);
                } else {
                  await Linking.openURL(out.url);
                }
              })
              .catch((e: unknown) => {
                const reason =
                  e && typeof e === "object" && "reason" in e
                    ? String((e as { reason: string }).reason)
                    : e instanceof Error
                      ? e.message
                      : String(e);
                setPortalNote(reason);
              })
              .finally(() => setPortalBusy(false));
          }}
        />
        {portalNote ? (
          <Meta testID="profile-billing-portal-note" color={brand.inkMuted}>
            {portalNote}
          </Meta>
        ) : null}
      </SurfaceCard>

      <SurfaceCard testID="profile-console-parity" tint="soft">
        <IconBubble name="console" tone="seed" size={32} iconSize={16} />
        <Subtitle>Cloud console on phone</Subtitle>
        <Meta>
          Full managed-console parity — Memory, API keys, Gateway, Automations,
          Audit, Settings. Depth deepens over time; nothing is permanently
          web-only.
        </Meta>
        <SecondaryButton
          testID="profile-open-memory"
          label="Memory explorer"
          onPress={() => router.push("/memory")}
        />
        <SecondaryButton
          testID="profile-open-sessions"
          label="Sessions"
          onPress={() => router.push("/sessions")}
        />
        <SecondaryButton
          testID="profile-open-skills"
          label="Skills"
          onPress={() => router.push("/skills")}
        />
        <SecondaryButton
          testID="profile-open-connections"
          label="Connections"
          onPress={() => router.push("/connections")}
        />
        <SecondaryButton
          testID="profile-open-keys"
          label="API keys"
          onPress={() => router.push("/keys")}
        />
        <SecondaryButton
          testID="profile-open-gateway"
          label="Gateway"
          onPress={() => router.push("/gateway")}
        />
        <SecondaryButton
          testID="profile-open-automations"
          label="Automations"
          onPress={() => router.push("/automations")}
        />
        <SecondaryButton
          testID="profile-open-audit"
          label="Audit"
          onPress={() => router.push("/audit")}
        />
        <SecondaryButton
          testID="profile-open-settings"
          label="Settings"
          onPress={() => router.push("/settings")}
        />
        <SecondaryButton
          testID="profile-open-workflows"
          label="Workflows"
          onPress={() => router.push("/workflows")}
        />
        <SecondaryButton
          testID="open-console"
          label="Also open web console"
          onPress={() => void openConsole()}
        />
      </SurfaceCard>

      <Column spacing={space.sm}>
        <SecondaryButton
          testID="profile-sign-out"
          label="Sign out"
          disabled={busy}
          onPress={() => {
            void (async () => {
              await signOut();
              router.replace("/sign-in");
            })();
          }}
        />
        <PrimaryButton
          testID="profile-delete-account"
          label="Delete account"
          danger
          disabled={busy}
          onPress={onDeleteAccount}
        />
      </Column>

      {note ? <Meta testID="profile-note">{note}</Meta> : null}
    </ScreenScroll>
  );
}
