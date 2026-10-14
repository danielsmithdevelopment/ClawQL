/**
 * Shortcut / App Actions donation catalog — fixture-safe deep-link phrases.
 * Real Siri App Intents / Android App Actions wire to these same URLs after Day-0.
 */
import { Context, Effect, Layer } from "effect";
import { Platform, Share } from "react-native";

export type ShortcutDonation = {
  readonly id: string;
  readonly phrase: string;
  readonly utterance: string;
  readonly deepLink: string;
  readonly platforms: readonly ("ios" | "android")[];
  readonly help: string;
};

function voiceLink(utterance: string): string {
  return `clawql://voice?q=${encodeURIComponent(utterance)}`;
}

/** Donated phrases users can copy into Shortcuts / Android App Actions. */
export const SHORTCUT_DONATIONS: readonly ShortcutDonation[] = [
  {
    id: "list_pending",
    phrase: "List my ClawQL approvals",
    utterance: "list pending",
    deepLink: voiceLink("list pending"),
    platforms: ["ios", "android"],
    help: "Speaks pending review titles.",
  },
  {
    id: "read_next",
    phrase: "Read my next ClawQL request",
    utterance: "read next",
    deepLink: voiceLink("read next"),
    platforms: ["ios", "android"],
    help: "Reads the first pending request aloud.",
  },
  {
    id: "decline_first",
    phrase: "Decline the first ClawQL request",
    utterance: "decline first",
    deepLink: voiceLink("decline first"),
    platforms: ["ios", "android"],
    help: "Declines the first pending item (no security key).",
  },
  {
    id: "ask_dana",
    phrase: "Ask Dana about my ClawQL request",
    utterance: "ask dana",
    deepLink: voiceLink("ask dana"),
    platforms: ["ios", "android"],
    help: "Asks Dana about the first pending review.",
  },
  {
    id: "start_standup",
    phrase: "Start ClawQL standup digest",
    utterance: "start standup digest",
    deepLink: voiceLink("start standup digest"),
    platforms: ["ios", "android"],
    help: "Starts the fixture standup-digest workflow.",
  },
  {
    id: "start_spend",
    phrase: "Start ClawQL weekly spend digest",
    utterance: "start weekly spend digest",
    deepLink: voiceLink("start weekly spend digest"),
    platforms: ["ios", "android"],
    help: "Starts the fixture weekly-spend-digest workflow.",
  },
  {
    id: "list_workflows",
    phrase: "List ClawQL workflows",
    utterance: "list workflows",
    deepLink: voiceLink("list workflows"),
    platforms: ["ios", "android"],
    help: "Lists startable workflows.",
  },
  {
    id: "open_voice",
    phrase: "Open ClawQL voice assistant",
    utterance: "help",
    deepLink: "clawql://voice",
    platforms: ["ios", "android"],
    help: "Opens the in-app voice screen.",
  },
];

export function listShortcutDonationsEffect(): Effect.Effect<readonly ShortcutDonation[]> {
  return Effect.succeed(SHORTCUT_DONATIONS);
}

export function listPlatformShortcutDonationsEffect(): Effect.Effect<
  readonly ShortcutDonation[]
> {
  return Effect.sync(() => {
    const os = Platform.OS === "android" ? "android" : "ios";
    return SHORTCUT_DONATIONS.filter((d) => d.platforms.includes(os));
  });
}

export function shortcutExportTextEffect(
  donation: ShortcutDonation
): Effect.Effect<string> {
  return Effect.succeed(
    [
      `ClawQL Shortcut · ${donation.phrase}`,
      `Utterance: ${donation.utterance}`,
      `Open URL: ${donation.deepLink}`,
      `Help: ${donation.help}`,
      "",
      "iOS: Shortcuts → Add Action → Open URLs → paste the link.",
      "Android: App Actions / Assistant → open the same deep link.",
      "Native Siri App Intents land after Day-0 (see voice-assistant-v0.1.md).",
    ].join("\n")
  );
}

export function shareShortcutDonationEffect(
  donation: ShortcutDonation
): Effect.Effect<{ shared: boolean; text: string }> {
  return Effect.gen(function* () {
    const text = yield* shortcutExportTextEffect(donation);
    if (Platform.OS === "web") {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.clipboard?.writeText) {
        yield* Effect.tryPromise({
          try: () => nav.clipboard.writeText(text),
          catch: () => undefined,
        }).pipe(Effect.catch(() => Effect.void));
        return { shared: true, text };
      }
      return { shared: false, text };
    }
    yield* Effect.tryPromise({
      try: () => Share.share({ message: text, title: donation.phrase }),
      catch: () => undefined,
    }).pipe(Effect.catch(() => Effect.void));
    return { shared: true, text };
  });
}

/** Android actions.xml-shaped catalog (checked into store/android for Day-0). */
export function androidAppActionsCatalogEffect(): Effect.Effect<
  readonly { readonly name: string; readonly queryPatterns: readonly string[]; readonly url: string }[]
> {
  return Effect.succeed(
    SHORTCUT_DONATIONS.filter((d) => d.platforms.includes("android")).map((d) => ({
      name: d.id,
      queryPatterns: [d.phrase, d.utterance],
      url: d.deepLink,
    }))
  );
}

const CLAWQL_SHORTCUTS_TAG = "clawql/MobileShortcutsDonation" as const;

export class MobileShortcutsDonation extends Context.Service<
  typeof CLAWQL_SHORTCUTS_TAG,
  {
    readonly list: () => Effect.Effect<readonly ShortcutDonation[]>;
    readonly listForPlatform: () => Effect.Effect<readonly ShortcutDonation[]>;
    readonly exportText: (donation: ShortcutDonation) => Effect.Effect<string>;
    readonly share: (
      donation: ShortcutDonation
    ) => Effect.Effect<{ shared: boolean; text: string }>;
    readonly androidCatalog: () => Effect.Effect<
      readonly {
        readonly name: string;
        readonly queryPatterns: readonly string[];
        readonly url: string;
      }[]
    >;
  }
>()(CLAWQL_SHORTCUTS_TAG) {}

export const MobileShortcutsDonationLive = Layer.succeed(MobileShortcutsDonation, {
  list: listShortcutDonationsEffect,
  listForPlatform: listPlatformShortcutDonationsEffect,
  exportText: shortcutExportTextEffect,
  share: shareShortcutDonationEffect,
  androidCatalog: androidAppActionsCatalogEffect,
});
