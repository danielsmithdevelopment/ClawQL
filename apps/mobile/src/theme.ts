/**
 * PhoneApprove theme — Material Design 3 **light** scheme.
 *
 * Visual reference: ClawQL Cloud console + brand mark
 * (navy chrome, orange Q for actions — not orange everywhere).
 *
 * - Primary / surfaces / secondary: MCU `themeFromSourceColor(#12182b)`
 *   (same algorithm as Material Theme Builder — https://m3.material.io/)
 * - Accent (filled CTAs only): tonal roles from brand orange `#FF5636`
 *
 * Regenerate: `node scripts/generate-m3-theme.mjs`
 * Rules: `DESIGN.md`
 */

/** Brand + console reference swatches. */
export const brandSwatches = {
  /** Managed cloud console `--primary` / sidebar */
  navy: "#12182b",
  /** Marketing splash / logo field */
  navyDeep: "#081133",
  /** Logo Q — action accent only */
  orange: "#FF5636",
} as const;

/**
 * M3 light color roles. Pair only as documented:
 * primary↔onPrimary, primaryContainer↔onPrimaryContainer, surface*↔onSurface,
 * accent↔onAccent (product action accent, not MCU primary).
 */
export const color = {
  // Primary — MCU light from console navy #12182b
  primary: "#3f5aa9",
  onPrimary: "#ffffff",
  primaryContainer: "#dbe1ff",
  onPrimaryContainer: "#00174c",

  secondary: "#595e72",
  onSecondary: "#ffffff",
  secondaryContainer: "#dde1f9",
  onSecondaryContainer: "#161b2c",

  // MCU tertiary from blue seed (soft mauve) — rare decorative use
  tertiary: "#745470",
  onTertiary: "#ffffff",
  tertiaryContainer: "#ffd6f7",
  onTertiaryContainer: "#2b122a",

  error: "#ba1a1a",
  onError: "#ffffff",
  errorContainer: "#ffdad6",
  onErrorContainer: "#410002",

  // Action accent — brand orange (filled CTAs; not chrome)
  accent: "#b72205",
  onAccent: "#ffffff",
  accentContainer: "#ffdad3",
  onAccentContainer: "#3e0400",

  // Surfaces — cool neutrals from blue seed
  surface: "#fbf8fd",
  onSurface: "#1b1b1f",
  onSurfaceVariant: "#45464f",
  surfaceContainerLowest: "#ffffff",
  surfaceContainerLow: "#f5f3f7",
  surfaceContainer: "#efedf1",
  surfaceContainerHigh: "#eae7ec",
  surfaceContainerHighest: "#e4e2e6",

  outline: "#757680",
  outlineVariant: "#c6c6d0",

  inverseSurface: "#303034",
  inverseOnSurface: "#f2f0f4",
  inversePrimary: "#b4c5ff",

  // Product extensions
  ok: "#146c2e",
  onOk: "#ffffff",
  okContainer: "#a6f2a8",
  onOkContainer: "#002106",
  /** “Needs you” / warn — warm amber, not orange accent */
  warn: "#8b6914",
  onWarn: "#ffffff",
  warnContainer: "#ffefc2",
  onWarnContainer: "#261a00",

  /** Host.seedColor — blue so native M3/SwiftUI tint matches chrome */
  seed: brandSwatches.navy,
  orange: brandSwatches.orange,
  splash: brandSwatches.navyDeep,
} as const;

export const shape = {
  xs: 4,
  sm: 8,
  md: 12,
  /** M3 card / large component */
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

/** M3 prefers tonal surfaces over heavy shadows — keep elevation subtle. */
export const elevation = {
  level1: {
    shadowColor: "#1B1B1F",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    boxShadow: "0 2px 8px rgba(27, 27, 31, 0.08)",
  },
} as const;

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

/** @deprecated Prefer `color.*` M3 role names. */
export const brand = {
  seed: color.seed,
  seedSoft: color.primaryContainer,
  seedMuted: color.primary,
  accent: color.accent,
  accentSoft: color.accentContainer,
  ink: color.onSurface,
  inkMuted: color.onSurfaceVariant,
  inkFaint: color.outline,
  surface: color.surface,
  surfaceElevated: color.surfaceContainerLow,
  card: color.surfaceContainerLowest,
  border: color.outlineVariant,
  borderSoft: color.outlineVariant,
  neutralSoft: color.surfaceContainerHighest,
  warn: color.warn,
  warnBg: color.warnContainer,
  danger: color.error,
  dangerBg: color.errorContainer,
  ok: color.ok,
  okBg: color.okContainer,
  splash: color.splash,
  shadow: "rgba(27, 27, 31, 0.08)",
} as const;

/** @deprecated Prefer color/brand. */
export const colors = {
  bg: color.surface,
  ink: color.onSurface,
  inkMuted: color.onSurfaceVariant,
  inkFaint: brand.inkFaint,
  card: color.surfaceContainerLowest,
  border: color.outlineVariant,
  accent: color.accent,
  warn: color.warn,
  warnBg: color.warnContainer,
  danger: color.error,
  dangerBg: color.errorContainer,
  ok: color.ok,
  okBg: color.okContainer,
  splash: color.splash,
} as const;
