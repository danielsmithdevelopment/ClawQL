/**
 * Cross-platform glyph: SF Symbol / Material XML on native, SVG stroke on web.
 * @expo/ui Icon is null on web — demos and Maestro web need this fallback.
 *
 * Tonal containers follow M3 primary/secondary/error/tertiary **container** roles
 * (see DESIGN.md).
 */
import { createElement, type ReactNode } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon } from "@expo/ui";

import { color, shape } from "../theme";
import { Icons, WEB_ICON_PATHS, type AppIconName } from "./icons";

/** M3 roles + short aliases (`seed`→primary blue, `accent`→orange, `warn`→amber). */
export type IconTone =
  | "primary"
  | "secondary"
  | "tertiary"
  | "accent"
  | "error"
  | "ok"
  | "neutral"
  | "seed"
  | "warn"
  | "danger";

function resolveTone(
  tone: IconTone
): "primary" | "secondary" | "tertiary" | "accent" | "error" | "ok" | "warn" {
  if (tone === "seed" || tone === "primary") return "primary";
  if (tone === "accent") return "accent";
  if (tone === "warn") return "warn";
  if (tone === "tertiary") return "tertiary";
  if (tone === "danger" || tone === "error") return "error";
  if (tone === "ok") return "ok";
  return "secondary";
}

export function AppIcon({
  name,
  size = 20,
  color: ink = color.onSurface,
  testID,
}: {
  name: AppIconName;
  size?: number;
  color?: string;
  testID?: string;
}): ReactNode {
  if (Platform.OS === "ios" || Platform.OS === "android") {
    return <Icon testID={testID} name={Icons[name]} size={size} color={ink} />;
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
      stroke: ink,
      strokeWidth: 1.75,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      fill: "none",
    })
  );
}

/** M3 tonal icon container — primaryContainer / secondaryContainer / etc. */
export function IconBubble({
  name,
  tone = "seed",
  size = 40,
  iconSize = 20,
  testID,
  style,
}: {
  name: AppIconName;
  /** Prefer seed (primary blue). Status/risk belongs on badges, not icon chrome. */
  tone?: IconTone;
  size?: number;
  iconSize?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const role = resolveTone(tone);
  const bg =
    role === "ok"
      ? color.okContainer
      : role === "warn"
        ? color.warnContainer
        : role === "accent"
          ? color.accentContainer
          : role === "tertiary"
            ? color.tertiaryContainer
            : role === "error"
              ? color.errorContainer
              : role === "secondary"
                ? color.secondaryContainer
                : color.primaryContainer;
  const fg =
    role === "ok"
      ? color.onOkContainer
      : role === "warn"
        ? color.onWarnContainer
        : role === "accent"
          ? color.onAccentContainer
          : role === "tertiary"
            ? color.onTertiaryContainer
            : role === "error"
              ? color.onErrorContainer
              : role === "secondary"
                ? color.onSecondaryContainer
                : color.onPrimaryContainer;
  return (
    <View
      testID={testID}
      style={[
        {
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.32) || shape.sm,
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
