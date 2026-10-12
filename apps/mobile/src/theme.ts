/**
 * PhoneApprove theme — Material Design 3 **light** scheme.
 *
 * Primary / surfaces / tertiary / error: MCU `themeFromSourceColor(#FF5636)`
 * (same algorithm as Material Theme Builder — https://m3.material.io/).
 * Secondary: tonal roles from brand navy `#081133` so icon bubbles
 * (`secondaryContainer`) stay distinct from coral `primaryContainer`.
 *
 * Regenerate: `node scripts/generate-m3-theme.mjs`
 * Rules: `DESIGN.md`
 */

/** Brand reference (marketing still) — seeds for MCU / secondary palette. */
export const brandSwatches = {
  orange: "#FF5636",
  navy: "#081133",
} as const;

/**
 * M3 light color roles. Pair only as documented:
 * primary↔onPrimary, primaryContainer↔onPrimaryContainer, surface*↔onSurface.
 */
export const color = {
  // Accent — MCU light from #FF5636
  primary: "#b72205",
  onPrimary: "#ffffff",
  primaryContainer: "#ffdad3",
  onPrimaryContainer: "#3e0400",

  // Secondary — navy tonal (M3 light tones 40/100/90/10)
  secondary: "#545c82",
  onSecondary: "#ffffff",
  secondaryContainer: "#dde1ff",
  onSecondaryContainer: "#10193b",

  tertiary: "#6e5c2e",
  onTertiary: "#ffffff",
  tertiaryContainer: "#f9e0a6",
  onTertiaryContainer: "#241a00",

  error: "#ba1a1a",
  onError: "#ffffff",
  errorContainer: "#ffdad6",
  onErrorContainer: "#410002",

  // Surfaces — neutral tonal steps (M3 surface containers)
  surface: "#fff8f6",
  onSurface: "#201a19",
  onSurfaceVariant: "#534340",
  surfaceContainerLowest: "#ffffff",
  surfaceContainerLow: "#fef1ee",
  surfaceContainer: "#f8ebe8",
  surfaceContainerHigh: "#f3e5e3",
  surfaceContainerHighest: "#ede0dd",

  outline: "#85736f",
  outlineVariant: "#d8c2bd",

  inverseSurface: "#362f2d",
  inverseOnSurface: "#fbeeeb",
  inversePrimary: "#ffb4a5",

  // Product extension — success (not core M3)
  ok: "#146c2e",
  onOk: "#ffffff",
  okContainer: "#a6f2a8",
  onOkContainer: "#002106",

  /** Host.seedColor */
  seed: brandSwatches.orange,
  splash: brandSwatches.navy,
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
    shadowColor: "#201A19",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    boxShadow: "0 2px 8px rgba(32, 26, 25, 0.08)",
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
  ink: color.onSurface,
  inkMuted: color.onSurfaceVariant,
  inkFaint: "#85736f",
  surface: color.surface,
  surfaceElevated: color.surfaceContainerLow,
  card: color.surfaceContainerLowest,
  border: color.outlineVariant,
  borderSoft: color.outlineVariant,
  neutralSoft: color.surfaceContainerHighest,
  warn: color.tertiary,
  warnBg: color.tertiaryContainer,
  danger: color.error,
  dangerBg: color.errorContainer,
  ok: color.ok,
  okBg: color.okContainer,
  splash: color.splash,
  shadow: "rgba(32, 26, 25, 0.08)",
} as const;

/** @deprecated Prefer color/brand. */
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
