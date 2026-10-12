import { useRouter } from "expo-router";
import { useState } from "react";

import { useSession } from "@/src/state/SessionContext";
import { brand, space } from "@/src/theme";
import {
  Body,
  Column,
  Fill,
  IconBubble,
  Meta,
  PrimaryButton,
  ScreenHost,
  SecondaryButton,
  Spacer,
  SurfaceCard,
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
    <ScreenHost testID="sign-in-screen">
      <Fill style={{ justifyContent: "center", padding: space.lg }}>
        <Column spacing={space.md} alignment="center">
        <Column spacing={space.sm} style={{ width: "100%" }} alignment="center">
          <IconBubble name="shield" tone="accent" size={56} iconSize={28} />
          <Title>ClawQL</Title>
          <Body color={brand.inkMuted}>
            Approve exact changes from your phone — tap your security key, not another push.
          </Body>
        </Column>

        <SurfaceCard elevated>
          <PrimaryButton
            testID="sign-in-browser"
            label={busy ? "Opening browser…" : "Sign in with browser"}
            disabled={busy}
            onPress={() => void run(signInWithBrowser)}
          />
          <Meta>Uses the system browser and returns via app link — no localhost.</Meta>
        </SurfaceCard>

        <SurfaceCard tint="soft">
          <Body>Demo & review</Body>
          <Spacer />
          <SecondaryButton
            testID="sign-in-fixture"
            label="Continue with fixture session"
            disabled={busy}
            onPress={() => void run(signInFixture)}
          />
          <Spacer />
          <SecondaryButton
            testID="sign-in-reviewer-demo"
            label="App Store reviewer demo (biometric)"
            disabled={busy}
            onPress={() => void run(signInReviewerDemo)}
          />
          <Meta>
            Reviewer demo allows device biometrics instead of a YubiKey. Approvals are audit-tagged.
          </Meta>
        </SurfaceCard>

        {error ? <Meta testID="sign-in-error" color={brand.danger}>{error}</Meta> : null}
        </Column>
      </Fill>
    </ScreenHost>
  );
}
