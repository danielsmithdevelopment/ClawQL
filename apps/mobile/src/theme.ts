/**
 * PhoneApprove theme — Material Design 3 roles, seeded from ClawQL brand art
 * (navy field · orange QL · warm paper · sky technical).
 *
 * See apps/mobile/DESIGN.md.
 */

/** ClawQL brand reference swatches (from logo / brand still). */
export const brandSwatches = {
  navy: "#081133",
  navyDeep: "#030921",
  navyGlow: "#1B2A68",
  orange: "#FF5636",
  orangeSoft: "#FF8A6E",
  paper: "#EFEAE7",
  sky: "#7289AB",
  skyBright: "#A8C0E0",
} as const;

/**
 * M3 **dark** color roles mapped from ClawQL brand.
 * Pair only as documented (primary↔onPrimary, surface↔onSurface, …).
 */
export const color = {
  // Primary = brand orange (CTAs, active tint, emphasis)
  primary: brandSwatches.orange,
  onPrimary: "#FFFFFF",
  primaryContainer: "#5C1A0F",
  onPrimaryContainer: "#FFDAD2",

  // Secondary = brand sky (technical / lower emphasis)
  secondary: brandSwatches.skyBright,
  onSecondary: brandSwatches.navyDeep,
  secondaryContainer: "#243556",
  onSecondaryContainer: "#D4E3FF",

  // Tertiary — amber “needs you” (warn family on dark)
  tertiary: "#FFB95C",
  onTertiary: "#422B00",
  tertiaryContainer: "#5C3D00",
  onTertiaryContainer: "#FFDDB3",

  // Error
  error: "#FFB4AB",
  onError: "#690005",
  errorContainer: "#93000A",
  onErrorContainer: "#FFDAD6",

  // Surfaces = brand navy field
  surface: brandSwatches.navy,
  onSurface: brandSwatches.paper,
  onSurfaceVariant: brandSwatches.sky,
  surfaceContainerLowest: brandSwatches.navyDeep,
  surfaceContainerLow: "#0C1638",
  surfaceContainer: "#121C42",
  surfaceContainerHigh: "#1A2650",
  surfaceContainerHighest: "#243056",

  // Outline
  outline: "#8A9BB8",
  outlineVariant: "#3A4668",

  // Product extension — success / approved (readable on navy)
  ok: "#6FDBA8",
  onOk: "#003824",
  okContainer: "#005236",
  onOkContainer: "#8FF8C3",

  /** Host.seedColor — drives Material You / SwiftUI tint */
  seed: brandSwatches.orange,
  splash: brandSwatches.navyDeep,
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
  level1: {
    shadowColor: "#000000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    boxShadow: "0 10px 28px rgba(0, 0, 0, 0.45)",
  },
} as const;

/** M3-aligned type scale on brand paper / sky. */
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
 * @deprecated Prefer `color.*` M3 role names.
 * Aliases remapped to the dark brand scheme so existing screens pick up navy/orange.
 */
export const brand = {
  seed: color.seed,
  seedSoft: color.primaryContainer,
  seedMuted: color.primary,
  ink: color.onSurface,
  inkMuted: color.onSurfaceVariant,
  inkFaint: "#6B7C9A",
  surface: color.surface,
  surfaceElevated: color.surfaceContainerLow,
  card: color.surfaceContainer,
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
  shadow: "rgba(0, 0, 0, 0.45)",
} as const;

/** @deprecated Prefer color/brand. */
export const colors = {
  bg: color.surface,
  ink: color.onSurface,
  inkMuted: color.onSurfaceVariant,
  inkFaint: brand.inkFaint,
  card: color.surfaceContainer,
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
