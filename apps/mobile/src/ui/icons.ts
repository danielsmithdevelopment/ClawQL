/**
 * Platform-native icons — SF Symbols on iOS, Material Symbols on Android.
 * Prefer Icon.select so Metro tree-shakes the unused side (@expo/ui babel plugin).
 */
import { Icon } from "@expo/ui";

export const Icons = {
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
  chevron: Icon.select({
    ios: "chevron.right",
    android: import("@expo/material-symbols/chevron_right.xml"),
  }),
  key: Icon.select({
    ios: "key.fill",
    android: import("@expo/material-symbols/key.xml"),
  }),
  notifications: Icon.select({
    ios: "bell.fill",
    android: import("@expo/material-symbols/notifications.xml"),
  }),
  warning: Icon.select({
    ios: "exclamationmark.triangle.fill",
    android: import("@expo/material-symbols/warning.xml"),
  }),
  verified: Icon.select({
    ios: "checkmark.shield.fill",
    android: import("@expo/material-symbols/verified_user.xml"),
  }),
  pending: Icon.select({
    ios: "hourglass",
    android: import("@expo/material-symbols/pending_actions.xml"),
  }),
  gavel: Icon.select({
    ios: "hammer.fill",
    android: import("@expo/material-symbols/gavel.xml"),
  }),
} as const;
