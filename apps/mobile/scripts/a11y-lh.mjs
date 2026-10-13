/**
 * WCAG + Lighthouse gate for PhoneApprove web export (lab proxy for native).
 *
 * 1. Lighthouse mobile on key static routes (a11y must be 1.0)
 * 2. axe-core WCAG 2.1 A/AA on authenticated fixture screens
 *
 * Usage:
 *   CLAWQL_MOBILE_DEMO_URL=http://127.0.0.1:4173 node scripts/a11y-lh.mjs
 *   (or omit URL to serve dist-web on 4175)
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.CLAWQL_A11Y_OUT || "/opt/cursor/artifacts/mobile-lh";
const DIST = path.join(root, "dist-web");
const MIN_A11Y = Number(process.env.LH_MIN_A11Y ?? "1");
const MIN_SEO = Number(process.env.LH_MIN_SEO ?? "0.9");
const MIN_BP = Number(process.env.LH_MIN_BP ?? "0.9");
const MIN_PERF = Number(process.env.LH_MIN_PERF ?? "0.55");

fs.mkdirSync(OUT, { recursive: true });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHttp(url, attempts = 60) {
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
    throw new Error(`lighthouse failed for ${url}:\n${(r.stderr || r.stdout || "").slice(-2000)}`);
  }
  const report = JSON.parse(fs.readFileSync(outJson, "utf8"));
  const scores = {
    performance: report.categories?.performance?.score ?? 0,
    accessibility: report.categories?.accessibility?.score ?? 0,
    bestPractices: report.categories?.["best-practices"]?.score ?? 0,
    seo: report.categories?.seo?.score ?? 0,
  };
  const a11yFails = (report.categories?.accessibility?.auditRefs ?? [])
    .map((ref) => report.audits[ref.id])
    .filter((a) => a && a.score !== null && a.score < 1)
    .map((a) => ({ id: a.id, title: a.title, score: a.score }));
  return { scores, a11yFails, audits: report.audits };
}

const lhRoutes = [
  { path: "/sign-in", name: "sign-in" },
  { path: "/", name: "home" },
  { path: "/review", name: "review" },
  { path: "/activity", name: "activity" },
  { path: "/profile", name: "profile" },
  { path: "/inbox", name: "inbox" },
];

const axeRoutes = [
  { path: "/sign-in", testId: "sign-in-screen", name: "sign-in", auth: false },
  { path: "/", testId: "home-screen", name: "home", auth: true },
  { path: "/review", testId: "review-queue-screen", name: "review", auth: true },
  { path: "/activity", testId: "activity-screen", name: "activity", auth: true },
  { path: "/profile", testId: "profile-screen", name: "profile", auth: true },
  { path: "/inbox", testId: "inbox-screen", name: "inbox", auth: true },
  { path: "/digest", testId: "digest-screen", name: "digest", auth: true },
  { path: "/agents", testId: "agents-screen", name: "agents", auth: true },
];

let child;
const ownServer = !process.env.CLAWQL_MOBILE_DEMO_URL;
const base = process.env.CLAWQL_MOBILE_DEMO_URL || "http://127.0.0.1:4175";

try {
  if (ownServer) {
    if (!fs.existsSync(DIST)) {
      throw new Error(`missing ${DIST} — run npm run local:web-export`);
    }
    child = spawn("npx", ["--yes", "serve", DIST, "-l", "4175"], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: process.env,
    });
    await waitHttp(`${base}/sign-in`);
  }

  const summary = { measuredAt: new Date().toISOString(), base, lighthouse: [], axe: [] };
  const failures = [];

  for (const route of lhRoutes) {
    const outJson = path.join(OUT, `lh-${route.name}.json`);
    const { scores, a11yFails } = runLighthouse(`${base}${route.path}`, outJson);
    summary.lighthouse.push({ route: route.name, path: route.path, scores, a11yFails });
    console.log(
      `LH ${route.name}: perf=${scores.performance} a11y=${scores.accessibility} bp=${scores.bestPractices} seo=${scores.seo}`
    );
    if (scores.accessibility < MIN_A11Y) {
      failures.push(
        `LH a11y ${route.name}: ${scores.accessibility} < ${MIN_A11Y} (${a11yFails.map((f) => f.id).join(", ")})`
      );
    }
    if (scores.seo < MIN_SEO) failures.push(`LH seo ${route.name}: ${scores.seo} < ${MIN_SEO}`);
    if (scores.bestPractices < MIN_BP) {
      failures.push(`LH bp ${route.name}: ${scores.bestPractices} < ${MIN_BP}`);
    }
    if (route.name === "sign-in" && scores.performance < MIN_PERF) {
      failures.push(`LH perf sign-in: ${scores.performance} < ${MIN_PERF}`);
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices["iPhone 14"] });
  const page = await context.newPage();

  async function ensureAuth() {
    await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
    if (await page.getByTestId("sign-in-fixture").isVisible().catch(() => false)) {
      await page.getByTestId("sign-in-fixture").click();
      await page.getByTestId("home-screen").waitFor({ state: "visible", timeout: 20000 });
    }
    if (await page.getByTestId("app-lock-screen").isVisible().catch(() => false)) {
      await page.getByTestId("app-lock-unlock").click();
    }
  }

  async function unlock() {
    if (await page.getByTestId("app-lock-screen").isVisible().catch(() => false)) {
      await page.getByTestId("app-lock-unlock").click();
      await page.getByTestId("app-lock-screen").waitFor({ state: "hidden", timeout: 10000 });
    }
  }

  for (const route of axeRoutes) {
    if (route.auth) await ensureAuth();
    await page.goto(`${base}${route.path}`, { waitUntil: "networkidle" });
    if (route.auth && (await page.getByTestId("sign-in-fixture").isVisible().catch(() => false))) {
      await ensureAuth();
      await page.goto(`${base}${route.path}`, { waitUntil: "networkidle" });
    }
    await unlock();
    const target = page.getByTestId(route.testId).first();
    await target.waitFor({ state: "attached", timeout: 20000 });
    await page.waitForTimeout(300);
    if (!(await target.isVisible().catch(() => false))) {
      // Stack screens (inbox/digest/agents) can stay opacity-0 after cold goto — open via Home.
      await unlock();
      if (route.auth) {
        await page.goto(`${base}/`, { waitUntil: "networkidle" });
        await unlock();
        await page.getByTestId("home-screen").waitFor({ state: "visible", timeout: 15000 });
        const openId =
          route.name === "inbox"
            ? "home-open-inbox"
            : route.name === "digest"
              ? "home-open-digest"
              : route.name === "agents"
                ? "home-open-agents"
                : null;
        if (openId && (await page.getByTestId(openId).isVisible().catch(() => false))) {
          await page.getByTestId(openId).click();
        } else {
          await page.goto(`${base}${route.path}`, { waitUntil: "networkidle" });
        }
        await unlock();
      }
      await target.waitFor({ state: "attached", timeout: 15000 });
    }
    // axe audits the document; don't require Playwright visibility (RN stack cards).
    await page.waitForTimeout(400);
    await page.addScriptTag({
      url: "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.3/axe.min.js",
    });
    const results = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      return await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      });
    });
    fs.writeFileSync(path.join(OUT, `axe-${route.name}.json`), JSON.stringify(results, null, 2));
    const serious = results.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact || "")
    );
    summary.axe.push({
      route: route.name,
      violations: results.violations.length,
      serious: serious.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
    });
    console.log(
      `axe ${route.name}: violations=${results.violations.length} serious=${serious.length}`
    );
    for (const v of serious) {
      failures.push(`axe ${route.name}: [${v.impact}] ${v.id} (${v.nodes.length} nodes)`);
    }
  }

  await context.close();
  await browser.close();

  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));

  const md = [
    "# PhoneApprove WCAG / Lighthouse (mobile web export)",
    "",
    `Measured: ${summary.measuredAt}`,
    `Base: ${base}`,
    "",
    "## Lighthouse (mobile)",
    "",
    "| Route | Perf | A11y | BP | SEO |",
    "| --- | --- | --- | --- | --- |",
    ...summary.lighthouse.map(
      (r) =>
        `| ${r.route} | ${r.scores.performance} | ${r.scores.accessibility} | ${r.scores.bestPractices} | ${r.scores.seo} |`
    ),
    "",
    "## axe WCAG 2.1 A/AA (serious+)",
    "",
    ...summary.axe.map((r) => {
      const ids = r.serious.map((s) => s.id).join(", ") || "none";
      return `- **${r.route}**: ${r.violations} total · serious: ${ids}`;
    }),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "REPORT.md"), md);

  if (failures.length) {
    console.error("\na11y-lh FAILED:");
    for (const f of failures) console.error(" -", f);
    process.exitCode = 1;
  } else {
    console.log("\na11y-lh OK →", OUT);
  }
} finally {
  if (child?.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        /* gone */
      }
    }
  }
}
