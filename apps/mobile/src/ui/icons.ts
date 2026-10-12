/**
 * Platform-native icons — SF Symbols on iOS, Material Symbols XML on Android.
 * Keep this list tiny: each entry is a dependency edge. Prefer TabAndroidIcons for tabs.
 */
import { Icon } from "@expo/ui";

export const Icons = {
  chevron: Icon.select({
    ios: "chevron.right",
    android: import("@expo/material-symbols/chevron_right.xml"),
  }),
} as const;
