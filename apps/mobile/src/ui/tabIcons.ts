/**
 * Android tab icons as XML vector drawables (tree-shakeable per Icon.select).
 * iOS uses SF Symbol name strings in TabGlyph.ios.
 */
import { Icon } from "@expo/ui";

export const TabAndroidIcons = {
  home: Icon.select({
    ios: "house.fill",
    android: import("@expo/material-symbols/home.xml"),
  }),
  review: Icon.select({
    ios: "checklist",
    android: import("@expo/material-symbols/rate_review.xml"),
  }),
  activity: Icon.select({
    ios: "clock.arrow.circlepath",
    android: import("@expo/material-symbols/history.xml"),
  }),
  profile: Icon.select({
    ios: "person.crop.circle.fill",
    android: import("@expo/material-symbols/person.xml"),
  }),
} as const;
