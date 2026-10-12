#!/usr/bin/env node
/**
 * Android native performance — Flashlight (FPS / CPU / RAM score).
 * Requires adb + a connected device/emulator and a release (or --no-dev) build.
 *
 * This is the Android counterpart to web Lighthouse for RN apps.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "perf", "out");
fs.mkdirSync(OUT, { recursive: true });

function which(bin) {
  const r = spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
}

const adb = which("adb");
if (!adb) {
  console.error(`adb not found.

Android native perf needs:
  1. Android SDK platform-tools (adb)
  2. Emulator or USB device
  3. App installed (Expo Dev Client / release): com.clawql.app

Lab proxy (no device): npm run perf:lab
Docs: PERFORMANCE.md § Android
`);
  process.exit(2);
}

const devices = spawnSync(adb, ["devices"], { encoding: "utf8" });
const lines = (devices.stdout || "").split("\n").filter((l) => /\tdevice$/.test(l));
if (lines.length === 0) {
  console.error("No adb device in 'device' state. Start an emulator or plug in a phone.");
  process.exit(2);
}

const flashlight = which("flashlight");
const outJson = path.join(OUT, "flashlight-android.json");

console.log(`
=== Android Flashlight measure ===
Device: ${lines[0].split("\t")[0]}
Bundle: com.clawql.app

Prereqs:
  - Install a production-like build (EAS preview/production or expo run:android --variant release)
  - Prefer low-end device; avoid __DEV__ Metro for apples-to-apples scores
`);

if (!flashlight) {
  const guide = path.join(OUT, "android-flashlight-SETUP.md");
  fs.writeFileSync(
    guide,
    `# Flashlight setup

Install from the official channel (do not curl|bash unverified scripts):

- https://docs.flashlight.dev/ (or \`npm i -g @perf-profiler/flashlight\` if that matches current docs)

Then re-run:

\`\`\`bash
cd apps/mobile
npm run perf:android
\`\`\`

Manual equivalent:

\`\`\`bash
flashlight measure --bundleId com.clawql.app --duration 10000 --resultsFile ${outJson}
# Interact: open Review, scroll queue, open a change request
flashlight report ${outJson}
\`\`\`

Export Perfetto/systrace for flame graphs:

\`\`\`bash
adb shell perfetto -c - --txt -o /data/misc/perfetto-traces/trace.perfetto-trace <<EOF
# use Android Studio Profiler → CPU → Record, or ui.perfetto.dev recipes
EOF
\`\`\`
`
  );
  console.error(`flashlight CLI not on PATH. Wrote setup notes → ${path.relative(root, guide)}`);
  process.exit(2);
}

const r = spawnSync(
  flashlight,
  [
    "measure",
    "--bundleId",
    "com.clawql.app",
    "--duration",
    "10000",
    "--resultsFile",
    outJson,
  ],
  { cwd: root, stdio: "inherit" }
);

if (r.status !== 0) process.exit(r.status ?? 1);
console.log("wrote", path.relative(root, outJson));
spawnSync(flashlight, ["report", outJson], { cwd: root, stdio: "inherit" });
