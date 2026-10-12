/**
 * Adaptive UI primitives — Material 3 via @expo/ui.
 * Android → M3 Compose; iOS → SwiftUI tinted by seed; web → RN/DOM fallback.
 * Token rules: apps/mobile/DESIGN.md
 */
import type { ReactNode } from "react";
import {
  Button,
  Column,
  FieldGroup,
  Host,
  Icon,
  List,
  ListItem,
  Row,
  ScrollView,
  Spacer,
  Switch,
  Text,
} from "@expo/ui";
import {
  ActivityIndicator,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { brand, color, elevation, shape, space, type } from "../theme";
import { AppIcon, IconBubble } from "./AppIcon";
import { Icons, type AppIconName } from "./icons";

export { AppIcon, IconBubble };
export type { AppIconName };
export { color, shape, space, type };

/** System monospace — skip custom SpaceMono.ttf in the asset catalog. */
const monoFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

export {
  Button,
  Column,
  FieldGroup,
  Host,
  Icon,
  List,
  ListItem,
  Row,
  ScrollView,
  Spacer,
  Switch,
  Text,
};
export { Icons };

/**
 * RN layout shell for flex / wrap / justify — UniversalStyle only allows
 * padding, size, border, opacity, backgroundColor.
 */
export function Fill({
  children,
  testID,
  style,
}: {
  children: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View testID={testID} style={[{ flex: 1 }, style]}>
      {children}
    </View>
  );
}

/** Horizontal wrap for chips / badges (Universal Row has no flexWrap). */
export function WrapRow({
  children,
  testID,
  gap = space.sm,
}: {
  children: ReactNode;
  testID?: string;
  gap?: number;
}) {
  return (
    <View
      testID={testID}
      style={{ flexDirection: "row", flexWrap: "wrap", gap, alignItems: "center" }}
    >
      {children}
    </View>
  );
}

/** Root host for a screen — seeds Material 3 / SwiftUI tint. */
export function ScreenHost({
  children,
  testID,
  matchContents,
}: {
  children: ReactNode;
  testID?: string;
  matchContents?: boolean;
}) {
  return (
    <Host
      testID={testID}
      style={{ backgroundColor: color.surface, width: "100%", height: "100%" }}
      seedColor={color.seed}
      colorScheme="light"
      matchContents={matchContents}
      useViewportSizeMeasurement
    >
      {children}
    </Host>
  );
}

export function ScreenScroll({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
  /** @deprecated Prefer List onRefresh — kept so call sites typecheck during migration. */
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
}) {
  return (
    <ScreenHost testID={testID}>
      <ScrollView>
        <Column spacing={space.md} style={{ padding: space.md, paddingBottom: space.xl }}>
          {children}
        </Column>
      </ScrollView>
    </ScreenHost>
  );
}

export function Title({ children, testID }: { children: string; testID?: string }) {
  return (
    <Text testID={testID} textStyle={type.headline}>
      {children}
    </Text>
  );
}

export function Subtitle({ children, testID }: { children: string; testID?: string }) {
  return (
    <Text testID={testID} textStyle={type.subtitle}>
      {children}
    </Text>
  );
}

export function Body({
  children,
  testID,
  color,
  italic,
}: {
  children: string;
  testID?: string;
  color?: string;
  italic?: boolean;
}) {
  return (
    <Text
      testID={testID}
      textStyle={{
        ...type.body,
        color: color ?? type.body.color,
        // italic approximated via weight on platforms that ignore fontStyle
        fontWeight: italic ? "400" : type.body.fontWeight,
      }}
    >
      {children}
    </Text>
  );
}

export function Meta({
  children,
  testID,
  color,
  mono,
}: {
  children: string;
  testID?: string;
  color?: string;
  mono?: boolean;
}) {
  return (
    <Text
      testID={testID}
      textStyle={{
        ...type.meta,
        color: color ?? type.meta.color,
        fontFamily: mono ? monoFont : undefined,
      }}
    >
      {children}
    </Text>
  );
}

export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "warn" | "neutral" | "ok" | "danger";
}) {
  const bg =
    tone === "ok"
      ? color.okContainer
      : tone === "warn"
        ? color.tertiaryContainer
        : tone === "danger"
          ? color.errorContainer
          : color.secondaryContainer;
  const fg =
    tone === "ok"
      ? color.onOkContainer
      : tone === "warn"
        ? color.onTertiaryContainer
        : tone === "danger"
          ? color.onErrorContainer
          : color.onSecondaryContainer;
  return (
    <Row
      style={{
        backgroundColor: bg,
        borderRadius: shape.full,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text textStyle={{ fontSize: 10, fontWeight: "700", color: fg }}>{label.toUpperCase()}</Text>
    </Row>
  );
}

/** Section title with a tonal icon — M3 Expressive hierarchy cue. */
export function SectionHeader({
  title,
  subtitle,
  icon,
  tone = "neutral",
  testID,
}: {
  title: string;
  subtitle?: string;
  icon?: AppIconName;
  tone?: "seed" | "ok" | "warn" | "danger" | "neutral";
  testID?: string;
}) {
  return (
    <View testID={testID} style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        {icon ? <IconBubble name={icon} tone={tone} size={36} iconSize={18} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text textStyle={type.headline}>{title}</Text>
          {subtitle ? <Text textStyle={type.meta}>{subtitle}</Text> : null}
        </View>
      </View>
    </View>
  );
}

/** Icon + label + chevron navigation row (replaces sterile outlined button stacks). */
export function NavRow({
  label,
  help,
  icon,
  onPress,
  testID,
  tone = "neutral",
}: {
  label: string;
  help?: string;
  icon: AppIconName;
  onPress: () => void;
  testID?: string;
  tone?: "seed" | "ok" | "warn" | "danger" | "neutral";
}) {
  return (
    <ListItem
      testID={testID}
      onPress={onPress}
      leading={<IconBubble name={icon} tone={tone} size={36} iconSize={18} />}
      trailing={<Icon name={Icons.chevron} size={14} color={color.onSurfaceVariant} />}
      supportingText={help}
    >
      {label}
    </ListItem>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  testID,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  danger?: boolean;
}) {
  return (
    <Button
      testID={testID}
      label={label}
      variant="filled"
      disabled={disabled}
      onPress={onPress}
      style={danger ? { backgroundColor: color.error } : undefined}
    />
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Button
      testID={testID}
      label={label}
      variant="outlined"
      disabled={disabled}
      onPress={onPress}
    />
  );
}

export function TextButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Button
      testID={testID}
      label={label}
      variant="text"
      disabled={disabled}
      onPress={onPress}
    />
  );
}

export function FilterChip({
  label,
  selected,
  onPress,
  testID,
  count,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
  count?: number;
}) {
  return (
    <Button
      testID={testID}
      label={typeof count === "number" ? `${label} ${count}` : label}
      variant={selected ? "filled" : "outlined"}
      onPress={onPress}
    />
  );
}

export function ChoiceRow({
  label,
  score,
  selected,
  onPress,
  testID,
}: {
  label: string;
  score?: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Button
      testID={testID}
      variant={selected ? "filled" : "outlined"}
      onPress={onPress}
      label={score ? `${label}  ${score}` : label}
    />
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl }} testID="loading">
      <ActivityIndicator color={color.primary} />
      <View style={{ height: space.sm }} />
      <Text textStyle={type.meta}>{label}</Text>
    </View>
  );
}

export function PrefRow({
  label,
  help,
  value,
  onChange,
  testID,
}: {
  label: string;
  help: string;
  value: boolean;
  onChange: (next: boolean) => void;
  testID?: string;
}) {
  return (
    <Column testID={testID} spacing={4} style={{ paddingVertical: space.sm }}>
      <Switch label={label} value={value} onValueChange={onChange} />
      <Meta>{help}</Meta>
    </Column>
  );
}

function kindIcon(kindLabel: string): AppIconName {
  const k = kindLabel.toUpperCase();
  if (k.includes("SKILL")) return "skill";
  if (k.includes("SOURCE")) return "source";
  if (k.includes("DECISION")) return "decision";
  if (k.includes("CHANGE")) return "change";
  return "activity";
}

function kindTone(badgeTone: "warn" | "neutral" | "ok" | "danger"): "seed" | "ok" | "warn" | "danger" | "neutral" {
  if (badgeTone === "ok") return "ok";
  if (badgeTone === "warn") return "warn";
  if (badgeTone === "danger") return "danger";
  return "neutral";
}

export function ReviewRow({
  kindLabel,
  badge,
  badgeTone,
  title,
  listMeta,
  statusLine,
  testID,
  onPress,
}: {
  kindLabel: string;
  badge: string;
  badgeTone: "warn" | "neutral" | "ok" | "danger";
  title: string;
  listMeta: string;
  statusLine: string;
  testID?: string;
  onPress: () => void;
}) {
  return (
    <ListItem
      testID={testID}
      onPress={onPress}
      leading={
        <IconBubble
          name={kindIcon(kindLabel)}
          tone={kindTone(badgeTone)}
          size={36}
          iconSize={18}
        />
      }
      trailing={<Icon name={Icons.chevron} size={14} color={color.onSurfaceVariant} />}
      supportingText={`${kindLabel} · ${badge}\n${listMeta}\n${statusLine}`}
    >
      {title}
    </ListItem>
  );
}

/** Surface card — M3 tonal containers (no hard borders; depth from tone/elevation). */
export function SurfaceCard({
  children,
  testID,
  elevated,
  tint,
}: {
  children: ReactNode;
  testID?: string;
  /** Soft elevation for hero / unread (M3 Expressive). */
  elevated?: boolean;
  /** seed → primaryContainer (one standout/screen) · soft → surfaceContainer · none → surfaceContainerLowest */
  tint?: "seed" | "soft" | "none";
}) {
  const bg =
    tint === "seed"
      ? color.primaryContainer
      : tint === "soft"
        ? color.surfaceContainer
        : color.surfaceContainerLowest;
  const elevationStyle: ViewStyle = elevated
    ? Platform.select<ViewStyle>({
        web: { boxShadow: elevation.level1.boxShadow } as ViewStyle,
        default: {
          shadowColor: elevation.level1.shadowColor,
          shadowOpacity: elevation.level1.shadowOpacity,
          shadowRadius: elevation.level1.shadowRadius,
          shadowOffset: elevation.level1.shadowOffset,
          elevation: elevation.level1.elevation,
        },
      }) ?? {}
    : {};
  return (
    <Column
      testID={testID}
      spacing={space.sm}
      style={{
        backgroundColor: bg,
        borderRadius: shape.lg,
        padding: space.md,
        ...elevationStyle,
      }}
    >
      {children}
    </Column>
  );
}

/** Back-compat alias used by older screens. */
export const Card = SurfaceCard;

/** Back-compat Screen wrapper. */
export function Screen({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
  style?: unknown;
}) {
  return <ScreenHost testID={testID}>{children}</ScreenHost>;
}
