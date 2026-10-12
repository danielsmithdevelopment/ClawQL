#!/usr/bin/env node
/**
 * Mobile performance lab — Lighthouse-equivalent for PhoneApprove without a device farm.
 *
 * Produces under perf/out/:
 *   bundle.json            — web/ios/android export sizes
 *   runtime.json           — interaction timings + LH mobile + CPU profile meta
 *   lighthouse-mobile.json — full Lighthouse report
 *   cpu-profile.cpuprofile — Chrome CPU profile (flame graph in speedscope)
 *   report.md              — human summary
 *   baseline-compare.json  — optional delta vs perf/baselines/lab.json
 *
 * Native device tooling (Flashlight / Instruments / Perfetto) is documented in PERFORMANCE.md
 * and invoked via npm run perf:android / perf:ios when hardware is available.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { measureBundles } from "./perf-bundle.mjs";
import { measureRuntime } from "./perf-runtime.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "perf", "out");
const BASELINE = path.join(root, "perf", "baselines", "lab.json");

fs.mkdirSync(OUT, { recursive: true });

console.log("=== mobile perf lab ===");
const bundle = await measureBundles({ platforms: ["web", "ios", "android"] });
fs.writeFileSync(path.join(OUT, "bundle.json"), JSON.stringify(bundle, null, 2));

const runtime = await measureRuntime({
  distDir: path.join(root, "dist-perf-web"),
  port: 8091,
});
fs.writeFileSync(path.join(OUT, "runtime.json"), JSON.stringify(runtime, null, 2));

function topCpuFunctions(profilePath, limit = 12) {
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
    const byId = new Map((profile.nodes ?? []).map((n) => [n.id, n]));
    const hit = new Map();
    for (const id of profile.samples ?? []) {
      hit.set(id, (hit.get(id) ?? 0) + 1);
    }
    const merged = new Map();
    for (const [id, samples] of hit) {
      const node = byId.get(id);
      const fn = node?.callFrame?.functionName || "(anonymous)";
      const url = node?.callFrame?.url || "";
      const k = `${fn}|${url}`;
      merged.set(k, (merged.get(k) ?? 0) + samples);
    }
    return [...merged.entries()]
      .map(([k, samples]) => {
        const [fn, url] = k.split("|");
        return { fn, url: (url ?? "").slice(-80), samples };
      })
      .sort((a, b) => b.samples - a.samples)
      .slice(0, limit);
  } catch {
    return [];
  }
}

const cpuTop = topCpuFunctions(path.join(root, runtime.cpuProfile.path));

const summary = {
  measuredAt: new Date().toISOString(),
  bundle: {
    web: bundle.results.web && {
      jsKb: bundle.results.web.jsKb,
      totalKb: bundle.results.web.totalKb,
    },
    ios: bundle.results.ios && {
      jsKb: bundle.results.ios.jsKb,
      totalKb: bundle.results.ios.totalKb,
    },
    android: bundle.results.android && {
      jsKb: bundle.results.android.jsKb,
      totalKb: bundle.results.android.totalKb,
    },
  },
  timings: runtime.timings,
  lighthouse: runtime.lighthouse,
  cpuProfile: { ...runtime.cpuProfile, topFunctions: cpuTop },
};

let compare = null;
if (fs.existsSync(BASELINE)) {
  const prev = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  compare = {
    baselineAt: prev.measuredAt ?? null,
    deltas: {
      webJsKb: (summary.bundle.web?.jsKb ?? 0) - (prev.bundle?.web?.jsKb ?? 0),
      iosJsKb: (summary.bundle.ios?.jsKb ?? 0) - (prev.bundle?.ios?.jsKb ?? 0),
      androidJsKb: (summary.bundle.android?.jsKb ?? 0) - (prev.bundle?.android?.jsKb ?? 0),
      signInToHomeMs: (summary.timings?.signInToHomeMs ?? 0) - (prev.timings?.signInToHomeMs ?? 0),
      lhPerf: Number(
        (((summary.lighthouse?.performance ?? 0) - (prev.lighthouse?.performance ?? 0)) * 100).toFixed(1)
      ),
    },
  };
  fs.writeFileSync(path.join(OUT, "baseline-compare.json"), JSON.stringify(compare, null, 2));
}

const report = [
  "# ClawQL mobile performance lab report",
  "",
  `Measured: ${summary.measuredAt}`,
  "",
  "## Bundle weight (Expo export)",
  "",
  "| Platform | JS (KB) | Total (KB) |",
  "| -------- | ------: | ---------: |",
  `| web | ${summary.bundle.web?.jsKb ?? "—"} | ${summary.bundle.web?.totalKb ?? "—"} |`,
  `| ios | ${summary.bundle.ios?.jsKb ?? "—"} | ${summary.bundle.ios?.totalKb ?? "—"} |`,
  `| android | ${summary.bundle.android?.jsKb ?? "—"} | ${summary.bundle.android?.totalKb ?? "—"} |`,
  "",
  "## Interaction timings (web export, iPhone viewport)",
  "",
  "```json",
  JSON.stringify(summary.timings, null, 2),
  "```",
  "",
  "## Lighthouse mobile (web export proxy)",
  "",
  summary.lighthouse
    ? [
        `| Category | Score |`,
        `| -------- | ----: |`,
        `| Performance | ${summary.lighthouse.performance} |`,
        `| Accessibility | ${summary.lighthouse.accessibility} |`,
        `| Best practices | ${summary.lighthouse.bestPractices} |`,
        `| SEO | ${summary.lighthouse.seo} |`,
        "",
        "Core Web Vitals (ms unless noted):",
        "```json",
        JSON.stringify(summary.lighthouse.audits, null, 2),
        "```",
      ].join("\n")
    : "_Lighthouse did not run._",
  "",
  "## Flame graph",
  "",
  `- CPU profile: \`${summary.cpuProfile?.path ?? "perf/out/cpu-profile.cpuprofile"}\``,
  "- Open in [speedscope.app](https://www.speedscope.app) for flame / sandwich views",
  `- Samples: ${summary.cpuProfile?.samples ?? "—"} · nodes: ${summary.cpuProfile?.nodes ?? "—"} · duration: ${summary.cpuProfile?.durationMs ?? "—"}ms`,
  "",
  "Top self-time samples (lab):",
  "",
  "| Samples | Function |",
  "| ------: | -------- |",
  ...(cpuTop.length
    ? cpuTop.map((r) => `| ${r.samples} | \`${r.fn || "(anonymous)"}\` |`)
    : ["| — | _(no samples)_ |"]),
  "",
  "## Baseline delta",
  "",
  compare ? "```json\n" + JSON.stringify(compare, null, 2) + "\n```" : "_No baseline yet — copy report into `perf/baselines/lab.json` after first green run._",
  "",
  "## Native next steps",
  "",
  "- Android FPS/CPU/RAM score: `npm run perf:android` (Flashlight + adb device)",
  "- iOS Time Profiler: `npm run perf:ios` (opens Instruments checklist)",
  "- Details: [PERFORMANCE.md](../PERFORMANCE.md)",
  "",
].join("\n");

fs.writeFileSync(path.join(OUT, "report.md"), report);
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(report);

const assert = spawnSync("node", ["scripts/perf-assert.mjs"], { cwd: root, stdio: "inherit" });
if (assert.status !== 0) process.exit(assert.status ?? 1);

// Refresh committed baseline when PERF_UPDATE_BASELINE=1
if (process.env.PERF_UPDATE_BASELINE === "1") {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(summary, null, 2) + "\n");
  console.log("updated baseline", path.relative(root, BASELINE));
}

console.log("\nperf:lab OK →", path.relative(root, OUT));
