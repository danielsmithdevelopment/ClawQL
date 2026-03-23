#!/usr/bin/env node
/**
 * Download bundled provider specs into providers/ (for offline installs / pinned copies).
 * Requires network. Run from repo root: node scripts/fetch-provider-specs.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = [
  {
    id: "google",
    url: "https://container.googleapis.com/$discovery/rest?version=v1",
    out: "providers/google/discovery.json",
  },
  {
    id: "jira",
    url: "https://raw.githubusercontent.com/magmax/atlassian-openapi/master/spec/jira.yaml",
    out: "providers/atlassian/jira/openapi.yaml",
  },
  {
    id: "cloudflare",
    url: "https://raw.githubusercontent.com/cloudflare/api-schemas/refs/heads/main/openapi.yaml",
    out: "providers/cloudflare/openapi.yaml",
  },
];

async function main() {
  for (const t of TARGETS) {
    const out = join(root, t.out);
    await mkdir(dirname(out), { recursive: true });
    process.stderr.write(`Fetching ${t.id} → ${t.out}\n`);
    const res = await fetch(t.url);
    if (!res.ok) {
      throw new Error(`${t.id}: HTTP ${res.status}`);
    }
    const text = await res.text();
    await writeFile(out, text, "utf-8");
  }
  process.stderr.write("Done.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
