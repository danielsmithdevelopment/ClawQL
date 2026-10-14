import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  androidAppActionsCatalogEffect,
  listShortcutDonationsEffect,
  shortcutExportTextEffect,
} from "../shortcuts-donation";

describe("shortcuts donation catalog", () => {
  it("lists donated phrases with clawql://voice deep links", async () => {
    const rows = await Effect.runPromise(listShortcutDonationsEffect());
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(rows.every((r) => r.deepLink.startsWith("clawql://"))).toBe(true);
    expect(rows.some((r) => r.utterance === "list pending")).toBe(true);
    expect(rows.some((r) => r.utterance === "start standup digest")).toBe(true);
  });

  it("exports Shortcut-friendly text and Android actions catalog", async () => {
    const rows = await Effect.runPromise(listShortcutDonationsEffect());
    const text = await Effect.runPromise(shortcutExportTextEffect(rows[0]!));
    expect(text).toMatch(/Open URL:/);
    expect(text).toMatch(/Shortcuts/);
    const android = await Effect.runPromise(androidAppActionsCatalogEffect());
    expect(android.some((a) => a.url.includes("list%20pending") || a.url.includes("list pending"))).toBe(
      true
    );
  });
});
