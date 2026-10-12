#!/usr/bin/env npx tsx
/**
 * Credential / live-path readiness. Safe with no secrets (prints what's missing).
 * With CLOUDFLARE_* set, optionally probes Artifacts REST list().
 *
 *   npm run demo:live-check
 *   LIVE_PROBE=1 npm run demo:live-check   # call Artifacts list() if creds present
 */

import { createRestClient } from "@artifacts-attempts/artifacts-client";
import { buildGradualDeployRequest, gradualDeployUrl } from "@artifacts-attempts/pipeline";

type Check = { name: string; ok: boolean; hint?: string };

function present(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

const checks: Check[] = [
  {
    name: "CLOUDFLARE_ACCOUNT_ID",
    ok: present("CLOUDFLARE_ACCOUNT_ID"),
    hint: "Workers Paid account id",
  },
  {
    name: "CLOUDFLARE_API_TOKEN",
    ok: present("CLOUDFLARE_API_TOKEN"),
    hint: "Token with Artifacts + Workers edit",
  },
  {
    name: "ARTIFACTS_NAMESPACE",
    ok: true,
    hint: present("ARTIFACTS_NAMESPACE")
      ? process.env.ARTIFACTS_NAMESPACE!.trim()
      : "unset → defaults to attempts",
  },
  {
    name: "ARWEAVE_JWK",
    ok: present("ARWEAVE_JWK"),
    hint: "Turbo / permanent publish (optional for forks-only smoke)",
  },
  {
    name: "DECISIONS_URL",
    ok: present("DECISIONS_URL"),
    hint: "ClawQL or OpenAI-compatible /v1/decisions",
  },
];

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim() ?? "";
const namespace = process.env.ARTIFACTS_NAMESPACE?.trim() || "attempts";
const scriptName = process.env.WORKERS_SCRIPT_NAME?.trim() || "artifacts-attempts-demo";

console.log("live-check: Cloudflare / release readiness\n");
for (const c of checks) {
  console.log(`${c.ok ? "OK  " : "MISS"}  ${c.name}${c.hint ? ` — ${c.hint}` : ""}`);
}

const cfReady = present("CLOUDFLARE_ACCOUNT_ID") && present("CLOUDFLARE_API_TOKEN");
const deploy = buildGradualDeployRequest({
  canaryPercent: 10,
  versionId: "ver_CANARY",
  previousVersionId: "ver_STABLE",
});

console.log("\nGradual deploy (when versions exist):");
const deployUrl = accountId
  ? gradualDeployUrl(accountId, scriptName)
  : `https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/${scriptName}/deployments`;
console.log(`  POST ${deployUrl}`);
console.log(`  body: ${JSON.stringify(deploy)}`);

if (process.env.LIVE_PROBE === "1") {
  if (!cfReady) {
    console.error("\nLIVE_PROBE=1 but CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN missing");
    process.exit(1);
  }
  console.log("\nProbing Artifacts REST list()…");
  const client = createRestClient({ accountId, apiToken, namespace });
  try {
    const repos = await client.list();
    console.log(`OK Artifacts namespace=${namespace} repos=${repos.length}`);
    if (repos.length) console.log(`  sample: ${repos.slice(0, 5).join(", ")}`);
  } catch (err) {
    console.error("FAIL Artifacts probe:", err);
    process.exit(1);
  }
}

if (!cfReady) {
  console.log(`
LIVE CHECK: local path only (no Cloudflare creds).

Next when creds arrive:
  1. Copy .env.example → .env and fill CLOUDFLARE_* (+ optional ARWEAVE_JWK)
  2. LIVE_PROBE=1 npm run demo:live-check
  3. ATTEMPTS_E2E=1 npx vitest run --config e2e/vitest.config.ts
  4. See docs/HUMAN_NEXT.md + docs/PITCH.md
`);
  process.exit(0);
}

console.log(`
LIVE CHECK: Cloudflare creds present (namespace=${namespace}).
Run LIVE_PROBE=1 to hit Artifacts list(). Film path: docs/PITCH.md + VIDEO_SCRIPT.md.
`);
