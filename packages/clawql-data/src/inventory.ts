import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import type { Effect } from "effect";
import { unzipSync } from "fflate";
import { dataFromPromise } from "./effect/data-effect-utils.js";
import type { DataError } from "./effect/data-errors.js";

const DOC_TYPE_RULES: readonly { signals: readonly string[]; docType: string }[] = [
  { signals: ["lock-up", "lockup", "lock_up"], docType: "lock-up-agreement" },
  { signals: ["withdraw", "withdrawal", "notice-of-withdrawal"], docType: "withdrawal-notice" },
  {
    signals: ["offering-memorandum", "prospectus", "424b", "s-1", "f-1"],
    docType: "offering-document",
  },
  {
    signals: ["underwriting-agreement", "private-placement", "warrant-agreement"],
    docType: "offering-document",
  },
  { signals: ["dip", "debtor-in-possession", "debtor_in_possession"], docType: "dip-financing" },
  { signals: ["credit-agreement", "loan-agreement", "bridge", "term-loan"], docType: "credit-agreement" },
  { signals: ["hsr", "second-request", "second_request"], docType: "hsr-filing" },
  { signals: ["form-of-", "form_of_"], docType: "form-document" },
];

export const DOC_TYPE_PARSE_PRIORITY: Record<string, number> = {
  "lock-up-agreement": 100,
  "withdrawal-notice": 95,
  "dip-financing": 90,
  "offering-document": 85,
  "credit-agreement": 80,
  "hsr-filing": 70,
  "form-document": 60,
  other: 10,
};

const LOCK_UP_DAYS_RE =
  /(?:lock[- ]?up\s+(?:period|restriction)?\s*(?:of|for|:)?\s*)?(\d{1,3})\s*-?\s*(?:calendar\s+)?days?(?:\s+(?:lock[- ]?up|following|after))?/i;
const LOCK_UP_DAYS_ALT_RE = /lock[- ]?up[^\n.]{0,80}?(\d{1,3})\s*-?\s*(?:calendar\s+)?days?/i;
const LOCK_UP_DAYS_PREFIX_RE = /(\d{1,3})\s*-?\s*(?:calendar\s+)?days?\s+lock[- ]?up/i;
const WITHDRAWAL_DATE_RE =
  /(?:withdraw(?:al|n)|notice\s+of\s+withdrawal)[^\n.]{0,60}?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i;
const OFFERING_WITHDRAWN_RE =
  /(?:offering (?:was|has been) withdrawn|(?:company|issuer) (?:has )?withdrawn the offering|withdrawal of the (?:offering|registration statement)|offering was pulled(?: at launch)?)/i;
const OFFERING_PULLED_DATE_RE =
  /offering was pulled(?: at launch)? on ((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i;
const DIP_AMOUNT_RE =
  /(?:DIP|debtor[- ]in[- ]possession)[^\n$]{0,80}?\$\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(billion|million)?/is;
const PARTY_RE =
  /(?:between|among)\s+([A-Z][A-Za-z0-9&.,' -]{2,60}?)\s+and\s+([A-Z][A-Za-z0-9&.,' -]{2,60}?)(?:\s*[,.(]|$)/g;

const CM_TOKENS = [
  "capital markets",
  "capital-markets",
  "/offering/",
  "offering-memorandum",
  "offering memorandum",
  "prospectus",
  "424b",
  "form-of-lock-up",
  "lock-up-agreement",
  "notice-of-withdrawal",
  "underwriting-agreement",
  "private-placement",
  "warrant-agreement",
  "registration-rights",
  "insider-letter",
  "s-1",
  "f-1",
  "form s-1",
  "ipo/",
  "/ipo",
] as const;

const RESTRUCTURING_TOKENS = [
  "restructuring",
  "/dip/",
  "dip-",
  "dip financing",
  "debtor-in-possession",
  "debtor_in_possession",
  "bankruptcy",
  "chapter-11",
  "chapter_11",
] as const;

export type MatterDocumentRow = {
  matter_id?: string;
  rel_path: string;
  filename: string;
  ext: string;
  doc_type: string;
  file_size_bytes: number | null;
  doc_date: string | null;
  key_terms: Record<string, unknown> | null;
  text_snippet: string;
  parse_status: string;
};

export function inferDocType(rel: string, name: string): string {
  const blob = `${rel.replaceAll("\\", "/").toLowerCase()} ${name.toLowerCase()}`;
  if (blob.includes("hsr") && blob.includes("withdraw")) return "hsr-filing";
  for (const rule of DOC_TYPE_RULES) {
    if (rule.signals.some((sig) => blob.includes(sig))) return rule.docType;
  }
  return "other";
}

export function docTypeParsePriority(docType: string | null | undefined): number {
  return DOC_TYPE_PARSE_PRIORITY[docType || "other"] ?? 10;
}

function parseMonthDayYear(raw: string): string | null {
  const cleaned = raw.replaceAll(",", "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
  const parsed = Date.parse(`${cleaned} UTC`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

export function normalizeWithdrawalDate(raw: string): string | null {
  const iso = parseMonthDayYear(raw);
  if (!iso) return null;
  const year = Number.parseInt(iso.slice(0, 4), 10);
  if (year < 1990 || year > 2027) return null;
  return iso;
}

export function extractKeyTermsFromText(
  text: string,
  opts: { docType?: string | null; filename?: string } = {}
): Record<string, unknown> {
  if (!text) return {};
  const terms: Record<string, unknown> = { source: "local_heuristic" };
  const dt = (opts.docType || "").toLowerCase();
  const fn = (opts.filename || "").toLowerCase();
  const textL = text.toLowerCase();
  const wantLock =
    dt === "lock-up-agreement" ||
    dt === "form-document" ||
    dt === "" ||
    ["lock-up", "lockup", "lock_up"].some((t) => fn.includes(t)) ||
    textL.includes("lock-up") ||
    textL.includes("lockup") ||
    textL.includes("lock up");
  const wantWithdraw =
    dt === "withdrawal-notice" ||
    fn.includes("withdraw") ||
    OFFERING_WITHDRAWN_RE.test(text) ||
    OFFERING_PULLED_DATE_RE.test(text);
  const wantDip =
    dt === "dip-financing" ||
    fn.includes("dip") ||
    fn.includes("debtor-in-possession") ||
    textL.includes("debtor-in-possession") ||
    textL.includes("debtor in possession");

  if (wantLock) {
    const m =
      LOCK_UP_DAYS_PREFIX_RE.exec(text) || LOCK_UP_DAYS_ALT_RE.exec(text) || LOCK_UP_DAYS_RE.exec(text);
    if (m) {
      const days = Number.parseInt(m[1] ?? "", 10);
      if (days >= 1 && days <= 730) {
        terms.lock_up_period_days = days;
        terms.lock_up_period = `${days} days`;
      }
    }
  }

  if (wantWithdraw) {
    if (OFFERING_WITHDRAWN_RE.test(text) || OFFERING_PULLED_DATE_RE.test(text)) {
      terms.offering_status = "withdrawn";
    }
    const m = OFFERING_PULLED_DATE_RE.exec(text) || WITHDRAWAL_DATE_RE.exec(text);
    if (m?.[1]) {
      const iso = normalizeWithdrawalDate(m[1]);
      if (iso) {
        terms.withdrawal_date = iso;
        terms.offering_status = "withdrawn";
      }
    }
  }

  if (wantDip) {
    const m = DIP_AMOUNT_RE.exec(text);
    if (m?.[1]) {
      let num = Number.parseFloat(m[1].replaceAll(",", ""));
      const unit = (m[2] || "").toLowerCase();
      if (unit.startsWith("b")) num *= 1_000_000_000;
      else if (unit.startsWith("m")) num *= 1_000_000;
      if (Number.isFinite(num)) terms.dip_amount_usd = num;
    }
  }

  const parties: string[] = [];
  const head = text.slice(0, 8000);
  PARTY_RE.lastIndex = 0;
  let pm: RegExpExecArray | null;
  while ((pm = PARTY_RE.exec(head)) && parties.length < 4) {
    for (const g of pm.slice(1)) {
      const party = g.replace(/\s+/g, " ").replace(/^[ ,.]|[ ,.]$/g, "").trim();
      if (party.length >= 3 && !parties.includes(party)) parties.push(party);
      if (parties.length >= 4) break;
    }
  }
  if (parties.length) terms.parties = parties;

  const keys = Object.keys(terms);
  if (keys.length <= 1 && keys[0] === "source") return {};
  return terms;
}

export function extractDocxText(bytes: Uint8Array): string {
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
function ooxmlDocumentXmlToPlainText(xml: string): string {
  const withBreaks = xml
    .replace(/<w:tab\b[^/]*\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n");
  const parts: string[] = [];
  const re = /<w:t\b[^>]*>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
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

function decodeXmlTextEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

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

export async function catalogMatterFiles(
  matterDir: string,
  opts: { skipExt?: Set<string> } = {}
): Promise<MatterDocumentRow[]> {
  const skip = opts.skipExt ?? new Set();
  const out: MatterDocumentRow[] = [];
  const files = (await walkFiles(matterDir)).sort();
  for (const abs of files) {
    const rel = relative(matterDir, abs).replaceAll("\\", "/");
    const ext = extname(abs).toLowerCase().replace(/^\./, "");
    const name = basename(abs);
    let size: number | null;
    try {
      size = (await stat(abs)).size;
    } catch {
      size = null;
    }
    const row: MatterDocumentRow = {
      rel_path: rel,
      filename: name,
      ext,
      doc_type: inferDocType(rel, name),
      file_size_bytes: size,
      doc_date: null,
      key_terms: null,
      text_snippet: "",
      parse_status: skip.has(`.${ext}`) ? "skipped" : "skipped",
    };
    out.push(row);
  }
  return out;
}

export type PracticeAreaHit = {
  practice_area: string | null;
  matter_type: string | null;
  evidence_files: string[];
};

export function detectCapitalMarkets(relPaths: readonly string[]): PracticeAreaHit {
  const evidence: string[] = [];
  for (const rel of relPaths) {
    const blob = rel.replaceAll("\\", "/").toLowerCase();
    // Do not treat generic "transaction documents/" as Capital Markets.
    if (CM_TOKENS.some((tok) => blob.includes(tok))) {
      evidence.push(rel);
      if (evidence.length >= 12) break;
    }
  }
  return {
    practice_area: evidence.length ? "Capital Markets" : null,
    matter_type: evidence.length ? "Offering" : null,
    evidence_files: evidence.slice(0, 12),
  };
}

export function detectRestructuring(relPaths: readonly string[]): PracticeAreaHit {
  const evidence: string[] = [];
  for (const rel of relPaths) {
    const blob = rel.replaceAll("\\", "/").toLowerCase();
    if (RESTRUCTURING_TOKENS.some((tok) => blob.includes(tok))) {
      evidence.push(rel);
      if (evidence.length >= 12) break;
    }
  }
  return {
    practice_area: evidence.length ? "Restructuring" : null,
    matter_type: evidence.length ? "DIP Financing" : null,
    evidence_files: evidence.slice(0, 12),
  };
}

export async function enrichInventoryRows(
  matterDir: string,
  rows: MatterDocumentRow[],
  opts: { parseLimit?: number; textCap?: number; skipExt?: Set<string> } = {}
): Promise<MatterDocumentRow[]> {
  const parseLimit = opts.parseLimit ?? 20;
  const textCap = opts.textCap ?? 500;
  const skip = opts.skipExt ?? new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".xlsx", ".xls", ".zip", ".gz"]);
  const ranked = [...rows].sort((a, b) => {
    const pd = docTypeParsePriority(b.doc_type) - docTypeParsePriority(a.doc_type);
    if (pd !== 0) return pd;
    const ae = ["docx", "txt", "md", "eml"].includes(a.ext) ? 0 : 1;
    const be = ["docx", "txt", "md", "eml"].includes(b.ext) ? 0 : 1;
    if (ae !== be) return ae - be;
    return a.rel_path.localeCompare(b.rel_path);
  });
  let parsed = 0;
  for (const row of ranked) {
    if (parsed >= parseLimit) break;
    const extDot = `.${row.ext}`;
    if (skip.has(extDot) || !["docx", "txt", "md", "eml"].includes(row.ext)) {
      row.parse_status = "skipped";
      continue;
    }
    const abs = join(matterDir, row.rel_path);
    try {
      let body = "";
      if (row.ext === "docx") {
        body = extractDocxText(new Uint8Array(await readFile(abs)));
      } else {
        body = await readFile(abs, "utf8");
      }
      if (!body) {
        row.parse_status = "skipped";
        continue;
      }
      const terms = extractKeyTermsFromText(body, {
        docType: row.doc_type,
        filename: row.filename,
      });
      row.key_terms = Object.keys(terms).length ? terms : null;
      if (terms.lock_up_period_days && row.doc_type !== "lock-up-agreement") {
        row.doc_type = "lock-up-agreement";
      }
      row.text_snippet = body.slice(0, textCap);
      row.parse_status = "ok";
      parsed += 1;
    } catch {
      row.parse_status = "failed";
    }
  }
  return rows;
}

/** Effect wrapper — FS IO at the Promise edge. */
export function catalogMatterFilesEffect(
  matterDir: string,
  opts: { skipExt?: Set<string> } = {}
): Effect.Effect<MatterDocumentRow[], DataError> {
  return dataFromPromise(() => catalogMatterFiles(matterDir, opts));
}

/** Effect wrapper — FS/parse IO at the Promise edge. */
export function enrichInventoryRowsEffect(
  matterDir: string,
  rows: MatterDocumentRow[],
  opts: { parseLimit?: number; textCap?: number; skipExt?: Set<string> } = {}
): Effect.Effect<MatterDocumentRow[], DataError> {
  return dataFromPromise(() => enrichInventoryRows(matterDir, rows, opts));
}
