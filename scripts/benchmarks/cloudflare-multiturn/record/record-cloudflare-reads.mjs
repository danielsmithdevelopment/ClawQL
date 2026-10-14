#!/usr/bin/env node
/**
 * One-time Cloudflare read recorder (read-only token required).
 *
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… \
 *     AUDIT_ZONE_NAME=example.com \
 *     node scripts/benchmarks/cloudflare-multiturn/record/record-cloudflare-reads.mjs
 *
 * Safety:
 * - Only GET requests
 * - No R2 object listing
 * - Output is sanitized before write (no tokens/emails/raw account ids in committed files)
 *
 * After recording, replace fixtures/recording.synthetic.json usage with the sanitized
 * live file and update MANIFEST.json hashes.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { sanitizeRecording } from "../lib/sanitize.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim();
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const ZONE_NAME = process.env.AUDIT_ZONE_NAME?.trim();
const API = "https://api.cloudflare.com/client/v4";
const SAMPLES = Math.max(1, Number(process.env.CF_LATENCY_SAMPLES || 3) || 3);

if (!TOKEN || !ACCOUNT || !ZONE_NAME) {
  console.error(
    "Requires CLOUDFLARE_API_TOKEN (read-only), CLOUDFLARE_ACCOUNT_ID, AUDIT_ZONE_NAME"
  );
  process.exit(2);
}

async function get(path, query = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  const samples = [];
  let last = null;
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    });
    const text = await res.text();
    samples.push(Number((performance.now() - t0).toFixed(2)));
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    last = { status: res.status, body, path: url.pathname.replace("/client/v4", ""), query };
    if (!res.ok) break;
  }
  return { ...last, method: "GET", latency_samples_ms: samples };
}

const calls = [];
const zones = await get("/zones", { name: ZONE_NAME });
calls.push({ operationId: "zones-get", ...zones });
const zone = zones.body?.result?.[0];
if (!zone?.id) {
  console.error("zone not found for", ZONE_NAME);
  process.exit(1);
}
const zoneId = zone.id;

calls.push({
  operationId: "zones-0-get",
  ...(await get(`/zones/${zoneId}`)),
});
calls.push({
  operationId: "zone-settings-get-single-setting",
  ...(await get(`/zones/${zoneId}/settings/ssl`)),
});
calls.push({
  operationId: "dns-records-for-a-zone-list-dns-records",
  ...(await get(`/zones/${zoneId}/dns_records`, { per_page: 500 })),
});
calls.push({
  operationId: "worker-script-list-workers",
  ...(await get(`/accounts/${ACCOUNT}/workers/scripts`)),
});
const scripts = calls.at(-1).body?.result || [];
const scriptName = scripts[0]?.id;
if (scriptName) {
  calls.push({
    operationId: "worker-script-get-settings",
    ...(await get(`/accounts/${ACCOUNT}/workers/scripts/${scriptName}/settings`)),
  });
}
calls.push({
  operationId: "worker-routes-list-routes",
  ...(await get(`/zones/${zoneId}/workers/routes`)),
});
calls.push({
  operationId: "r2-list-buckets",
  ...(await get(`/accounts/${ACCOUNT}/r2/buckets`)),
});
calls.push({
  operationId: "firewall-rules-list-firewall-rules",
  ...(await get(`/zones/${zoneId}/firewall/rules`)),
});

const raw = {
  version: 1,
  kind: "cloudflare-zone-audit-fixture",
  source: "live-recording",
  label: "real schemas, unscaled content — sanitize before commit",
  recordedAt: new Date().toISOString(),
  apiBase: API,
  accountId: ACCOUNT,
  auditZoneName: ZONE_NAME,
  calls,
};

const sanitized = sanitizeRecording(raw);
// Drop any residual secrets
for (const c of sanitized.calls) {
  delete c.authorization;
}

const outDir = join(HERE, "../fixtures");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "recording.live.sanitized.json");
writeFileSync(outPath, JSON.stringify(sanitized, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      wrote: outPath,
      calls: sanitized.calls.length,
      note: "Inspect, optionally scale DNS via scale-dns.mjs, update MANIFEST, then point FIXTURE at this file",
    },
    null,
    2
  )
);
