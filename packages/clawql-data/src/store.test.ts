import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDataEngine } from "./engine.js";
import { ClawqlDataStore, resetClawqlDataStoreForTests } from "./store.js";

describe("resolveDataEngine", () => {
  it("defaults to duckdb", () => {
    expect(resolveDataEngine({})).toBe("duckdb");
    expect(resolveDataEngine({ CLAWQL_DATA_ENGINE: "duckdb" })).toBe("duckdb");
  });

  it("rejects chDB and Python engines", () => {
    expect(() => resolveDataEngine({ CLAWQL_DATA_ENGINE: "chdb" })).toThrow(/Python/);
    expect(() => resolveDataEngine({ CLAWQL_DATA_ENGINE: "python-duckdb" })).toThrow(/Python/);
  });
});

describe("ClawqlDataStore Node DuckDB", () => {
  afterEach(async () => {
    await resetClawqlDataStoreForTests();
  });

  it("ingests matters + documents and queries via json_extract_string", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clawql-data-db-"));
    const store = new ClawqlDataStore({
      CLAWQL_DATA_PATH: join(dir, "matters.duckdb"),
      CLAWQL_DATA_ENGINE: "duckdb",
    });
    const ingest = await store.ingest({
      replace: true,
      matters: [
        {
          matter_id: "1010-00002",
          client_short_name: "Arbor Health",
          practice_area: "Capital Markets",
          matter_type: "Offering",
          title: "1010-00002 — Arbor",
          is_credit_facility: false,
          sandbox_root: "/workspace/documents/matters/1010-00002",
        },
        {
          matter_id: "1008-00001",
          client_short_name: "Lumos",
          practice_area: "Banking & Finance",
          matter_type: "Credit Facility",
          is_credit_facility: true,
        },
      ],
      documents: [
        {
          matter_id: "1010-00002",
          rel_path: "Offering/form-of-lock-up-agreement.docx",
          filename: "form-of-lock-up-agreement.docx",
          ext: "docx",
          doc_type: "lock-up-agreement",
          file_size_bytes: 100,
          text: "The lock-up period is 180 days following the effective date.",
          parse_status: "ok",
        },
      ],
    });
    expect(ingest.ok).toBe(true);
    expect(ingest.engine).toBe("duckdb");
    expect(ingest.matterCount).toBe(2);
    expect(ingest.documentCount).toBe(1);

    const out = await store.query(
      "SELECT m.matter_id, d.filename, CAST(json_extract_string(d.key_terms, '$.lock_up_period_days') AS INTEGER) AS days " +
        "FROM matters m JOIN matter_documents d ON m.matter_id = d.matter_id " +
        "WHERE lower(m.practice_area) LIKE '%capital%market%' AND d.doc_type = 'lock-up-agreement'"
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.engine).toBe("duckdb");
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.matter_id).toBe("1010-00002");
    expect(out.rows[0]?.days).toBe(180);

    const cf = await store.query("SELECT matter_id FROM credit_facilities ORDER BY matter_id");
    expect(cf.ok).toBe(true);
    if (!cf.ok) return;
    expect(cf.rows.map((r) => r.matter_id)).toEqual(["1008-00001"]);

    const blocked = await store.query("INSERT INTO matters VALUES ('x')");
    expect(blocked.ok).toBe(false);

    const nullMaint = await store.query(
      "SELECT matter_id FROM matters WHERE has_maintenance_financial_covenant IS NULL"
    );
    expect(nullMaint.ok).toBe(true);
    await store.close();
  });
});
