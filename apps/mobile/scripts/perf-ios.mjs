#!/usr/bin/env node
/**
 * iOS native performance checklist — Instruments Time Profiler + RN DevTools.
 * There is no Flashlight-equivalent CLI on iOS yet; this writes a reproducible runbook
 * and verifies xcrun/simctl when available.
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

const xcrun = which("xcrun");
const guidePath = path.join(OUT, "ios-instruments-RUNBOOK.md");

const guide = `# iOS performance runbook (Instruments + RN DevTools)

ClawQL iOS bundle id: \`com.clawql.app\`

## 1. JS profiler (Expo Go or Dev Client)

1. \`cd apps/mobile && EXPO_PUBLIC_CLAWQL_FIXTURE=1 npx expo start --no-dev --minify\`
2. Open the app → Developer menu → **Open DevTools**
3. **Profiler** tab → Record → fixture sign-in → Review → open change → Approve/Decline → Stop
4. Export / screenshot the flame chart; drop under \`perf/out/ios-rn-profiler/\`

## 2. Native CPU flame (release / prebuild)

Needs Apple Developer toolchain (Xcode). Expo Go cannot profile native modules.

\`\`\`bash
cd apps/mobile
npx expo prebuild --platform ios
# open ios/*.xcworkspace in Xcode → Product → Profile
# Instruments → Time Profiler
# Record while: cold launch → Review scroll → open skill → Promote
# File → Export → save .trace under perf/out/ios-time-profiler.trace
\`\`\`

Also useful templates: **Hangs**, **Allocations**, **Leaks**.

## 3. Perf overlay (FPS / RAM)

Developer menu → **Toggle performance monitor**
Target: UI & JS FPS near 60 while scrolling Review; watch JS heap across navigate/back.

## Lab proxy (this VM / CI)

\`npm run perf:lab\` — Lighthouse mobile + Chrome CPU profile on the web export.
`;

fs.writeFileSync(guidePath, guide);

if (!xcrun) {
  console.log(`xcrun not available (not macOS / no Xcode).

Wrote ${path.relative(root, guidePath)}

Use a Mac with Xcode for Instruments flame charts.
Meanwhile run: npm run perf:lab
`);
  process.exit(0);
}

const sims = spawnSync("xcrun", ["simctl", "list", "devices", "available"], { encoding: "utf8" });
console.log(sims.stdout?.split("\n").slice(0, 20).join("\n") || "(no simctl output)");
console.log(`\nWrote ${path.relative(root, guidePath)}`);
console.log("Open that runbook and Profile with Instruments Time Profiler.");
process.exit(0);
