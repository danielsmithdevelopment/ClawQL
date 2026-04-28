#!/usr/bin/env node
/**
 * n8n serves the bundled OpenAPI as embedded JSON inside
 * GET {base}/api/v1/docs/swagger-ui-init.js (not as standalone openapi.json).
 *
 * Usage (from repo root):
 *   N8N_BASE_URL=http://127.0.0.1:5678 node scripts/providers/fetch-n8n-openapi.mjs
 *
 * Requires a running n8n with the public API enabled (default in many installs;
 * see https://docs.n8n.io/hosting/securing/disable-public-api ).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "providers/n8n/openapi.json");

const base = (process.env.N8N_BASE_URL ?? "http://127.0.0.1:5678").replace(
  /\/$/,
  ""
);
const url = `${base}/api/v1/docs/swagger-ui-init.js`;

async function main() {
  process.stderr.write(`Fetching n8n swagger bundle → ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`n8n: HTTP ${res.status} (is n8n up and public API enabled?)`);
  }
  const text = await res.text();
  const marker = '"swaggerDoc":';
  const endMarker = ',\n  "customOptions"';
  const start = text.indexOf(marker);
  if (start === -1) {
    throw new Error("n8n: could not find swaggerDoc in swagger-ui-init.js");
  }
  const jsonStart = start + marker.length;
  const end = text.indexOf(endMarker, jsonStart);
  if (end === -1) {
    throw new Error("n8n: could not find end of swaggerDoc object");
  }
  const raw = text.slice(jsonStart, end).trim();
  const doc = JSON.parse(raw);
  // Duplicate / malformed "server" block from some builds; "servers" is canonical.
  if (doc.server) {
    delete doc.server;
  }
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(doc, null, 2), "utf-8");
  process.stderr.write(`Wrote ${out}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
