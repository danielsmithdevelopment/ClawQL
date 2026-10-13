import { Effect } from "effect";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { TextInput } from "react-native";

import { useSession } from "@/src/state/SessionContext";
import {
  fixtureDictateEffect,
  runVoiceCommandEffect,
  type VoiceAssistantResult,
} from "@/src/services/voice-assistant";
import { brand, space } from "@/src/theme";
import {
  Body,
  Column,
  LoadingBlock,
  Meta,
  PrimaryButton,
  ScreenHost,
  ScreenScroll,
  SecondaryButton,
  SectionHeader,
  SurfaceCard,
} from "@/src/ui/primitives";

const SUGGESTIONS = [
  "list pending",
  "read next",
  "decline first",
  "open first",
  "approve first",
  "help",
] as const;

export default function VoiceScreen() {
  const { session } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const [utterance, setUtterance] = useState("");
  const [result, setResult] = useState<VoiceAssistantResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (phrase: string, speak = true) => {
      if (!session) return;
      const text = phrase.trim();
      if (!text) return;
      setBusy(true);
      setError(null);
      try {
        const dictated = await Effect.runPromise(fixtureDictateEffect(text));
        setUtterance(dictated);
        const next = await Effect.runPromise(
          runVoiceCommandEffect({ session, utterance: dictated, speak })
        );
        setResult(next);
        if (next.navigateTo) {
          router.push(next.navigateTo as Href);
        }
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
    },
    [router, session]
  );

  useEffect(() => {
    const q = typeof params.q === "string" ? params.q : "";
    if (q) void run(q);
  }, [params.q, run]);

  if (!session) {
    return (
      <ScreenHost>
        <LoadingBlock />
      </ScreenHost>
    );
  }

  return (
    <ScreenScroll testID="voice-screen">
      <SectionHeader
        icon="agents"
        title="Voice assistant"
        subtitle="Dictate or type a command. Approve still needs your security key."
      />

      <SurfaceCard testID="voice-composer" tint="soft">
        <Meta color={brand.inkFaint}>
          Fixture mode uses typed commands (and Siri deep links later). Mic STT
          lands with Day-0 native speech.
        </Meta>
        <TextInput
          testID="voice-input"
          value={utterance}
          onChangeText={setUtterance}
          placeholder='Try “list pending”'
          placeholderTextColor={brand.inkFaint}
          accessibilityLabel="Voice command"
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            marginTop: space.sm,
            padding: space.md,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: brand.border,
            color: brand.ink,
            backgroundColor: brand.surface,
            minHeight: 48,
          }}
        />
        <Column spacing={space.sm}>
          <PrimaryButton
            testID="voice-run"
            label={busy ? "Working…" : "Run command"}
            disabled={busy || !utterance.trim()}
            onPress={() => void run(utterance)}
          />
          <SecondaryButton
            testID="voice-dictate-fixture"
            label="Fixture dictate: list pending"
            disabled={busy}
            onPress={() => void run("list pending")}
          />
        </Column>
      </SurfaceCard>

      <SurfaceCard testID="voice-suggestions">
        <Body>Suggestions</Body>
        <Column spacing={space.sm}>
          {SUGGESTIONS.map((s) => (
            <SecondaryButton
              key={s}
              testID={`voice-suggest-${s.replace(/\s+/g, "-")}`}
              label={s}
              disabled={busy}
              onPress={() => void run(s)}
            />
          ))}
        </Column>
      </SurfaceCard>

      {error ? (
        <Meta testID="voice-error" color={brand.danger}>
          {error}
        </Meta>
      ) : null}

      {result ? (
        <SurfaceCard testID="voice-result" tint="seed">
          <Body testID="voice-spoken">{result.spoken}</Body>
          <Meta testID="voice-detail" color={brand.inkFaint}>
            {result.detail}
          </Meta>
          {result.pendingCount != null ? (
            <Meta testID="voice-pending-count">{`Pending · ${result.pendingCount}`}</Meta>
          ) : null}
        </SurfaceCard>
      ) : null}

      <SecondaryButton label="Back" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
