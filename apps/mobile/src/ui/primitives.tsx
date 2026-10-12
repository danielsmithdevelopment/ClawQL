/**
 * Adaptive UI primitives — @expo/ui universal components.
 * Android → Material 3 (Jetpack Compose); iOS → SwiftUI; web → RN/DOM fallback.
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

import { brand, space, type } from "../theme";
import { Icons } from "./icons";

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
      style={{ backgroundColor: brand.surface, width: "100%", height: "100%" }}
      seedColor={brand.seed}
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
      ? brand.okBg
      : tone === "warn"
        ? brand.warnBg
        : tone === "danger"
          ? brand.dangerBg
          : brand.border;
  const fg =
    tone === "ok"
      ? brand.ok
      : tone === "warn"
        ? brand.warn
        : tone === "danger"
          ? brand.danger
          : brand.inkMuted;
  return (
    <Row
      style={{
        backgroundColor: bg,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <Text textStyle={{ fontSize: 10, fontWeight: "700", color: fg }}>{label.toUpperCase()}</Text>
    </Row>
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
      style={danger ? { backgroundColor: brand.danger } : undefined}
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
      <ActivityIndicator color={brand.seed} />
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
      trailing={<Icon name={Icons.chevron} size={14} color={brand.inkFaint} />}
      supportingText={`${kindLabel} · ${badge}\n${listMeta}\n${statusLine}`}
    >
      {title}
    </ListItem>
  );
}

/** Surface card for detail blocks that aren't list rows. */
export function SurfaceCard({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}) {
  return (
    <Column
      testID={testID}
      spacing={space.sm}
      style={{
        backgroundColor: brand.card,
        borderColor: brand.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: space.md,
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
