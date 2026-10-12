/**
 * PhoneApprove theme — Material Design 3 color roles + type/shape/space.
 * See apps/mobile/DESIGN.md.
 *
 * Brand seed (#0B5FFF) drives Host.seedColor (Material You on Android /
 * SwiftUI tint on iOS). Prefer `color.*` role names in new code.
 */

/** M3 color roles (light scheme). Pair only as documented in DESIGN.md. */
export const color = {
  // Primary
  primary: "#0B5FFF",
  onPrimary: "#FFFFFF",
  primaryContainer: "#DCE8FF",
  onPrimaryContainer: "#001A41",

  // Secondary
  secondary: "#535F70",
  onSecondary: "#FFFFFF",
  secondaryContainer: "#D7E3F8",
  onSecondaryContainer: "#101C2B",

  // Tertiary — used for warn / “needs you” emphasis (static family)
  tertiary: "#B45309",
  onTertiary: "#FFFFFF",
  tertiaryContainer: "#FEF3C7",
  onTertiaryContainer: "#3D1F00",

  // Error
  error: "#BE123C",
  onError: "#FFFFFF",
  errorContainer: "#FFE4E6",
  onErrorContainer: "#410002",

  // Surfaces
  surface: "#E8EEF6",
  onSurface: "#0B1220",
  onSurfaceVariant: "#5B6578",
  surfaceContainerLowest: "#FFFFFF",
  surfaceContainerLow: "#F3F6FB",
  surfaceContainer: "#EDEFF7",
  surfaceContainerHigh: "#E8EEF6",
  surfaceContainerHighest: "#E2E8F2",

  // Outline
  outline: "#747C8A",
  outlineVariant: "#D0D8E6",

  // Product extension (not core M3) — success / approved
  ok: "#047857",
  onOk: "#FFFFFF",
  okContainer: "#D1FAE5",
  onOkContainer: "#002114",

  /** Seed passed to Host.seedColor */
  seed: "#0B5FFF",
  splash: "#0B1220",
} as const;

export const shape = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 28,
  full: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const elevation = {
  /** Soft card lift — use sparingly (hero / unread). */
  level1: {
    shadowColor: "#0F2346",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    boxShadow: "0 8px 24px rgba(15, 35, 70, 0.08)",
  },
} as const;

/** M3-aligned type scale (system UI fonts — no custom TTF splash gate). */
export const type = {
  display: { fontSize: 32, fontWeight: "700" as const, color: color.onSurface },
  headline: { fontSize: 22, fontWeight: "700" as const, color: color.onSurface },
  title: { fontSize: 28, fontWeight: "700" as const, color: color.onSurface },
  subtitle: { fontSize: 17, fontWeight: "600" as const, color: color.onSurface },
  body: {
    fontSize: 15,
    fontWeight: "400" as const,
    color: color.onSurface,
    lineHeight: 22,
  },
  label: { fontSize: 12, fontWeight: "700" as const, color: color.onSurfaceVariant },
  meta: {
    fontSize: 13,
    fontWeight: "400" as const,
    color: color.onSurfaceVariant,
    lineHeight: 18,
  },
  caption: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: color.onSurfaceVariant,
  },
} as const;

/**
 * @deprecated Prefer `color.*` M3 role names. Kept so existing screens keep compiling.
 */
export const brand = {
  seed: color.seed,
  seedSoft: color.primaryContainer,
  seedMuted: color.primary,
  ink: color.onSurface,
  inkMuted: color.onSurfaceVariant,
  inkFaint: "#8A93A6",
  surface: color.surface,
  surfaceElevated: color.surfaceContainerLow,
  card: color.surfaceContainerLowest,
  border: color.outlineVariant,
  borderSoft: color.surfaceContainerHighest,
  neutralSoft: color.surfaceContainerHighest,
  warn: color.tertiary,
  warnBg: color.tertiaryContainer,
  danger: color.error,
  dangerBg: color.errorContainer,
  ok: color.ok,
  okBg: color.okContainer,
  splash: color.splash,
  shadow: "rgba(15, 35, 70, 0.08)",
} as const;

/** @deprecated Prefer brand/color — gradual migration. */
export const colors = {
  bg: color.surface,
  ink: color.onSurface,
  inkMuted: color.onSurfaceVariant,
  inkFaint: brand.inkFaint,
  card: color.surfaceContainerLowest,
  border: color.outlineVariant,
  accent: color.primary,
  warn: color.tertiary,
  warnBg: color.tertiaryContainer,
  danger: color.error,
  dangerBg: color.errorContainer,
  ok: color.ok,
  okBg: color.okContainer,
  splash: color.splash,
} as const;
