import { Text } from "react-native";

import { brand } from "@/src/theme";

/**
 * Web / default — lightweight glyph labels (no icon font TTFs).
 * Maestro still sees tabBarButtonTestID on the tab button itself.
 */
export function TabGlyph({
  label,
  focused,
}: {
  ios?: string;
  androidXml?: number | { uri: string };
  label: string;
  focused: boolean;
}) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: focused ? "700" : "500",
        color: focused ? brand.seed : brand.inkFaint,
      }}
    >
      {label}
    </Text>
  );
}
