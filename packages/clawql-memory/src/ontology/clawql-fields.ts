/**
 * Machine-readable CLAWQL_* field blocks for legal ontology extraction (Phase 1).
 * Spec: docs/specs/ontology/legal-domain-v0.1.md §3.1
 */

export type FieldConfidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";
export type ExtractionMethod = "machine_readable" | "pattern" | "llm";

export type MatterFields = {
  id: string;
  title?: string;
  status?: string;
  practiceArea?: string;
  matterType?: string;
  dealValueUSD?: number;
  escrowPct?: number;
  escrowDurationMonths?: number;
  nonCompeteMonths?: number;
  nonCompeteGeography?: string;
  clientId?: string;
};

export type ExtractedFieldMeta = {
  confidence: FieldConfidence;
  extractionMethod: ExtractionMethod;
};

export type ExtractedMatter = {
  fields: MatterFields;
  fieldMeta: Partial<Record<keyof MatterFields, ExtractedFieldMeta>>;
};

/** Calderwood B-7 ids (`MAT-2401`) plus Harvey LAB DMS ids (`1003-00001`). */
const MATTER_ID_RE = /^(?:MAT-\d{4}|\d{4}-\d{5})$/;
const CLIENT_ID_RE = /^CLT-\d{4}$/;

const KEY_MAP: Record<string, keyof MatterFields> = {
  CLAWQL_MATTER_ID: "id",
  CLAWQL_ESCROW_PCT: "escrowPct",
  CLAWQL_NONCOMPETE_MONTHS: "nonCompeteMonths",
  CLAWQL_DEAL_VALUE_USD: "dealValueUSD",
  CLAWQL_CLIENT_ID: "clientId",
  CLAWQL_PRACTICE_AREA: "practiceArea",
  CLAWQL_STATUS: "status",
  CLAWQL_ESCROW_DURATION_MONTHS: "escrowDurationMonths",
  CLAWQL_NC_GEOGRAPHY: "nonCompeteGeography",
  CLAWQL_MATTER_TYPE: "matterType",
  CLAWQL_TITLE: "title",
};

/** Parse `KEY=value` lines (optionally fenced) into a flat map. */
export function parseClawqlFieldBlock(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("```")) continue;
    const m = /^(CLAWQL_[A-Z0-9_]+)\s*=\s*(.*)$/.exec(t);
    if (!m) continue;
    out[m[1]!] = m[2]!.trim();
  }
  return out;
}

function parsePercentage(raw: string): number | undefined {
  const n = Number.parseFloat(raw.replace(/%/g, "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return n;
}

function parseIntField(raw: string): number | undefined {
  const n = Number.parseInt(raw.replace(/[,_\s]/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Extract Matter fields from vault Markdown using machine-readable CLAWQL_* blocks.
 * Returns null when no CLAWQL_MATTER_ID is present.
 */
export function extractMatterFromClawqlFields(text: string): ExtractedMatter | null {
  const raw = parseClawqlFieldBlock(text);
  const idRaw = raw.CLAWQL_MATTER_ID?.trim();
  if (!idRaw || !MATTER_ID_RE.test(idRaw)) return null;

  const fields: MatterFields = { id: idRaw };
  const fieldMeta: ExtractedMatter["fieldMeta"] = {
    id: { confidence: "EXTRACTED", extractionMethod: "machine_readable" },
  };
  const meta: ExtractedFieldMeta = {
    confidence: "EXTRACTED",
    extractionMethod: "machine_readable",
  };

  for (const [key, camel] of Object.entries(KEY_MAP)) {
    if (camel === "id") continue;
    const v = raw[key]?.trim();
    if (!v) continue;
    if (camel === "escrowPct") {
      const n = parsePercentage(v);
      if (n !== undefined) {
        fields.escrowPct = n;
        fieldMeta.escrowPct = meta;
      }
      continue;
    }
    if (
      camel === "nonCompeteMonths" ||
      camel === "escrowDurationMonths" ||
      camel === "dealValueUSD"
    ) {
      const n = parseIntField(v);
      if (n !== undefined) {
        (fields as Record<string, unknown>)[camel] = n;
        fieldMeta[camel] = meta;
      }
      continue;
    }
    if (camel === "clientId") {
      if (CLIENT_ID_RE.test(v)) {
        fields.clientId = v;
        fieldMeta.clientId = meta;
      }
      continue;
    }
    (fields as Record<string, unknown>)[camel] = v;
    fieldMeta[camel] = meta;
  }

  return { fields, fieldMeta };
}
