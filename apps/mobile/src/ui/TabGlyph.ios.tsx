import { SymbolView } from "expo-symbols";

import { brand } from "@/src/theme";

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
      tintColor={focused ? brand.seed : brand.inkFaint}
      weight={focused ? "semibold" : "regular"}
    />
  );
}
