#!/usr/bin/env node
/**
 * CI helper (audit 7.07): ensure committed top-50 provider manifests parse as JSON.
 * Prints a short Markdown report to stdout.
 */
import fs from "node:fs";

const paths = [
  "providers/aws/aws-top50-apis.json",
  "providers/google/google-top50-apis.json",
];

console.log(`# Provider catalog validate ${new Date().toISOString()}`);
console.log();
console.log("## Top-50 manifests");

for (const p of paths) {
  const raw = fs.readFileSync(p, "utf8");
  const j = JSON.parse(raw);
  const n = Array.isArray(j)
    ? j.length
    : (j.apis?.length ?? j.items?.length ?? Object.keys(j).length);
  console.log(`- ok ${p} (entries≈${n})`);
}

console.log();
console.log("## scripts/providers inventory");
for (const name of fs.readdirSync("scripts/providers").sort()) {
  console.log(name);
}
console.log();
console.log("## Note");
console.log(
  "Full network refresh (fetch-provider-specs / fetch-aws-top50 / fetch-google-top50)"
);
console.log(
  "is not run in CI — requires egress + optional self-hosted OpenAPI hosts."
);
console.log("Local: npm run fetch-provider-specs");
console.log("Dry-run list only is exercised in the following workflow step.");
