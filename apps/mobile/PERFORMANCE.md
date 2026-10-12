# Mobile performance — Lighthouse equivalents

Web Lighthouse does **not** measure Hermes / UIKit / Compose. For PhoneApprove we use a **tiered** stack:

| Tier | What | Platforms | Command |
| ---- | ---- | --------- | ------- |
| **Lab (CI / no device)** | Bundle weight + interaction timings + Lighthouse mobile on web export + **Chrome CPU flame profile** | JS shared by iOS/Android (+ web proxy) | `npm run perf:lab` |
| **Android device** | Flashlight score (FPS / CPU / RAM) + Perfetto flame | Android | `npm run perf:android` |
| **iOS device / sim** | React Native DevTools Profiler + Instruments Time Profiler | iOS | `npm run perf:ios` |

## Quick start (no Apple / Google signup)

```bash
cd apps/mobile
npm run perf:lab          # export web/ios/android + runtime + flame + assert
# artifacts → perf/out/
# open perf/out/cpu-profile.cpuprofile in https://www.speedscope.app
```

Refresh the committed baseline after an intentional change:

```bash
PERF_UPDATE_BASELINE=1 npm run perf:lab
```

Gates live in [`perf/thresholds.json`](perf/thresholds.json). Baseline: [`perf/baselines/lab.json`](perf/baselines/lab.json).

## What each artifact means

### `perf/out/bundle.json`

Expo `export` sizes for **web**, **ios**, and **android**. Hermes/native bytecode weight is the best device-free signal that both store builds stay lean.

### `perf/out/lighthouse-mobile.json`

Lighthouse **mobile** form-factor against the **web export**. Useful for JS parse/eval + render regressions; **not** a store App Review score. Same pattern as `apps/docs` / landing Lighthouse CI.

### `perf/out/cpu-profile.cpuprofile`

Chrome DevTools Protocol sampling profile over the fixture journey (sign-in → home → review → detail → decline). Open in [speedscope](https://www.speedscope.app) for **flame / sandwich** views — this is the lab flame graph.

### `perf/out/runtime.json`

Wall-clock interaction timings (`signInToHomeMs`, `homeToReviewMs`, `reviewOpenDetailMs`).

## Android (Flashlight + Perfetto)

Flashlight is the usual “Lighthouse for React Native Android” answer: overall score, FPS graph, CPU (watch `mqt_js` / Hermes), RAM.

```bash
# device connected
npm run perf:android
```

For system flame charts: Android Studio **Profiler → CPU**, or export a **Perfetto** trace and open [ui.perfetto.dev](https://ui.perfetto.dev). Measure on a **release / `--no-dev --minify`** build when comparing.

## iOS (Instruments + RN DevTools)

```bash
npm run perf:ios   # writes perf/out/ios-instruments-RUNBOOK.md
```

1. **JS flame:** DevTools → Profiler (Expo Go OK).
2. **Native flame:** `expo prebuild` → Xcode → Product → Profile → **Time Profiler** (needs Apple toolchain; not Expo Go).
3. Overlay: Developer menu → Performance monitor (UI/JS FPS + JS heap).

## Baseline (lab, 2026-10-12)

| Signal | Value |
| ------ | ----- |
| Web JS | ~3.6 MB |
| iOS Hermes `.hbc` | ~6.7 MB |
| Android Hermes `.hbc` | ~6.8 MB |
| Lighthouse mobile Performance | ~0.84 |
| Fixture sign-in → home | ~100 ms |
| CPU profile | `perf/out/cpu-profile.cpuprofile` → speedscope |

Largest **assets** (not Hermes): Material Symbols TTF ~948 KB, Material Icons TTF ~348 KB. First weight win is subsetting or dropping the unused icon font on platforms that already use SF Symbols / XML material-symbols.

## Optimization checklist (when lab or device scores regress)

1. Speedscope / Instruments — who owns the wide flame stacks?
2. Bundle largest files in `bundle.json` — unexpected deps / icons / fonts?
3. Avoid unnecessary re-renders on Review list (prefer `List` + stable row props).
4. Keep fixture/NFC paths Effect-thin at the UI boundary (no heavy sync work on press).
5. Re-run `perf:lab` then device Flashlight / Instruments before claiming a win.

## Relation to console Lighthouse / OTEL flames

- Cloud console / docs Lighthouse CI is **web-only** (`scripts/dev/assert-lighthouse-scores.mjs`).
- Server OTEL span flamegraphs (Tempo) are **backend** — different problem than RN FPS.
