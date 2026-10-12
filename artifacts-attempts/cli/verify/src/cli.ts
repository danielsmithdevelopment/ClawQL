#!/usr/bin/env node
/**
 * Verify a release from its Arweave ID, or verify a local evidence-note chain.
 *
 *   artifacts-verify --notes path/to/notes.jsonl
 *   artifacts-verify <arweave-id> [--gateway https://arweave.net] [--bundle path]
 *   artifacts-verify --local-manifest path/to/manifest.json --bundle-dir path/
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseEvidenceNote, verifyEvidenceChain } from "@artifacts-attempts/notes";
import {
  verifyBundleAgainstManifest,
  type BundleFile,
  type ReleaseManifest,
} from "@artifacts-attempts/manifest";

function usage(): never {
  console.error(`Usage:
  artifacts-verify --notes <notes.jsonl>
  artifacts-verify --local-manifest <manifest.json> --bundle-dir <dir>
  artifacts-verify --canary <status.json> [--percent 10]
  artifacts-verify <arweave-tx-id> [--gateway <url>] [--bundle-dir <dir>]`);
  process.exit(2);
}

function verifyCanaryFile(path: string, expectPercent: number): void {
  const status = JSON.parse(readFileSync(path, "utf8")) as {
    mode?: string;
    strategy?: string;
    versions?: Array<{ label: string; percentage: number }>;
    rollbackTrigger?: string;
  };
  if (status.mode !== "dry-run" && status.mode !== "live") {
    console.error("FAIL canary: mode must be dry-run or live");
    process.exit(1);
  }
  if (status.strategy !== "percentage") {
    console.error("FAIL canary: strategy must be percentage");
    process.exit(1);
  }
  const canary = status.versions?.find((v) => v.label === "canary");
  if (!canary) {
    console.error("FAIL canary: missing canary version slice");
    process.exit(1);
  }
  if (canary.percentage !== expectPercent) {
    console.error(`FAIL canary: ${canary.percentage}% !== ${expectPercent}%`);
    process.exit(1);
  }
  const previous = status.versions?.find((v) => v.label === "previous");
  if (previous && previous.percentage + canary.percentage !== 100) {
    console.error("FAIL canary: version percentages must total 100");
    process.exit(1);
  }
  if (!status.rollbackTrigger?.includes("error_rate")) {
    console.error("FAIL canary: rollbackTrigger must mention error_rate");
    process.exit(1);
  }
  console.log(
    `OK canary mode=${status.mode} percent=${canary.percentage} rollback=${status.rollbackTrigger}`
  );
}

function loadBundleDir(dir: string): BundleFile[] {
  const files: BundleFile[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else files.push({ path: relative(dir, p).split("\\").join("/"), bytes: readFileSync(p) });
    }
  };
  walk(dir);
  return files;
}

async function main(argv: string[]): Promise<void> {
  if (argv.includes("--notes")) {
    const idx = argv.indexOf("--notes");
    const path = argv[idx + 1];
    if (!path) usage();
    const lines = readFileSync(path, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const notes = lines.map(parseEvidenceNote);
    const result = verifyEvidenceChain(notes);
    if (!result.ok) {
      console.error("FAIL notes:", result.reason);
      process.exit(1);
    }
    console.log(`OK notes chain (${notes.length} notes)`);
    return;
  }

  if (argv.includes("--canary")) {
    const idx = argv.indexOf("--canary");
    const path = argv[idx + 1];
    if (!path) usage();
    const pIdx = argv.indexOf("--percent");
    const expectPercent = pIdx >= 0 ? Number(argv[pIdx + 1]) : 10;
    if (!Number.isFinite(expectPercent)) usage();
    verifyCanaryFile(path, expectPercent);
    return;
  }

  if (argv.includes("--local-manifest")) {
    const mIdx = argv.indexOf("--local-manifest");
    const bIdx = argv.indexOf("--bundle-dir");
    const mPath = argv[mIdx + 1];
    const bPath = argv[bIdx + 1];
    if (!mPath || !bPath) usage();
    const manifest = JSON.parse(readFileSync(mPath, "utf8")) as ReleaseManifest;
    const files = loadBundleDir(bPath);
    const result = verifyBundleAgainstManifest(manifest, files);
    if (!result.ok) {
      console.error("FAIL manifest:", result.reason);
      process.exit(1);
    }
    console.log(`OK local manifest merkleRoot=${manifest.merkleRoot}`);
    console.log(
      `buildEnvironment fork=${manifest.buildEnvironment.fork} commit=${manifest.buildEnvironment.commit}`
    );
    return;
  }

  const tx = argv.find((a) => !a.startsWith("-") && a !== "node");
  // skip node path / script path — argv from process.argv.slice(2)
  const txId = argv.filter((a) => !a.startsWith("-") && a !== "--gateway" && a !== "--bundle-dir")[0];
  if (!txId) usage();

  const gIdx = argv.indexOf("--gateway");
  const gateway = (gIdx >= 0 ? argv[gIdx + 1] : null) ?? "https://arweave.net";
  const url = `${gateway.replace(/\/$/, "")}/${txId}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAIL fetch ${url}: ${res.status}`);
    process.exit(1);
  }
  const manifest = (await res.json()) as ReleaseManifest;
  const bIdx = argv.indexOf("--bundle-dir");
  if (bIdx >= 0) {
    const bPath = argv[bIdx + 1];
    if (!bPath) usage();
    const result = verifyBundleAgainstManifest(manifest, loadBundleDir(bPath));
    if (!result.ok) {
      console.error("FAIL:", result.reason);
      process.exit(1);
    }
  } else {
    console.log("Fetched manifest; pass --bundle-dir to verify Merkle leaves against local files.");
  }
  console.log(`OK arweave tx=${txId} merkleRoot=${manifest.merkleRoot}`);
  void tx;
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exit(1);
});
