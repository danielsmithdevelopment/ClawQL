import { Effect } from "effect";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, TextInput } from "react-native";

import { useSession } from "@/src/state/SessionContext";
import {
  listShortcutDonationsEffect,
  shareShortcutDonationEffect,
  type ShortcutDonation,
} from "@/src/services/shortcuts-donation";
import { allowsVoiceMicListening } from "@/src/services/release-policy";
import {
  fixtureDictateEffect,
  runVoiceCommandEffect,
  webDictateEffect,
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
  "ask dana",
  "list workflows",
  "start standup digest",
  "decline first",
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
  const [donations, setDonations] = useState<readonly ShortcutDonation[]>([]);
  const [shareNote, setShareNote] = useState<string | null>(null);

  useEffect(() => {
    void Effect.runPromise(listShortcutDonationsEffect()).then(setDonations);
  }, []);

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
        subtitle="Type a command like “read the next request.” Approve still needs your security key."
      />

      <SurfaceCard testID="voice-composer" tint="soft">
        <Meta color={brand.inkFaint} testID="voice-privacy-note">
          {allowsVoiceMicListening()
            ? "Web demo: browser Speech Recognition may send audio to the browser vendor. Typed commands always work. Spoken replies use on-device TTS when available."
            : "This phone build does not listen on the microphone. Type commands (or use fixture buttons). Spoken replies use on-device text-to-speech — no audio leaves the device. Native mic recognition ships in a later update with specific privacy strings."}
        </Meta>
        <TextInput
          testID="voice-input"
          value={utterance}
          onChangeText={setUtterance}
          placeholder='Try “list pending” or “ask dana”'
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
          {allowsVoiceMicListening() ? (
            <SecondaryButton
              testID="voice-dictate-web"
              label="Listen (browser mic)"
              disabled={busy}
              onPress={() => {
                setBusy(true);
                void Effect.runPromise(webDictateEffect({ lastHint: utterance }))
                  .then((text) => {
                    if (text) return run(text);
                    setError("No speech captured — try typed commands.");
                  })
                  .catch((e: unknown) =>
                    setError(e instanceof Error ? e.message : String(e))
                  )
                  .finally(() => setBusy(false));
              }}
            />
          ) : null}
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

      <SurfaceCard testID="voice-shortcuts">
        <Body>Add to Shortcuts / App Actions</Body>
        <Meta color={brand.inkFaint}>
          Copy a deep link now. Native Siri donation wires the same phrases after
          Day-0.
        </Meta>
        <Column spacing={space.sm}>
          {donations.slice(0, 6).map((donation) => (
            <SecondaryButton
              key={donation.id}
              testID={`voice-shortcut-${donation.id}`}
              label={donation.phrase}
              disabled={busy}
              onPress={() => {
                void Effect.runPromise(shareShortcutDonationEffect(donation)).then(
                  (out) => {
                    setShareNote(
                      out.shared
                        ? `Shared / copied · ${donation.utterance}`
                        : `Copy this URL: ${donation.deepLink}`
                    );
                  }
                );
              }}
            />
          ))}
        </Column>
        {shareNote ? (
          <Meta testID="voice-shortcut-note" color={brand.ok}>
            {shareNote}
          </Meta>
        ) : null}
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
          {result.startedWorkflowId ? (
            <Meta testID="voice-started-workflow">{`Started · ${result.startedWorkflowId}`}</Meta>
          ) : null}
          {result.askedTeammate ? (
            <Meta testID="voice-asked-teammate">{`Asked · ${result.askedTeammate}`}</Meta>
          ) : null}
        </SurfaceCard>
      ) : null}

      <SecondaryButton
        testID="voice-open-workflows"
        label="Browse workflows"
        onPress={() => router.push("/workflows")}
      />
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </ScreenScroll>
  );
}
