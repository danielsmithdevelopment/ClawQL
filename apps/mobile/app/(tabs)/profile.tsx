import { Effect } from "effect";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";

import type {
  ConnectedApp,
  DeviceSession,
  NotificationPrefs,
  SecurityKey,
} from "@/src/domain/schemas";
import {
  deleteAccountEffect,
  endOtherDeviceSessionsEffect,
  getNotificationPrefsEffect,
  listConnectedAppsEffect,
  listDeviceSessionsEffect,
  listSecurityKeysEffect,
  revokeConnectedAppEffect,
  setNotificationPrefsEffect,
} from "@/src/services/api";
import { loadMobileConfigEffect } from "@/src/services/config";
import { useSession } from "@/src/state/SessionContext";
import { space } from "@/src/theme";
import {
  Badge,
  Body,
  Column,
  FieldGroup,
  LoadingBlock,
  Meta,
  PrefRow,
  PrimaryButton,
  ScreenHost,
  ScrollView,
  SecondaryButton,
  Subtitle,
  SurfaceCard,
  Title,
} from "@/src/ui/primitives";

export default function ProfileScreen() {
  const { session, signOut } = useSession();
  const router = useRouter();
  const [keys, setKeys] = useState<readonly SecurityKey[]>([]);
  const [apps, setApps] = useState<readonly ConnectedApp[]>([]);
  const [deviceSessions, setDeviceSessions] = useState<readonly DeviceSession[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [k, a, p, s] = await Promise.all([
      Effect.runPromise(listSecurityKeysEffect(session)),
      Effect.runPromise(listConnectedAppsEffect(session)),
      Effect.runPromise(getNotificationPrefsEffect(session)),
      Effect.runPromise(listDeviceSessionsEffect(session)),
    ]);
    setKeys(k);
    setApps(a);
    setPrefs(p);
    setDeviceSessions(s);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session || loading || !prefs) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

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
    <ScreenHost testID="profile-screen">
      <ScrollView>
        <Column spacing={space.md} style={{ padding: space.md, paddingBottom: space.xl }}>
          <Column spacing={4}>
            <Title>{session.displayName}</Title>
            <Meta>
              {`${session.email} · ${session.role}${session.reviewerDemo ? " · reviewer demo" : ""}`}
            </Meta>
          </Column>

          <SurfaceCard testID="profile-security-keys">
            <Subtitle>Your security keys</Subtitle>
            <Meta>You need two keys that can approve.</Meta>
            {keys.map((key) => (
              <Column key={key.id} spacing={4} testID="profile-security-key">
                <Body>{key.name}</Body>
                <Badge label={key.badge} tone={key.canApprove ? "ok" : "neutral"} />
                <Meta>{key.detail}</Meta>
              </Column>
            ))}
          </SurfaceCard>

          <SurfaceCard testID="profile-sessions">
            <Subtitle>Where you are signed in</Subtitle>
            <Meta>End other sessions if a device is lost or shared.</Meta>
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
            <FieldGroup.Section title="When something needs you">
              <PrefRow
                testID="pref-push"
                label="Push to the ClawQL app"
                help="Approve from your phone by tapping your YubiKey to it."
                value={prefs.push}
                onChange={(push) => {
                  const next = { ...prefs, push };
                  setPrefs(next);
                  void Effect.runPromise(setNotificationPrefsEffect({ session, prefs: next }));
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

          <SurfaceCard>
            <Subtitle>Everything else</Subtitle>
            <Meta>Policies, spend, gateways, and team live in the web console.</Meta>
            <SecondaryButton
              testID="open-console"
              label="Open web console"
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
        </Column>
      </ScrollView>
    </ScreenHost>
  );
}
