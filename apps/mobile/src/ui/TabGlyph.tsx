import { View } from "react-native";

import { color } from "@/src/theme";
import { AppIcon } from "@/src/ui/AppIcon";
import type { AppIconName } from "@/src/ui/icons";

/**
 * Web / default — SVG AppIcon (no icon font TTFs).
 * Maestro still sees tabBarButtonTestID on the tab button itself.
 */
export function TabGlyph({
  webIcon,
  focused,
}: {
  ios?: string;
  androidXml?: number | { uri: string };
  /** @deprecated text fallback — prefer webIcon */
  label?: string;
  webIcon?: AppIconName;
  focused: boolean;
}) {
  const name = webIcon ?? "shield";
  return (
    <View style={{ alignItems: "center", justifyContent: "center", minWidth: 28, minHeight: 22 }}>
      <AppIcon name={name} size={22} color={focused ? color.primary : color.onSurfaceVariant} />
    </View>
  );
}
