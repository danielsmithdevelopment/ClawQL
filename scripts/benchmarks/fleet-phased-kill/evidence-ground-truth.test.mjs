#!/usr/bin/env node
/**
 * Unit tests for evidence path refuse/overwrite recording + trial ground truth.
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveEvidenceOut,
  evidenceTrialsDir,
  persistTrialGroundTruth,
} from "./evidence-ground-truth.mjs";

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok:", msg);
  }
}

const dir = mkdtempSync(join(tmpdir(), "fleet-evidence-gt-"));
try {
  const existing = join(dir, "board.json");
  writeFileSync(existing, "{}\n");

  let threw = false;
  try {
    resolveEvidenceOut({
      outEnv: existing,
      allowOverwrite: false,
      defaultOut: join(dir, "default.json"),
    });
  } catch (e) {
    threw = /refusing to overwrite/.test(String(e?.message || e));
  }
  assert(threw, "refuse overwrite when file exists");

  const withEscape = resolveEvidenceOut({
    outEnv: existing,
    allowOverwrite: true,
    defaultOut: join(dir, "default.json"),
  });
  assert(withEscape.allowOverwrite === true, "allowOverwrite recorded");
  assert(withEscape.existedBefore === true, "existedBefore true");
  assert(withEscape.replacedExisting === true, "replacedExisting true when escape used on existing");

  const fresh = resolveEvidenceOut({
    outEnv: join(dir, "fresh.json"),
    allowOverwrite: true,
    defaultOut: join(dir, "default.json"),
  });
  assert(fresh.replacedExisting === false, "replacedExisting false when no prior file");
  assert(fresh.allowOverwrite === true, "escape hatch still recorded when set");

  const evidenceDir = evidenceTrialsDir(existing);
  assert(evidenceDir.endsWith("-trials"), "trials dir sibling naming");

  const programId = "phased_after_intent_before_call_1_test";
  const ownerKey = `owner_${programId}`;
  const gt = persistTrialGroundTruth({
    evidenceDir,
    i: 1,
    programId,
    phase: "after_intent_before_call",
    effectLedger: {
      count: 1,
      inFlight: 0,
      generation: 2,
      uniqueKeys: 1,
      writes: [{ id: ownerKey, key: programId, at: "2026-11-05T00:00:00.000Z", name: "lab", generation: 2 }],
    },
    twinDigest: {
      captured: true,
      preserved: true,
      baselineResultDigest: "abc",
      observedResultDigest: "abc",
    },
  });
  assert(existsSync(gt.effectLedgerPath), "effect-ledger.json written");
  assert(existsSync(gt.twinDigestPath), "twin-digest.json written");
  assert(gt.ownerEffectCount === 1, "ownerEffectCount counts owner_* rows");
  const ledger = JSON.parse(readFileSync(gt.effectLedgerPath, "utf8"));
  assert(ledger.ownerKey === ownerKey, "ownerKey recorded");
  assert(/Independent mock-pets/.test(ledger.note), "ledger notes independence from journal");
  const twin = JSON.parse(readFileSync(gt.twinDigestPath, "utf8"));
  assert(twin.captured === true && twin.preserved === true, "twin digest persisted");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nall assertions passed");
