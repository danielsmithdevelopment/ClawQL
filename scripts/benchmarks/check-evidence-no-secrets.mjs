#!/usr/bin/env node
/**
 * Fail if any docs/benchmarks *evidence*.json contains credential-shaped content
 * or unredacted cloud account / bucket identifiers.
 *
 * Usage: node scripts/benchmarks/check-evidence-no-secrets.mjs [rootDir]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2] || join(process.cwd(), "docs/benchmarks");

const PATTERNS = [
  { name: "aws_access_key_id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "aws_secret_access_key_assign", re: /AWS_SECRET_ACCESS_KEY\s*[=:]\s*\S+/i },
  { name: "cloudflare_api_token", re: /\bcfat_[A-Za-z0-9_-]{20,}\b/ },
  { name: "bearer_token", re: /\bBearer\s+[A-Za-z0-9._\-+/=]{20,}/i },
  { name: "openai_sk", re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "r2_endpoint_host", re: /[a-f0-9]{32}\.r2\.cloudflarestorage\.com/i },
  { name: "r2_endpoint_url", re: /https?:\/\/[^"'\s]*r2\.cloudflarestorage\.com/i },
  { name: "s3_uri_unredacted", re: /\bs3:\/\/[A-Za-z0-9._/-]+/ },
  {
    name: "access_key_assign",
    re: /\b(AWS_|CLAWQL_SYNC_|CLAWQL_R2_)?(ACCESS_KEY_ID|SECRET_ACCESS_KEY)\s*[=:]\s*["']?[^"'\s]{8,}/i,
  },
  {
    name: "account_id_field",
    re: /"(accountId|r2AccountId|cloudflareAccountId|CLAWQL_R2_ACCOUNT_ID)"\s*:\s*"[a-f0-9]{32}"/i,
  },
  { name: "bucket_field_unredacted", re: /"bucket"\s*:\s*"s3:\/\// },
];

function isEvidenceFile(name) {
  // evidence.json, phased-evidence.json, *-evidence.json
  return name === "evidence.json" || (name.endsWith(".json") && name.includes("evidence"));
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (isEvidenceFile(name)) out.push(p);
  }
  return out;
}

function scanText(text) {
  const hits = [];
  for (const { name, re } of PATTERNS) {
    if (re.test(text)) hits.push(name);
  }
  return hits;
}

if (process.argv.includes("--self-test")) {
  const samples = [
    { label: "akia", text: '{"k":"AKIAIOSFODNN7EXAMPLE"}', expect: "aws_access_key_id" },
    { label: "r2_host", text: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com", expect: "r2_endpoint_host" },
    { label: "s3_uri", text: '{"bucket":"s3://my-bucket/prefix"}', expect: "s3_uri_unredacted" },
    { label: "clean", text: '{"bucketRedacted":true,"storageProvider":"cloudflare-r2"}', expect: null },
  ];
  let bad = 0;
  for (const s of samples) {
    const hits = scanText(s.text);
    const ok = s.expect ? hits.includes(s.expect) : hits.length === 0;
    if (!ok) {
      console.error(`self-test FAIL ${s.label}: hits=${hits.join(",") || "(none)"}`);
      bad += 1;
    }
  }
  if (bad) process.exit(1);
  console.log("check-evidence-no-secrets: self-test ok");
  process.exit(0);
}

const files = walk(root);
let failed = 0;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const rel = relative(process.cwd(), file);
  for (const name of scanText(text)) {
    console.error(`FAIL ${rel}: matched ${name}`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`check-evidence-no-secrets: ${failed} finding(s) in ${files.length} file(s)`);
  process.exit(1);
}
console.log(`check-evidence-no-secrets: ok (${files.length} evidence file(s))`);
