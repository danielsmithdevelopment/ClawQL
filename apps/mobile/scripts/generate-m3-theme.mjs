/**
 * Regenerate M3 light scheme tokens for PhoneApprove.
 *
 * Visual reference: ClawQL Cloud console + brand (navy chrome, orange Q accent).
 *
 * - Primary / surfaces / secondary: MCU from console navy `#12182b`
 *   (`themeFromSourceColor` — Material Theme Builder algorithm)
 * - Accent (actions): tonal roles from brand orange `#FF5636`
 *   → filled CTAs, not chrome / surfaces / icon defaults
 *
 *   node scripts/generate-m3-theme.mjs
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { argbFromHex, hexFromArgb, themeFromSourceColor, TonalPalette } =
  require("@material/material-color-utilities");

/** Matches `apps/dashboard` managed `--primary` / sidebar. */
const BLUE = "#12182b";
/** ClawQL brand orange — action accent only. */
const ORANGE = "#FF5636";

const theme = themeFromSourceColor(argbFromHex(BLUE));
const light = theme.schemes.light;
const n = theme.palettes.neutral;
const accent = TonalPalette.fromInt(argbFromHex(ORANGE));

const hex = (v) => hexFromArgb(v);
const role = (scheme, k) => hex(scheme[k]);

// M3 light tertiary-style tones for the orange action accent
const accentRoles = {
  accent: hex(accent.tone(40)),
  onAccent: hex(accent.tone(100)),
  accentContainer: hex(accent.tone(90)),
  onAccentContainer: hex(accent.tone(10)),
};

console.log(`// Primary ${BLUE} + accent ${ORANGE} → M3 light`);
console.log("{");
for (const k of [
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "tertiary",
  "onTertiary",
  "tertiaryContainer",
  "onTertiaryContainer",
  "error",
  "onError",
  "errorContainer",
  "onErrorContainer",
  "outline",
  "outlineVariant",
  "inverseSurface",
  "inverseOnSurface",
  "inversePrimary",
]) {
  console.log(`  ${k}: "${role(light, k)}",`);
}
for (const [k, v] of Object.entries(accentRoles)) {
  console.log(`  ${k}: "${v}",`);
}
console.log(`  surface: "${hex(n.tone(98))}",`);
console.log(`  onSurface: "${role(light, "onSurface")}",`);
console.log(`  onSurfaceVariant: "${role(light, "onSurfaceVariant")}",`);
console.log(`  surfaceContainerLowest: "${hex(n.tone(100))}",`);
console.log(`  surfaceContainerLow: "${hex(n.tone(96))}",`);
console.log(`  surfaceContainer: "${hex(n.tone(94))}",`);
console.log(`  surfaceContainerHigh: "${hex(n.tone(92))}",`);
console.log(`  surfaceContainerHighest: "${hex(n.tone(90))}",`);
console.log(`  seed: "${BLUE}",`);
console.log(`  orange: "${ORANGE}",`);
console.log("}");
