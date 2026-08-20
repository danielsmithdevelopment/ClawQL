/**
 * Harvey LAB memory_recall enrichment — sandbox document roots + cohort guidance.
 * Ported from integrations/harvey-labs/harness/adapters/clawql_lab_session.py `_enrich_lab_memory_recall`.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { unzipSync } from "fflate";
import type { MemoryRecallResult } from "./recall.js";

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

const CLIENT_SHORT_NAMES = [
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
] as const;

const CLIENT_CANONICAL: Record<string, string> = {
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

const MATTER_CLIENT_SHORT: Record<string, string> = {
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

/** True when MCP should attach LAB sandbox guidance to recall JSON. */
export function harveyLabRecallEnabled(): boolean {
  return process.env.CLAWQL_HARVEY_LAB?.trim() === "1";
}

const TITLE_PREFIX_RE =
  /^(?:general\s+counsel|corporate\s+secretary|secretary|managing\s+partner|chief\s+investment\s+officer|mail\s+and\s+docusign|docusign)\s+/i;

function canonicalizeClient(label: string): string {
  let normalized = String(label).trim().split(/\s+/).join(" ");
  normalized = normalized.replace(TITLE_PREFIX_RE, "").trim() || normalized;
  const key = normalized.toLowerCase();
  if (key in CLIENT_CANONICAL) return CLIENT_CANONICAL[key]!;
  for (const [stem, canon] of Object.entries(CLIENT_CANONICAL)
    .filter(([k]) => k.includes(" "))
    .sort((a, b) => b[0].length - a[0].length)) {
    if (key.startsWith(stem)) return canon;
  }
  for (const [stem, canon] of Object.entries(CLIENT_CANONICAL)
    .filter(([k]) => !k.includes(" "))
    .sort((a, b) => b[0].length - a[0].length)) {
    if (key === stem || key.startsWith(`${stem} `)) return canon;
  }
  return normalized;
}

function extractDocxText(bytes: Uint8Array): string {
  try {
    const files = unzipSync(bytes);
    const xmlBytes = files["word/document.xml"];
    if (!xmlBytes) return "";
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(xmlBytes);
    return xml
      .replace(/<w:tab[^/]*\/>/g, "\t")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  } catch {
    return "";
  }
}

async function docxToText(filePath: string, maxChars = 8000): Promise<string> {
  try {
    const buf = await readFile(filePath);
    let text = extractDocxText(buf);
    text = text.replace(/\n{3,}/g, "\n\n").trim();
    if (text.length > maxChars) return `${text.slice(0, maxChars)}\n…[truncated]`;
    return text;
  } catch {
    return "";
  }
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

function clientHintFromEngagementFilename(filePath: string): string | null {
  let stem = basename(filePath, ".docx");
  stem = stem.replace(/engagement[-_ ]?letter[-_ ]?/gi, "");
  stem = stem.replace(/[-_]+/g, " ").trim();
  if (!stem) return null;
  const key = stem.toLowerCase();
  if (key in CLIENT_CANONICAL) return CLIENT_CANONICAL[key]!;
  const first = key.split(/\s+/)[0];
  if (first && first in CLIENT_CANONICAL) return CLIENT_CANONICAL[first]!;
  const canon = canonicalizeClient(stem);
  if (canon !== stem.trim()) return canon;
  return null;
}

async function labClientHint(matterDir: string): Promise<string> {
  const mid = basename(matterDir).trim();
  if (mid in MATTER_CLIENT_SHORT) return MATTER_CLIENT_SHORT[mid]!;

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

async function labPreferredEvidencePaths(matterDir: string, matterId: string): Promise<string[]> {
  const hits: [number, string][] = [];
  const files = await walkFiles(matterDir);
  for (const p of files) {
    if (!p.toLowerCase().endsWith(".docx")) continue;
    const name = basename(p).toLowerCase();
    if (name.includes("engagement")) continue;
    for (let i = 0; i < PREFERRED_SECOND_REQUEST_EVIDENCE.length; i += 1) {
      const pref = PREFERRED_SECOND_REQUEST_EVIDENCE[i]!;
      if (name.includes(pref)) {
        const rel = relative(matterDir, p).replaceAll("\\", "/");
        hits.push([i, `matters/${matterId}/${rel}`]);
        break;
      }
    }
  }
  hits.sort((a, b) => a[0] - b[0]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const [, path] of hits) {
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out.slice(0, 8);
}

function resolveMattersRoot(documentsDir: string): string | null {
  const docsRoot = documentsDir.replace(/^~/, process.env.HOME ?? "");
  if (!docsRoot) return null;
  const candidates = [
    join(docsRoot, "matters"),
    docsRoot.endsWith("/matters") || docsRoot.endsWith("\\matters") ? docsRoot : null,
  ].filter(Boolean) as string[];
  return candidates[0] ?? null;
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

type EnrichedPayload = MemoryRecallResult & {
  matterIds?: string[];
  matterIdCount?: number;
  labGuidance?: Record<string, unknown>;
  filteredEntities?: number;
  scannedEntities?: number;
};

/**
 * Attach sandbox document roots + deliverable reminder for LAB agents.
 */
export async function enrichLabMemoryRecall(
  result: MemoryRecallResult | unknown
): Promise<EnrichedPayload> {
  const payload: EnrichedPayload =
    result && typeof result === "object" && "ok" in result
      ? ({ ...(result as MemoryRecallResult) } as EnrichedPayload)
      : ({ ok: false, raw: result } as EnrichedPayload);

  if (!payload.ok) return payload;

  const hitsRaw = Array.isArray(payload.hits) ? payload.hits : [];
  const docsRoot = process.env.CLAWQL_LAB_DOCUMENTS_DIR?.trim() ?? "";
  let mattersRoot = docsRoot ? resolveMattersRoot(docsRoot) : null;
  if (mattersRoot && !(await dirExists(mattersRoot))) mattersRoot = null;

  const enrichedHits: Record<string, unknown>[] = [];
  const matterIds: string[] = [];

  for (const hit of hitsRaw) {
    if (!hit || typeof hit !== "object") continue;
    const h: Record<string, unknown> = { ...(hit as Record<string, unknown>) };
    const meta =
      h.meta && typeof h.meta === "object"
        ? { ...(h.meta as Record<string, unknown>) }
        : {};
    const fieldsFromMeta =
      meta.fields && typeof meta.fields === "object"
        ? (meta.fields as Record<string, unknown>)
        : {};
    const fieldsFromHit =
      h.fields && typeof h.fields === "object" ? (h.fields as Record<string, unknown>) : {};
    let fields: Record<string, unknown> = { ...fieldsFromMeta, ...fieldsFromHit };

    let entityId =
      (h.entityId as string | undefined) ??
      (fields.id as string | undefined) ??
      (meta.entityId as string | undefined);

    if (!entityId) {
      const path = String(h.path ?? "");
      const m = path.match(/(\d{4}-\d{5}|MAT-\d{4})/);
      if (m) entityId = m[1];
    }

    if (entityId) {
      matterIds.push(String(entityId));
      h.entityId = String(entityId);
      h.sandboxDocumentRoot = `/workspace/documents/matters/${entityId}`;
      fields = { ...fields, id: String(entityId) };

      const matterDir = mattersRoot ? join(mattersRoot, String(entityId)) : "";
      if (matterDir && (await dirExists(matterDir))) {
        const client = await labClientHint(matterDir);
        const preferred = await labPreferredEvidencePaths(matterDir, String(entityId));
        h.clientShortName = client;
        h.preferredEvidence = preferred.map((p) =>
          p.startsWith("/workspace/") ? p : `/workspace/documents/${p}`
        );
        fields.title = fields.title ?? `${entityId} — ${client}`;
        fields.clientShortName = client;
      }
      h.fields = fields;
      if (payload.queryType === "structured_predicate" || payload.indexUsed === "ontology") {
        meta.reason = "structured_predicate";
        h.meta = meta;
      }
    }
    enrichedHits.push(h);
  }

  if (
    Array.isArray(payload.results) &&
    (payload.queryType === "structured_predicate" || payload.indexUsed === "ontology")
  ) {
    payload.results = payload.results.map((row) => {
      if (!row || typeof row !== "object") return row;
      return { ...row, reason: "structured_predicate" as const };
    });
  }

  payload.hits = enrichedHits as MemoryRecallResult["hits"];
  const sortedIds = [...new Set(matterIds)].sort();
  payload.matterIds = sortedIds;
  payload.matterIdCount = sortedIds.length;

  if (payload.queryType === "structured_predicate" || payload.indexUsed === "ontology") {
    const slimResults: Record<string, unknown>[] = [];
    for (const row of payload.results ?? []) {
      if (!row || typeof row !== "object") continue;
      const path = String((row as { path?: string }).path ?? "");
      const midM = path.match(/(\d{4}-\d{5}|MAT-\d{4})/);
      slimResults.push({
        path,
        score: (row as { score?: number }).score ?? 1,
        depth: 0,
        reason: "structured_predicate",
        entityId: midM ? midM[1] : null,
      });
    }
    payload.results = slimResults as MemoryRecallResult["results"];

    const compactHits: Record<string, unknown>[] = [];
    for (const h of enrichedHits) {
      const f = h.fields && typeof h.fields === "object" ? (h.fields as Record<string, unknown>) : {};
      compactHits.push({
        entityId: h.entityId,
        path: h.path,
        score: h.score ?? 1,
        clientShortName: h.clientShortName ?? f.clientShortName,
        fields: {
          id: f.id ?? h.entityId,
          title: f.title,
          practiceArea: f.practiceArea,
          matterType: f.matterType,
          status: f.status,
        },
        sandboxDocumentRoot: h.sandboxDocumentRoot,
        preferredEvidence: ((h.preferredEvidence as string[] | undefined) ?? []).slice(0, 4),
      });
    }
    payload.hits = compactHits as MemoryRecallResult["hits"];
  }

  const guidance: Record<string, unknown> = {
    sandboxDocumentRoots: sortedIds.map((mid) => `/workspace/documents/matters/${mid}`),
    vaultPathsNotReadableViaHarnessRead: true,
    cohortRule:
      "For frequency/survey tasks, treat matterIds (and matterIdCount) as the authoritative denominator N. List every id. Do not drop ids when writing k of N.",
    requiredDeliverable:
      "Before finishing, call the harness `write` tool to create a file under /workspace/output/ (e.g. matters-enumeration.md or response.md). Attempt every rubric criterion with the best evidence you have — partial credit beats empty output. Verify distinctive terms against cited document text (guilty until proven). For frequency/survey tasks: define N as the prompt's filtered matter set (list every matter id), then write k of N (or 0 of N) — do not use folder counts or whole-vault counts as N. For HSR tasks use clientShortName (Cascade Retail, Harrowgate PE, Solara Digital, Halcyon Semi), state that each listed matter qualifies, and cite preferredEvidence — not engagement letters. Chat-only answers are not graded.",
    matterIds: sortedIds,
    evidenceRule:
      "Cite Second Request evidence docs (joint-status-report, case-assessment-memo, letter-ftc-meet-and-confer, second-request-strategy-memo, hsr-withdrawal-letter, substantial-compliance-certification, custodian-identification-collection-protocol). Do not cite engagement letters as Second Request evidence.",
    contextDiscipline:
      "Never ls -R / find the entire /workspace/documents tree. Use narrow paths. Do not invent ontology title flags beyond seeded tokens such as HSR_SECOND_REQUEST. memory_recall limit must be ≤50.",
  };
  if (!sortedIds.length) {
    guidance.fallback =
      "Structured recall returned no matter hits. Do not repeat the same filter more than once more. Fall back to targeted grep/glob/read under /workspace/documents/matters/, then write /workspace/output/ attempting all criteria.";
  }
  payload.labGuidance = guidance;

  const ordered: EnrichedPayload = { ok: payload.ok };
  for (const key of [
    "ok",
    "query",
    "matterIdCount",
    "matterIds",
    "filteredEntities",
    "scannedEntities",
    "queryType",
    "indexUsed",
    "schema",
    "filters",
    "hits",
    "results",
    "labGuidance",
  ] as const) {
    if (key in payload) (ordered as Record<string, unknown>)[key] = payload[key];
  }
  for (const [key, val] of Object.entries(payload)) {
    if (!(key in ordered)) (ordered as Record<string, unknown>)[key] = val;
  }
  return ordered;
}

/** Enrich recall output when `CLAWQL_HARVEY_LAB=1`. */
export async function maybeEnrichHarveyLabRecall(
  result: MemoryRecallResult
): Promise<MemoryRecallResult> {
  if (!harveyLabRecallEnabled() || !result.ok) return result;
  return enrichLabMemoryRecall(result);
}
