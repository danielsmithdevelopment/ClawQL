import { Effect } from "effect";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";

import type { ConnectedApp, NotificationPrefs, SecurityKey } from "@/src/domain/schemas";
import {
  deleteAccountEffect,
  getNotificationPrefsEffect,
  listConnectedAppsEffect,
  listSecurityKeysEffect,
  revokeConnectedAppEffect,
  setNotificationPrefsEffect,
} from "@/src/services/api";
import { loadMobileConfigEffect } from "@/src/services/config";
import { useSession } from "@/src/state/SessionContext";
import { colors, space } from "@/src/theme";
import {
  Badge,
  Body,
  Card,
  LoadingBlock,
  Meta,
  PrefRow,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Subtitle,
  Title,
} from "@/src/ui/primitives";

export default function ProfileScreen() {
  const { session, signOut } = useSession();
  const router = useRouter();
  const [keys, setKeys] = useState<readonly SecurityKey[]>([]);
  const [apps, setApps] = useState<readonly ConnectedApp[]>([]);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [k, a, p] = await Promise.all([
      Effect.runPromise(listSecurityKeysEffect(session)),
      Effect.runPromise(listConnectedAppsEffect(session)),
      Effect.runPromise(getNotificationPrefsEffect(session)),
    ]);
    setKeys(k);
    setApps(a);
    setPrefs(p);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session || loading || !prefs) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
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
              await Effect.runPromise(
                revokeConnectedAppEffect({ session, clientId })
              );
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
    <Screen testID="profile-screen">
      <ScrollView>
        <Title accessibilityRole="header">{session.displayName}</Title>
        <Meta style={{ marginTop: 4 }}>
          {session.email} · {session.role}
          {session.reviewerDemo ? " · reviewer demo" : ""}
        </Meta>

        <Card style={{ marginTop: space.md }} testID="profile-security-keys">
          <Subtitle>Your security keys</Subtitle>
          <Meta style={{ marginTop: 4 }}>You need two keys that can approve.</Meta>
          {keys.map((key) => (
            <View
              key={key.id}
              style={{ marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}
              testID="profile-security-key"
            >
              <Body style={{ fontWeight: "600" }}>{key.name}</Body>
              <View style={{ marginTop: 4 }}>
                <Badge label={key.badge} tone={key.canApprove ? "ok" : "neutral"} />
              </View>
              <Meta style={{ marginTop: 4 }}>{key.detail}</Meta>
            </View>
          ))}
        </Card>

        <Card testID="profile-connected-apps">
          <Subtitle>Connected apps</Subtitle>
          <Meta style={{ marginTop: 4 }}>Revoke access for agents and IDEs.</Meta>
          {apps.map((app) => (
            <View
              key={app.clientId}
              style={{ marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}
              testID={`connected-app-${app.clientId}`}
            >
              <Body style={{ fontWeight: "600" }}>{app.name}</Body>
              <Meta>
                {app.scopes.join(", ")} · {app.lastUsed}
              </Meta>
              <View style={{ marginTop: space.sm }}>
                <SecondaryButton
                  testID={`revoke-${app.clientId}`}
                  label="Revoke"
                  disabled={busy}
                  onPress={() => onRevoke(app.clientId)}
                />
              </View>
            </View>
          ))}
          {apps.length === 0 ? <Meta testID="connected-apps-empty">No connected apps.</Meta> : null}
        </Card>

        <Card testID="profile-notification-prefs">
          <Subtitle>When something needs you</Subtitle>
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
        </Card>

        <Card>
          <Subtitle>Everything else</Subtitle>
          <Meta style={{ marginTop: 4, marginBottom: space.sm }}>
            Policies, spend, gateways, and team live in the web console.
          </Meta>
          <SecondaryButton testID="open-console" label="Open web console" onPress={() => void openConsole()} />
        </Card>

        <View style={{ gap: space.sm, marginBottom: space.xl }}>
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
        </View>

        {note ? (
          <Meta testID="profile-note" style={{ marginBottom: space.lg }}>
            {note}
          </Meta>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
