/**
 * Platform-native icons — SF Symbols on iOS, Material Symbols XML on Android.
 * Web uses SVG path fallbacks in AppIcon (Icon renders null on web).
 * Keep this list small: each Android XML is a tree-shaken dependency edge.
 */
import { Icon } from "@expo/ui";

export type AppIconName =
  | "chevron"
  | "home"
  | "org"
  | "spend"
  | "agents"
  | "digest"
  | "inbox"
  | "policies"
  | "key"
  | "people"
  | "change"
  | "skill"
  | "source"
  | "decision"
  | "shield"
  | "activity"
  | "sessions"
  | "console";

export const Icons = {
  chevron: Icon.select({
    ios: "chevron.right",
    android: import("@expo/material-symbols/chevron_right.xml"),
  }),
  home: Icon.select({
    ios: "house.fill",
    android: import("@expo/material-symbols/home.xml"),
  }),
  org: Icon.select({
    ios: "building.2.fill",
    android: import("@expo/material-symbols/apartment.xml"),
  }),
  spend: Icon.select({
    ios: "creditcard.fill",
    android: import("@expo/material-symbols/payments.xml"),
  }),
  agents: Icon.select({
    ios: "cpu.fill",
    android: import("@expo/material-symbols/smart_toy.xml"),
  }),
  digest: Icon.select({
    ios: "sun.max.fill",
    android: import("@expo/material-symbols/wb_sunny.xml"),
  }),
  inbox: Icon.select({
    ios: "bell.fill",
    android: import("@expo/material-symbols/notifications.xml"),
  }),
  policies: Icon.select({
    ios: "scroll.fill",
    android: import("@expo/material-symbols/policy.xml"),
  }),
  key: Icon.select({
    ios: "key.fill",
    android: import("@expo/material-symbols/key.xml"),
  }),
  people: Icon.select({
    ios: "person.3.fill",
    android: import("@expo/material-symbols/group.xml"),
  }),
  change: Icon.select({
    ios: "pencil",
    android: import("@expo/material-symbols/edit.xml"),
  }),
  skill: Icon.select({
    ios: "sparkles",
    android: import("@expo/material-symbols/bolt.xml"),
  }),
  source: Icon.select({
    ios: "link.badge.plus",
    android: import("@expo/material-symbols/add_link.xml"),
  }),
  decision: Icon.select({
    ios: "questionmark.circle.fill",
    android: import("@expo/material-symbols/help.xml"),
  }),
  shield: Icon.select({
    ios: "shield.checkered",
    android: import("@expo/material-symbols/shield.xml"),
  }),
  activity: Icon.select({
    ios: "clock.arrow.circlepath",
    android: import("@expo/material-symbols/history.xml"),
  }),
  sessions: Icon.select({
    ios: "laptopcomputer.and.iphone",
    android: import("@expo/material-symbols/devices.xml"),
  }),
  console: Icon.select({
    ios: "safari.fill",
    android: import("@expo/material-symbols/open_in_browser.xml"),
  }),
} as const;

/** Lucide-style 24×24 stroke paths for web (no icon font / TTF). */
export const WEB_ICON_PATHS: Record<AppIconName, string> = {
  chevron: "M9 18l6-6-6-6",
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z",
  org: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01M9 14h.01M15 14h.01",
  spend: "M2 8h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8Zm0 0V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2M12 14h.01",
  agents: "M12 8V4H8M4 8h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Zm4 4h.01M16 12h.01M9 16c.8.8 1.8 1.2 3 1.2s2.2-.4 3-1.2",
  digest: "M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  inbox: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0",
  policies: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  key: "M21 2l-2 2m-7.6 7.6a5 5 0 1 1-2.1-2.1L16 3l2 2 2-2 3 3-2 2-2-2-4.6 4.6z",
  people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  change: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z",
  skill: "M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z",
  source: "M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1M19 3v6M22 6h-6",
  decision: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  activity: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 3",
  sessions: "M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9M2 20h20M8 20v-2h8v2",
  console: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3",
};
