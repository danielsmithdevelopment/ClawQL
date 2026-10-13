/**
 * In-app voice assistant — parse spoken/typed commands, speak pending reviews,
 * decline/open (approve still requires security key).
 * Fixture / web: typed commands + expo-speech / speechSynthesis TTS.
 * Siri App Intents land later (see docs/specs/mobile/voice-assistant-v0.1.md).
 */
import * as Speech from "expo-speech";
import { Context, Data, Effect, Layer } from "effect";
import { Platform } from "react-native";

import type { MobileSession, ReviewItem } from "../domain/schemas";
import {
  decideReviewEffect,
  getReviewByIdEffect,
  listReviewEffect,
} from "./api";
import { loadDevicePrefsEffect } from "./device-ux";

export class VoiceAssistantError extends Data.TaggedError("VoiceAssistantError")<{
  readonly reason: string;
}> {}

export type VoiceCommandKind =
  | "list_pending"
  | "read_next"
  | "decline_first"
  | "decline_id"
  | "open_first"
  | "open_id"
  | "approve_intent"
  | "help"
  | "unknown";

export type ParsedVoiceCommand = {
  readonly kind: VoiceCommandKind;
  readonly reviewId?: string;
  readonly raw: string;
};

export type VoiceAssistantResult = {
  readonly command: ParsedVoiceCommand;
  readonly spoken: string;
  readonly detail: string;
  /** When set, UI should navigate here after the command. */
  readonly navigateTo?: string;
  readonly declinedId?: string;
  readonly pendingCount?: number;
};

const HELP =
  "Try: list pending, read next, decline first, open first, or approve first. Approve always needs your security key.";

export function parseVoiceCommandEffect(raw: string): Effect.Effect<ParsedVoiceCommand> {
  return Effect.sync(() => {
    const text = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (!text) return { kind: "unknown" as const, raw };
    if (/^(help|what can you do|commands)\b/.test(text)) {
      return { kind: "help", raw };
    }
    if (
      /^(list|show|what('?s| is)?)\b.*\b(pending|waiting|approvals?|requests?)\b/.test(text) ||
      /^(list|show)\s+pending\b/.test(text) ||
      text === "list pending" ||
      text === "what's pending" ||
      text === "whats pending"
    ) {
      return { kind: "list_pending", raw };
    }
    if (/^(read|speak|say)\b.*\b(next|first)\b/.test(text) || text === "read next") {
      return { kind: "read_next", raw };
    }
    if (/^decline\s+first\b/.test(text) || text === "decline the first") {
      return { kind: "decline_first", raw };
    }
    const declineId = text.match(/^decline\s+(rev_[\w-]+|[\w-]+)$/);
    if (declineId?.[1]) {
      return { kind: "decline_id", reviewId: declineId[1], raw };
    }
    if (/^open\s+first\b/.test(text) || text === "open the first") {
      return { kind: "open_first", raw };
    }
    const openId = text.match(/^open\s+(rev_[\w-]+|[\w-]+)$/);
    if (openId?.[1]) {
      return { kind: "open_id", reviewId: openId[1], raw };
    }
    if (/^(approve|confirm)\b/.test(text)) {
      return { kind: "approve_intent", raw };
    }
    return { kind: "unknown", raw };
  });
}

function summarizeItem(item: ReviewItem): string {
  return `${item.kindLabel}: ${item.title}. ${item.statusLine}`;
}

export function speakTextEffect(text: string): Effect.Effect<void, VoiceAssistantError> {
  return Effect.gen(function* () {
    const prefs = yield* loadDevicePrefsEffect().pipe(
      Effect.mapError((e) => new VoiceAssistantError({ reason: e.reason }))
    );
    if (!prefs.voiceSpeak) return;
    if (Platform.OS === "web") {
      yield* Effect.sync(() => {
        const g = globalThis as unknown as {
          speechSynthesis?: {
            cancel: () => void;
            speak: (u: unknown) => void;
          };
          SpeechSynthesisUtterance?: new (t: string) => unknown;
        };
        if (!g.speechSynthesis || !g.SpeechSynthesisUtterance) return;
        g.speechSynthesis.cancel();
        g.speechSynthesis.speak(new g.SpeechSynthesisUtterance(text));
      });
      return;
    }
    yield* Effect.tryPromise({
      try: () =>
        new Promise<void>((resolve, reject) => {
          Speech.stop();
          Speech.speak(text, {
            onDone: () => resolve(),
            onStopped: () => resolve(),
            onError: () => reject(new Error("speech_failed")),
          });
        }),
      catch: (cause) =>
        new VoiceAssistantError({
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
    }).pipe(Effect.catch(() => Effect.void));
  });
}

export function runVoiceCommandEffect(input: {
  session: MobileSession;
  utterance: string;
  /** When false, skip TTS (tests / silent arrange). */
  speak?: boolean;
}): Effect.Effect<VoiceAssistantResult, VoiceAssistantError> {
  return Effect.gen(function* () {
    const command = yield* parseVoiceCommandEffect(input.utterance);
    const speak = input.speak !== false;

    const finish = (result: VoiceAssistantResult) =>
      Effect.gen(function* () {
        if (speak) yield* speakTextEffect(result.spoken);
        return result;
      });

    if (command.kind === "help" || command.kind === "unknown") {
      return yield* finish({
        command,
        spoken: HELP,
        detail: HELP,
      });
    }

    const list = yield* listReviewEffect(input.session).pipe(
      Effect.mapError((e) => new VoiceAssistantError({ reason: e.reason }))
    );
    const items = list.items;

    if (command.kind === "list_pending") {
      if (items.length === 0) {
        const spoken = "Nothing is waiting for you.";
        return yield* finish({
          command,
          spoken,
          detail: spoken,
          pendingCount: 0,
        });
      }
      const lines = items
        .slice(0, 5)
        .map((item, i) => `${i + 1}. ${item.kindLabel}: ${item.title}`)
        .join(" ");
      const spoken = `${items.length} pending. ${lines}`;
      return yield* finish({
        command,
        spoken,
        detail: items.map((i) => `• ${i.id} — ${i.title}`).join("\n"),
        pendingCount: items.length,
      });
    }

    if (command.kind === "read_next" || command.kind === "open_first") {
      const first = items[0];
      if (!first) {
        const spoken = "Nothing is waiting for you.";
        return yield* finish({ command, spoken, detail: spoken, pendingCount: 0 });
      }
      const spoken = summarizeItem(first);
      return yield* finish({
        command,
        spoken,
        detail: spoken,
        navigateTo: command.kind === "open_first" ? `/review/${first.id}` : undefined,
        pendingCount: items.length,
      });
    }

    if (command.kind === "open_id" && command.reviewId) {
      const item = yield* getReviewByIdEffect(input.session, command.reviewId).pipe(
        Effect.mapError((e) => new VoiceAssistantError({ reason: e.reason }))
      );
      if (!item) {
        const spoken = `I could not find ${command.reviewId}.`;
        return yield* finish({ command, spoken, detail: spoken });
      }
      return yield* finish({
        command,
        spoken: `Opening ${item.title}.`,
        detail: summarizeItem(item),
        navigateTo: `/review/${item.id}`,
      });
    }

    if (command.kind === "decline_first" || command.kind === "decline_id") {
      const target =
        command.kind === "decline_id" && command.reviewId
          ? items.find((i) => i.id === command.reviewId) ??
            (yield* getReviewByIdEffect(input.session, command.reviewId).pipe(
              Effect.mapError((e) => new VoiceAssistantError({ reason: e.reason }))
            ))
          : items[0];
      if (!target) {
        const spoken = "Nothing to decline.";
        return yield* finish({ command, spoken, detail: spoken, pendingCount: 0 });
      }
      yield* decideReviewEffect({
        session: input.session,
        id: target.id,
        kind: target.kind,
        decision: "decline",
      }).pipe(Effect.mapError((e) => new VoiceAssistantError({ reason: e.reason })));
      const spoken = `Declined ${target.title}.`;
      return yield* finish({
        command,
        spoken,
        detail: spoken,
        declinedId: target.id,
        pendingCount: Math.max(0, items.length - 1),
      });
    }

    if (command.kind === "approve_intent") {
      const first = items[0];
      const spoken = first
        ? `I can open ${first.title}, but approve still needs your security key or Face ID on the review screen.`
        : "Nothing to approve. Approve always needs your security key — I will never approve from voice alone.";
      return yield* finish({
        command,
        spoken,
        detail: spoken,
        navigateTo: first ? `/review/${first.id}` : undefined,
        pendingCount: items.length,
      });
    }

    return yield* finish({
      command,
      spoken: HELP,
      detail: HELP,
    });
  });
}

/** Fixture dictate — stands in for mic STT until Day-0 native speech. */
export function fixtureDictateEffect(
  phrase: string
): Effect.Effect<string, VoiceAssistantError> {
  return Effect.succeed(phrase.trim());
}

const CLAWQL_VOICE_TAG = "clawql/MobileVoiceAssistant" as const;

export class MobileVoiceAssistantService extends Context.Service<
  typeof CLAWQL_VOICE_TAG,
  {
    readonly parse: (raw: string) => Effect.Effect<ParsedVoiceCommand>;
    readonly run: (input: {
      session: MobileSession;
      utterance: string;
      speak?: boolean;
    }) => Effect.Effect<VoiceAssistantResult, VoiceAssistantError>;
    readonly speak: (text: string) => Effect.Effect<void, VoiceAssistantError>;
    readonly fixtureDictate: (phrase: string) => Effect.Effect<string, VoiceAssistantError>;
  }
>()(CLAWQL_VOICE_TAG) {}

export const MobileVoiceAssistantLive = Layer.succeed(MobileVoiceAssistantService, {
  parse: parseVoiceCommandEffect,
  run: runVoiceCommandEffect,
  speak: speakTextEffect,
  fixtureDictate: fixtureDictateEffect,
});
