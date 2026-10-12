import { Icon } from "@expo/ui";

import { color } from "@/src/theme";

/**
 * Android — Material Symbols as XML vector drawables (not the ~1MB TTF font).
 * Avoids expo-symbols → @expo-google-fonts/material-symbols.
 */
export function TabGlyph({
  androidXml,
  focused,
}: {
  ios?: string;
  androidXml: number | { uri: string };
  focused: boolean;
}) {
  return (
    <Icon
      name={androidXml}
      size={22}
      color={focused ? color.primary : color.onSurfaceVariant}
    />
  );
}
