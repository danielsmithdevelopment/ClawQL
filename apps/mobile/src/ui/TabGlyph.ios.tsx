import { SymbolView } from "expo-symbols";

import { color } from "@/src/theme";

/** iOS — SF Symbols (no font assets in the bundle). */
export function TabGlyph({
  ios,
  focused,
}: {
  ios: string;
  androidXml?: number | { uri: string };
  focused: boolean;
}) {
  return (
    <SymbolView
      name={ios as never}
      size={22}
      tintColor={focused ? color.primary : color.onSurfaceVariant}
      weight={focused ? "semibold" : "regular"}
    />
  );
}
