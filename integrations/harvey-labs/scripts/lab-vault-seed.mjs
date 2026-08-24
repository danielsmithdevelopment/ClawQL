#!/usr/bin/env node
/**
 * Harvey LAB firm-knowledge DMS detection + vault markdown seed builders (Node ESM).
 * Ported from integrations/harvey-labs/harness/adapters/clawql_lab_session.py
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { unzipSync } from "fflate";

export const INGEST_CACHE_NAME = ".clawql-lab-ingest-complete";

export const MAX_EXTRACT_CHARS = Number.parseInt(
  process.env.CLAWQL_LAB_MAX_EXTRACT_CHARS ?? "250000",
  10
);
export const MAX_DOCS_PER_MATTER = Number.parseInt(
  process.env.CLAWQL_LAB_MAX_DOCS_PER_MATTER ?? "8",
  10
);
export const MAX_MATTERS = Number.parseInt(process.env.CLAWQL_LAB_MAX_MATTERS ?? "0", 10);

const HSR_SECOND_REQUEST_PAREN =
  /\(the ["\u201c]Second Request["\u201d]\)/i;
const ANTITRUST_PATH = /antitrust|hsr|ftc|doj/i;

export const PREFERRED_SECOND_REQUEST_EVIDENCE = [
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
];

export const CLIENT_SHORT_NAMES = [
  "Cascade Retail",
  "Harrowgate PE",
  "Solara Digital",
  "Halcyon Semi",
  "Crestline Packaging",
  "Arbor Health Tech",
  "Stonefield Logistics",
  "Genome Dx",
  "Whitmore Aerospace",
  "Fairwater REIT",
  "Brightfield Cloud",
  "Ironhaven Data",
  "Lumos Analytics",
  "Verimark Hospitality",
  "Nexford Industrial",
  "Ardent Capital Partners",
  "Cascadia Renewables",
  "Harrowgate",
  "Cascade",
  "Solara",
  "Halcyon",
  "Crestline",
  "Arbor",
  "Stonefield",
  "Genome",
  "Whitmore",
  "Fairwater",
  "Brightfield",
  "Ironhaven",
  "Lumos",
  "Verimark",
  "Nexford",
  "Ardent",
  "Cascadia",
];

/** @type {Record<string, string>} */
export const CLIENT_CANONICAL = {
  cascade: "Cascade Retail",
  "cascade retail": "Cascade Retail",
  harrowgate: "Harrowgate PE",
  "harrowgate pe": "Harrowgate PE",
  "harrowgate hsr": "Harrowgate PE",
  hpe: "Harrowgate PE",
  "hpe fund iv": "Harrowgate PE",
  solara: "Solara Digital",
  "solara digital": "Solara Digital",
  sdilp: "Solara Digital",
  halcyon: "Halcyon Semi",
  "halcyon semi": "Halcyon Semi",
  "halcyon semiconductor": "Halcyon Semi",
  crestline: "Crestline Packaging",
  "crestline packaging": "Crestline Packaging",
  arbor: "Arbor Health Tech",
  "arbor health": "Arbor Health Tech",
  "arbor health tech": "Arbor Health Tech",
  "arbor health technologies": "Arbor Health Tech",
  stonefield: "Stonefield Logistics",
  "stonefield logistics": "Stonefield Logistics",
  genome: "Genome Dx",
  "genome dx": "Genome Dx",
  whitmore: "Whitmore Aerospace",
  "whitmore aerospace": "Whitmore Aerospace",
  fairwater: "Fairwater REIT",
  "fairwater reit": "Fairwater REIT",
  "fairwater take out financing": "Fairwater REIT",
  brightfield: "Brightfield Cloud",
  "brightfield cloud": "Brightfield Cloud",
  bcs: "Brightfield Cloud",
  ironhaven: "Ironhaven Data",
  "ironhaven data": "Ironhaven Data",
  "ironhaven data centers": "Ironhaven Data",
  lumos: "Lumos Analytics",
  "lumos analytics": "Lumos Analytics",
  verimark: "Verimark Hospitality",
  "verimark hospitality": "Verimark Hospitality",
  nexford: "Nexford Industrial",
  "nexford industrial": "Nexford Industrial",
  ardent: "Ardent Capital Partners",
  "ardent capital": "Ardent Capital Partners",
  "ardent capital partners": "Ardent Capital Partners",
  cascadia: "Cascadia Renewables",
  "cascadia renewables": "Cascadia Renewables",
};

/** @type {Record<string, string>} */
export const MATTER_CLIENT_SHORT = {
  "1001-00004": "Ardent Capital Partners",
  "1003-00001": "Harrowgate PE",
  "1003-00003": "Harrowgate PE",
  "1005-00001": "Nexford Industrial",
  "1006-00001": "Crestline Packaging",
  "1008-00001": "Lumos Analytics",
  "1010-00001": "Arbor Health Tech",
  "1012-00001": "Stonefield Logistics",
  "1013-00001": "Genome Dx",
  "1019-00002": "Whitmore Aerospace",
  "1021-00001": "Verimark Hospitality",
  "1023-00001": "Cascadia Renewables",
  "1032-00001": "Halcyon Semi",
  "1032-00005": "Halcyon Semi",
  "1036-00001": "Fairwater REIT",
  "1038-00001": "Cascade Retail",
  "1038-00002": "Cascade Retail",
  "1038-00009": "Cascade Retail",
  "1041-00001": "Solara Digital",
  "1041-00003": "Solara Digital",
  "1042-00001": "Brightfield Cloud",
  "1043-00001": "Ironhaven Data",
};

const TITLE_PREFIX_RE =
  /^(?:general\s+counsel|corporate\s+secretary|secretary|managing\s+partner|chief\s+investment\s+officer|mail\s+and\s+docusign|docusign)\s+/i;

const SR_DATE_NEAR_RE =
  /(?:Second\s+Request|second\s+request)[^\n.]{0,160}?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/gis;
const SR_CALENDAR_DATE_RE =
  /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/gi;

/** @param {string} label */
export function canonicalizeClient(label) {
  let normalized = String(label).trim().split(/\s+/).join(" ");
  normalized = normalized.replace(TITLE_PREFIX_RE, "").trim() || normalized;
  const key = normalized.toLowerCase();
  if (key in CLIENT_CANONICAL) return CLIENT_CANONICAL[key];
  const longEntries = Object.entries(CLIENT_CANONICAL)
    .filter(([k]) => k.includes(" "))
    .sort((a, b) => b[0].length - a[0].length);
  for (const [stem, canon] of longEntries) {
    if (key.startsWith(stem)) return canon;
  }
  const shortEntries = Object.entries(CLIENT_CANONICAL)
    .filter(([k]) => !k.includes(" "))
    .sort((a, b) => b[0].length - a[0].length);
  for (const [stem, canon] of shortEntries) {
    if (key === stem || key.startsWith(`${stem} `)) return canon;
  }
  return normalized;
}

/**
 * @param {string} matterId
 * @param {{ title: string; practiceArea: string; matterType: string; status?: string }} fields
 */
export function clawqlFieldBlock(matterId, { title, practiceArea, matterType, status = "Active" }) {
  return [
    "```",
    `CLAWQL_MATTER_ID=${matterId}`,
    `CLAWQL_TITLE=${title}`,
    `CLAWQL_PRACTICE_AREA=${practiceArea}`,
    `CLAWQL_MATTER_TYPE=${matterType}`,
    `CLAWQL_STATUS=${status}`,
    "```",
    "",
  ].join("\n");
}

/** Docx text extraction via fflate (matches packages/clawql-data/src/inventory.ts). */
export function extractDocxText(bytes) {
  try {
    const files = unzipSync(bytes);
    const xmlBytes = files["word/document.xml"];
    if (!xmlBytes) return "";
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(xmlBytes);
    return ooxmlDocumentXmlToPlainText(xml);
  } catch {
    return "";
  }
}

/** OOXML word/document.xml → plain text via `<w:t>` runs (not HTML sanitization). */
function ooxmlDocumentXmlToPlainText(xml) {
  const withBreaks = xml
    .replace(/<w:tab\b[^/]*\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n");
  const parts = [];
  const re = /<w:t\b[^>]*>([^<]*)<\/w:t>/g;
  let m;
  let last = 0;
  while ((m = re.exec(withBreaks)) !== null) {
    const between = withBreaks.slice(last, m.index);
    if (between.includes("\n")) parts.push("\n".repeat(between.split("\n").length - 1));
    if (between.includes("\t")) parts.push("\t");
    parts.push(decodeXmlTextEntities(m[1]));
    last = m.index + m[0].length;
  }
  return parts.join("");
}

function decodeXmlTextEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

/**
 * @param {string} filePath
 * @param {number} [maxChars]
 */
export async function docxToText(filePath, maxChars = MAX_EXTRACT_CHARS) {
  try {
    const buf = await readFile(filePath);
    let text = extractDocxText(buf);
    text = text.replace(/\n{3,}/g, "\n\n").trim();
    if (text.length > maxChars) return `${text.slice(0, maxChars)}\n…[truncated]`;
    return text;
  } catch (exc) {
    return `(failed to extract ${basename(filePath)}: ${exc})`;
  }
}

/**
 * @param {string} filePath
 * @param {number} [maxChars]
 */
export async function plainText(filePath, maxChars = MAX_EXTRACT_CHARS) {
  try {
    const raw = await readFile(filePath, "utf8");
    if (raw.length > maxChars) return `${raw.slice(0, maxChars)}\n…[truncated]`;
    return raw;
  } catch (exc) {
    return `(failed to read ${basename(filePath)}: ${exc})`;
  }
}

/** @param {string} dir */
async function walkFiles(dir) {
  /** @type {string[]} */
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkFiles(abs)));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

/**
 * @param {string} matterDir
 * @returns {Promise<string[]>}
 */
export async function priorityDocs(matterDir) {
  const files = await walkFiles(matterDir);
  /** @type {[number, string][]} */
  const scored = [];
  for (const p of files) {
    const name = basename(p).toLowerCase();
    let score = 0;
    if (name.includes("closing")) score += 50;
    if (name.includes("engagement")) score += 40;
    if (name.includes("second-request") || name.includes("second_request")) score += 80;
    if (name.includes("hsr")) score += 30;
    for (const pref of PREFERRED_SECOND_REQUEST_EVIDENCE) {
      if (name.includes(pref)) {
        score += 120;
        break;
      }
    }
    if (name.includes("engagement")) score -= 20;
    if (name.endsWith(".docx") || name.endsWith(".md") || name.endsWith(".txt")) score += 5;
    if (name.endsWith(".xlsx") || name.endsWith(".pptx") || name.endsWith(".pdf")) score -= 10;
    if (score > 0) scored.push([score, p]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]));
  return scored.slice(0, MAX_DOCS_PER_MATTER).map(([, p]) => p);
}

/**
 * @param {string} matterDir
 * @param {string} matterId
 */
export async function preferredEvidencePaths(matterDir, matterId) {
  /** @type {[number, string][]} */
  const hits = [];
  const files = await walkFiles(matterDir);
  for (const p of files) {
    if (!p.toLowerCase().endsWith(".docx")) continue;
    const name = basename(p).toLowerCase();
    if (name.includes("engagement")) continue;
    for (let i = 0; i < PREFERRED_SECOND_REQUEST_EVIDENCE.length; i += 1) {
      const pref = PREFERRED_SECOND_REQUEST_EVIDENCE[i];
      if (name.includes(pref)) {
        const rel = relative(matterDir, p).replaceAll("\\", "/");
        hits.push([i, `matters/${matterId}/${rel}`]);
        break;
      }
    }
  }
  hits.sort((a, b) => a[0] - b[0]);
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const [, path] of hits) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out.slice(0, 8);
}

/**
 * @param {string} filePath
 */
function clientHintFromEngagementFilename(filePath) {
  let stem = basename(filePath, ".docx");
  stem = stem.replace(/engagement[-_ ]?letter[-_ ]?/gi, "");
  stem = stem.replace(/[-_]+/g, " ").trim();
  if (!stem) return null;
  const key = stem.toLowerCase();
  if (key in CLIENT_CANONICAL) return CLIENT_CANONICAL[key];
  const first = key.split(/\s+/)[0];
  if (first in CLIENT_CANONICAL) return CLIENT_CANONICAL[first];
  const canon = canonicalizeClient(stem);
  if (canon !== stem.trim()) return canon;
  return null;
}

/**
 * @param {string} matterDir
 */
export async function clientHint(matterDir) {
  const mid = basename(matterDir).trim();
  if (mid in MATTER_CLIENT_SHORT) return MATTER_CLIENT_SHORT[mid];

  const files = await walkFiles(matterDir);
  const engagementDocs = files.filter(
    (p) => basename(p).toLowerCase().includes("engagement") && p.toLowerCase().endsWith(".docx")
  );

  for (const p of engagementDocs) {
    const hint = clientHintFromEngagementFilename(p);
    if (hint) return hint;
  }

  const sortedLabels = [...CLIENT_SHORT_NAMES].sort((a, b) => b.length - a.length);
  for (const p of engagementDocs) {
    const text = await docxToText(p, 8000);
    for (const label of sortedLabels) {
      const re = new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(text)) return canonicalizeClient(label);
    }
    const m = text.match(
      /\b([A-Z][A-Za-z0-9&.'/-]+(?:\s+[A-Z][A-Za-z0-9&.'/-]+){0,4})\s+(?:Holdings|Semiconductor|Capital|Retail|Digital|Inc\.?|LLC|LP)\b/
    );
    if (m) return canonicalizeClient(m[0]);
  }

  for (const p of engagementDocs) {
    const hint = clientHintFromEngagementFilename(p);
    if (hint) return hint;
    let stem = basename(p, ".docx").replace(/engagement[-_ ]?letter[-_ ]?/gi, "");
    stem = stem.replace(/[-_]+/g, " ").trim();
    if (stem) {
      const titled = stem
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      return canonicalizeClient(titled);
    }
  }
  return mid.split(/\s+/).join(" ");
}

/**
 * @param {string} matterDir
 */
async function hasAntitrustSignal(matterDir) {
  const files = await walkFiles(matterDir);
  for (const p of files) {
    const rel = relative(matterDir, p);
    if (ANTITRUST_PATH.test(rel)) return true;
  }
  return false;
}

/**
 * @param {string} matterDir
 */
async function secondRequestFilenameEvidence(matterDir) {
  /** @type {string[]} */
  const hits = [];
  const files = await walkFiles(matterDir);
  for (const p of files) {
    const name = basename(p).toLowerCase();
    if (!name.includes("second-request") && !name.includes("second_request")) continue;
    if (name.includes("preparation")) continue;
    hits.push(relative(matterDir, p).replaceAll("\\", "/"));
  }
  return hits;
}

/**
 * @param {string} matterDir
 */
async function secondRequestDefinedTermEvidence(matterDir) {
  /** @type {string[]} */
  const hits = [];
  const files = await walkFiles(matterDir);
  for (const p of files) {
    if (!p.toLowerCase().endsWith(".docx")) continue;
    const pathL = p.toLowerCase();
    if (
      !(
        pathL.includes("second-request") ||
        pathL.includes("second_request") ||
        ANTITRUST_PATH.test(pathL) ||
        pathL.includes("status") ||
        pathL.includes("case-assessment") ||
        pathL.includes("compliance") ||
        pathL.includes("closing")
      )
    ) {
      continue;
    }
    const text = await docxToText(p, 50000);
    if (HSR_SECOND_REQUEST_PAREN.test(text)) {
      hits.push(relative(matterDir, p).replaceAll("\\", "/"));
    }
  }
  return hits;
}

/** @param {string} raw */
function parseSrCalendarDate(raw) {
  const s = raw.replace(",", "").trim();
  for (const fmt of ["%B %d %Y", "%b %d %Y"]) {
    const parsed = parseDateFormat(s, fmt);
    if (parsed) return parsed;
  }
  return null;
}

/** @param {string} s @param {string} fmt */
function parseDateFormat(s, fmt) {
  const months = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
  };
  const shortMonths = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const parts = s.split(/\s+/);
  if (parts.length < 3) return null;
  const monthKey = parts[0].toLowerCase();
  const month =
    fmt.startsWith("%B") ? months[monthKey] : shortMonths[monthKey.slice(0, 3)];
  if (month === undefined) return null;
  const day = Number.parseInt(parts[1], 10);
  const year = Number.parseInt(parts[2], 10);
  if (!Number.isFinite(day) || !Number.isFinite(year)) return null;
  const d = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * @param {string} matterDir
 * @param {string} rel
 */
function resolveMatterRel(matterDir, rel) {
  let cleaned = rel.replaceAll("\\", "/").replace(/^\/+/, "");
  if (cleaned.startsWith("matters/")) {
    const parts = cleaned.split("/");
    if (parts.length >= 3) cleaned = parts.slice(2).join("/");
  }
  const cand = join(matterDir, cleaned);
  return cand;
}

async function fileExists(path) {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

/**
 * @param {string} matterDir
 * @param {string[]} evidenceRels
 * @param {string[]} preferredRels
 */
async function secondRequestEventDate(matterDir, evidenceRels, preferredRels) {
  /** @type {string[]} */
  const ordered = [];
  for (const rel of [...preferredRels, ...evidenceRels]) {
    if (!ordered.includes(rel)) ordered.push(rel);
  }
  /** @type {[string, string, number][]} */
  const dated = [];
  for (const rel of ordered.slice(0, 10)) {
    const path = resolveMatterRel(matterDir, rel);
    if (!(await fileExists(path))) continue;
    const suffix = path.slice(path.lastIndexOf(".")).toLowerCase();
    let body = "";
    if (suffix === ".docx") body = await docxToText(path, 40000);
    else if (suffix === ".eml" || suffix === ".txt" || suffix === ".md") {
      body = await plainText(path, 40000);
    } else continue;
    const relOut = relative(matterDir, path).replaceAll("\\", "/");
    for (const m of body.matchAll(SR_DATE_NEAR_RE)) {
      const iso = parseSrCalendarDate(m[1]);
      if (iso) dated.push([iso, relOut, 2]);
    }
    SR_CALENDAR_DATE_RE.lastIndex = 0;
    for (const m of body.slice(0, 12000).matchAll(SR_CALENDAR_DATE_RE)) {
      const iso = parseSrCalendarDate(m[1]);
      if (iso) dated.push([iso, relOut, 1]);
    }
  }
  if (!dated.length) return { eventDate: null, proofDoc: "" };
  dated.sort((a, b) => a[0].localeCompare(b[0]) || a[2] - b[2]);
  const [bestDate, bestRel] = dated[dated.length - 1];
  return { eventDate: bestDate, proofDoc: bestRel };
}

/**
 * @param {string} matterDir
 */
export async function detectHsrClearance(matterDir) {
  const files = await walkFiles(matterDir);
  for (const p of files) {
    const name = basename(p).toLowerCase();
    if (name.includes("conflict") && name.includes("clearance")) continue;
    if (
      name.includes("post-clearance") ||
      name.includes("clearance-confirmation") ||
      (name.includes("clearance") && name.includes("status")) ||
      name.startsWith("hsr-clearance")
    ) {
      return {
        cleared: true,
        proofDoc: relative(matterDir, p).replaceAll("\\", "/"),
      };
    }
  }
  return { cleared: false, proofDoc: "" };
}

/**
 * @param {string} matterDir
 */
export async function detectHsrSecondRequest(matterDir) {
  const fileHits = await secondRequestFilenameEvidence(matterDir);
  const textHits = fileHits.length ? [] : await secondRequestDefinedTermEvidence(matterDir);
  const received = fileHits.length > 0 || textHits.length > 0;
  const matterId = basename(matterDir);
  const preferred = received ? await preferredEvidencePaths(matterDir, matterId) : [];
  const evidence = [...fileHits, ...textHits].slice(0, 12);
  let eventDate = null;
  let proofDoc = "";
  if (received) {
    const { eventDate: ed, proofDoc: dateProof } = await secondRequestEventDate(
      matterDir,
      evidence,
      preferred
    );
    eventDate = ed;
    if (preferred.length) {
      const path = resolveMatterRel(matterDir, preferred[0]);
      if (await fileExists(path)) {
        proofDoc = relative(matterDir, path).replaceAll("\\", "/");
      }
    }
    if (!proofDoc) proofDoc = dateProof || (evidence[0] ?? "");
  }
  return {
    received,
    evidenceFiles: evidence,
    preferredEvidence: preferred,
    secondRequestDate: eventDate,
    proofDoc,
    antitrustSignal: await hasAntitrustSignal(matterDir),
    clientHint: await clientHint(matterDir),
  };
}

/** @param {string} nameL */
function isSignedFacilityDocxName(nameL) {
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

/**
 * @param {string} matterDir
 */
export async function detectCreditFacility(matterDir) {
  /** @type {string[]} */
  const evidence = [];
  const files = await walkFiles(matterDir);
  const dirs = new Set();
  for (const p of files) {
    let d = join(p, "..");
    while (d.startsWith(matterDir) && d !== matterDir) {
      dirs.add(d);
      d = join(d, "..");
    }
  }
  for (const dirPath of dirs) {
    const nameL = basename(dirPath).toLowerCase();
    if (nameL !== "credit agreement" && nameL !== "credit-agreement") continue;
    const rel = relative(matterDir, dirPath).replaceAll("\\", "/");
    const relL = rel.toLowerCase();
    if (relL.includes("dip")) continue;
    const execs = files.filter(
      (c) =>
        c.startsWith(dirPath) &&
        c.toLowerCase().endsWith(".docx") &&
        basename(c).toLowerCase().includes("execution")
    );
    if (execs.length) {
      evidence.push(rel);
      for (const e of execs.slice(0, 3)) {
        evidence.push(relative(matterDir, e).replaceAll("\\", "/"));
      }
    }
  }

  for (const p of files) {
    if (!p.toLowerCase().endsWith(".docx")) continue;
    const rel = relative(matterDir, p).replaceAll("\\", "/");
    const relL = rel.toLowerCase();
    const nameL = basename(p).toLowerCase();
    if (relL.startsWith("financing/")) continue;
    if (nameL.includes("dip") || relL.includes("dip " ) || relL.includes("/dip")) continue;
    const underPrimary =
      relL.startsWith("transaction documents/") ||
      relL.startsWith("documents/") ||
      relL.includes("/credit agreement/") ||
      relL.includes("/credit-agreement/");
    if (!underPrimary) continue;
    if (isSignedFacilityDocxName(nameL)) {
      evidence.push(rel);
      continue;
    }
    if (
      (nameL === "draft-loan-agreement.docx" || nameL === "loan-agreement.docx") &&
      relL.startsWith("transaction documents/")
    ) {
      evidence.push(rel);
    }
  }

  const seen = new Set();
  /** @type {string[]} */
  const uniq = [];
  for (const e of evidence) {
    if (seen.has(e)) continue;
    seen.add(e);
    uniq.push(e);
  }
  return {
    isCreditFacility: uniq.length > 0,
    evidenceFiles: uniq.slice(0, 16),
    practiceArea: uniq.length > 0 ? "Banking & Finance" : "Other",
    matterType: uniq.length > 0 ? "Credit Facility" : "Other",
  };
}

/**
 * Build firm-knowledge DMS vault markdown docs for bulk ingest.
 *
 * @param {{ mattersRoot: string; taskId: string; mcpClient?: unknown; env?: NodeJS.ProcessEnv }} opts
 */
export async function seedFirmKnowledgeDms({ mattersRoot, taskId, env = process.env }) {
  const maxMatters = Number.parseInt(env.CLAWQL_LAB_MAX_MATTERS ?? String(MAX_MATTERS), 10);
  const entries = await readdir(mattersRoot, { withFileTypes: true });
  const allMatterDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => join(mattersRoot, e.name))
    .sort();

  const fullTextDirs =
    maxMatters > 0 ? allMatterDirs.slice(0, maxMatters) : allMatterDirs;
  const fullTextSet = new Set(fullTextDirs);

  console.log(
    `ClawQL pre-ingest: ${allMatterDirs.length} matters catalogued ` +
      `(full-text cap=${maxMatters || "none"}) from ${mattersRoot}`
  );

  let hsrCount = 0;
  let creditCount = 0;
  /** @type {{ path: string; markdown: string; matter_id: string; title: string }[]} */
  const bulkDocs = [];
  /** @type {{ path: string; markdown: string; matter_id: string; title: string }[]} */
  const creditDocs = [];
  /** @type {{ path: string; markdown: string; matter_id: string; title: string }[]} */
  const hsrDocs = [];

  const mattersParent = join(mattersRoot, "..");
  const safeTask = taskId.replace(/[^a-zA-Z0-9_-]+/g, "-");

  for (let matterI = 0; matterI < allMatterDirs.length; matterI += 1) {
    const matterDir = allMatterDirs[matterI];
    const matterId = basename(matterDir);
    if (matterI === 0 || (matterI + 1) % 25 === 0 || matterI + 1 === allMatterDirs.length) {
      console.log(
        `ClawQL pre-ingest: matter ${matterI + 1}/${allMatterDirs.length} (${matterId})`
      );
    }

    const detection = await detectHsrSecondRequest(matterDir);
    const credit = await detectCreditFacility(matterDir);
    if (detection.received) hsrCount += 1;
    if (credit.isCreditFacility) creditCount += 1;

    let client = detection.clientHint || (await clientHint(matterDir));
    client = String(client).trim().split(/\s+/).join(" ");

    /** @type {string[]} */
    const titleParts = [matterId, client];
    if (detection.received) titleParts.push("HSR_SECOND_REQUEST");
    if (credit.isCreditFacility) titleParts.push("CREDIT_FACILITY");
    const title = titleParts.join(" — ");

    let practice = credit.practiceArea;
    if (detection.received && (practice === "Other" || practice === "Antitrust")) {
      practice = "Antitrust & Competition";
    }
    if (detection.antitrustSignal && (practice === "Other" || practice === "Antitrust")) {
      practice = "Antitrust & Competition";
    }

    let matterType = credit.matterType;
    if (detection.received && matterType === "Other") matterType = "Advisory";
    if (detection.antitrustSignal && matterType === "Other") matterType = "M&A";

    const extractFull =
      fullTextSet.has(matterDir) || detection.received || credit.isCreditFacility;

    /** @type {string[]} */
    const sections = [
      `# Matter ${matterId}`,
      "",
      clawqlFieldBlock(matterId, {
        title,
        practiceArea: practice,
        matterType,
      }),
      `LAB task: ${taskId}`,
      `Matter path: matters/${matterId}`,
      `Client short name: ${client}`,
      `HSR second request received: ${detection.received}`,
      `Credit facility (Banking & Finance signal): ${credit.isCreditFacility}`,
      "",
      "IMPORTANT for deliverable packaging:",
      "- Use the Client short name exactly (e.g. Cascade Retail, not Cascade).",
      "- Cite a Preferred Second Request evidence document below — do NOT cite engagement letters as Second Request evidence.",
      "- For frequency/credit-facility surveys: prefer clawql_sql SELECT … FROM matters WHERE is_credit_facility (or ontology title CREDIT_FACILITY) to define N.",
    ];

    if (detection.preferredEvidence?.length) {
      sections.push("", "## Preferred Second Request evidence (cite one)");
      for (const ev of detection.preferredEvidence) sections.push(`- \`${ev}\``);
    }
    if (credit.evidenceFiles?.length) {
      sections.push("", "## Credit facility evidence paths");
      for (const ev of credit.evidenceFiles) sections.push(`- \`matters/${matterId}/${ev}\``);
    }
    if (detection.evidenceFiles?.length) {
      sections.push("", "## Detection evidence paths");
      for (const ev of detection.evidenceFiles) {
        sections.push(`- \`matters/${matterId}/${ev}\``);
      }
    }

    sections.push("", "## Document inventory");
    const allFiles = (await walkFiles(matterDir))
      .map((p) => relative(mattersParent, p).replaceAll("\\", "/"))
      .sort();
    for (const rel of allFiles.slice(0, 80)) sections.push(`- \`${rel}\``);
    if (allFiles.length > 80) sections.push(`- … (${allFiles.length - 80} more)`);

    if (extractFull) {
      sections.push("", "## Extracted key documents");
      for (const doc of await priorityDocs(matterDir)) {
        const rel = relative(mattersParent, doc).replaceAll("\\", "/");
        sections.push(`### ${rel}`);
        const ext = doc.slice(doc.lastIndexOf(".")).toLowerCase();
        if (ext === ".docx") sections.push(await docxToText(doc));
        else if (ext === ".md" || ext === ".txt") sections.push(await plainText(doc));
        else sections.push(`(binary skipped in seed: ${ext})`);
        sections.push("");
      }
    }

    let insights = `Firm-knowledge DMS matter ${matterId} seeded for LAB task ${taskId}`;
    if (detection.received) insights += " | ontology flag HSR_SECOND_REQUEST";
    if (credit.isCreditFacility) {
      insights += " | ontology flag CREDIT_FACILITY | practice=Banking & Finance";
    }

    const wikiLines = [
      `- [[LAB:${taskId}]]`,
      `- [[Matter:${matterId}]]`,
      "- [[HarveyLAB]]",
      ...(detection.received ? ["- [[HSR_SECOND_REQUEST]]"] : []),
      ...(credit.isCreditFacility ? ["- [[CREDIT_FACILITY]]"] : []),
    ].join("\n");

    const markdown = [
      `# [LAB:${taskId}] Matter ${matterId}`,
      "",
      insights,
      "",
      "## Related",
      "",
      wikiLines,
      "",
      sections.join("\n"),
      "",
    ].join("\n");

    const doc = {
      path: `Memory/lab-${safeTask}-matter-${matterId}.md`,
      markdown,
      matter_id: matterId,
      /** Ontology title for memory_ingest — must include HSR_SECOND_REQUEST / CREDIT_FACILITY for structured recall filters. */
      title,
    };
    bulkDocs.push(doc);
    if (detection.received) hsrDocs.push(doc);
    if (credit.isCreditFacility) creditDocs.push(doc);
  }

  console.log(
    `ClawQL pre-ingest: ontology HSR_SECOND_REQUEST flagged ${hsrCount}/${allMatterDirs.length} matters; ` +
      `CREDIT_FACILITY flagged ${creditCount}/${allMatterDirs.length} matters; bulk_docs=${bulkDocs.length}`
  );

  return { hsrCount, creditCount, hsrDocs, creditDocs, bulkDocs };
}

// Legacy snake_case aliases for tests / parity
export const detect_hsr_second_request = detectHsrSecondRequest;
export const detect_hsr_clearance = detectHsrClearance;
export const detect_credit_facility = detectCreditFacility;
export const _client_hint = clientHint;
export const _canonicalize_client = canonicalizeClient;
export const _clawql_field_block = clawqlFieldBlock;
export const _priority_docs = priorityDocs;
