import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type TextProps,
  type ViewProps,
} from "react-native";

import { colors, space } from "../theme";

export function Screen({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.screen, style]} {...rest}>
      {children}
    </View>
  );
}

/** Scrollable screen body — flex:1 avoids RN-web blank layouts inside tab screens. */
export function ScreenScroll({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}) {
  return (
    <Screen testID={testID}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: space.xl, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </Screen>
  );
}

export function Card({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

export function Title({ style, ...rest }: TextProps) {
  return <Text style={[styles.title, style]} {...rest} />;
}

export function Subtitle({ style, ...rest }: TextProps) {
  return <Text style={[styles.subtitle, style]} {...rest} />;
}

export function Body({ style, ...rest }: TextProps) {
  return <Text style={[styles.body, style]} {...rest} />;
}

export function Meta({ style, ...rest }: TextProps) {
  return <Text style={[styles.meta, style]} {...rest} />;
}

export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "warn" | "neutral" | "ok" | "danger";
}) {
  const toneStyle =
    tone === "ok"
      ? styles.badgeOk
      : tone === "warn"
        ? styles.badgeWarn
        : tone === "danger"
          ? styles.badgeDanger
          : styles.badgeNeutral;
  return (
    <View style={[styles.badge, toneStyle]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
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
    <Pressable
      accessibilityRole="button"
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryBtn,
        danger && styles.dangerBtn,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
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
    <Pressable
      accessibilityRole="button"
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryBtn,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={styles.secondaryBtnText}>{label}</Text>
    </Pressable>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={styles.loading} testID="loading">
      <ActivityIndicator color={colors.accent} />
      <Meta style={{ marginTop: space.sm }}>{label}</Meta>
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
    <View style={styles.prefRow} testID={testID}>
      <View style={{ flex: 1, paddingRight: space.md }}>
        <Body style={{ fontWeight: "600" }}>{label}</Body>
        <Meta>{help}</Meta>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.accent, false: colors.border }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: space.md,
    paddingTop: space.md,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: space.md,
    marginBottom: space.md,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  meta: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkMuted,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  badgeOk: { backgroundColor: colors.okBg },
  badgeWarn: { backgroundColor: colors.warnBg },
  badgeDanger: { backgroundColor: colors.dangerBg },
  badgeNeutral: { backgroundColor: colors.border },
  primaryBtn: {
    backgroundColor: colors.ink,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  dangerBtn: {
    backgroundColor: colors.danger,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryBtn: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    backgroundColor: colors.card,
  },
  secondaryBtnText: {
    color: colors.ink,
    fontWeight: "600",
    fontSize: 15,
  },
  loading: {
    padding: space.xl,
    alignItems: "center",
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
