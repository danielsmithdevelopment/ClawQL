/**
 * Cross-platform glyph: SF Symbol / Material XML on native, SVG stroke on web.
 * @expo/ui Icon is null on web — demos and Maestro web need this fallback.
 */
import { createElement, type ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon } from "@expo/ui";

import { brand } from "../theme";
import { Icons, WEB_ICON_PATHS, type AppIconName } from "./icons";

export function AppIcon({
  name,
  size = 20,
  color = brand.ink,
  testID,
}: {
  name: AppIconName;
  size?: number;
  color?: string;
  testID?: string;
}): ReactNode {
  if (Platform.OS === "ios" || Platform.OS === "android") {
    return <Icon testID={testID} name={Icons[name]} size={size} color={color} />;
  }

  const d = WEB_ICON_PATHS[name];
  return createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      "data-testid": testID,
      role: "img",
      "aria-hidden": true,
    },
    createElement("path", {
      d,
      stroke: color,
      strokeWidth: 1.75,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      fill: "none",
    })
  );
}

/** Tonal M3-style icon container — soft depth without heavy shadows. */
export function IconBubble({
  name,
  tone = "seed",
  size = 40,
  iconSize = 20,
  testID,
  style,
}: {
  name: AppIconName;
  tone?: "seed" | "ok" | "warn" | "danger" | "neutral";
  size?: number;
  iconSize?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    tone === "ok"
      ? brand.okBg
      : tone === "warn"
        ? brand.warnBg
        : tone === "danger"
          ? brand.dangerBg
          : tone === "neutral"
            ? brand.neutralSoft
            : brand.seedSoft;
  const fg =
    tone === "ok"
      ? brand.ok
      : tone === "warn"
        ? brand.warn
        : tone === "danger"
          ? brand.danger
          : tone === "neutral"
            ? brand.inkMuted
            : brand.seed;
  return (
    <View
      testID={testID}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.32,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <AppIcon name={name} size={iconSize} color={fg} />
    </View>
  );
}
