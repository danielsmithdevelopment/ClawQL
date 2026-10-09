import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useSession } from "@/src/state/SessionContext";
import { colors, space } from "@/src/theme";
import {
  Body,
  Card,
  Meta,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Title,
} from "@/src/ui/primitives";

export default function SignInScreen() {
  const router = useRouter();
  const { signInWithBrowser, signInFixture, signInReviewerDemo, error } = useSession();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      router.replace("/(tabs)");
    } catch {
      /* surfaced via session.error */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={styles.root} testID="sign-in-screen">
      <View style={styles.hero}>
        <Title accessibilityRole="header">ClawQL</Title>
        <Body style={{ marginTop: space.sm, color: colors.inkMuted }}>
          Approve exact changes from your phone — tap your security key, not another push.
        </Body>
      </View>

      <Card>
        <PrimaryButton
          testID="sign-in-browser"
          label={busy ? "Opening browser…" : "Sign in with browser"}
          disabled={busy}
          onPress={() => void run(signInWithBrowser)}
        />
        <Meta style={{ marginTop: space.sm }}>
          Uses the system browser and returns via app link — no localhost.
        </Meta>
      </Card>

      <Card>
        <Body style={{ fontWeight: "600", marginBottom: space.sm }}>Demo & review</Body>
        <SecondaryButton
          testID="sign-in-fixture"
          label="Continue with fixture session"
          disabled={busy}
          onPress={() => void run(signInFixture)}
        />
        <View style={{ height: space.sm }} />
        <SecondaryButton
          testID="sign-in-reviewer-demo"
          label="App Store reviewer demo (biometric)"
          disabled={busy}
          onPress={() => void run(signInReviewerDemo)}
        />
        <Meta style={{ marginTop: space.sm }}>
          Reviewer demo allows device biometrics instead of a YubiKey. Approvals are audit-tagged.
        </Meta>
      </Card>

      {error ? (
        <Meta testID="sign-in-error" style={{ color: colors.danger }}>
          {error}
        </Meta>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    justifyContent: "center",
  },
  hero: {
    marginBottom: space.lg,
    paddingHorizontal: space.xs,
  },
});
