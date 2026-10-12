/**
 * Runtime lab against the static web export (JS/render proxy for PhoneApprove).
 * Captures:
 *  - interaction timings (sign-in → home → review → detail)
 *  - Chrome CDP CPU profile (open in speedscope.app / Chrome Performance = flame chart)
 *  - Lighthouse mobile form-factor scores (closest automated "Lighthouse for RN web")
 *
 * Not a substitute for Flashlight (Android) or Instruments (iOS) — see PERFORMANCE.md.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "perf", "out");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHttp(url, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok || res.status === 304) return;
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error(`server not ready: ${url}`);
}

function startServer(distDir, port) {
  const child = spawn("npx", ["--yes", "serve", distDir, "-l", String(port)], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  return child;
}

async function captureCpuProfile(page, work) {
  const client = await page.context().newCDPSession(page);
  await client.send("Profiler.enable");
  await client.send("Profiler.setSamplingInterval", { interval: 100 });
  await client.send("Profiler.start");
  await work();
  const { profile } = await client.send("Profiler.stop");
  await client.detach().catch(() => {});
  return profile;
}

async function runInteractions(page, base) {
  const timings = {};

  let t0 = Date.now();
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await page.getByTestId("sign-in-screen").waitFor({ state: "visible", timeout: 15000 });
  timings.signInPaintMs = Date.now() - t0;

  t0 = Date.now();
  await page.getByTestId("sign-in-fixture").click();
  await page.getByTestId("home-spend").waitFor({ state: "visible", timeout: 15000 });
  await page.getByText("$128.40").waitFor({ state: "visible" });
  timings.signInToHomeMs = Date.now() - t0;

  t0 = Date.now();
  await page.getByTestId("tab-review").first().click();
  await page.getByTestId("review-item-rev_change").first().waitFor({ state: "visible", timeout: 15000 });
  timings.homeToReviewMs = Date.now() - t0;

  t0 = Date.now();
  await page.getByTestId("review-item-rev_change").first().click();
  await page.getByTestId("exact-change").waitFor({ state: "visible", timeout: 15000 });
  timings.reviewOpenDetailMs = Date.now() - t0;

  // Scroll / interact for a richer CPU sample
  await page.mouse.wheel(0, 400);
  await sleep(400);
  await page.getByTestId("review-decline").click();
  await page.waitForTimeout(900);
  await page.getByText(/\d+ waiting/).filter({ visible: true }).waitFor({ state: "visible", timeout: 15000 });

  return timings;
}

function runLighthouse(url, outJson) {
  const args = [
    "--yes",
    "lighthouse@13.1.0",
    url,
    "--form-factor=mobile",
    "--screenEmulation.mobile=true",
    "--only-categories=performance,accessibility,best-practices,seo",
    "--output=json",
    `--output-path=${outJson}`,
    "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
    "--quiet",
  ];
  const r = spawnSync("npx", args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`lighthouse failed:\n${(r.stderr || r.stdout || "").slice(-2500)}`);
  }
  const report = JSON.parse(fs.readFileSync(outJson, "utf8"));
  return {
    performance: report.categories?.performance?.score ?? null,
    accessibility: report.categories?.accessibility?.score ?? null,
    bestPractices: report.categories?.["best-practices"]?.score ?? null,
    seo: report.categories?.seo?.score ?? null,
    audits: {
      fcp: report.audits?.["first-contentful-paint"]?.numericValue ?? null,
      lcp: report.audits?.["largest-contentful-paint"]?.numericValue ?? null,
      tbt: report.audits?.["total-blocking-time"]?.numericValue ?? null,
      cls: report.audits?.["cumulative-layout-shift"]?.numericValue ?? null,
      si: report.audits?.["speed-index"]?.numericValue ?? null,
      interactive: report.audits?.interactive?.numericValue ?? null,
    },
  };
}

export async function measureRuntime({
  distDir = path.join(root, "dist-perf-web"),
  port = 8091,
  baseUrl,
} = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const ownServer = !baseUrl;
  let child;
  const base = baseUrl || `http://127.0.0.1:${port}`;

  if (ownServer) {
    if (!fs.existsSync(distDir)) {
      throw new Error(`missing dist: ${distDir} (run perf-bundle first)`);
    }
    child = startServer(distDir, port);
    await waitHttp(`${base}/sign-in`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  let timings;
  let cpuProfile;
  try {
    cpuProfile = await captureCpuProfile(page, async () => {
      timings = await runInteractions(page, base);
    });
  } finally {
    await context.close();
    await browser.close();
  }

  const cpuPath = path.join(OUT, "cpu-profile.cpuprofile");
  fs.writeFileSync(cpuPath, JSON.stringify(cpuProfile));
  // Speedscope accepts Chrome CPU profiles; also write a tiny HTML pointer.
  const speedscopeNote = path.join(OUT, "FLAMEGRAPH.md");
  fs.writeFileSync(
    speedscopeNote,
    [
      "# Flame graph (CPU profile)",
      "",
      "Open `cpu-profile.cpuprofile` in:",
      "",
      "1. https://www.speedscope.app (drag & drop) — preferred flame / sandwich views",
      "2. Chrome → DevTools → Performance → load profile",
      "",
      "This profile covers fixture sign-in → home → review → detail → decline on the web export",
      "(Hermes JS work proxy). For native iOS/Android flame charts see PERFORMANCE.md",
      "(Instruments Time Profiler / Perfetto / Flashlight).",
      "",
    ].join("\n")
  );

  let lighthouse = null;
  const lhPath = path.join(OUT, "lighthouse-mobile.json");
  try {
    lighthouse = runLighthouse(`${base}/sign-in`, lhPath);
  } catch (e) {
    console.warn("[perf-runtime] lighthouse skipped:", e instanceof Error ? e.message : e);
  }

  if (child) {
    child.kill("SIGTERM");
  }

  const nodes = cpuProfile?.nodes?.length ?? 0;
  const samples = cpuProfile?.samples?.length ?? 0;

  return {
    measuredAt: new Date().toISOString(),
    base,
    timings,
    lighthouse,
    cpuProfile: {
      path: path.relative(root, cpuPath),
      nodes,
      samples,
      startTime: cpuProfile?.startTime ?? null,
      endTime: cpuProfile?.endTime ?? null,
      durationMs:
        cpuProfile?.startTime != null && cpuProfile?.endTime != null
          ? Math.round((cpuProfile.endTime - cpuProfile.startTime) / 1000)
          : null,
    },
  };
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const data = await measureRuntime();
  fs.writeFileSync(path.join(OUT, "runtime.json"), JSON.stringify(data, null, 2));
  console.log(JSON.stringify(data, null, 2));
}
