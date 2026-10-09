/**
 * Deterministic mobile web demo: screenshots + video at iPhone viewport.
 * Stays on SPA navigations after sign-in so fixture queue state survives Decline.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.CLAWQL_MOBILE_DEMO_URL || "http://localhost:8081";
const OUT = process.env.CLAWQL_MOBILE_DEMO_OUT || "/opt/cursor/artifacts/mobile-demo";
const VIDEO_DIR = path.join(OUT, "playwright-video");

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(VIDEO_DIR, { recursive: true, force: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  recordVideo: { dir: VIDEO_DIR, size: { width: 390, height: 844 } },
});
const page = await context.newPage();

async function shot(name) {
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, type: "png" });
  console.log("shot", dest);
}

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.getByTestId("sign-in-screen").waitFor({ state: "visible" });
await page.waitForTimeout(900);
await shot("01-sign-in.png");

await page.getByTestId("sign-in-fixture").click();
await page.getByTestId("home-spend").waitFor({ state: "visible", timeout: 15000 });
await page.getByText("$128.40").waitFor({ state: "visible" });
await page.waitForTimeout(1600);
await shot("02-home.png");

await page.getByTestId("tab-review").first().click();
await page.getByTestId("review-item-rev_change").first().waitFor({ state: "visible", timeout: 15000 });
await page.waitForTimeout(1000);
await shot("03-review-queue.png");

await page.getByTestId("review-item-rev_change").first().click();
await page.getByTestId("exact-change").waitFor({ state: "visible", timeout: 15000 });
await page.waitForTimeout(1600);
await shot("04-change-request-detail.png");

await page.getByTestId("review-decline").click();
// Detail screen auto-routes to /(tabs)/review after decline (~600ms).
await page.getByText("2 waiting").waitFor({ state: "visible", timeout: 15000 });
await page.waitForTimeout(1000);
await shot("03b-review-after-decline.png");

// Client-side route (localStorage session survives). Avoids flaky hidden duplicate tab nodes.
await page.evaluate(() => {
  window.location.assign("/profile");
});
await page.getByTestId("profile-security-keys").waitFor({ state: "visible", timeout: 15000 });
await page.waitForTimeout(1600);
await shot("05-profile.png");

await context.close();
await browser.close();

const videos = fs.readdirSync(VIDEO_DIR).filter((f) => f.endsWith(".webm"));
if (videos.length === 0) throw new Error("no playwright video produced");
const src = path.join(VIDEO_DIR, videos[0]);
const destWebm = path.join(OUT, "clawql-mobile-demo.webm");
fs.copyFileSync(src, destWebm);
console.log("video", destWebm, fs.statSync(destWebm).size);

const mp4 = "/opt/cursor/artifacts/clawql-mobile-demo-walkthrough.mp4";
const conv = spawnSync(
  "ffmpeg",
  ["-y", "-i", destWebm, "-c:v", "libx264", "-pix_fmt", "yuv420p", mp4],
  { encoding: "utf8" }
);
if (conv.status !== 0) {
  console.error(conv.stderr);
  throw new Error("ffmpeg failed");
}
console.log("mp4", mp4, fs.statSync(mp4).size);
console.log("demo ok");
