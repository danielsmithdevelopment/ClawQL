/**
 * Regenerate M3 light scheme tokens for PhoneApprove.
 *
 * - Primary / surfaces / tertiary / error: MCU from ClawQL orange `#FF5636`
 *   (`themeFromSourceColor` — same algorithm as Material Theme Builder)
 * - Secondary: tonal roles from ClawQL navy `#081133` so secondaryContainer
 *   does not collapse onto primaryContainer (MCU mono-seed quirk for this hue)
 *
 *   node scripts/generate-m3-theme.mjs
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { argbFromHex, hexFromArgb, themeFromSourceColor, TonalPalette } =
  require("@material/material-color-utilities");

const SEED = "#FF5636";
const NAVY = "#081133";

const theme = themeFromSourceColor(argbFromHex(SEED));
const light = theme.schemes.light;
const n = theme.palettes.neutral;
const secondary = TonalPalette.fromInt(argbFromHex(NAVY));

const hex = (v) => hexFromArgb(v);
const role = (scheme, k) => hex(scheme[k]);

// M3 light secondary tone mapping (Material Theme Builder / MCU Scheme)
const secondaryRoles = {
  secondary: hex(secondary.tone(40)),
  onSecondary: hex(secondary.tone(100)),
  secondaryContainer: hex(secondary.tone(90)),
  onSecondaryContainer: hex(secondary.tone(10)),
};

console.log(`// Seed ${SEED} + secondary ${NAVY} → M3 light`);
console.log("{");
for (const k of [
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
]) {
  console.log(`  ${k}: "${role(light, k)}",`);
}
for (const [k, v] of Object.entries(secondaryRoles)) {
  console.log(`  ${k}: "${v}",`);
}
for (const k of [
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
console.log(`  surface: "${hex(n.tone(98))}",`);
console.log(`  onSurface: "${role(light, "onSurface")}",`);
console.log(`  onSurfaceVariant: "${role(light, "onSurfaceVariant")}",`);
console.log(`  surfaceContainerLowest: "${hex(n.tone(100))}",`);
console.log(`  surfaceContainerLow: "${hex(n.tone(96))}",`);
console.log(`  surfaceContainer: "${hex(n.tone(94))}",`);
console.log(`  surfaceContainerHigh: "${hex(n.tone(92))}",`);
console.log(`  surfaceContainerHighest: "${hex(n.tone(90))}",`);
console.log(`  seed: "${SEED}",`);
console.log("}");
