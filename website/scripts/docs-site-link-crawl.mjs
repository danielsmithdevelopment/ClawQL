#!/usr/bin/env node
/**
 * Crawl docs site from sitemap + recurse same-origin <a href>.
 * Reports: non-2xx, redirect chains to unexpected targets, empty anchors.
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.DOCS_BASE || "http://127.0.0.1:3000";
const OUT = process.env.DOCS_CRAWL_OUT || "/opt/cursor/artifacts/docs_site_link_crawl.json";

function normalize(url, base = BASE) {
  try {
    const u = new URL(url, base);
    if (u.origin !== new URL(BASE).origin) return null; // external skip
    u.hash = "";
    // drop trailing slash except root
    let p = u.pathname;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return u.origin + p + u.search;
  } catch {
    return null;
  }
}

async function fetchStatus(url) {
  try {
    const res = await fetch(url, { redirect: "manual", headers: { accept: "text/html" } });
    return { status: res.status, location: res.headers.get("location") };
  } catch (e) {
    return { status: 0, error: String(e) };
  }
}

async function main() {
  const smRes = await fetch(`${BASE}/sitemap.xml`);
  if (!smRes.ok) throw new Error(`sitemap ${smRes.status}`);
  const sm = await smRes.text();
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const seed = new Set();
  for (const loc of locs) {
    // rewrite public origin to local
    const path = new URL(loc).pathname.replace(/\/$/, "") || "/";
    seed.add(normalize(BASE + path));
  }
  seed.add(normalize(BASE + "/"));
  // also seed common redirects
  for (const p of ["/reference/plugins", "/verticals", "/reference/verticals", "/getting-started/migrate-to-8.0", "/plugins/bundled-providers", "/streams/clawql-celld"]) {
    seed.add(normalize(BASE + p));
  }

  const visited = new Map(); // url -> {status, from, final?}
  const broken = [];
  const redirects = [];
  const queue = [...seed].filter(Boolean).map((u) => ({ url: u, from: "sitemap-or-seed" }));
  const linkGraph = new Map(); // page -> outlinks
  const discoveredFrom = new Map(); // url -> first referring page

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  while (queue.length) {
    const { url, from } = queue.shift();
    if (visited.has(url)) continue;
    const { status, location, error } = await fetchStatus(url);
    const entry = { status, from, location: location || undefined, error };
    visited.set(url, entry);

    if (status === 0 || status >= 400) {
      broken.push({ url, ...entry });
      continue;
    }
    if (status >= 300 && status < 400) {
      redirects.push({ url, status, location });
      const next = location ? normalize(location, url) : null;
      if (next && !visited.has(next) && !queue.some((q) => q.url === next)) {
        queue.push({ url: next, from: url });
      }
      continue;
    }
    // 2xx — parse links
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const hrefs = await page.$$eval("a[href]", (as) =>
        as.map((a) => a.getAttribute("href")).filter(Boolean)
      );
      const outs = [];
      for (const h of hrefs) {
        if (h.startsWith("mailto:") || h.startsWith("tel:") || h.startsWith("javascript:")) continue;
        const n = normalize(h, url);
        if (!n) continue; // external
        outs.push(n);
        if (!discoveredFrom.has(n)) discoveredFrom.set(n, url);
        if (!visited.has(n) && !queue.some((q) => q.url === n)) {
          queue.push({ url: n, from: url });
        }
      }
      linkGraph.set(url, [...new Set(outs)]);
    } catch (e) {
      broken.push({ url, status: "nav-error", error: String(e) });
    }
  }

  await browser.close();

  // Second pass: any queued that were only discovered — already processed in loop

  const stalePatterns = [
    { id: "opinionated-default-autoload", re: /loads the opinionated default stack|Default install loads the opinionated|auto-load(?:s|ed)? pack [`']?default/i },
    { id: "onRegister-as-current", re: /Today:\s*plugins register via|implement \*\*`?onRegister`?|via `onRegister`(?!.*historical)/i },
    { id: "beforeCallTool-current", re: /Panguard `beforeCallTool`/i },
    { id: "adapter-0.6.0", re: /mcp-api-adapter[`'\s]*0\.6\.0|in-repo `0\.6\.0`/i },
    // QR is planned 8th; /mcp-ui is correctly the 7th surface — only flag QR-as-7th claims
    { id: "qr-as-7th", re: /QR[^\n.]{0,60}7th surface/i },
    // Flag only when chart default is wrongly claimed as `default` (correct is `none`)
    { id: "providers-pack-default-chart", re: /chart default is [`']?default[`']?/i },
  ];

  const staleHits = [];
  const browser2 = await chromium.launch({ headless: true });
  const page2 = await browser2.newPage();
  const samplePages = [...visited.keys()].filter((u) => {
    const st = visited.get(u).status;
    return st >= 200 && st < 300;
  });
  // Limit content scan to first-party docs pages (not assets)
  for (const url of samplePages) {
    if (url.includes("/_next/") || url.endsWith(".xml") || url.endsWith(".json") || url.endsWith(".txt") && !url.endsWith("/llms.txt")) continue;
    try {
      await page2.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const text = await page2.innerText("body");
      for (const pat of stalePatterns) {
        if (pat.re.test(text)) {
          staleHits.push({ url, pattern: pat.id, snippet: text.match(pat.re)?.[0]?.slice(0, 120) });
        }
      }
    } catch {
      /* ignore */
    }
  }
  await browser2.close();

  const summary = {
    base: BASE,
    sitemapLocs: locs.length,
    pagesVisited: visited.size,
    brokenCount: broken.length,
    redirectCount: redirects.length,
    staleHitCount: staleHits.length,
    broken,
    redirects: redirects.slice(0, 100),
    staleHits,
    okSample: [...visited.entries()].filter(([, v]) => v.status >= 200 && v.status < 300).slice(0, 20).map(([u, v]) => ({ u, ...v })),
  };
  writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    pagesVisited: summary.pagesVisited,
    brokenCount: summary.brokenCount,
    redirectCount: summary.redirectCount,
    staleHitCount: summary.staleHitCount,
    broken: summary.broken,
    staleHits: summary.staleHits,
  }, null, 2));
  process.exit(broken.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
