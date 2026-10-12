/**
 * ClawQL mobile visual tokens.
 * Brand seed drives Material 3 (Android) and SwiftUI tint (iOS) via Host.seedColor.
 */
export const brand = {
  /** Material You / SwiftUI tint seed */
  seed: "#0B5FFF",
  ink: "#0B1220",
  inkMuted: "#5B6578",
  inkFaint: "#8A93A6",
  surface: "#F4F7FB",
  card: "#FFFFFF",
  border: "#D8DEE9",
  warn: "#B45309",
  warnBg: "#FEF3C7",
  danger: "#BE123C",
  dangerBg: "#FFE4E6",
  ok: "#047857",
  okBg: "#D1FAE5",
  splash: "#0B1220",
} as const;

/** @deprecated Prefer brand.* — kept for gradual migration of remaining RN styles. */
export const colors = {
  bg: brand.surface,
  ink: brand.ink,
  inkMuted: brand.inkMuted,
  inkFaint: brand.inkFaint,
  card: brand.card,
  border: brand.border,
  accent: brand.seed,
  warn: brand.warn,
  warnBg: brand.warnBg,
  danger: brand.danger,
  dangerBg: brand.dangerBg,
  ok: brand.ok,
  okBg: brand.okBg,
  splash: brand.splash,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const type = {
  title: { fontSize: 28, fontWeight: "700" as const, color: brand.ink },
  headline: { fontSize: 22, fontWeight: "700" as const, color: brand.ink },
  subtitle: { fontSize: 17, fontWeight: "600" as const, color: brand.ink },
  body: { fontSize: 15, fontWeight: "400" as const, color: brand.ink, lineHeight: 22 },
  meta: { fontSize: 13, fontWeight: "400" as const, color: brand.inkMuted, lineHeight: 18 },
  caption: { fontSize: 11, fontWeight: "600" as const, color: brand.inkFaint },
} as const;
