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

## Baseline (lab, after optimize — 2026-10-12)

| Signal | Before | After |
| ------ | -----: | ----: |
| Web JS / total | 3.6 / 5.4 MB | **3.5 / 3.9 MB** |
| iOS Hermes / total | 6.7 / 7.2 MB | **6.7 / 6.7 MB** |
| Android Hermes / total | 6.8 / 8.2 MB | **6.7 / 6.7 MB** |
| Lighthouse mobile Performance | 0.84 | **0.85** |
| Fixture sign-in → home | ~100 ms | ~100 ms |

No `.ttf` icon fonts in web/ios/android exports. Android/web use XML vector drawables or text glyphs; iOS uses SF Symbols.

## Optimizations applied (best-practice pass)

Mapped from Expo/RN 2026 playbook + our lab baseline:

| Practice | Change |
| -------- | ------ |
| Don’t ship unused icon fonts | Platform-split `TabGlyph` — SF Symbols (iOS), Material XML (Android), text (web). No `@expo/vector-icons` / no `expo-symbols` on Android/web. |
| Block expo-router Material Symbols leak | `metro.config.cjs` aliases Android `materialIconConverter` → no-op stub ([expo#43614](https://github.com/expo/expo/issues/43614)). |
| Trim icon graph | `icons.ts` keeps only `chevron`; tabs use `tabIcons.ts`. |
| Don’t block splash on fonts | Removed SpaceMono `useFonts` gate; digests use system Menlo/monospace. |
| React Compiler | `experiments.reactCompiler` + babel-preset-expo `react-compiler`. |
| New Architecture | Expo SDK 57 default (Fabric / TurboModules). |
| Lazy tabs | `Tabs` `lazy: true` so inactive screens aren’t work on first paint. |

## Optimization checklist (when lab or device scores regress)

1. Speedscope / Instruments — who owns the wide flame stacks?
2. Bundle largest files in `bundle.json` — unexpected deps / icons / fonts?
3. Avoid unnecessary re-renders on Review list (prefer `List` + stable row props).
4. Keep fixture/NFC paths Effect-thin at the UI boundary (no heavy sync work on press).
5. Re-run `perf:lab` then device Flashlight / Instruments before claiming a win.

## Relation to console Lighthouse / OTEL flames

- Cloud console / docs Lighthouse CI is **web-only** (`scripts/dev/assert-lighthouse-scores.mjs`).
- Server OTEL span flamegraphs (Tempo) are **backend** — different problem than RN FPS.
