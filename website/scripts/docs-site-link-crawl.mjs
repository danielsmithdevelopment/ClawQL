#!/usr/bin/env node
/**
 * Crawl docs site from sitemap + recurse same-origin <a href>.
 * Also validates **every unique external** href discovered on those pages.
 *
 * Reports:
 * - same-origin non-2xx / nav errors
 * - external non-2xx / network errors / soft-404 parking landers
 * - stale content patterns on first-party pages
 *
 * Env:
 *   DOCS_BASE          default http://127.0.0.1:3000
 *   DOCS_CRAWL_OUT     default /opt/cursor/artifacts/docs_site_link_crawl.json
 *   DOCS_CRAWL_EXT_CONCURRENCY  default 8
 *   DOCS_CRAWL_SKIP_EXTERNAL=1  same-origin only (legacy)
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.DOCS_BASE || "http://127.0.0.1:3000";
const OUT =
  process.env.DOCS_CRAWL_OUT || "/opt/cursor/artifacts/docs_site_link_crawl.json";
const CHECK_EXTERNAL = process.env.DOCS_CRAWL_SKIP_EXTERNAL !== "1";
const EXT_CONCURRENCY = Math.max(
  1,
  Number(process.env.DOCS_CRAWL_EXT_CONCURRENCY || 8),
);
const ORIGIN = new URL(BASE).origin;

/** Domains that routinely block bots / rate-limit — still checked, tagged soft-fail. */
const FLAKY_HOST_SUFFIXES = [
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "npmjs.com",
  "paperless-ngx.com",
];

/** Example / local / annotation URLs that are not real navigable destinations. */
function isNonNavigableExample(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".localhost")
    ) {
      return true;
    }
    // Kubernetes annotation keys sometimes render as http://...
    if (host === "pod-security.kubernetes.io") return true;
    // Placeholder OIDC issuer examples
    if (host.includes("oidc.eks.") && /\/id\/ABC123/i.test(u.pathname + u.href)) {
      return true;
    }
    if (/\/id\/ABC123(?::|$)/i.test(u.pathname) || u.href.includes("/id/ABC123:")) {
      return true;
    }
    // Egress allowlist examples (HTTP hosts used as identifiers, not docs)
    if (host === "api.openai.com" || host === "api.anthropic.com") return true;
    return false;
  } catch {
    return false;
  }
}

function normalizeSameOrigin(url, base = BASE) {
  try {
    const u = new URL(url, base);
    if (u.origin !== ORIGIN) return null;
    u.hash = "";
    let p = u.pathname;
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return u.origin + p + u.search;
  } catch {
    return null;
  }
}

function normalizeExternal(url, base = BASE) {
  try {
    const u = new URL(url, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.origin === ORIGIN) return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}

function isFlakyHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return FLAKY_HOST_SUFFIXES.some(
      (s) => host === s || host.endsWith(`.${s}`),
    );
  } catch {
    return false;
  }
}

async function fetchStatus(url, { follow = false } = {}) {
  try {
    const res = await fetch(url, {
      redirect: follow ? "follow" : "manual",
      headers: {
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "user-agent":
          "ClawQL-docs-link-crawl/1.0 (+https://docs.clawql.com; link-audit)",
      },
      signal: AbortSignal.timeout(20000),
    });
    return {
      status: res.status,
      location: res.headers.get("location"),
      finalUrl: res.url,
      contentType: res.headers.get("content-type") || undefined,
    };
  } catch (e) {
    return { status: 0, error: String(e) };
  }
}

/**
 * Soft-404 / parking detection after following redirects.
 * okf.io returns 200 with a JS lander — treat as broken.
 */
async function checkExternal(url) {
  const head = await fetchStatus(url, { follow: false });
  if (head.status === 0) {
    return { ...head, kind: "network-error", ok: false };
  }

  // Follow redirects ourselves so we can inspect the final body
  let current = url;
  let status = head.status;
  let location = head.location;
  const chain = [];
  for (let i = 0; i < 8 && status >= 300 && status < 400 && location; i++) {
    chain.push({ status, location });
    current = new URL(location, current).href;
    const next = await fetchStatus(current, { follow: false });
    status = next.status;
    location = next.location;
    if (next.status === 0) {
      return {
        status: 0,
        error: next.error,
        kind: "network-error",
        ok: false,
        redirectChain: chain,
        finalUrl: current,
      };
    }
  }

  if (status >= 400) {
    return {
      status,
      kind: "http-error",
      ok: false,
      redirectChain: chain.length ? chain : undefined,
      finalUrl: current,
      flaky: isFlakyHost(url),
    };
  }

  // Fetch body of final URL for parking / empty lander detection
  let body = "";
  try {
    const res = await fetch(current, {
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "user-agent":
          "ClawQL-docs-link-crawl/1.0 (+https://docs.clawql.com; link-audit)",
      },
      signal: AbortSignal.timeout(20000),
    });
    status = res.status;
    current = res.url;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html") || ct.includes("text/plain") || !ct) {
      body = (await res.text()).slice(0, 8000);
    }
  } catch (e) {
    return {
      status: 0,
      error: String(e),
      kind: "network-error",
      ok: false,
      redirectChain: chain.length ? chain : undefined,
    };
  }

  if (status >= 400) {
    return {
      status,
      kind: "http-error",
      ok: false,
      finalUrl: current,
      redirectChain: chain.length ? chain : undefined,
      flaky: isFlakyHost(url),
    };
  }

  const lower = body.toLowerCase();
  const parking =
    /window\.location\.href\s*=\s*["']\/lander["']/i.test(body) ||
    /parking\s+crew|buy this domain|domain is for sale|sedoparking|godaddy\.com\/park/i.test(
      lower,
    ) ||
    (body.length > 0 &&
      body.length < 400 &&
      /onload\s*=\s*function\(\)\s*\{\s*window\.location/i.test(body));

  if (parking) {
    return {
      status,
      kind: "soft-404-parking",
      ok: false,
      finalUrl: current,
      redirectChain: chain.length ? chain : undefined,
      snippet: body.replace(/\s+/g, " ").slice(0, 160),
    };
  }

  return {
    status,
    kind: "ok",
    ok: true,
    finalUrl: current,
    redirectChain: chain.length ? chain : undefined,
    flaky: isFlakyHost(url),
  };
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function main() {
  const smRes = await fetch(`${BASE}/sitemap.xml`);
  if (!smRes.ok) throw new Error(`sitemap ${smRes.status}`);
  const sm = await smRes.text();
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const seed = new Set();
  for (const loc of locs) {
    const path = new URL(loc).pathname.replace(/\/$/, "") || "/";
    seed.add(normalizeSameOrigin(BASE + path));
  }
  seed.add(normalizeSameOrigin(BASE + "/"));
  for (const p of [
    "/reference/plugins",
    "/verticals",
    "/reference/verticals",
    "/getting-started/migrate-to-8.0",
    "/plugins/bundled-providers",
    "/streams/clawql-celld",
    "/memory/okf",
  ]) {
    seed.add(normalizeSameOrigin(BASE + p));
  }

  const visited = new Map();
  const broken = [];
  const redirects = [];
  const queue = [...seed]
    .filter(Boolean)
    .map((u) => ({ url: u, from: "sitemap-or-seed" }));
  const linkGraph = new Map();
  /** @type {Map<string, Set<string>>} external url -> set of pages */
  const externalFrom = new Map();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  while (queue.length) {
    const { url, from } = queue.shift();
    if (visited.has(url)) continue;
    const { status, location, error } = await fetchStatus(url);
    const entry = {
      status,
      from,
      location: location || undefined,
      error,
    };
    visited.set(url, entry);

    if (status === 0 || status >= 400) {
      broken.push({ url, scope: "same-origin", ...entry });
      continue;
    }
    if (status >= 300 && status < 400) {
      redirects.push({ url, status, location });
      const next = location ? normalizeSameOrigin(location, url) : null;
      if (next && !visited.has(next) && !queue.some((q) => q.url === next)) {
        queue.push({ url: next, from: url });
      }
      continue;
    }
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const hrefs = await page.$$eval("a[href]", (as) =>
        as.map((a) => a.getAttribute("href")).filter(Boolean),
      );
      const outs = [];
      for (const h of hrefs) {
        // Skip non-navigable / executable schemes (CodeQL js/incomplete-url-scheme-check:
        // javascript: alone is insufficient — also reject data: and vbscript:).
        const scheme = String(h).trim().toLowerCase();
        if (
          scheme.startsWith("mailto:") ||
          scheme.startsWith("tel:") ||
          scheme.startsWith("javascript:") ||
          scheme.startsWith("data:") ||
          scheme.startsWith("vbscript:")
        ) {
          continue;
        }
        const same = normalizeSameOrigin(h, url);
        if (same) {
          outs.push(same);
          if (!visited.has(same) && !queue.some((q) => q.url === same)) {
            queue.push({ url: same, from: url });
          }
          continue;
        }
        const ext = normalizeExternal(h, url);
        if (ext) {
          if (isNonNavigableExample(ext)) continue;
          if (!externalFrom.has(ext)) externalFrom.set(ext, new Set());
          externalFrom.get(ext).add(url);
        }
      }
      linkGraph.set(url, [...new Set(outs)]);
    } catch (e) {
      broken.push({
        url,
        scope: "same-origin",
        status: "nav-error",
        error: String(e),
      });
    }
  }

  await browser.close();

  /** @type {Array<object>} */
  const externalBroken = [];
  /** @type {Array<object>} */
  const externalOk = [];
  /** @type {Array<object>} */
  const externalFlaky = [];

  if (CHECK_EXTERNAL && externalFrom.size) {
    const urls = [...externalFrom.keys()];
    console.error(
      `Checking ${urls.length} unique external URLs (concurrency ${EXT_CONCURRENCY})…`,
    );
    const results = await mapPool(urls, EXT_CONCURRENCY, async (extUrl) => {
      const result = await checkExternal(extUrl);
      return { url: extUrl, ...result, from: [...externalFrom.get(extUrl)] };
    });
    for (const r of results) {
      if (r.ok) {
        if (r.flaky) externalFlaky.push(r);
        else externalOk.push({ url: r.url, status: r.status, finalUrl: r.finalUrl });
      } else if (r.flaky && (r.status === 403 || r.status === 429 || r.status === 999)) {
        // Bot-blocked social hosts — record but do not fail the crawl
        externalFlaky.push(r);
      } else {
        externalBroken.push(r);
        broken.push({
          url: r.url,
          scope: "external",
          status: r.status,
          kind: r.kind,
          error: r.error,
          finalUrl: r.finalUrl,
          snippet: r.snippet,
          from: r.from?.[0] || "unknown",
          fromAll: r.from,
        });
      }
    }
  }

  const stalePatterns = [
    {
      id: "opinionated-default-autoload",
      re: /loads the opinionated default stack|Default install loads the opinionated|auto-load(?:s|ed)? pack [`']?default/i,
    },
    {
      id: "onRegister-as-current",
      re: /Today:\s*plugins register via|implement \*\*`?onRegister`?|via `onRegister`(?!.*historical)/i,
    },
    { id: "beforeCallTool-current", re: /Panguard `beforeCallTool`/i },
    {
      id: "adapter-0.6.0",
      re: /mcp-api-adapter[`'\s]*0\.6\.0|in-repo `0\.6\.0`/i,
    },
    { id: "qr-as-7th", re: /QR[^\n.]{0,60}7th surface/i },
    {
      id: "providers-pack-default-chart",
      re: /chart default is [`']?default[`']?/i,
    },
    { id: "okf-io-parking", re: /https?:\/\/okf\.io/i },
  ];

  const staleHits = [];
  const browser2 = await chromium.launch({ headless: true });
  const page2 = await browser2.newPage();
  const samplePages = [...visited.keys()].filter((u) => {
    const st = visited.get(u).status;
    return st >= 200 && st < 300;
  });
  for (const url of samplePages) {
    if (
      url.includes("/_next/") ||
      url.endsWith(".xml") ||
      url.endsWith(".json") ||
      (url.endsWith(".txt") && !url.endsWith("/llms.txt"))
    ) {
      continue;
    }
    try {
      await page2.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const text = await page2.innerText("body");
      const html = await page2.content();
      for (const pat of stalePatterns) {
        const hay = pat.id === "okf-io-parking" ? html : text;
        if (pat.re.test(hay)) {
          staleHits.push({
            url,
            pattern: pat.id,
            snippet: hay.match(pat.re)?.[0]?.slice(0, 120),
          });
        }
      }
    } catch {
      /* ignore */
    }
  }
  await browser2.close();

  const summary = {
    base: BASE,
    checkExternal: CHECK_EXTERNAL,
    sitemapLocs: locs.length,
    pagesVisited: visited.size,
    externalChecked: externalFrom.size,
    externalOkCount: externalOk.length,
    externalFlakyCount: externalFlaky.length,
    brokenCount: broken.length,
    redirectCount: redirects.length,
    staleHitCount: staleHits.length,
    broken,
    externalFlaky: externalFlaky.slice(0, 50),
    redirects: redirects.slice(0, 100),
    staleHits,
  };
  writeFileSync(OUT, JSON.stringify(summary, null, 2));

  const sameOriginBroken = broken.filter((b) => b.scope !== "external");
  const extBroken = broken.filter((b) => b.scope === "external");
  console.log(
    JSON.stringify(
      {
        pagesVisited: summary.pagesVisited,
        externalChecked: summary.externalChecked,
        externalOkCount: summary.externalOkCount,
        externalFlakyCount: summary.externalFlakyCount,
        brokenCount: summary.brokenCount,
        sameOriginBroken: sameOriginBroken.length,
        externalBroken: extBroken.length,
        redirectCount: summary.redirectCount,
        staleHitCount: summary.staleHitCount,
        broken: summary.broken,
        staleHits: summary.staleHits,
      },
      null,
      2,
    ),
  );
  process.exit(broken.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
