import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  closeDuckDb,
  maxCellChars,
  maxQueryRows,
  openDuckDb,
  queryDuckDb,
  resolveDataEngine,
  resolveDataPath,
  runSql,
  type DataQueryResult,
  type DuckDbHandle,
} from "./engine.js";
import {
  catalogMatterFiles,
  detectCapitalMarkets,
  detectRestructuring,
  enrichInventoryRows,
  extractKeyTermsFromText,
  inferDocType,
  type MatterDocumentRow,
} from "./inventory.js";
import { CREATE_LAB_SCHEMA_SQL, CREATE_LAB_VIEW_SQL, DROP_LAB_SCHEMA_SQL, MATTER_COLUMNS } from "./schema.js";
import { validateReadonlySelect } from "./sql-guard.js";

const STRUCTURAL_BOOLS = new Set([
  "is_credit_facility",
  "is_hsr_second_request",
  "has_hsr_clearance",
  "has_hsr_filing",
  "is_antitrust_matter",
  "has_ma_execution_agreement",
]);

const SEMANTIC_BOOLS = new Set([
  "mentions_springing_lien",
  "has_revolving_facility",
  "is_secured",
  "has_incremental_facility",
  "has_adjusted_ebitda_addbacks",
  "is_covenant_lite",
  "has_mfn_in_credit_agreement",
  "has_springing_financial_covenant",
  "has_always_on_maintenance_covenant",
  "has_maintenance_financial_covenant",
]);

export type OpenFactRow = {
  matter_id?: string;
  rel_doc?: string;
  fact_key?: string;
  fact_value?: string;
  evidence_snippet?: string;
  extractor?: string;
};

export type IngestPayload = {
  matters?: readonly Record<string, unknown>[];
  documents?: readonly Record<string, unknown>[];
  openFacts?: readonly OpenFactRow[];
  mattersRoot?: string;
  replace?: boolean;
};

export type IngestResult = {
  ok: true;
  engine: "duckdb";
  path: string;
  matterCount: number;
  documentCount: number;
  openFactCount: number;
};

export type DataStatus = {
  ok: true;
  engine: "duckdb";
  path: string;
  enabled: true;
};

function asBool(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

function nullableBool(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null;
  if (v === false || v === 0 || v === "0" || v === "false") return false;
  return asBool(v) ? true : null;
}

function str(v: unknown, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isPathInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith(".."));
}

export async function assertAllowedIngestRoot(
  mattersRoot: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  if (!mattersRoot || !isAbsolute(mattersRoot)) {
    throw new Error("mattersRoot must be an absolute directory path");
  }
  const resolved = resolve(mattersRoot);
  const real = await realpath(resolved);
  const extra = (env.CLAWQL_DATA_INGEST_ROOTS ?? "")
    .split(":")
    .map((s) => s.trim())
    .filter(Boolean);
  const vault = env.CLAWQL_OBSIDIAN_VAULT_PATH?.trim();
  const defaults = ["/workspace", "/tmp", join(env.HOME ?? "/home", ".ClawQL")];
  const roots = [...defaults, ...extra, vault ? resolve(vault) : ""].filter(Boolean);
  const allowed = await Promise.all(
    roots.map(async (r) => {
      try {
        return await realpath(resolve(r));
      } catch {
        return resolve(r);
      }
    })
  );
  if (!allowed.some((root) => isPathInside(root, real))) {
    throw new Error(
      `mattersRoot ${real} is outside CLAWQL_DATA_INGEST_ROOTS (and /workspace, /tmp, vault)`
    );
  }
  return real;
}

function matterValues(row: Record<string, unknown>): unknown[] {
  return MATTER_COLUMNS.map((col) => {
    const v = row[col];
    if (STRUCTURAL_BOOLS.has(col)) return asBool(v);
    if (SEMANTIC_BOOLS.has(col)) return nullableBool(v);
    if (col === "deal_value_usd" || col === "facility_amount_usd") return numOrNull(v);
    if (col === "document_count" || col === "indexed_doc_count") return numOrNull(v);
    if (col === "practice_area") return str(v, "Other");
    if (col === "matter_type") return str(v, "Other");
    if (col === "client_short_name" || col === "title" || col.endsWith("_proof_doc")) return str(v);
    if (col === "sandbox_root" || col === "vault_note_path") return str(v);
    if (v === undefined) return null;
    return v;
  });
}

function collectOpenFacts(matters: readonly Record<string, unknown>[], extra?: readonly OpenFactRow[]): OpenFactRow[] {
  const out: OpenFactRow[] = [...(extra ?? [])];
  for (const row of matters) {
    const mid = str(row.matter_id);
    const facts = row._open_facts;
    if (!Array.isArray(facts)) continue;
    for (const f of facts) {
      if (!f || typeof f !== "object") continue;
      const rec = f as OpenFactRow;
      out.push({ ...rec, matter_id: rec.matter_id || mid });
    }
  }
  return out;
}

function collectDocuments(
  matters: readonly Record<string, unknown>[],
  extra?: readonly Record<string, unknown>[]
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [...(extra ?? [])];
  for (const row of matters) {
    const mid = str(row.matter_id);
    const docs = row._matter_documents;
    if (!Array.isArray(docs)) continue;
    for (const d of docs) {
      if (!d || typeof d !== "object") continue;
      out.push({ ...(d as Record<string, unknown>), matter_id: (d as { matter_id?: string }).matter_id || mid });
    }
  }
  return out;
}

function documentInsert(d: Record<string, unknown>): unknown[] {
  const rel = str(d.rel_path);
  const filename = str(d.filename, rel.split("/").pop() ?? "");
  const ext = str(d.ext, filename.includes(".") ? filename.split(".").pop() ?? "" : "").toLowerCase();
  let docType = d.doc_type ? str(d.doc_type) : inferDocType(rel, filename);
  let keyTerms = d.key_terms;
  const text = str(d.text ?? d.text_snippet);
  if (text && (!keyTerms || (typeof keyTerms === "object" && !Array.isArray(keyTerms) && Object.keys(keyTerms as object).length === 0))) {
    const extracted = extractKeyTermsFromText(text, { docType, filename });
    keyTerms = Object.keys(extracted).length ? extracted : null;
    if ((extracted as { lock_up_period_days?: number }).lock_up_period_days && docType !== "lock-up-agreement") {
      docType = "lock-up-agreement";
    }
  }
  let ktJson: string | null = null;
  if (keyTerms && typeof keyTerms === "object") {
    const keys = Object.keys(keyTerms as object);
    ktJson = keys.length ? JSON.stringify(keyTerms) : null;
  } else if (typeof keyTerms === "string" && keyTerms.trim() && keyTerms.trim() !== "{}" && keyTerms.trim() !== "[]") {
    ktJson = keyTerms;
  }
  return [
    str(d.matter_id),
    rel,
    filename,
    ext,
    docType || null,
    d.doc_date ?? null,
    numOrNull(d.file_size_bytes),
    ktJson,
    text ? text.slice(0, 500) : null,
    str(d.parse_status, text ? "ok" : "skipped"),
  ];
}

export class ClawqlDataStore {
  private handle: DuckDbHandle | null = null;
  private schemaReady = false;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  engine(): "duckdb" {
    return resolveDataEngine(this.env);
  }

  path(): string {
    return resolveDataPath(this.env);
  }

  async ensureOpen(): Promise<DuckDbHandle> {
    this.engine();
    if (this.handle) return this.handle;
    this.handle = await openDuckDb(this.path());
    return this.handle;
  }

  async close(): Promise<void> {
    if (!this.handle) return;
    await closeDuckDb(this.handle);
    this.handle = null;
    this.schemaReady = false;
  }

  private async applySchema(replace: boolean): Promise<void> {
    const handle = await this.ensureOpen();
    if (replace || !this.schemaReady) {
      for (const sql of DROP_LAB_SCHEMA_SQL) {
        await runSql(handle, sql);
      }
      for (const sql of CREATE_LAB_SCHEMA_SQL) {
        await runSql(handle, sql);
      }
      for (const sql of CREATE_LAB_VIEW_SQL) {
        await runSql(handle, sql);
      }
      this.schemaReady = true;
    }
  }

  async ingest(payload: IngestPayload): Promise<IngestResult> {
    const replace = payload.replace !== false;
    await this.applySchema(replace);
    const handle = await this.ensureOpen();
    const matters = [...(payload.matters ?? [])];
    const openFacts = collectOpenFacts(matters, payload.openFacts);
    const documents = collectDocuments(matters, payload.documents);

    if (payload.mattersRoot) {
      const root = await assertAllowedIngestRoot(payload.mattersRoot, this.env);
      const skipRaw = this.env.CLAWQL_DATA_INVENTORY_SKIP_EXT ?? ".png,.jpg,.jpeg,.gif,.webp,.xlsx,.xls,.zip,.gz";
      const skipExt = new Set(
        skipRaw
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
          .map((s) => (s.startsWith(".") ? s : `.${s}`))
      );
      const parseLimit = Number.parseInt(this.env.CLAWQL_DATA_INVENTORY_PARSE_LIMIT ?? "20", 10);
      const textCap = Number.parseInt(this.env.CLAWQL_DATA_INVENTORY_TEXT_CAP ?? "500", 10);
      const { readdir } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const dirs = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory());
      const byId = new Map(matters.map((m) => [str(m.matter_id), m]));
      for (const dirent of dirs) {
        const matterId = dirent.name;
        const matterDir = join(root, matterId);
        let rows = await catalogMatterFiles(matterDir, { skipExt });
        rows = await enrichInventoryRows(matterDir, rows, { parseLimit, textCap, skipExt });
        const rels = rows.map((r) => r.rel_path);
        const cm = detectCapitalMarkets(rels);
        const re = detectRestructuring(rels);
        const existing = byId.get(matterId);
        if (existing) {
          if (cm.practice_area && (!existing.practice_area || existing.practice_area === "Other")) {
            existing.practice_area = cm.practice_area;
            existing.matter_type = cm.matter_type ?? existing.matter_type;
          }
          if (re.practice_area && existing.practice_area !== "Capital Markets") {
            existing.practice_area = re.practice_area;
            existing.matter_type = re.matter_type ?? existing.matter_type;
          }
          existing.document_count = rows.length;
          existing.indexed_doc_count = rows.filter((r) => r.parse_status === "ok").length;
        } else {
          const practice = cm.practice_area ?? re.practice_area ?? "Other";
          const added: Record<string, unknown> = {
            matter_id: matterId,
            client_short_name: "",
            practice_area: practice,
            matter_type: cm.matter_type ?? re.matter_type ?? "Other",
            title: matterId,
            sandbox_root: matterDir,
            document_count: rows.length,
            indexed_doc_count: rows.filter((r) => r.parse_status === "ok").length,
          };
          matters.push(added);
          byId.set(matterId, added);
        }
        for (const row of rows) {
          documents.push({ ...row, matter_id: matterId });
        }
      }
    }

    const placeholders = MATTER_COLUMNS.map(() => "?").join(", ");
    for (const row of matters) {
      if (!row.matter_id) continue;
      await runSql(
        handle,
        `INSERT INTO matters (${MATTER_COLUMNS.join(", ")}) VALUES (${placeholders})`,
        matterValues(row)
      );
    }
    for (const fact of openFacts) {
      await runSql(handle, "INSERT INTO open_facts VALUES (?, ?, ?, ?, ?, ?)", [
        str(fact.matter_id),
        str(fact.rel_doc),
        str(fact.fact_key),
        str(fact.fact_value),
        str(fact.evidence_snippet),
        str(fact.extractor, "open-kv-v0"),
      ]);
    }
    const seen = new Set<string>();
    let documentCount = 0;
    for (const d of documents) {
      const mid = str(d.matter_id);
      const rel = str(d.rel_path);
      if (!mid || !rel) continue;
      const key = `${mid}\0${rel}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await runSql(
        handle,
        "INSERT INTO matter_documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        documentInsert(d)
      );
      documentCount += 1;
    }
    if (documentCount > 0) {
      await runSql(handle, "CREATE INDEX IF NOT EXISTS idx_matter_documents_filename ON matter_documents(filename)");
      await runSql(handle, "CREATE INDEX IF NOT EXISTS idx_matter_documents_doc_type ON matter_documents(doc_type)");
    }
    return {
      ok: true,
      engine: "duckdb",
      path: this.path(),
      matterCount: matters.filter((m) => m.matter_id).length,
      documentCount,
      openFactCount: openFacts.length,
    };
  }

  async query(sql: string): Promise<DataQueryResult> {
    let safe: string;
    try {
      safe = validateReadonlySelect(sql);
    } catch (err) {
      return { ok: false, engine: "duckdb", error: err instanceof Error ? err.message : String(err) };
    }
    try {
      const handle = await this.ensureOpen();
      return await queryDuckDb(handle, safe, {
        maxRows: maxQueryRows(this.env),
        maxChars: maxCellChars(this.env),
      });
    } catch (err) {
      return {
        ok: false,
        engine: "duckdb",
        sql: safe,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  status(): DataStatus {
    this.engine();
    return { ok: true, engine: "duckdb", path: this.path(), enabled: true };
  }
}

let processStore: ClawqlDataStore | null = null;

export function getClawqlDataStore(env: NodeJS.ProcessEnv = process.env): ClawqlDataStore {
  processStore ??= new ClawqlDataStore(env);
  return processStore;
}

export async function resetClawqlDataStoreForTests(): Promise<void> {
  if (processStore) await processStore.close();
  processStore = null;
}

export type { MatterDocumentRow };
