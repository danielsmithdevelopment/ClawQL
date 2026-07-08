#!/usr/bin/env node
/**
 * Generate providers/aws/aws-top50-apis.json from APIs.guru catalog.
 * Run: node scripts/providers/generate-aws-top50-manifest.mjs
 */
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(root, "providers/aws/aws-top50-apis.json");

function stripHtmlTags(value) {
  let text = String(value);
  let prev;
  do {
    prev = text;
    text = text.replace(/<[^>]*>/g, "");
  } while (text !== prev);
  return text.replace(/[<>]/g, "").trim();
}

const PRIORITY = [
  "ec2",
  "s3",
  "iam",
  "sts",
  "lambda",
  "ecs",
  "eks",
  "rds",
  "dynamodb",
  "cloudformation",
  "logs",
  "monitoring",
  "sns",
  "sqs",
  "route53",
  "elasticloadbalancingv2",
  "autoscaling",
  "kms",
  "secretsmanager",
  "ecr",
  "apigateway",
  "cloudfront",
  "events",
  "ssm",
  "organizations",
  "cloudtrail",
  "config",
  "guardduty",
  "securityhub",
  "wafv2",
  "elasticache",
  "es",
  "sagemaker",
  "redshift",
  "glue",
  "athena",
  "elasticmapreduce",
  "kinesis",
  "firehose",
  "states",
  "batch",
  "codebuild",
  "codepipeline",
  "codecommit",
  "codestar-notifications",
  "acm",
  "cognito-idp",
  "sesv2",
  "backup",
  "elasticfilesystem",
  "fsx",
];

async function main() {
  const res = await fetch("https://api.apis.guru/v2/list.json");
  if (!res.ok) throw new Error(`list.json HTTP ${res.status}`);
  const list = await res.json();

  const bySvc = {};
  for (const [k, v] of Object.entries(list)) {
    if (!k.startsWith("amazonaws.com:")) continue;
    const svc = k.slice("amazonaws.com:".length);
    const version = v.preferred;
    const title = v.versions?.[version]?.info?.title ?? svc;
    bySvc[svc] = { svc, version, title };
  }

  const apis = [];
  const missing = [];
  for (const svc of PRIORITY) {
    const p = bySvc[svc];
    if (!p) {
      missing.push(svc);
      continue;
    }
    const slug = `${svc}-${p.version}`;
    apis.push({
      slug,
      id: svc,
      version: p.version,
      title: stripHtmlTags(p.title),
      openapiUrl: `https://api.apis.guru/v2/specs/amazonaws.com/${svc}/${p.version}/openapi.yaml`,
      documentationLink: `https://docs.aws.amazon.com/${svc}/`,
    });
  }

  if (missing.length) {
    process.stderr.write(`Warning: not in APIs.guru catalog: ${missing.join(", ")}\n`);
  }
  if (apis.length < 50) {
    throw new Error(`Expected 50 APIs, got ${apis.length} (missing: ${missing.join(", ")})`);
  }

  const manifest = {
    description:
      "Curated AWS service OpenAPI bundle (top 50): APIs.guru / aws2openapi conversions. Pinned specs under providers/aws/apis/<slug>/openapi.yaml.",
    source: "https://api.apis.guru/v2/list.json (amazonaws.com:*)",
    apis: apis.slice(0, 50),
  };

  await writeFile(OUT, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  process.stderr.write(`Wrote ${manifest.apis.length} entries to ${OUT}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
