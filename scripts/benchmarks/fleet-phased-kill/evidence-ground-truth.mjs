/**
 * Per-trial effect ledger + twin digest persistence for fleet-phased boards.
 * Independent of the ProgramCell journal under test — v4 settle precondition.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * @param {{
 *   outEnv?: string | null,
 *   evidenceEnv?: string | null,
 *   allowOverwrite?: boolean,
 *   defaultOut: string,
 * }} opts
 */
export function resolveEvidenceOut({
  outEnv = null,
  evidenceEnv = null,
  allowOverwrite = false,
  defaultOut,
}) {
  if (outEnv && evidenceEnv && outEnv !== evidenceEnv) {
    console.warn(
      `fleet-phased: FLEET_PHASED_OUT wins over FLEET_PHASED_EVIDENCE (${evidenceEnv} ignored)`
    );
  }
  const out = outEnv || evidenceEnv || defaultOut;
  const existed = existsSync(out);
  if (existed && !allowOverwrite) {
    throw new Error(
      `fleet-phased: refusing to overwrite existing evidence at ${out} ` +
        `(set FLEET_PHASED_ALLOW_OVERWRITE=1 to replace, or point FLEET_PHASED_OUT at a new path)`
    );
  }
  return {
    out,
    existedBefore: existed,
    allowOverwrite: Boolean(allowOverwrite),
    replacedExisting: Boolean(allowOverwrite && existed),
  };
}

/** Sibling directory next to the evidence JSON for per-trial ground truth. */
export function evidenceTrialsDir(outPath) {
  return outPath.replace(/\.json$/i, "") + "-trials";
}

/**
 * @param {{
 *   evidenceDir: string,
 *   i: number | string,
 *   programId: string,
 *   phase: string,
 *   effectLedger: Record<string, unknown>,
 *   twinDigest?: Record<string, unknown> | null,
 *   note?: string | null,
 * }} opts
 */
export function persistTrialGroundTruth({
  evidenceDir,
  i,
  programId,
  phase,
  effectLedger,
  twinDigest = null,
  note = null,
}) {
  const trialDir = join(
    evidenceDir,
    "trials",
    `${String(i).padStart(4, "0")}_${String(programId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120)}`
  );
  mkdirSync(trialDir, { recursive: true });
  const effectLedgerPath = join(trialDir, "effect-ledger.json");
  const twinDigestPath = join(trialDir, "twin-digest.json");
  const ownerKey = `owner_${String(programId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96)}`;
  const writes = Array.isArray(effectLedger?.writes) ? effectLedger.writes : [];
  const ownerWrites = writes.filter(
    (w) => w?.id === ownerKey || w?.key === programId || String(w?.key || "").includes(programId)
  );
  writeFileSync(
    effectLedgerPath,
    JSON.stringify(
      {
        i,
        programId,
        phase,
        capturedAt: new Date().toISOString(),
        ownerKey,
        ownerEffectCount: ownerWrites.length,
        count: effectLedger?.count ?? writes.length,
        inFlight: effectLedger?.inFlight ?? null,
        generation: effectLedger?.generation ?? null,
        uniqueKeys: effectLedger?.uniqueKeys ?? null,
        writes,
        ownerWrites,
        note:
          note ||
          "Independent mock-pets __writes snapshot (external effect ledger). Not the ProgramCell journal.",
      },
      null,
      2
    ) + "\n"
  );
  writeFileSync(
    twinDigestPath,
    JSON.stringify(
      {
        i,
        programId,
        phase,
        capturedAt: new Date().toISOString(),
        ...(twinDigest || {
          captured: false,
          reason: "twin_not_run",
          note: "Outer-phase twins only; mid-flight / injection_missed trials record null twin here.",
        }),
      },
      null,
      2
    ) + "\n"
  );
  return {
    dir: trialDir,
    effectLedgerPath,
    twinDigestPath,
    ownerKey,
    ownerEffectCount: ownerWrites.length,
  };
}
