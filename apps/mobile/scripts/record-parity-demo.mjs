/**
 * PhoneApprove parity demo at iPhone viewport (390×844) — never desktop width.
 * Covers push register, document scan, session refresh, share clipboard.
 * Requires fixture web export served (default http://127.0.0.1:4173).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright";

const BASE = process.env.CLAWQL_MOBILE_DEMO_URL || "http://127.0.0.1:4173";
const OUT = process.env.CLAWQL_MOBILE_DEMO_OUT || "/opt/cursor/artifacts/mobile-parity-iphone";
const VIDEO_DIR = path.join(OUT, "playwright-video");

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(VIDEO_DIR, { recursive: true, force: true });
fs.mkdirSync(VIDEO_DIR, { recursive: true });

const iphone = devices["iPhone 14"];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...iphone,
  recordVideo: {
    dir: VIDEO_DIR,
    size: { width: iphone.viewport.width, height: iphone.viewport.height },
  },
});
const page = await context.newPage();

async function shot(name) {
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, type: "png" });
  console.log("shot", dest);
}

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.getByTestId("sign-in-fixture").waitFor({ state: "visible" });
await page.waitForTimeout(600);
await shot("01-sign-in.png");

await page.getByTestId("sign-in-fixture").click();
await page.getByTestId("home-screen").waitFor({ state: "visible", timeout: 15000 });
await page.waitForTimeout(800);
await shot("02-home.png");

// Profile → register push + refresh session
await page.getByTestId("tab-profile").first().click();
await page.getByTestId("profile-push-devices").waitFor({ state: "visible", timeout: 15000 });
await page.getByTestId("profile-register-push").click();
await page.getByTestId("profile-push-note").waitFor({ state: "visible", timeout: 10000 });
await page.waitForTimeout(500);
await shot("03-profile-push.png");

await page.getByTestId("profile-refresh-session").click();
await page.getByTestId("profile-note").waitFor({ state: "visible", timeout: 10000 });
await page.waitForTimeout(500);
await shot("04-profile-session-refresh.png");

// App Lock → lock now → unlock (fixture)
const appLockRow = page.getByTestId("pref-app-lock");
await appLockRow.scrollIntoViewIfNeeded();
// Expo Switch uses a visually-hidden checkbox — click the label text.
await appLockRow.getByText("App Lock", { exact: true }).click({ force: true });
await page.getByTestId("profile-lock-now").waitFor({ state: "visible", timeout: 10000 });
await page.getByTestId("profile-lock-now").click();
await page.getByTestId("app-lock-screen").waitFor({ state: "visible", timeout: 10000 });
await page.waitForTimeout(500);
await shot("04b-app-lock.png");
await page.getByTestId("app-lock-unlock").click();
await page.getByTestId("profile-screen").waitFor({ state: "visible", timeout: 15000 });
await page.waitForTimeout(400);
await shot("04c-app-unlocked.png");

// Review → document scan + share
await page.getByTestId("tab-review").first().click();
await page.getByTestId("review-item-rev_change").first().waitFor({ state: "visible", timeout: 15000 });
await page.getByTestId("review-item-rev_change").first().click();
await page.getByTestId("review-attachments").waitFor({ state: "visible", timeout: 15000 });
await page.getByTestId("review-scan-camera").click();
await page.getByTestId("review-note").waitFor({ state: "visible", timeout: 10000 });
await page.waitForTimeout(600);
await shot("05-review-document-scan.png");

await page.getByTestId("review-share").click();
await page.getByTestId("review-note").waitFor({ state: "visible", timeout: 10000 });
await page.waitForTimeout(600);
await shot("06-review-share.png");

// Back to tabs from review detail (stack hides tab bar)
await page.goBack();
await page.getByTestId("review-queue-screen").waitFor({ state: "visible", timeout: 15000 });

// Offline cache on Review queue
await page.getByTestId("review-load-offline-cache").waitFor({ state: "visible", timeout: 15000 });
await page.getByTestId("review-load-offline-cache").click();
await page.getByTestId("review-offline-banner").waitFor({ state: "visible", timeout: 10000 });
await page.waitForTimeout(500);
await shot("07-review-offline-cache.png");

// Home simulate push → inbox mark-all-read (SPA)
await page.getByTestId("tab-home").filter({ visible: true }).first().click();
await page.getByTestId("home-simulate-push-btn").waitFor({ state: "visible", timeout: 15000 });
await page.getByTestId("home-simulate-push-btn").click();
await page.getByTestId("home-push-note").waitFor({ state: "visible", timeout: 10000 });
await page.waitForTimeout(400);
// Web sim may auto-route to review — return home for inbox nav
if (!(await page.getByTestId("home-open-inbox").isVisible().catch(() => false))) {
  await page.getByTestId("tab-home").filter({ visible: true }).first().click();
  await page.getByTestId("home-open-inbox").waitFor({ state: "visible", timeout: 15000 });
}
await page.getByTestId("home-open-inbox").click();
await page.getByTestId("inbox-screen").waitFor({ state: "visible", timeout: 15000 });
await page.getByTestId("inbox-mark-all-read").waitFor({ state: "visible", timeout: 10000 });
await page.getByTestId("inbox-mark-all-read").click();
await page.waitForTimeout(600);
await shot("08-inbox-mark-all-read.png");

// Decision → ask a named teammate picker (inbox is stacked — leave first)
await page.goBack();
await page.getByTestId("home-screen").waitFor({ state: "visible", timeout: 15000 });
await page.getByTestId("tab-review").filter({ visible: true }).first().click();
await page.getByTestId("review-queue-screen").waitFor({ state: "visible", timeout: 15000 });
await page.getByTestId("filter-decision").click();
await page.getByTestId("review-item-rev_decision").first().waitFor({ state: "visible", timeout: 15000 });
await page.getByTestId("review-item-rev_decision").first().click();
await page.getByTestId("review-ask-teammate").waitFor({ state: "visible", timeout: 15000 });
await page.getByTestId("review-ask-teammate").click();
await page.getByTestId("review-ask-teammate-picker").waitFor({ state: "visible", timeout: 10000 });
await page.getByTestId("ask-teammate-user_marcus").scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await shot("16-ask-teammate-picker.png");
await page.getByTestId("ask-teammate-user_marcus").click();
await page.getByTestId("review-ask-teammate-confirm").click();
await page.getByTestId("review-note").waitFor({ state: "visible", timeout: 10000 });
await page.waitForTimeout(500);
await shot("17-ask-teammate-done.png");

await context.close();
await browser.close();

const videos = fs.readdirSync(VIDEO_DIR).filter((f) => f.endsWith(".webm"));
if (videos.length === 0) throw new Error("no playwright video produced");
const src = path.join(VIDEO_DIR, videos[0]);
const destWebm = path.join(OUT, "parity-iphone.webm");
fs.copyFileSync(src, destWebm);

const mp4 = "/opt/cursor/artifacts/phoneapprove-parity-iphone.mp4";
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
console.log("demo ok", OUT);
