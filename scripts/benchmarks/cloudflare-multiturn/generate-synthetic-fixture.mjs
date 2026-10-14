#!/usr/bin/env node
/**
 * Build a labeled synthetic Cloudflare fixture for the 12-step zone audit.
 *
 * This is **not** a live recording. Board label: "real schemas, synthetic content"
 * until `record/record-cloudflare-reads.mjs` produces a sanitized capture.
 *
 *   node scripts/benchmarks/cloudflare-multiturn/generate-synthetic-fixture.mjs
 *   DNS_COUNT=300 node ...
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FAKE, fakeId } from "./lib/fixture-ids.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "fixtures");
const DNS_COUNT = Math.max(50, Number(process.env.DNS_COUNT || 300) || 300);

function cfOk(result, extras = {}) {
  return { success: true, errors: [], messages: [], result, ...extras };
}

function latencySamples(baseMs, n = 8) {
  const out = [];
  for (let i = 0; i < n; i++) {
    // Log-normal-ish synthetic samples; labeled synthetic in manifest.
    const jitter = (i + 1) * 3.7 + ((i * 17) % 11);
    out.push(Number((baseMs + jitter).toFixed(2)));
  }
  return out;
}

const zones = [
  {
    id: FAKE.auditZoneId,
    name: FAKE.auditZoneName,
    status: "active",
    paused: false,
    type: "full",
    development_mode: 0,
    name_servers: ["ada.ns.cloudflare.invalid", "bob.ns.cloudflare.invalid"],
    original_name_servers: [],
    original_registrar: null,
    original_dnshost: null,
    modified_on: "2024-06-01T12:00:00.000Z",
    created_on: "2023-01-15T08:00:00.000Z",
    activated_on: "2023-01-15T09:00:00.000Z",
    meta: { step: 2 },
    owner: { id: null, type: "user", email: "user@example.invalid" },
    account: { id: FAKE.accountId, name: "Bench Account" },
    tenant: { id: null, name: null },
    tenant_unit: { id: null },
    plan: { id: "free", name: "Free Website", price: 0, currency: "USD", frequency: "", is_subscribed: true, can_subscribe: false },
  },
  {
    id: fakeId("zone", 2),
    name: "other-zone.example",
    status: "active",
    plan: { id: "pro", name: "Pro", price: 20, currency: "USD" },
  },
  {
    id: fakeId("zone", 3),
    name: "staging.example",
    status: "pending",
    plan: { id: "free", name: "Free Website", price: 0, currency: "USD" },
  },
];

const dnsRecords = [];
for (let i = 1; i <= DNS_COUNT; i++) {
  const isTarget = i <= 12;
  const unproxied = i === 1 || i === 7 || i === 11;
  const type = i % 17 === 0 ? "CNAME" : i % 11 === 0 ? "TXT" : "A";
  const name =
    i === 1
      ? FAKE.unproxiedRecordName
      : type === "A"
        ? `host-${i}.${FAKE.auditZoneName}`
        : type === "CNAME"
          ? `alias-${i}.${FAKE.auditZoneName}`
          : `_verify-${i}.${FAKE.auditZoneName}`;
  const content =
    type === "A"
      ? isTarget
        ? FAKE.targetIp
        : `203.0.113.${(i % 200) + 1}`
      : type === "CNAME"
        ? `target-${i}.cdn.example`
        : `v=spf${i}`;
  dnsRecords.push({
    id: i === 1 ? FAKE.unproxiedRecordId : fakeId("dns", i),
    zone_id: FAKE.auditZoneId,
    zone_name: FAKE.auditZoneName,
    name,
    type,
    content,
    proxiable: type === "A" || type === "CNAME",
    proxied: type === "A" || type === "CNAME" ? !unproxied && type === "A" ? i % 3 !== 0 : false : false,
    ttl: unproxied ? 120 : 1,
    locked: false,
    meta: { auto_added: false },
    comment: null,
    tags: [],
    created_on: "2024-01-01T00:00:00.000Z",
    modified_on: "2024-06-01T00:00:00.000Z",
  });
}
// Ensure proxied flag correct for A @ target IP
for (const r of dnsRecords) {
  if (r.type === "A" && r.content === FAKE.targetIp) {
    r.proxied = r.id !== FAKE.unproxiedRecordId && !r.name.startsWith("host-7") && !r.name.startsWith("host-11");
  }
}
// Force the three unproxied A records at target IP used by steps 5–6 / 12
const forceUnproxied = [1, 7, 11];
for (const i of forceUnproxied) {
  const r = dnsRecords[i - 1];
  r.type = "A";
  r.content = FAKE.targetIp;
  r.proxied = false;
  r.proxiable = true;
  if (i === 1) {
    r.id = FAKE.unproxiedRecordId;
    r.name = FAKE.unproxiedRecordName;
  }
}

const workers = [
  {
    id: FAKE.workerScriptName,
    etag: "etag-edge-router",
    handlers: ["fetch"],
    modified_on: "2024-09-01T10:00:00.000Z",
    created_on: "2024-02-01T10:00:00.000Z",
    compatibility_date: FAKE.workerCompatDate,
  },
  {
    id: "log-sink",
    etag: "etag-log-sink",
    handlers: ["fetch"],
    modified_on: "2024-08-01T10:00:00.000Z",
    created_on: "2024-03-01T10:00:00.000Z",
    compatibility_date: "2024-09-23",
  },
];

const routes = [
  {
    id: fakeId("route", 1),
    pattern: `api.${FAKE.auditZoneName}/*`,
    script: FAKE.workerScriptName,
    request_limit_fail_open: false,
  },
  {
    id: fakeId("route", 2),
    pattern: `logs.${FAKE.auditZoneName}/*`,
    script: "log-sink",
    request_limit_fail_open: false,
  },
];

const r2Buckets = [
  { name: "assets-prod", creation_date: "2024-04-01T12:00:00.000Z", location: "WNAM" },
  { name: "artifacts-ci", creation_date: "2024-05-15T08:30:00.000Z", location: "EEUR" },
  { name: "backups-cold", creation_date: "2023-12-01T00:00:00.000Z", location: "WNAM" },
];

const firewallRules = [];
for (let i = 1; i <= 8; i++) {
  firewallRules.push({
    id: fakeId("rule", i),
    paused: i === 3 || i === 6,
    description: `Rule ${i}`,
    action: i % 2 === 0 ? "block" : "challenge",
    priority: i * 10,
    filter: { id: fakeId("x", 500 + i), expression: `(http.request.uri.path contains "/admin-${i}")`, paused: false },
  });
}

const sslMode = "full";

const world = {
  label: "real schemas, synthetic content",
  accountId: FAKE.accountId,
  zones,
  dnsRecords,
  workers,
  routes,
  r2Buckets,
  firewallRules,
  sslMode,
  dnsCount: dnsRecords.length,
};

/** HTTP call records the mock replays (method+path+query → body). */
const calls = [
  {
    operationId: "zones-get",
    method: "GET",
    path: "/zones",
    query: {},
    status: 200,
    latency_samples_ms: latencySamples(45),
    body: cfOk(zones, { result_info: { page: 1, per_page: 50, count: zones.length, total_count: zones.length } }),
  },
  {
    operationId: "zones-0-get",
    method: "GET",
    path: `/zones/${FAKE.auditZoneId}`,
    query: {},
    status: 200,
    latency_samples_ms: latencySamples(38),
    body: cfOk(zones[0]),
  },
  {
    operationId: "zone-settings-get-single-setting",
    method: "GET",
    path: `/zones/${FAKE.auditZoneId}/settings/ssl`,
    query: {},
    status: 200,
    latency_samples_ms: latencySamples(32),
    body: cfOk({ id: "ssl", value: sslMode, editable: true, modified_on: "2024-01-01T00:00:00.000Z" }),
  },
  {
    operationId: "dns-records-for-a-zone-list-dns-records",
    method: "GET",
    path: `/zones/${FAKE.auditZoneId}/dns_records`,
    query: { per_page: "500" },
    status: 200,
    latency_samples_ms: latencySamples(120),
    body: cfOk(dnsRecords, {
      result_info: { page: 1, per_page: 500, count: dnsRecords.length, total_count: dnsRecords.length },
    }),
  },
  {
    operationId: "worker-script-list-workers",
    method: "GET",
    path: `/accounts/${FAKE.accountId}/workers/scripts`,
    query: {},
    status: 200,
    latency_samples_ms: latencySamples(55),
    body: cfOk(workers),
  },
  {
    operationId: "worker-script-get-settings",
    method: "GET",
    path: `/accounts/${FAKE.accountId}/workers/scripts/${FAKE.workerScriptName}/settings`,
    query: {},
    status: 200,
    latency_samples_ms: latencySamples(40),
    body: cfOk({
      placement: {},
      compatibility_date: FAKE.workerCompatDate,
      compatibility_flags: [],
      usage_model: "standard",
      tags: [],
      tail_consumers: [],
      logpush: false,
      bindings: [],
    }),
  },
  {
    operationId: "worker-routes-list-routes",
    method: "GET",
    path: `/zones/${FAKE.auditZoneId}/workers/routes`,
    query: {},
    status: 200,
    latency_samples_ms: latencySamples(42),
    body: cfOk(routes),
  },
  {
    operationId: "r2-list-buckets",
    method: "GET",
    path: `/accounts/${FAKE.accountId}/r2/buckets`,
    query: {},
    status: 200,
    latency_samples_ms: latencySamples(60),
    body: cfOk({ buckets: r2Buckets }),
  },
  {
    operationId: "firewall-rules-list-firewall-rules",
    method: "GET",
    path: `/zones/${FAKE.auditZoneId}/firewall/rules`,
    query: {},
    status: 200,
    latency_samples_ms: latencySamples(48),
    body: cfOk(firewallRules),
  },
  // Gated write — mock returns 403 if ever called; harness must not call it.
  {
    operationId: "dns-records-for-a-zone-patch-dns-record",
    method: "PATCH",
    path: `/zones/${FAKE.auditZoneId}/dns_records/${FAKE.unproxiedRecordId}`,
    query: {},
    status: 403,
    latency_samples_ms: latencySamples(20),
    body: {
      success: false,
      errors: [{ code: 10000, message: "Benchmark mock refuses writes; proposal must stay gated" }],
      messages: [],
      result: null,
    },
  },
];

const recording = {
  version: 1,
  kind: "cloudflare-zone-audit-fixture",
  source: "synthetic",
  label: world.label,
  recordedAt: null,
  generatedAt: new Date().toISOString(),
  apiBase: "https://api.cloudflare.com/client/v4",
  accountId: FAKE.accountId,
  auditZoneId: FAKE.auditZoneId,
  auditZoneName: FAKE.auditZoneName,
  world,
  calls,
};

mkdirSync(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, "recording.synthetic.json");
const json = JSON.stringify(recording, null, 2) + "\n";
writeFileSync(outPath, json);

const hash = createHash("sha256").update(json).digest("hex");
const curated = JSON.parse(readFileSync(join(OUT_DIR, "curated-subset.json"), "utf8"));
const manifest = {
  generatedAt: recording.generatedAt,
  files: {
    "recording.synthetic.json": { sha256: hash, bytes: json.length, source: "synthetic", dnsCount: DNS_COUNT },
    "curated-subset.json": {
      sha256: createHash("sha256").update(readFileSync(join(OUT_DIR, "curated-subset.json"))).digest("hex"),
      operationCount: curated.actualSize,
      frozenAt: curated.frozenAt,
    },
  },
  safety: {
    writes: "mock returns 403 for PATCH dns; harness proposes only",
    credentials: "none in fixture",
    r2: "list buckets only — no object listing",
  },
};
writeFileSync(join(OUT_DIR, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join("/workspace/docs/benchmarks/cloudflare-multiturn", "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(JSON.stringify({ outPath, sha256: hash, dnsCount: DNS_COUNT, calls: calls.length }, null, 2));
