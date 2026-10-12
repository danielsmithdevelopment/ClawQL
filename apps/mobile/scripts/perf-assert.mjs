/**
 * Assert lab thresholds from perf/out/{bundle,runtime}.json + perf/thresholds.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const thresholds = JSON.parse(fs.readFileSync(path.join(root, "perf", "thresholds.json"), "utf8"));
const bundle = JSON.parse(fs.readFileSync(path.join(root, "perf", "out", "bundle.json"), "utf8"));
const runtime = JSON.parse(fs.readFileSync(path.join(root, "perf", "out", "runtime.json"), "utf8"));

const failed = [];

function check(cond, msg) {
  if (!cond) failed.push(msg);
}

const web = bundle.results?.web;
const ios = bundle.results?.ios;
const android = bundle.results?.android;

if (web) {
  check(web.jsBytes <= thresholds.bundle.maxJsBytesWeb, `web js ${web.jsBytes} > ${thresholds.bundle.maxJsBytesWeb}`);
  check(
    web.totalBytes <= thresholds.bundle.maxTotalExportBytesWeb,
    `web total ${web.totalBytes} > ${thresholds.bundle.maxTotalExportBytesWeb}`
  );
}
if (ios) {
  check(ios.jsBytes <= thresholds.bundle.maxJsBytesIos, `ios js ${ios.jsBytes} > ${thresholds.bundle.maxJsBytesIos}`);
}
if (android) {
  check(
    android.jsBytes <= thresholds.bundle.maxJsBytesAndroid,
    `android js ${android.jsBytes} > ${thresholds.bundle.maxJsBytesAndroid}`
  );
}

const t = runtime.timings ?? {};
check(
  (t.signInToHomeMs ?? Infinity) <= thresholds.runtime.maxSignInToHomeMs,
  `signInToHomeMs ${t.signInToHomeMs} > ${thresholds.runtime.maxSignInToHomeMs}`
);
check(
  (t.homeToReviewMs ?? Infinity) <= thresholds.runtime.maxHomeToReviewMs,
  `homeToReviewMs ${t.homeToReviewMs} > ${thresholds.runtime.maxHomeToReviewMs}`
);
check(
  (t.reviewOpenDetailMs ?? Infinity) <= thresholds.runtime.maxReviewOpenDetailMs,
  `reviewOpenDetailMs ${t.reviewOpenDetailMs} > ${thresholds.runtime.maxReviewOpenDetailMs}`
);

if (runtime.cpuProfile?.durationMs != null) {
  check(
    runtime.cpuProfile.durationMs <= thresholds.runtime.maxCpuProfileDurationMs,
    `cpuProfile duration ${runtime.cpuProfile.durationMs}ms > ${thresholds.runtime.maxCpuProfileDurationMs}`
  );
}

const lh = runtime.lighthouse;
if (lh) {
  const L = thresholds.lighthouseMobile;
  check((lh.performance ?? 0) >= L.minPerformance, `LH perf ${lh.performance} < ${L.minPerformance}`);
  check((lh.accessibility ?? 0) >= L.minAccessibility, `LH a11y ${lh.accessibility} < ${L.minAccessibility}`);
  check((lh.bestPractices ?? 0) >= L.minBestPractices, `LH BP ${lh.bestPractices} < ${L.minBestPractices}`);
  check((lh.seo ?? 0) >= L.minSeo, `LH seo ${lh.seo} < ${L.minSeo}`);
} else {
  failed.push("lighthouse results missing");
}

if (failed.length) {
  console.error("perf:assert FAILED");
  for (const f of failed) console.error(" -", f);
  process.exit(1);
}

console.log("perf:assert OK");
console.log(
  JSON.stringify(
    {
      bundle: {
        webKb: web?.jsKb,
        iosKb: ios?.jsKb,
        androidKb: android?.jsKb,
      },
      timings: t,
      lighthouse: lh,
    },
    null,
    2
  )
);
