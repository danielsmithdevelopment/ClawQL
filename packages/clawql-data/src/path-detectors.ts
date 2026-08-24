/**
 * Path / light-text detectors for Harvey LAB structural bools at ingest.
 * Parity target: integrations/harvey-labs/scripts/lab-vault-seed.mjs
 * (filename second-request + defined-term "(the "Second Request")" in docx/eml).
 */
import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { extractDocxText } from "./inventory.js";

const HSR_SECOND_REQUEST_PAREN = /\(the ["\u201c]Second Request["\u201d]\)/i;
const ANTITRUST_PATH = /antitrust|hsr|ftc|doj/i;

/** Prefer gold-style proof paths over generic second-request*.docx strategy memos. */
const PREFERRED_SECOND_REQUEST_EVIDENCE = [
  "substantial-compliance-certification",
  "custodian-identification-collection-protocol",
  "second-request-strategy-memo",
  "hsr-withdrawal-letter",
  "joint-status-report",
  "case-assessment-memo",
  "letter-ftc-meet-and-confer",
  "second-request-response-strategy",
  "second-request-compliance-cover",
  "second-request-compliance-cost",
  "second-request-compliance-strategy",
] as const;

export type HsrDetection = {
  received: boolean;
  proofDoc: string;
  secondRequestDate: string | null;
  antitrustSignal: boolean;
  clientHint: string;
};

export type CreditDetection = {
  isCreditFacility: boolean;
  practiceArea: string;
  matterType: string;
};

export type ClearanceDetection = {
  cleared: boolean;
  proofDoc: string;
};

export type StructuralPathFlags = {
  is_hsr_second_request: boolean;
  hsr_second_request_proof_doc: string;
  hsr_second_request_date: string | null;
  has_hsr_clearance: boolean;
  hsr_clearance_proof_doc: string;
  is_credit_facility: boolean;
  is_antitrust_matter: boolean;
  client_short_name: string;
  practice_area?: string;
  matter_type?: string;
};

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkFiles(abs)));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

function isSignedFacilityDocxName(nameL: string): boolean {
  if (
    ["dip", "construction", "building-loan", "project-loan", "mortgage", "liquidity", "memo", "analysis", "letter", "issues"].some(
      (tok) => nameL.includes(tok)
    )
  ) {
    return false;
  }
  if (!nameL.includes("execution")) return false;
  return (
    nameL.includes("credit-agreement") ||
    nameL.includes("credit_agreement") ||
    nameL.startsWith("credit agreement") ||
    nameL.includes("bridge-loan-agreement") ||
    nameL.includes("bridge_loan_agreement") ||
    nameL.includes("term-loan-agreement") ||
    nameL.includes("term_loan_agreement") ||
    nameL.includes("mezzanine-credit-agreement") ||
    (nameL.includes("loan-agreement") &&
      !nameL.includes("intercreditor") &&
      !nameL.includes("mezzanine-loan") &&
      !nameL.includes("senior-mortgage"))
  );
}

export function detectHsrFromRelPaths(relPaths: readonly string[]): {
  received: boolean;
  proofDoc: string;
  antitrustSignal: boolean;
} {
  let proofDoc = "";
  let received = false;
  let antitrustSignal = false;
  for (const rel of relPaths) {
    const relNorm = rel.replaceAll("\\", "/");
    const name = basename(relNorm).toLowerCase();
    if (ANTITRUST_PATH.test(relNorm)) antitrustSignal = true;
    if (!name.includes("second-request") && !name.includes("second_request")) continue;
    if (name.includes("preparation")) continue;
    received = true;
    if (!proofDoc) proofDoc = relNorm;
  }
  return { received, proofDoc, antitrustSignal };
}

export function detectCreditFromRelPaths(relPaths: readonly string[]): CreditDetection {
  const evidence: string[] = [];
  for (const rel of relPaths) {
    const relNorm = rel.replaceAll("\\", "/");
    const relL = relNorm.toLowerCase();
    const nameL = basename(relNorm).toLowerCase();
    if (!nameL.endsWith(".docx")) continue;
    if (relL.startsWith("financing/")) continue;
    if (nameL.includes("dip") || relL.includes("/dip/") || relL.includes("dip ")) continue;
    const underPrimary =
      relL.startsWith("transaction documents/") ||
      relL.startsWith("documents/") ||
      relL.includes("/credit agreement/") ||
      relL.includes("/credit-agreement/");
    if (!underPrimary) continue;
    if (isSignedFacilityDocxName(nameL)) evidence.push(relNorm);
    else if (
      (nameL === "draft-loan-agreement.docx" || nameL === "loan-agreement.docx") &&
      relL.startsWith("transaction documents/")
    ) {
      evidence.push(relNorm);
    }
  }
  const hit = evidence.length > 0;
  return {
    isCreditFacility: hit,
    practiceArea: hit ? "Banking & Finance" : "Other",
    matterType: hit ? "Credit Facility" : "Other",
  };
}

export function detectClearanceFromRelPaths(relPaths: readonly string[]): ClearanceDetection {
  for (const rel of relPaths) {
    const name = basename(rel.replaceAll("\\", "/")).toLowerCase();
    if (name.includes("conflict") && name.includes("clearance")) continue;
    if (
      name.includes("post-clearance") ||
      name.includes("clearance-confirmation") ||
      (name.includes("clearance") && name.includes("status")) ||
      name.startsWith("hsr-clearance")
    ) {
      return { cleared: true, proofDoc: rel.replaceAll("\\", "/") };
    }
  }
  return { cleared: false, proofDoc: "" };
}

function isDefinedTermCandidate(rel: string): boolean {
  const pathL = rel.replaceAll("\\", "/").toLowerCase();
  return (
    pathL.includes("second-request") ||
    pathL.includes("second_request") ||
    ANTITRUST_PATH.test(pathL) ||
    pathL.includes("status") ||
    pathL.includes("case-assessment") ||
    pathL.includes("compliance") ||
    pathL.includes("closing") ||
    pathL.includes("joint-status")
  );
}

async function readMatterText(abs: string, maxChars = 50_000): Promise<string> {
  const lower = abs.toLowerCase();
  try {
    if (lower.endsWith(".docx")) {
      const body = extractDocxText(new Uint8Array(await readFile(abs)));
      return body.length > maxChars ? body.slice(0, maxChars) : body;
    }
    if (lower.endsWith(".eml") || lower.endsWith(".txt") || lower.endsWith(".md")) {
      const raw = await readFile(abs, "utf8");
      return raw.length > maxChars ? raw.slice(0, maxChars) : raw;
    }
  } catch {
    return "";
  }
  return "";
}

/**
 * Full HSR detection: filename hits first, then defined-term scan on candidate docs.
 * proofDoc prefers gold-style stems (joint-status-report, substantial-compliance, …).
 */
export async function detectHsrSecondRequest(matterDir: string): Promise<HsrDetection> {
  const files = await walkFiles(matterDir);
  const rels = files.map((p) => relative(matterDir, p).replaceAll("\\", "/"));
  const fromName = detectHsrFromRelPaths(rels);
  let received = fromName.received;
  let proofDoc = fromName.proofDoc;
  if (!received) {
    for (const abs of files) {
      const rel = relative(matterDir, abs).replaceAll("\\", "/");
      if (!isDefinedTermCandidate(rel)) continue;
      if (!/\.(docx|eml|txt|md)$/i.test(rel)) continue;
      const text = await readMatterText(abs);
      if (HSR_SECOND_REQUEST_PAREN.test(text)) {
        received = true;
        proofDoc = rel;
        break;
      }
    }
  }
  if (received) {
    const preferred = pickPreferredProofDoc(rels);
    if (preferred) proofDoc = preferred;
  }
  return {
    received,
    proofDoc,
    secondRequestDate: null,
    antitrustSignal: fromName.antitrustSignal || ANTITRUST_PATH.test(matterDir),
    clientHint: "",
  };
}

function pickPreferredProofDoc(relPaths: readonly string[]): string {
  for (const stem of PREFERRED_SECOND_REQUEST_EVIDENCE) {
    const hit = relPaths.find((rel) => {
      const name = basename(rel.replaceAll("\\", "/")).toLowerCase();
      return name.includes(stem);
    });
    if (hit) return hit.replaceAll("\\", "/");
  }
  return "";
}

export async function detectCreditFacility(matterDir: string): Promise<CreditDetection> {
  const files = await walkFiles(matterDir);
  const rels = files.map((p) => relative(matterDir, p).replaceAll("\\", "/"));
  return detectCreditFromRelPaths(rels);
}

export async function detectHsrClearance(matterDir: string): Promise<ClearanceDetection> {
  const files = await walkFiles(matterDir);
  const rels = files.map((p) => relative(matterDir, p).replaceAll("\\", "/"));
  return detectClearanceFromRelPaths(rels);
}

/** Apply structural flags onto a matter row (path detectors win when true). */
export async function applyStructuralPathFlags(
  matterDir: string,
  row: Record<string, unknown>
): Promise<StructuralPathFlags> {
  const [hsr, credit, clearance] = await Promise.all([
    detectHsrSecondRequest(matterDir),
    detectCreditFacility(matterDir),
    detectHsrClearance(matterDir),
  ]);
  const flags: StructuralPathFlags = {
    is_hsr_second_request: hsr.received,
    hsr_second_request_proof_doc: hsr.proofDoc,
    hsr_second_request_date: hsr.secondRequestDate,
    has_hsr_clearance: clearance.cleared,
    hsr_clearance_proof_doc: clearance.proofDoc,
    is_credit_facility: credit.isCreditFacility,
    is_antitrust_matter: !!(hsr.received || hsr.antitrustSignal),
    client_short_name: String(row.client_short_name || hsr.clientHint || ""),
  };
  if (credit.isCreditFacility) {
    flags.practice_area = credit.practiceArea;
    flags.matter_type = credit.matterType;
  } else if (hsr.received) {
    const practice = String(row.practice_area || "Other");
    if (practice === "Other" || practice === "Antitrust") {
      flags.practice_area = "Antitrust & Competition";
      flags.matter_type = String(row.matter_type || "Advisory");
    }
  }
  return flags;
}
